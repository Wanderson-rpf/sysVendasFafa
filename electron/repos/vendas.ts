import { fromCents, getDb, toCents, transaction } from '../database';

export type FormaPagamento =
  | 'dinheiro'
  | 'pix'
  | 'cartao_credito'
  | 'cartao_debito'
  | 'transferencia'
  | 'servico'
  | 'produto'
  | 'outro';

export type Situacao = 'quitada' | 'parcial' | 'aberta' | 'atrasada' | 'cancelada';

export interface VendaItemInput {
  compra_item_id?: number | null;
  descricao: string;
  quantidade: number;
  preco_unitario: number;
  custo_unitario?: number;
}

export interface VendaInput {
  id?: number;
  cliente_id?: number | null;
  data: string;
  vencimento?: string | null;
  desconto: number;
  observacao?: string | null;
  itens: VendaItemInput[];
}

export interface RecebimentoInput {
  venda_id: number;
  data: string;
  partes: { valor: number; forma: FormaPagamento; descricao?: string | null }[];
}

export interface FiltroVendas {
  de?: string;
  ate?: string;
  situacao?: Situacao | 'pendentes' | '';
  cliente_id?: number | null;
}

export function hoje(): string {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

const VENDA_SQL = `
  SELECT v.*, cl.nome AS cliente, cl.telefone,
         (SELECT COALESCE(SUM(quantidade * preco_unitario),0) FROM venda_itens WHERE venda_id = v.id) AS bruto,
         (SELECT COALESCE(SUM(quantidade * custo_unitario),0) FROM venda_itens WHERE venda_id = v.id) AS custo,
         (SELECT COALESCE(SUM(quantidade),0) FROM venda_itens WHERE venda_id = v.id)                  AS qtd_pecas,
         (SELECT COALESCE(SUM(valor),0) FROM recebimentos WHERE venda_id = v.id)                      AS recebido
    FROM vendas v
    LEFT JOIN clientes cl ON cl.id = v.cliente_id`;

function mapVenda(r: any, dataRef = hoje()) {
  const total = r.bruto - r.desconto;
  const saldo = total - r.recebido;
  let situacao: Situacao;
  if (r.cancelada) situacao = 'cancelada';
  else if (saldo <= 0) situacao = 'quitada';
  else if (r.vencimento && r.vencimento < dataRef) situacao = 'atrasada';
  else if (r.recebido > 0) situacao = 'parcial';
  else situacao = 'aberta';

  const diasAtraso =
    situacao === 'atrasada'
      ? Math.floor((Date.parse(dataRef) - Date.parse(r.vencimento)) / 86_400_000)
      : 0;

  return {
    id: r.id,
    cliente_id: r.cliente_id,
    cliente: r.cliente ?? 'Sem cliente',
    telefone: r.telefone,
    data: r.data,
    vencimento: r.vencimento,
    observacao: r.observacao,
    qtd_pecas: r.qtd_pecas,
    desconto: fromCents(r.desconto),
    total: fromCents(total),
    custo: fromCents(r.custo),
    lucro: fromCents(total - r.custo),
    recebido: fromCents(r.recebido),
    saldo: fromCents(Math.max(0, saldo)),
    situacao,
    dias_atraso: diasAtraso,
  };
}

export const vendas = {
  listar(filtro: FiltroVendas = {}) {
    const rows = getDb()
      .prepare(
        `${VENDA_SQL}
          WHERE (:de IS NULL OR v.data >= :de) AND (:ate IS NULL OR v.data <= :ate)
            AND (:cliente IS NULL OR v.cliente_id = :cliente)
          ORDER BY v.data DESC, v.id DESC`,
      )
      .all({ de: filtro.de || null, ate: filtro.ate || null, cliente: filtro.cliente_id || null }) as any[];

    const lista = rows.map((r) => mapVenda(r));
    if (!filtro.situacao) return lista;
    if (filtro.situacao === 'pendentes')
      return lista.filter((v) => ['aberta', 'parcial', 'atrasada'].includes(v.situacao));
    return lista.filter((v) => v.situacao === filtro.situacao);
  },

  obter(id: number) {
    const db = getDb();
    const r = db.prepare(`${VENDA_SQL} WHERE v.id = ?`).get(id) as any;
    if (!r) return null;
    const itens = db.prepare('SELECT * FROM venda_itens WHERE venda_id = ? ORDER BY id').all(id) as any[];
    const recs = db.prepare('SELECT * FROM recebimentos WHERE venda_id = ? ORDER BY data, id').all(id) as any[];
    return {
      ...mapVenda(r),
      itens: itens.map((i) => ({
        ...i,
        preco_unitario: fromCents(i.preco_unitario),
        custo_unitario: fromCents(i.custo_unitario),
      })),
      recebimentos: recs.map((x) => ({ ...x, valor: fromCents(x.valor) })),
    };
  },

  salvar(venda: VendaInput): number {
    if (!venda.itens?.length) throw new Error('Informe ao menos um item na venda.');
    const db = getDb();

    return transaction(() => {
      const head = {
        cliente_id: venda.cliente_id || null,
        data: venda.data,
        vencimento: venda.vencimento || null,
        desconto: toCents(venda.desconto),
        observacao: venda.observacao ?? null,
      };

      let id = venda.id;
      if (id) {
        db.prepare(
          'UPDATE vendas SET cliente_id=:cliente_id, data=:data, vencimento=:vencimento, desconto=:desconto, observacao=:observacao WHERE id=:id',
        ).run({ ...head, id });
        db.prepare('DELETE FROM venda_itens WHERE venda_id = ?').run(id);
      } else {
        id = Number(
          db
            .prepare(
              'INSERT INTO vendas (cliente_id, data, vencimento, desconto, observacao) VALUES (:cliente_id, :data, :vencimento, :desconto, :observacao)',
            )
            .run(head).lastInsertRowid,
        );
      }

      const estoqueStmt = db.prepare(
        `SELECT ci.descricao, ci.custo_efetivo,
                ci.quantidade - (SELECT COALESCE(SUM(vi.quantidade),0) FROM venda_itens vi
                                   JOIN vendas v ON v.id = vi.venda_id AND v.cancelada = 0
                                  WHERE vi.compra_item_id = ci.id) AS disponivel
           FROM compra_itens ci WHERE ci.id = ?`,
      );
      const insert = db.prepare(
        `INSERT INTO venda_itens (venda_id, compra_item_id, descricao, quantidade, preco_unitario, custo_unitario)
         VALUES (:venda_id, :compra_item_id, :descricao, :quantidade, :preco_unitario, :custo_unitario)`,
      );

      for (const item of venda.itens) {
        const qtd = Math.max(1, Math.trunc(item.quantidade));
        let custo = toCents(item.custo_unitario ?? 0);
        if (item.compra_item_id) {
          const est = estoqueStmt.get(item.compra_item_id) as any;
          if (!est) throw new Error('Peça de estoque não encontrada.');
          if (est.disponivel < qtd)
            throw new Error(`Estoque insuficiente para "${est.descricao}" (disponível: ${est.disponivel}).`);
          custo = est.custo_efetivo;
        }
        insert.run({
          venda_id: id,
          compra_item_id: item.compra_item_id || null,
          descricao: item.descricao.trim(),
          quantidade: qtd,
          preco_unitario: toCents(item.preco_unitario),
          custo_unitario: custo,
        });
      }
      return id!;
    });
  },

  cancelar(id: number, cancelada = true): void {
    getDb().prepare('UPDATE vendas SET cancelada = ? WHERE id = ?').run(cancelada ? 1 : 0, id);
  },

  excluir(id: number): void {
    getDb().prepare('DELETE FROM vendas WHERE id = ?').run(id);
  },

  receber(input: RecebimentoInput): void {
    const partes = (input.partes ?? []).filter((p) => toCents(p.valor) > 0);
    if (!partes.length) throw new Error('Informe ao menos uma forma de pagamento com valor.');
    for (const p of partes) {
      if ((p.forma === 'servico' || p.forma === 'produto') && !p.descricao?.trim())
        throw new Error('Descreva o serviço ou produto recebido como pagamento.');
    }

    const venda = vendas.obter(input.venda_id);
    if (!venda) throw new Error('Venda não encontrada.');
    if (venda.situacao === 'cancelada') throw new Error('Venda cancelada não pode receber pagamentos.');
    const totalPartes = partes.reduce((s, p) => s + toCents(p.valor), 0);
    if (totalPartes > toCents(venda.saldo))
      throw new Error(`O valor informado ultrapassa o saldo devedor de R$ ${venda.saldo.toFixed(2)}.`);

    const db = getDb();
    const stmt = db.prepare(
      'INSERT INTO recebimentos (venda_id, data, valor, forma, descricao) VALUES (:venda_id, :data, :valor, :forma, :descricao)',
    );
    transaction(() => {
      for (const p of partes) {
        stmt.run({
          venda_id: input.venda_id,
          data: input.data,
          valor: toCents(p.valor),
          forma: p.forma,
          descricao: p.descricao?.trim() || null,
        });
      }
    });
  },

  excluirRecebimento(id: number): void {
    getDb().prepare('DELETE FROM recebimentos WHERE id = ?').run(id);
  },

  /** Saldo devedor em atraso agrupado por cliente. */
  inadimplentes() {
    const atrasadas = vendas.listar({ situacao: 'atrasada' });
    const porCliente = new Map<string, any>();
    for (const v of atrasadas) {
      const key = String(v.cliente_id ?? 0);
      const acc = porCliente.get(key) ?? {
        cliente_id: v.cliente_id,
        cliente: v.cliente,
        telefone: v.telefone,
        vendas: 0,
        saldo: 0,
        maior_atraso: 0,
      };
      acc.vendas += 1;
      acc.saldo = Math.round((acc.saldo + v.saldo) * 100) / 100;
      acc.maior_atraso = Math.max(acc.maior_atraso, v.dias_atraso);
      porCliente.set(key, acc);
    }
    return [...porCliente.values()].sort((a, b) => b.saldo - a.saldo);
  },
};
