import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  {
    path: 'dashboard',
    title: 'Dashboard · Loja da Fafá',
    loadComponent: () => import('./pages/dashboard/dashboard').then((m) => m.DashboardPage),
  },
  {
    path: 'compras',
    title: 'Entradas · Loja da Fafá',
    loadComponent: () => import('./pages/compras/compras').then((m) => m.ComprasPage),
  },
  {
    path: 'vendas',
    title: 'Vendas · Loja da Fafá',
    loadComponent: () => import('./pages/vendas/vendas').then((m) => m.VendasPage),
  },
  {
    path: 'despesas',
    title: 'Despesas · Loja da Fafá',
    loadComponent: () => import('./pages/despesas/despesas').then((m) => m.DespesasPage),
  },
  {
    path: 'clientes',
    title: 'Clientes · Loja da Fafá',
    loadComponent: () => import('./pages/clientes/clientes').then((m) => m.ClientesPage),
  },
  {
    path: 'fornecedores',
    title: 'Fornecedores · Loja da Fafá',
    loadComponent: () => import('./pages/fornecedores/fornecedores').then((m) => m.FornecedoresPage),
  },
  {
    path: 'configuracoes',
    title: 'Configurações · Loja da Fafá',
    loadComponent: () => import('./pages/configuracoes/configuracoes').then((m) => m.ConfiguracoesPage),
  },
  { path: '**', redirectTo: 'dashboard' },
];
