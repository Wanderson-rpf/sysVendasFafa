import { Injectable } from '@angular/core';
import {
  BackupInfo,
  Cliente,
  Compra,
  CompraResumo,
  AbaEncomendas,
  Dashboard,
  Despesa,
  GrupoListaCompras,
  Pedido,
  PedidoItem,
  PedidoResumo,
  StatusEncomenda,
  Fornecedor,
  Inadimplente,
  ItemEstoque,
  ParteRecebimento,
  Periodo,
  Situacao,
  Venda,
  VendaDetalhe,
  VendaResumo,
} from './models';

declare global {
  interface Window {
    api?: { call: (op: string, args?: unknown) => Promise<unknown> };
  }
}

/** Ponte tipada para o processo principal do Electron (ver electron/main.ts → handlers). */
@Injectable({ providedIn: 'root' })
export class ApiService {
  readonly disponivel = !!window.api;

  private call<T>(op: string, args?: unknown): Promise<T> {
    if (!window.api) {
      return Promise.reject(new Error('Rode o sistema pelo Electron (npm start) para acessar o banco de dados.'));
    }
    return window.api.call(op, args) as Promise<T>;
  }

  fornecedores = {
    listar: () => this.call<Fornecedor[]>('fornecedores.listar'),
    salvar: (f: Fornecedor) => this.call<number>('fornecedores.salvar', f),
  };

  clientes = {
    listar: () => this.call<Cliente[]>('clientes.listar'),
    salvar: (c: Cliente) => this.call<number>('clientes.salvar', c),
  };

  compras = {
    listar: (p: Periodo = {}) => this.call<CompraResumo[]>('compras.listar', p),
    obter: (id: number) => this.call<Compra>('compras.obter', id),
    salvar: (c: Compra) => this.call<number>('compras.salvar', c),
    excluir: (id: number) => this.call<void>('compras.excluir', id),
    estoque: () => this.call<ItemEstoque[]>('compras.estoque'),
  };

  vendas = {
    listar: (f: Periodo & { situacao?: Situacao | 'pendentes' | ''; cliente_id?: number | null } = {}) =>
      this.call<VendaResumo[]>('vendas.listar', f),
    obter: (id: number) => this.call<VendaDetalhe>('vendas.obter', id),
    salvar: (v: Venda) => this.call<number>('vendas.salvar', v),
    cancelar: (id: number, cancelada: boolean) => this.call<void>('vendas.cancelar', { id, cancelada }),
    excluir: (id: number) => this.call<void>('vendas.excluir', id),
    receber: (venda_id: number, data: string, partes: ParteRecebimento[]) =>
      this.call<void>('vendas.receber', { venda_id, data, partes }),
    excluirRecebimento: (id: number) => this.call<void>('vendas.excluirRecebimento', id),
    inadimplentes: () => this.call<Inadimplente[]>('vendas.inadimplentes'),
  };

  despesas = {
    listar: (f: Periodo & { categoria?: string } = {}) => this.call<Despesa[]>('despesas.listar', f),
    salvar: (d: Despesa) => this.call<number>('despesas.salvar', d),
    excluir: (id: number) => this.call<void>('despesas.excluir', id),
  };

  pedidos = {
    listar: (aba: AbaEncomendas) => this.call<PedidoResumo[]>('pedidos.listar', { aba }),
    obter: (id: number) => this.call<PedidoResumo>('pedidos.obter', id),
    salvar: (p: Pedido) => this.call<number>('pedidos.salvar', p),
    excluir: (id: number) => this.call<void>('pedidos.excluir', id),
    alterarStatus: (item_id: number, status: StatusEncomenda) =>
      this.call<void>('pedidos.alterarStatus', { item_id, status }),
    reservarDoEstoque: (item_id: number, compra_item_id: number) =>
      this.call<void>('pedidos.reservarDoEstoque', { item_id, compra_item_id }),
    gerarVenda: (pedido_id: number, data: string, vencimento: string | null) =>
      this.call<number>('pedidos.gerarVenda', { pedido_id, data, vencimento }),
    listaCompras: () => this.call<GrupoListaCompras[]>('pedidos.listaCompras'),
    pendentesParaEntrada: () => this.call<PedidoItem[]>('pedidos.pendentesParaEntrada'),
  };

  dashboard = {
    resumo: (p: Periodo) => this.call<Dashboard>('dashboard.resumo', p),
  };

  config = {
    todas: () => this.call<Record<string, string>>('config.todas'),
    definir: (chave: string, valor: string | null) => this.call<void>('config.definir', { chave, valor }),
  };

  app = {
    info: () => this.call<{ versao: string; banco: string; pastaBackups: string }>('app.info'),
  };

  backup = {
    listar: () => this.call<BackupInfo[]>('backup.listar'),
    agora: () => this.call<string>('backup.agora'),
    abrirPasta: () => this.call<string>('backup.abrirPasta'),
    exportar: () => this.call<string | null>('backup.exportar'),
    restaurar: (caminho?: string) => this.call<string | null>('backup.restaurar', caminho),
  };
}
