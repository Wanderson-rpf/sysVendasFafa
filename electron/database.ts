import { DatabaseSync } from 'node:sqlite';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Valores monetários são gravados em CENTAVOS (INTEGER) para evitar erro de ponto flutuante.
 * A conversão acontece na borda dos repositórios: o Angular só enxerga reais (number).
 */
export const toCents = (v: unknown): number => Math.round((Number(v) || 0) * 100);
export const fromCents = (v: unknown): number => (Number(v) || 0) / 100;

let db: DatabaseSync | null = null;
let dbPath = '';

const MIGRATIONS: string[] = [
  // v1 — esquema inicial
  `
  CREATE TABLE fornecedores (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    nome        TEXT NOT NULL,
    plataforma  TEXT,
    contato     TEXT,
    observacao  TEXT,
    ativo       INTEGER NOT NULL DEFAULT 1,
    criado_em   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE clientes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    nome        TEXT NOT NULL,
    telefone    TEXT,
    observacao  TEXT,
    ativo       INTEGER NOT NULL DEFAULT 1,
    criado_em   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  -- Lançamento de entrada (um pedido/lote de compra). Pode envolver vários fornecedores via itens.
  CREATE TABLE compras (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    data        TEXT NOT NULL,
    descricao   TEXT,
    frete       INTEGER NOT NULL DEFAULT 0,
    desconto    INTEGER NOT NULL DEFAULT 0,  -- cupom/desconto obtido na compra
    comissao    INTEGER NOT NULL DEFAULT 0,  -- comissão/cashback recebido (ex.: afiliado Shopee)
    observacao  TEXT,
    criado_em   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  -- Cada item é também a unidade de estoque disponível para venda.
  CREATE TABLE compra_itens (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    compra_id       INTEGER NOT NULL REFERENCES compras(id) ON DELETE CASCADE,
    fornecedor_id   INTEGER REFERENCES fornecedores(id),
    descricao       TEXT NOT NULL,
    tamanho         TEXT,
    quantidade      INTEGER NOT NULL DEFAULT 1,
    custo_unitario  INTEGER NOT NULL DEFAULT 0,  -- preço pago por unidade
    custo_efetivo   INTEGER NOT NULL DEFAULT 0,  -- custo unitário após ratear frete/desconto/comissão
    preco_venda     INTEGER NOT NULL DEFAULT 0   -- preço de revenda pretendido por unidade
  );

  CREATE TABLE vendas (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id  INTEGER REFERENCES clientes(id),
    data        TEXT NOT NULL,
    vencimento  TEXT,
    desconto    INTEGER NOT NULL DEFAULT 0,
    observacao  TEXT,
    cancelada   INTEGER NOT NULL DEFAULT 0,
    criado_em   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE venda_itens (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    venda_id        INTEGER NOT NULL REFERENCES vendas(id) ON DELETE CASCADE,
    compra_item_id  INTEGER REFERENCES compra_itens(id),
    descricao       TEXT NOT NULL,
    quantidade      INTEGER NOT NULL DEFAULT 1,
    preco_unitario  INTEGER NOT NULL DEFAULT 0,
    custo_unitario  INTEGER NOT NULL DEFAULT 0   -- foto do custo efetivo no momento da venda
  );

  -- Cada linha é uma parte do pagamento: permite parcial, misto (cartão + dinheiro) e permuta.
  CREATE TABLE recebimentos (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    venda_id    INTEGER NOT NULL REFERENCES vendas(id) ON DELETE CASCADE,
    data        TEXT NOT NULL,
    valor       INTEGER NOT NULL,
    forma       TEXT NOT NULL,   -- dinheiro | pix | cartao_credito | cartao_debito | transferencia | servico | produto | outro
    descricao   TEXT,            -- obrigatório na prática para serviço/produto: o que foi recebido
    criado_em   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE configuracoes (
    chave  TEXT PRIMARY KEY,
    valor  TEXT
  );

  CREATE INDEX ix_compra_itens_compra ON compra_itens(compra_id);
  CREATE INDEX ix_venda_itens_venda ON venda_itens(venda_id);
  CREATE INDEX ix_venda_itens_estoque ON venda_itens(compra_item_id);
  CREATE INDEX ix_recebimentos_venda ON recebimentos(venda_id);
  CREATE INDEX ix_vendas_data ON vendas(data);
  CREATE INDEX ix_compras_data ON compras(data);
  `,
  // v2 — despesas avulsas (embalagem, entrega, taxas...) que reduzem o lucro líquido
  `
  CREATE TABLE despesas (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    data        TEXT NOT NULL,
    descricao   TEXT NOT NULL,
    categoria   TEXT NOT NULL,
    valor       INTEGER NOT NULL,
    observacao  TEXT,
    criado_em   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE INDEX ix_despesas_data ON despesas(data);
  `,
  // v3 — encomendas: peças que as clientes pedem, do "anotado" até virar venda
  `
  CREATE TABLE pedidos (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id   INTEGER NOT NULL REFERENCES clientes(id),
    data         TEXT NOT NULL,
    prazo        TEXT,
    sinal        INTEGER NOT NULL DEFAULT 0,  -- adiantamento pago pela cliente
    sinal_forma  TEXT,
    sinal_usado  INTEGER NOT NULL DEFAULT 0,  -- quanto do sinal já virou recebimento em vendas
    observacao   TEXT,
    criado_em    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  -- status: anotado → comprado → chegou → entregue (ou cancelado).
  -- Com status comprado/chegou e compra_item_id preenchido, a peça fica RESERVADA para a cliente.
  CREATE TABLE pedido_itens (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    pedido_id       INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
    descricao       TEXT NOT NULL,
    tamanho         TEXT,
    cor             TEXT,
    referencia      TEXT,                     -- link do anúncio ou código, para achar a peça de novo
    quantidade      INTEGER NOT NULL DEFAULT 1,
    preco           INTEGER NOT NULL DEFAULT 0, -- preço combinado com a cliente (por unidade)
    fornecedor_id   INTEGER REFERENCES fornecedores(id),
    status          TEXT NOT NULL DEFAULT 'anotado',
    compra_item_id  INTEGER REFERENCES compra_itens(id) ON DELETE SET NULL,
    venda_id        INTEGER REFERENCES vendas(id) ON DELETE SET NULL
  );

  -- Recebimento que veio do sinal de uma encomenda (para devolver o sinal se a venda for excluída).
  ALTER TABLE recebimentos ADD COLUMN pedido_id INTEGER REFERENCES pedidos(id) ON DELETE SET NULL;

  CREATE INDEX ix_pedido_itens_pedido ON pedido_itens(pedido_id);
  CREATE INDEX ix_pedido_itens_status ON pedido_itens(status);
  CREATE INDEX ix_pedido_itens_compra ON pedido_itens(compra_item_id);
  CREATE INDEX ix_pedido_itens_venda  ON pedido_itens(venda_id);
  `,
];

