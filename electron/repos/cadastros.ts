import { fromCents, getDb } from '../database';

export interface Fornecedor {
  id?: number;
  nome: string;
  plataforma?: string | null;
  contato?: string | null;
  observacao?: string | null;
  ativo?: number;
}

export interface Cliente {
  id?: number;
  nome: string;
  telefone?: string | null;
  observacao?: string | null;
  ativo?: number;
}

export const fornecedores = {
  listar() {
    const rows = getDb()
      .prepare(
        `SELECT f.*,
                COALESCE(SUM(ci.quantidade * ci.custo_unitario), 0) AS total_comprado,
                COALESCE(SUM(ci.quantidade), 0)                     AS pecas,
                MAX(c.data)                                         AS ultima_compra
           FROM fornecedores f
           LEFT JOIN compra_itens ci ON ci.fornecedor_id = f.id
           LEFT JOIN compras c       ON c.id = ci.compra_id
          GROUP BY f.id
          ORDER BY f.ativo DESC, f.nome`,
      )
      .all() as any[];
    return rows.map((r) => ({ ...r, total_comprado: fromCents(r.total_comprado) }));
  },
  salvar(f: Fornecedor): number {
    const params = {
      nome: f.nome.trim(),
      plataforma: f.plataforma ?? null,
      contato: f.contato ?? null,
      observacao: f.observacao ?? null,
      ativo: f.ativo ?? 1,
    };
    if (f.id) {
      getDb()
        .prepare(
          `UPDATE fornecedores SET nome=:nome, plataforma=:plataforma, contato=:contato,
           observacao=:observacao, ativo=:ativo WHERE id=:id`,
        )
        .run({ ...params, id: f.id });
      return f.id;
    }
    const r = getDb()
      .prepare(
        `INSERT INTO fornecedores (nome, plataforma, contato, observacao, ativo)
         VALUES (:nome, :plataforma, :contato, :observacao, :ativo)`,
      )
      .run(params);
    return Number(r.lastInsertRowid);
  },
};

export const clientes = {
  listar() {
    const rows = getDb()
      .prepare(
        `SELECT cl.*,
                COUNT(v.id) AS qtd_compras,
                MAX(v.data) AS ultima_compra,
                COALESCE(SUM((SELECT COALESCE(SUM(quantidade * preco_unitario),0) FROM venda_itens WHERE venda_id = v.id) - v.desconto), 0) AS total_comprado,
                COALESCE(SUM((SELECT COALESCE(SUM(valor),0) FROM recebimentos WHERE venda_id = v.id)), 0) AS total_pago
           FROM clientes cl
           LEFT JOIN vendas v ON v.cliente_id = cl.id AND v.cancelada = 0
          GROUP BY cl.id
          ORDER BY cl.ativo DESC, cl.nome`,
      )
      .all() as any[];
    return rows.map((r) => ({
      ...r,
      total_comprado: fromCents(r.total_comprado),
      total_pago: fromCents(r.total_pago),
      saldo_devedor: fromCents(Math.max(0, r.total_comprado - r.total_pago)),
    }));
  },
  salvar(c: Cliente): number {
    const params = {
      nome: c.nome.trim(),
      telefone: c.telefone ?? null,
      observacao: c.observacao ?? null,
      ativo: c.ativo ?? 1,
    };
    if (c.id) {
      getDb()
        .prepare('UPDATE clientes SET nome=:nome, telefone=:telefone, observacao=:observacao, ativo=:ativo WHERE id=:id')
        .run({ ...params, id: c.id });
      return c.id;
    }
    const r = getDb()
      .prepare('INSERT INTO clientes (nome, telefone, observacao, ativo) VALUES (:nome, :telefone, :observacao, :ativo)')
      .run(params);
    return Number(r.lastInsertRowid);
  },
};
