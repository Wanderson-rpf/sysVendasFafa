import { fromCents, getDb, toCents, transaction } from '../database';

export interface CompraItemInput {
  id?: number;
  fornecedor_id?: number | null;
  descricao: string;
  tamanho?: string | null;
  quantidade: number;
  custo_unitario: number;
  preco_venda: number;
  /** Item de encomenda que esta peça atende: ao salvar, a encomenda passa a "comprado" e a peça fica reservada. */
  pedido_item_id?: number | null;
}

export interface CompraInput {
  id?: number;
  data: string;
  descricao?: string | null;
  frete: number;
  desconto: number;
  comissao: number;
  observacao?: string | null;
  itens: CompraItemInput[];
}

export interface FiltroPeriodo {
  de?: string;
  ate?: string;
}

export const VENDIDOS_SQL = `(SELECT COALESCE(SUM(vi.quantidade),0) FROM venda_itens vi
                        JOIN vendas v ON v.id = vi.venda_id AND v.cancelada = 0
                       WHERE vi.compra_item_id = ci.id)`;

/** Unidades da peça (ci) reservadas para encomendas ainda não entregues. */
export const RESERVADOS_SQL = `(SELECT COALESCE(SUM(pi.quantidade),0) FROM pedido_itens pi
                         WHERE pi.compra_item_id = ci.id AND pi.status IN ('comprado','chegou'))`;

/** Desfaz o vínculo de encomendas com peças que vão sumir (item removido ou compra excluída). */
function desvincularEncomendas(compraItemIds: number[]): void {
  if (!compraItemIds.length) return;
  getDb()
    .prepare(
      `UPDATE pedido_itens SET status = 'anotado', compra_item_id = NULL
        WHERE compra_item_id IN (${compraItemIds.map(() => '?').join(',')}) AND status IN ('comprado','chegou')`,
    )
    .run(...compraItemIds);
}

/**
 * Rateia frete, desconto e comissão proporcionalmente ao valor de cada item,
 * para que o custo efetivo reflita quanto cada peça realmente custou.
 */
function custoEfetivo(compra: CompraInput): (item: CompraItemInput) => number {
  const totalProdutos = compra.itens.reduce((s, i) => s + toCents(i.custo_unitario) * i.quantidade, 0);
  const totalUnidades = compra.itens.reduce((s, i) => s + i.quantidade, 0) || 1;
  const ajuste = toCents(compra.frete) - toCents(compra.desconto) - toCents(compra.comissao);
  return (item) => {
    const custo = toCents(item.custo_unitario);
    const parcela = totalProdutos > 0 ? (ajuste * custo) / totalProdutos : ajuste / totalUnidades;
    return Math.max(0, Math.round(custo + parcela));
  };
}