export function openDatabase(file: string): DatabaseSync {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  dbPath = file;
  db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  migrate(db);
  return db;
}

export function closeDatabase(): void {
  db?.close();
  db = null;
}

export function getDb(): DatabaseSync {
  if (!db) throw new Error('Banco de dados não está aberto');
  return db;
}

export function getDbPath(): string {
  return dbPath;
}

function migrate(conn: DatabaseSync): void {
  const row = conn.prepare('PRAGMA user_version').get() as { user_version: number };
  for (let v = row.user_version; v < MIGRATIONS.length; v++) {
    transaction(() => {
      conn.exec(MIGRATIONS[v]);
      conn.exec(`PRAGMA user_version = ${v + 1}`);
    }, conn);
  }
}

/**
 * Executa fn numa transação. Pode ser aninhada (ex.: gerar venda a partir de uma encomenda chama
 * vendas.salvar dentro da própria transação): as internas viram SAVEPOINTs, e um erro em qualquer
 * nível desfaz só aquele nível — quem chamou decide se propaga.
 */
let profundidade = 0;
export function transaction<T>(fn: () => T, conn: DatabaseSync = getDb()): T {
  const nome = `sp${profundidade}`;
  conn.exec(profundidade === 0 ? 'BEGIN' : `SAVEPOINT ${nome}`);
  profundidade++;
  try {
    const result = fn();
    profundidade--;
    conn.exec(profundidade === 0 ? 'COMMIT' : `RELEASE ${nome}`);
    return result;
  } catch (err) {
    profundidade--;
    conn.exec(profundidade === 0 ? 'ROLLBACK' : `ROLLBACK TO ${nome}; RELEASE ${nome}`);
    throw err;
  }
}
