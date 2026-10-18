import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, shell } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as backup from './backup';
import { closeDatabase, getDbPath, openDatabase } from './database';
import { clientes, fornecedores } from './repos/cadastros';
import { compras } from './repos/compras';
import { configuracoes } from './repos/configuracoes';
import { dashboard } from './repos/dashboard';
import { despesas } from './repos/despesas';
import { vendas } from './repos/vendas';

const DEV_URL = process.env['ELECTRON_DEV_URL'];

/**
 * O app se chamava "Sys Vendas", e a pasta de dados (userData) deriva do nome do produto.
 * Na primeira execução como "Loja da Fafá", copia os dados da pasta antiga para a nova.
 * A pasta antiga é mantida intacta como cópia de segurança.
 */
function migrarPastaAntiga(): void {
  const novos = path.join(app.getPath('userData'), 'dados');
  const antigos = path.join(app.getPath('appData'), 'Sys Vendas', 'dados');
  if (fs.existsSync(path.join(novos, 'vendas.db')) || !fs.existsSync(path.join(antigos, 'vendas.db'))) return;
  fs.cpSync(antigos, novos, { recursive: true });
  console.log(`[migração] dados copiados de ${antigos} para ${novos}`);
}
let janela: BrowserWindow | null = null;

type Tema = 'claro' | 'escuro' | 'sistema';
function aplicarTema(tema: string | null): void {
  const mapa: Record<Tema, 'light' | 'dark' | 'system'> = { claro: 'light', escuro: 'dark', sistema: 'system' };
  nativeTheme.themeSource = mapa[(tema as Tema) ?? 'sistema'] ?? 'system';
}

/** Todas as operações expostas ao Angular. Cada uma recebe um único argumento serializável. */
const handlers: Record<string, (args: any) => unknown> = {
  'fornecedores.listar': () => fornecedores.listar(),
  'fornecedores.salvar': (f) => fornecedores.salvar(f),
  'clientes.listar': () => clientes.listar(),
  'clientes.salvar': (c) => clientes.salvar(c),

  'compras.listar': (filtro) => compras.listar(filtro),
  'compras.obter': (id) => compras.obter(id),
  'compras.salvar': (c) => compras.salvar(c),
  'compras.excluir': (id) => compras.excluir(id),
  'compras.estoque': () => compras.estoque(),

  'vendas.listar': (filtro) => vendas.listar(filtro),
  'vendas.obter': (id) => vendas.obter(id),
  'vendas.salvar': (v) => vendas.salvar(v),
  'vendas.cancelar': ({ id, cancelada }) => vendas.cancelar(id, cancelada),
  'vendas.excluir': (id) => vendas.excluir(id),
  'vendas.receber': (r) => vendas.receber(r),
  'vendas.excluirRecebimento': (id) => vendas.excluirRecebimento(id),
  'vendas.inadimplentes': () => vendas.inadimplentes(),

  'despesas.listar': (filtro) => despesas.listar(filtro),
  'despesas.salvar': (d) => despesas.salvar(d),
  'despesas.excluir': (id) => despesas.excluir(id),

  'dashboard.resumo': (filtro) => dashboard.resumo(filtro),

  'config.todas': () => configuracoes.todas(),
  'config.definir': ({ chave, valor }) => {
    configuracoes.definir(chave, valor);
    if (chave === 'tema') aplicarTema(valor);
  },

  'app.info': () => ({ versao: app.getVersion(), banco: getDbPath(), pastaBackups: backup.pastaAutomaticos() }),
  'backup.listar': () => backup.listarAutomaticos(),
  'backup.agora': () => backup.automatico(),
  'backup.abrirPasta': () => shell.openPath(backup.pastaAutomaticos()),
  'backup.exportar': async () => {
    const r = await dialog.showSaveDialog(janela!, {
      title: 'Salvar backup do banco de dados',
      defaultPath: path.join(app.getPath('documents'), backup.nomeSugerido()),
      filters: [{ name: 'Banco SQLite', extensions: ['db'] }],
    });
    return r.canceled || !r.filePath ? null : backup.exportar(r.filePath);
  },
  'backup.restaurar': async (caminho?: string) => {
    let origem = caminho;
    if (!origem) {
      const r = await dialog.showOpenDialog(janela!, {
        title: 'Escolha o backup a restaurar',
        properties: ['openFile'],
        filters: [{ name: 'Banco SQLite', extensions: ['db', 'sqlite'] }],
      });
      if (r.canceled || !r.filePaths[0]) return null;
      origem = r.filePaths[0];
    }
    const { response } = await dialog.showMessageBox(janela!, {
      type: 'warning',
      buttons: ['Restaurar', 'Cancelar'],
      defaultId: 1,
      cancelId: 1,
      title: 'Restaurar backup',
      message: 'Os dados atuais serão substituídos pelo backup selecionado.',
      detail: 'Uma cópia de segurança do banco atual será salva automaticamente antes.',
    });
    if (response !== 0) return null;
    return backup.restaurar(origem);
  },
};

ipcMain.handle('api', async (_e, op: string, args: unknown) => {
  const fn = handlers[op];
  if (!fn) return { ok: false, error: `Operação desconhecida: ${op}` };
  try {
    return { ok: true, data: await fn(args) };
  } catch (err) {
    console.error(`[api] ${op}`, err);
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
});

function criarJanela(): void {
  janela = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    title: 'Loja da Fafá',
    // No Windows o .exe já carrega o ícone; no Linux a janela precisa recebê-lo explicitamente.
    icon: path.join(__dirname, '..', 'dist', 'sys-vendas-fafa', 'browser', 'icone.png'),
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#171216' : '#fbf6f8',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (DEV_URL) {
    janela.loadURL(DEV_URL);
  } else {
    Menu.setApplicationMenu(null);
    janela.loadFile(path.join(__dirname, '..', 'dist', 'sys-vendas-fafa', 'browser', 'index.html'));
  }

  // Links externos abrem no navegador padrão, nunca dentro do app.
  janela.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  migrarPastaAntiga();
  openDatabase(path.join(app.getPath('userData'), 'dados', 'vendas.db'));
  aplicarTema(configuracoes.obter('tema'));
  criarJanela();
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && criarJanela());
});

let finalizado = false;
app.on('before-quit', () => {
  if (finalizado) return;
  finalizado = true;
  try {
    if (configuracoes.obter('backup_automatico') !== '0') backup.automatico();
  } catch (err) {
    console.error('Falha no backup automático', err);
  }
  closeDatabase();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