export const compras = {
  listar(filtro: FiltroPeriodo = {}) {
    const rows = getDb()
      .prepare(
        `SELECT c.*,
                COALESCE(SUM(ci.quantidade * ci.custo_unitario), 0) AS valor_produtos,
                COALESCE(SUM(ci.quantidade * ci.preco_venda), 0)    AS valor_venda_previsto,
                COALESCE(SUM(ci.quantidade), 0)                     AS qtd_pecas,
                GROUP_CONCAT(DISTINCT f.nome)                       AS fornecedores
           FROM compras c
           LEFT JOIN compra_itens ci ON ci.compra_id = c.id
           LEFT JOIN fornecedores f  ON f.id = ci.fornecedor_id
          WHERE (:de IS NULL OR c.data >= :de) AND (:ate IS NULL OR c.data <= :ate)
          GROUP BY c.id
          ORDER BY c.data DESC, c.id DESC`,
      )
      .all({ de: filtro.de || null, ate: filtro.ate || null }) as any[];

    return rows.map((r) => {
      const investido = r.valor_produtos + r.frete - r.desconto - r.comissao;
      return {
        id: r.id,
        data: r.data,
        descricao: r.descricao,
        fornecedores: r.fornecedores ? String(r.fornecedores).split(',') : [],
        qtd_pecas: r.qtd_pecas,
        valor_produtos: fromCents(r.valor_produtos),
        frete: fromCents(r.frete),
        desconto: fromCents(r.desconto),
        comissao: fromCents(r.comissao),
        total_investido: fromCents(investido),
        valor_venda_previsto: fromCents(r.valor_venda_previsto),
        lucro_previsto: fromCents(r.valor_venda_previsto - investido),
      };
    });
  },

  obter(id: number) {
    const db = getDb();
    const c = db.prepare('SELECT * FROM compras WHERE id = ?').get(id) as any;
    if (!c) return null;
    const itens = db
      .prepare(
        `SELECT ci.*, ${VENDIDOS_SQL} AS vendidos,
                (SELECT pi.id FROM pedido_itens pi WHERE pi.compra_item_id = ci.id AND pi.status <> 'cancelado' LIMIT 1) AS pedido_item_id,
                (SELECT GROUP_CONCAT(cl.nome, ', ') FROM pedido_itens pi
                   JOIN pedidos p ON p.id = pi.pedido_id JOIN clientes cl ON cl.id = p.cliente_id
                  WHERE pi.compra_item_id = ci.id AND pi.status <> 'cancelado') AS encomenda_de
           FROM compra_itens ci WHERE ci.compra_id = ? ORDER BY ci.id`,
      )
      .all(id) as any[];
    return {
      ...c,
      frete: fromCents(c.frete),
      desconto: fromCents(c.desconto),
      comissao: fromCents(c.comissao),
      itens: itens.map((i) => ({
        ...i,
        custo_unitario: fromCents(i.custo_unitario),
        custo_efetivo: fromCents(i.custo_efetivo),
        preco_venda: fromCents(i.preco_venda),
      })),
    };
  },

  salvar(compra: CompraInput): number {
    if (!compra.itens?.length) throw new Error('Informe ao menos um item na compra.');
    const db = getDb();
    const efetivo = custoEfetivo(compra);

    return transaction(() => {
      const head = {
        data: compra.data,
        descricao: compra.descricao ?? null,
        frete: toCents(compra.frete),
        desconto: toCents(compra.desconto),
        comissao: toCents(compra.comissao),
        observacao: compra.observacao ?? null,
      };

      let id = compra.id;
      if (id) {
        db.prepare(
          `UPDATE compras SET data=:data, descricao=:descricao, frete=:frete, desconto=:desconto,
           comissao=:comissao, observacao=:observacao WHERE id=:id`,
        ).run({ ...head, id });
      } else {
        id = Number(
          db
            .prepare(
              `INSERT INTO compras (data, descricao, frete, desconto, comissao, observacao)
               VALUES (:data, :descricao, :frete, :desconto, :comissao, :observacao)`,
            )
            .run(head).lastInsertRowid,
        );
      }

      // Itens removidos na edição: só pode apagar o que ainda não foi vendido.
      const mantidos = new Set(compra.itens.filter((i) => i.id).map((i) => i.id));
      const atuais = db
        .prepare(`SELECT ci.id, ci.descricao, ${VENDIDOS_SQL} AS vendidos FROM compra_itens ci WHERE compra_id = ?`)
        .all(id) as any[];
      for (const a of atuais) {
        if (mantidos.has(a.id)) continue;
        if (a.vendidos > 0) throw new Error(`O item "${a.descricao}" já tem vendas e não pode ser removido.`);
        desvincularEncomendas([a.id]);
        db.prepare('DELETE FROM compra_itens WHERE id = ?').run(a.id);
      }

      // Liga a peça ao item de encomenda: a encomenda vira "comprado" e a peça fica reservada para a cliente.
      const vincular = db.prepare(
        `UPDATE pedido_itens SET compra_item_id = :ci,
                status = CASE WHEN status = 'anotado' THEN 'comprado' ELSE status END
          WHERE id = :pi AND status IN ('anotado','comprado','chegou')`,
      );

      for (const item of compra.itens) {
        const p = {
          compra_id: id,
          fornecedor_id: item.fornecedor_id || null,
          descricao: item.descricao.trim(),
          tamanho: item.tamanho || null,
          quantidade: Math.max(1, Math.trunc(item.quantidade)),
          custo_unitario: toCents(item.custo_unitario),
          custo_efetivo: efetivo(item),
          preco_venda: toCents(item.preco_venda),
        };
        let itemId = item.id;
        if (itemId) {
          db.prepare(
            `UPDATE compra_itens SET fornecedor_id=:fornecedor_id, descricao=:descricao, tamanho=:tamanho,
             quantidade=:quantidade, custo_unitario=:custo_unitario, custo_efetivo=:custo_efetivo,
             preco_venda=:preco_venda WHERE id=:id AND compra_id=:compra_id`,
          ).run({ ...p, id: itemId });
        } else {
          itemId = Number(
            db
              .prepare(
                `INSERT INTO compra_itens (compra_id, fornecedor_id, descricao, tamanho, quantidade, custo_unitario, custo_efetivo, preco_venda)
                 VALUES (:compra_id, :fornecedor_id, :descricao, :tamanho, :quantidade, :custo_unitario, :custo_efetivo, :preco_venda)`,
              )
              .run(p).lastInsertRowid,
          );
        }
        if (item.pedido_item_id) vincular.run({ ci: itemId, pi: item.pedido_item_id });
      }
      return id!;
    });
  },

  excluir(id: number): void {
    const vendidos = getDb()
      .prepare(`SELECT COALESCE(SUM(${VENDIDOS_SQL}),0) AS n FROM compra_itens ci WHERE ci.compra_id = ?`)
      .get(id) as { n: number };
    if (vendidos.n > 0) throw new Error('Esta compra possui peças já vendidas e não pode ser excluída.');
    transaction(() => {
      const ids = (getDb().prepare('SELECT id FROM compra_itens WHERE compra_id = ?').all(id) as any[]).map((r) => r.id);
      desvincularEncomendas(ids);
      getDb().prepare('DELETE FROM compras WHERE id = ?').run(id);
    });
  },

  /** Peças com saldo disponível para venda (descontando as reservadas para encomendas). */
  estoque() {
    const rows = getDb()
      .prepare(
        `SELECT * FROM (
           SELECT ci.id, ci.descricao, ci.tamanho, ci.custo_efetivo, ci.preco_venda, ci.quantidade,
                  f.nome AS fornecedor, c.data AS data_compra,
                  ${RESERVADOS_SQL} AS reservados,
                  ci.quantidade - ${VENDIDOS_SQL} - ${RESERVADOS_SQL} AS disponivel
             FROM compra_itens ci
             JOIN compras c ON c.id = ci.compra_id
             LEFT JOIN fornecedores f ON f.id = ci.fornecedor_id
         ) WHERE disponivel > 0
         ORDER BY descricao`,
      )
      .all() as any[];
    return rows.map((r) => ({
      ...r,
      custo_efetivo: fromCents(r.custo_efetivo),
      preco_venda: fromCents(r.preco_venda),
    }));
  },
};
