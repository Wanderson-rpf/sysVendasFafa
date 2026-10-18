import { fromCents, getDb, toCents } from '../database';
import { FiltroPeriodo } from './compras';

export interface DespesaInput {
  id?: number;
  data: string;
  descricao: string;
  categoria: string;
  valor: number;
  observacao?: string | null;
}

export const despesas = {
  listar(filtro: FiltroPeriodo & { categoria?: string } = {}) {
    const rows = getDb()
      .prepare(
        `SELECT * FROM despesas
          WHERE (:de IS NULL OR data >= :de) AND (:ate IS NULL OR data <= :ate)
            AND (:categoria IS NULL OR categoria = :categoria)
          ORDER BY data DESC, id DESC`,
      )
      .all({ de: filtro.de || null, ate: filtro.ate || null, categoria: filtro.categoria || null }) as any[];
    return rows.map((r) => ({ ...r, valor: fromCents(r.valor) }));
  },

  salvar(d: DespesaInput): number {
    if (!d.descricao?.trim()) throw new Error('Informe a descrição da despesa.');
    if (toCents(d.valor) <= 0) throw new Error('Informe um valor maior que zero.');
    const p = {
      data: d.data,
      descricao: d.descricao.trim(),
      categoria: d.categoria || 'outros',
      valor: toCents(d.valor),
      observacao: d.observacao ?? null,
    };
    if (d.id) {
      getDb()
        .prepare('UPDATE despesas SET data=:data, descricao=:descricao, categoria=:categoria, valor=:valor, observacao=:observacao WHERE id=:id')
        .run({ ...p, id: d.id });
      return d.id;
    }
    return Number(
      getDb()
        .prepare('INSERT INTO despesas (data, descricao, categoria, valor, observacao) VALUES (:data, :descricao, :categoria, :valor, :observacao)')
        .run(p).lastInsertRowid,
    );
  },

  excluir(id: number): void {
    getDb().prepare('DELETE FROM despesas WHERE id = ?').run(id);
  },

  /** Total por categoria no período (para o dashboard e o rodapé da tela). */
  porCategoria(filtro: FiltroPeriodo = {}) {
    const rows = getDb()
      .prepare(
        `SELECT categoria, SUM(valor) AS valor, COUNT(*) AS qtd FROM despesas
          WHERE (:de IS NULL OR data >= :de) AND (:ate IS NULL OR data <= :ate)
          GROUP BY categoria ORDER BY valor DESC`,
      )
      .all({ de: filtro.de || null, ate: filtro.ate || null }) as any[];
    return rows.map((r) => ({ categoria: r.categoria, valor: fromCents(r.valor), qtd: r.qtd }));
  },
};
