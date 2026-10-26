import { fromCents, getDb, toCents, transaction } from '../database';
import { RESERVADOS_SQL, VENDIDOS_SQL } from './compras';
import { hoje, vendas } from './vendas';

export type StatusItem = 'anotado' | 'comprado' | 'chegou' | 'entregue' | 'cancelado';
export type AbaPedidos = 'a_comprar' | 'aguardando' | 'prontos' | 'finalizados' | 'todos';

export interface PedidoItemInput {
  id?: number;
  descricao: string;
  tamanho?: string | null;
  cor?: string | null;
  referencia?: string | null;
  quantidade: number;
  preco: number;
  fornecedor_id?: number | null;
}

export interface PedidoInput {
  id?: number;
  cliente_id: number;
  data: string;
  prazo?: string | null;
  sinal: number;
  sinal_forma?: string | null;
  observacao?: string | null;
  itens: PedidoItemInput[];
}

/** Transições permitidas pela tela (entregue só acontece via gerarVenda). */
const TRANSICOES: Record<string, StatusItem[]> = {
  comprado: ['anotado'],
  chegou: ['anotado', 'comprado'],
  anotado: ['comprado', 'chegou', 'cancelado'],
  cancelado: ['anotado', 'comprado', 'chegou'],
};

const ITENS_SQL = `
  SELECT pi.*, f.nome AS fornecedor
    FROM pedido_itens pi LEFT JOIN fornecedores f ON f.id = pi.fornecedor_id
   WHERE pi.pedido_id IN (SELECT value FROM json_each(?))
   ORDER BY pi.id`;

function mapItem(i: any) {
  return { ...i, preco: fromCents(i.preco) };
}

function montar(rows: any[]) {
  if (!rows.length) return [];
  const itens = getDb().prepare(ITENS_SQL).all(JSON.stringify(rows.map((r) => r.id))) as any[];
  const porPedido = new Map<number, any[]>();
  for (const i of itens) porPedido.set(i.pedido_id, [...(porPedido.get(i.pedido_id) ?? []), mapItem(i)]);
  const ref = hoje();

  return rows.map((p) => {
    const lista = porPedido.get(p.id) ?? [];
    const conta = (s: StatusItem) => lista.filter((i) => i.status === s).length;
    const ativos = lista.filter((i) => i.status !== 'cancelado');
    const abertos = lista.filter((i) => !['entregue', 'cancelado'].includes(i.status));
    const situacao = !ativos.length ? 'cancelado' : abertos.length ? 'aberto' : 'entregue';
    return {
      id: p.id,
      cliente_id: p.cliente_id,
      cliente: p.cliente,
      telefone: p.telefone,
      data: p.data,
      prazo: p.prazo,
      observacao: p.observacao,
      sinal: fromCents(p.sinal),
      sinal_forma: p.sinal_forma,
      sinal_restante: fromCents(Math.max(0, p.sinal - p.sinal_usado)),
      total: fromCents(ativos.reduce((s, i) => s + i.quantidade * toCents(i.preco), 0)),
      itens: lista,
      contagem: {
        anotado: conta('anotado'),
        comprado: conta('comprado'),
        chegou: conta('chegou'),
        entregue: conta('entregue'),
        cancelado: conta('cancelado'),
      },
      situacao,
      atrasado: situacao === 'aberto' && !!p.prazo && p.prazo < ref,
    };
  });
}

const PEDIDO_SQL = `
  SELECT p.*, cl.nome AS cliente, cl.telefone
    FROM pedidos p JOIN clientes cl ON cl.id = p.cliente_id`;

