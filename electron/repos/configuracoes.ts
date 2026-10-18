import { getDb } from '../database';

export const configuracoes = {
  todas(): Record<string, string> {
    const rows = getDb().prepare('SELECT chave, valor FROM configuracoes').all() as any[];
    return Object.fromEntries(rows.map((r) => [r.chave, r.valor]));
  },
  obter(chave: string): string | null {
    const r = getDb().prepare('SELECT valor FROM configuracoes WHERE chave = ?').get(chave) as any;
    return r?.valor ?? null;
  },
  definir(chave: string, valor: string | null): void {
    getDb()
      .prepare(
        'INSERT INTO configuracoes (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor',
      )
      .run(chave, valor);
  },
};
