import * as fs from 'node:fs';
import * as path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { closeDatabase, getDb, getDbPath, openDatabase } from './database';

const MANTER_AUTOMATICOS = 15;

function carimbo(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export function nomeSugerido(): string {
  return `loja-da-fafa-backup-${carimbo()}.db`;
}

/** Gera uma cópia consistente do banco (mesmo com WAL ativo) usando VACUUM INTO. */
export function exportar(destino: string): string {
  if (fs.existsSync(destino)) fs.rmSync(destino);
  getDb().exec(`VACUUM INTO '${destino.replace(/'/g, "''")}'`);
  return destino;
}

export function pastaAutomaticos(): string {
  return path.join(path.dirname(getDbPath()), 'backups');
}

export function automatico(): string {
  const pasta = pastaAutomaticos();
  fs.mkdirSync(pasta, { recursive: true });
  const destino = exportar(path.join(pasta, `auto-${carimbo()}.db`));

  const antigos = listarAutomaticos().slice(MANTER_AUTOMATICOS);
  for (const b of antigos) fs.rmSync(b.caminho, { force: true });
  return destino;
}

export function listarAutomaticos() {
  const pasta = pastaAutomaticos();
  if (!fs.existsSync(pasta)) return [];
  return fs
    .readdirSync(pasta)
    .filter((f) => f.endsWith('.db'))
    .map((f) => {
      const caminho = path.join(pasta, f);
      const st = fs.statSync(caminho);
      return { nome: f, caminho, tamanho: st.size, data: st.mtime.toISOString() };
    })
    .sort((a, b) => b.data.localeCompare(a.data));
}

/** Confere se o arquivo é um banco deste sistema antes de substituir o atual. */
function validar(origem: string): void {
  let conn: DatabaseSync | null = null;
  try {
    conn = new DatabaseSync(origem, { readOnly: true });
    const t = conn
      .prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name IN ('vendas','compras','recebimentos')")
      .get() as { n: number };
    if (t.n !== 3) throw new Error();
  } catch {
    throw new Error('O arquivo selecionado não é um backup válido do sistema.');
  } finally {
    conn?.close();
  }
}

/** Restaura um backup. Antes, salva uma cópia de segurança do banco atual. */
export function restaurar(origem: string): string {
  validar(origem);
  const seguranca = automatico();
  const atual = getDbPath();

  closeDatabase();
  try {
    for (const sufixo of ['-wal', '-shm']) fs.rmSync(atual + sufixo, { force: true });
    fs.copyFileSync(origem, atual);
  } finally {
    openDatabase(atual);
  }
  return seguranca;
}