export const pedidos = {
  listar(filtro: { aba?: AbaPedidos } = {}) {
    const lista = montar(getDb().prepare(`${PEDIDO_SQL} ORDER BY COALESCE(p.prazo, '9999'), p.data, p.id`).all() as any[]);
    switch (filtro.aba ?? 'todos') {
      case 'a_comprar':
        return lista.filter((p) => p.contagem.anotado > 0);
      case 'aguardando':
        return lista.filter((p) => p.contagem.comprado > 0);
      case 'prontos':
        return lista.filter((p) => p.contagem.chegou > 0);
      case 'finalizados':
        return lista.filter((p) => p.situacao !== 'aberto').reverse();
      default:
        return lista;
    }
  },

  obter(id: number) {
    return montar(getDb().prepare(`${PEDIDO_SQL} WHERE p.id = ?`).all(id) as any[])[0] ?? null;
  },

  salvar(p: PedidoInput): number {
    if (!p.cliente_id) throw new Error('Escolha a cliente da encomenda.');
    if (!p.itens?.length) throw new Error('Informe ao menos uma peça.');
    if (p.itens.some((i) => !i.descricao?.trim())) throw new Error('Preencha a descrição de todas as peças.');
    const db = getDb();

    return transaction(() => {
      const head = {
        cliente_id: p.cliente_id,
        data: p.data,
        prazo: p.prazo || null,
        sinal: toCents(p.sinal),
        sinal_forma: toCents(p.sinal) > 0 ? p.sinal_forma || 'pix' : null,
        observacao: p.observacao ?? null,
      };

      let id = p.id;
      if (id) {
        const atual = db.prepare('SELECT sinal_usado FROM pedidos WHERE id = ?').get(id) as any;
        if (head.sinal < atual.sinal_usado)
          throw new Error(`O sinal não pode ser menor que o já usado em vendas (R$ ${fromCents(atual.sinal_usado).toFixed(2)}).`);
        db.prepare(
          'UPDATE pedidos SET cliente_id=:cliente_id, data=:data, prazo=:prazo, sinal=:sinal, sinal_forma=:sinal_forma, observacao=:observacao WHERE id=:id',
        ).run({ ...head, id });
      } else {
        id = Number(
          db
            .prepare(
              'INSERT INTO pedidos (cliente_id, data, prazo, sinal, sinal_forma, observacao) VALUES (:cliente_id, :data, :prazo, :sinal, :sinal_forma, :observacao)',
            )
            .run(head).lastInsertRowid,
        );
      }

      // Peças removidas: as já entregues fazem parte de uma venda e não podem sumir.
      const mantidos = new Set(p.itens.filter((i) => i.id).map((i) => i.id));
      for (const a of db.prepare('SELECT id, descricao, status FROM pedido_itens WHERE pedido_id = ?').all(id) as any[]) {
        if (mantidos.has(a.id)) continue;
        if (a.status === 'entregue') throw new Error(`"${a.descricao}" já foi entregue e não pode ser removida.`);
        db.prepare('DELETE FROM pedido_itens WHERE id = ?').run(a.id);
      }

      for (const i of p.itens) {
        const campos = {
          descricao: i.descricao.trim(),
          tamanho: i.tamanho || null,
          cor: i.cor || null,
          referencia: i.referencia?.trim() || null,
          quantidade: Math.max(1, Math.trunc(i.quantidade || 1)),
          preco: toCents(i.preco),
          fornecedor_id: i.fornecedor_id || null,
        };
        if (i.id) {
          db.prepare(
            `UPDATE pedido_itens SET descricao=:descricao, tamanho=:tamanho, cor=:cor, referencia=:referencia,
             quantidade=:quantidade, preco=:preco, fornecedor_id=:fornecedor_id WHERE id=:id AND pedido_id=:pedido_id`,
          ).run({ ...campos, id: i.id, pedido_id: id });
        } else {
          db.prepare(
            `INSERT INTO pedido_itens (pedido_id, descricao, tamanho, cor, referencia, quantidade, preco, fornecedor_id)
             VALUES (:pedido_id, :descricao, :tamanho, :cor, :referencia, :quantidade, :preco, :fornecedor_id)`,
          ).run({ ...campos, pedido_id: id });
        }
      }
      return id!;
    });
  },

  excluir(id: number): void {
    const entregues = getDb()
      .prepare("SELECT COUNT(*) AS n FROM pedido_itens WHERE pedido_id = ? AND status = 'entregue'")
      .get(id) as { n: number };
    if (entregues.n > 0) throw new Error('Esta encomenda já tem peças entregues (com venda). Cancele as peças restantes em vez de excluir.');
    getDb().prepare('DELETE FROM pedidos WHERE id = ?').run(id);
  },

  /** Muda o status de uma peça manualmente. Voltar para "anotado" ou cancelar libera a reserva de estoque. */
  alterarStatus({ item_id, status }: { item_id: number; status: StatusItem }): void {
    const item = getDb().prepare('SELECT status FROM pedido_itens WHERE id = ?').get(item_id) as any;
    if (!item) throw new Error('Peça da encomenda não encontrada.');
    if (!TRANSICOES[status]?.includes(item.status))
      throw new Error(`Não é possível mudar de "${item.status}" para "${status}".`);
    const liberaReserva = status === 'anotado' || status === 'cancelado';
    getDb()
      .prepare(`UPDATE pedido_itens SET status = ?${liberaReserva ? ', compra_item_id = NULL' : ''} WHERE id = ?`)
      .run(status, item_id);
  },

  /** Atende a peça com uma que já está no estoque: reserva e marca como "chegou". */
  reservarDoEstoque({ item_id, compra_item_id }: { item_id: number; compra_item_id: number }): void {
    transaction(() => {
      const db = getDb();
      const item = db.prepare('SELECT status, quantidade FROM pedido_itens WHERE id = ?').get(item_id) as any;
      if (!item || !['anotado', 'comprado'].includes(item.status)) throw new Error('Só peças ainda não recebidas podem ser reservadas do estoque.');
      const est = db
        .prepare(`SELECT ci.descricao, ci.quantidade - ${VENDIDOS_SQL} - ${RESERVADOS_SQL} AS disponivel FROM compra_itens ci WHERE ci.id = ?`)
        .get(compra_item_id) as any;
      if (!est) throw new Error('Peça de estoque não encontrada.');
      if (est.disponivel < item.quantidade) throw new Error(`"${est.descricao}" não tem ${item.quantidade} unidade(s) livre(s) no estoque.`);
      db.prepare("UPDATE pedido_itens SET compra_item_id = ?, status = 'chegou' WHERE id = ?").run(compra_item_id, item_id);
    });
  },

  /**
   * Cria a venda com as peças que já chegaram. O preço é o combinado com a cliente; o custo vem
   * da entrada vinculada (peças sem entrada entram como item avulso, sem custo). O sinal ainda não
   * usado vira o primeiro recebimento da venda, com a data da encomenda.
   */
  gerarVenda({ pedido_id, data, vencimento }: { pedido_id: number; data?: string; vencimento?: string | null }): number {
    return transaction(() => {
      const db = getDb();
      const p = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(pedido_id) as any;
      if (!p) throw new Error('Encomenda não encontrada.');
      const prontos = db.prepare("SELECT * FROM pedido_itens WHERE pedido_id = ? AND status = 'chegou' ORDER BY id").all(pedido_id) as any[];
      if (!prontos.length) throw new Error('Nenhuma peça desta encomenda está marcada como "chegou".');

      // Libera a reserva antes de vender (senão a própria reserva bloquearia o estoque).
      const ids = prontos.map((i) => i.id);
      db.prepare(`UPDATE pedido_itens SET status = 'entregue' WHERE id IN (${ids.map(() => '?').join(',')})`).run(...ids);

      const dia = data || hoje();
      const vendaId = vendas.salvar({
        cliente_id: p.cliente_id,
        data: dia,
        vencimento: vencimento === undefined ? dia : vencimento,
        desconto: 0,
        observacao: `Encomenda #${pedido_id}`,
        itens: prontos.map((i) => ({
          compra_item_id: i.compra_item_id,
          descricao: [i.descricao, i.tamanho, i.cor].filter(Boolean).join(' · '),
          quantidade: i.quantidade,
          preco_unitario: fromCents(i.preco),
        })),
      });
      db.prepare(`UPDATE pedido_itens SET venda_id = ? WHERE id IN (${ids.map(() => '?').join(',')})`).run(vendaId, ...ids);

      const total = prontos.reduce((s, i) => s + i.quantidade * i.preco, 0);
      const usar = Math.min(p.sinal - p.sinal_usado, total);
      if (usar > 0) {
        db.prepare(
          'INSERT INTO recebimentos (venda_id, data, valor, forma, descricao, pedido_id) VALUES (?, ?, ?, ?, ?, ?)',
        ).run(vendaId, p.data, usar, p.sinal_forma || 'pix', `Sinal da encomenda #${pedido_id}`, pedido_id);
        db.prepare('UPDATE pedidos SET sinal_usado = sinal_usado + ? WHERE id = ?').run(usar, pedido_id);
      }
      return vendaId;
    });
  },

  /** Peças ainda a comprar, agrupadas por fornecedor — para fazer um pedido só por loja. */
  listaCompras() {
    const rows = getDb()
      .prepare(
        `SELECT pi.*, f.nome AS fornecedor, p.prazo, p.id AS pedido_id, cl.nome AS cliente
           FROM pedido_itens pi
           JOIN pedidos p ON p.id = pi.pedido_id
           JOIN clientes cl ON cl.id = p.cliente_id
           LEFT JOIN fornecedores f ON f.id = pi.fornecedor_id
          WHERE pi.status = 'anotado'
          ORDER BY f.nome IS NULL, f.nome, COALESCE(p.prazo, '9999'), pi.id`,
      )
      .all() as any[];
    const grupos = new Map<string, any>();
    for (const r of rows) {
      const chave = String(r.fornecedor_id ?? 0);
      const g = grupos.get(chave) ?? { fornecedor_id: r.fornecedor_id, fornecedor: r.fornecedor ?? 'Sem fornecedor definido', itens: [], pecas: 0 };
      g.itens.push(mapItem(r));
      g.pecas += r.quantidade;
      grupos.set(chave, g);
    }
    return [...grupos.values()];
  },

  /** Peças de encomenda que ainda não têm entrada vinculada (para incluir ao lançar uma compra). */
  pendentesParaEntrada() {
    const rows = getDb()
      .prepare(
        `SELECT pi.*, cl.nome AS cliente, f.nome AS fornecedor
           FROM pedido_itens pi
           JOIN pedidos p ON p.id = pi.pedido_id
           JOIN clientes cl ON cl.id = p.cliente_id
           LEFT JOIN fornecedores f ON f.id = pi.fornecedor_id
          WHERE pi.status IN ('anotado','comprado') AND pi.compra_item_id IS NULL
          ORDER BY f.nome IS NULL, f.nome, pi.id`,
      )
      .all() as any[];
    return rows.map(mapItem);
  },

  /** Números para o dashboard. */
  resumo() {
    const abertos = pedidos.listar().filter((p) => p.situacao === 'aberto');
    const soma = (s: StatusItem) => abertos.reduce((n, p) => n + p.contagem[s], 0);
    return {
      a_comprar: soma('anotado'),
      aguardando: soma('comprado'),
      prontos: soma('chegou'),
      atrasados: abertos.filter((p) => p.atrasado).length,
      sinal_em_aberto: Math.round(abertos.reduce((s, p) => s + p.sinal_restante, 0) * 100) / 100,
    };
  },
};
