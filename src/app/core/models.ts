// Todos os valores monetários aqui estão em REAIS. O Electron converte de/para centavos.

export interface Fornecedor {
  id?: number;
  nome: string;
  plataforma?: string | null;
  contato?: string | null;
  observacao?: string | null;
  ativo?: number;
  // somente leitura (calculados na listagem)
  total_comprado?: number;
  pecas?: number;
  ultima_compra?: string | null;
}

export interface Cliente {
  id?: number;
  nome: string;
  telefone?: string | null;
  observacao?: string | null;
  ativo?: number;
  // somente leitura (calculados na listagem)
  qtd_compras?: number;
  ultima_compra?: string | null;
  total_comprado?: number;
  total_pago?: number;
  saldo_devedor?: number;
}

export interface Despesa {
  id?: number;
  data: string;
  descricao: string;
  categoria: string;
  valor: number;
  observacao?: string | null;
}

// ------------------------------------------------------------------ Encomendas

export type StatusEncomenda = 'anotado' | 'comprado' | 'chegou' | 'entregue' | 'cancelado';
export type AbaEncomendas = 'a_comprar' | 'aguardando' | 'prontos' | 'finalizados' | 'todos';

export interface PedidoItem {
  id?: number;
  descricao: string;
  tamanho?: string | null;
  cor?: string | null;
  referencia?: string | null;
  quantidade: number;
  preco: number;
  fornecedor_id?: number | null;
  // somente leitura
  fornecedor?: string | null;
  status?: StatusEncomenda;
  compra_item_id?: number | null;
  venda_id?: number | null;
  cliente?: string;
  pedido_id?: number;
}

export interface Pedido {
  id?: number;
  cliente_id: number | null;
  data: string;
  prazo?: string | null;
  sinal: number;
  sinal_forma?: string | null;
  observacao?: string | null;
  itens: PedidoItem[];
}

export interface PedidoResumo extends Pedido {
  id: number;
  cliente: string;
  telefone: string | null;
  sinal_restante: number;
  total: number;
  contagem: Record<StatusEncomenda, number>;
  situacao: 'aberto' | 'entregue' | 'cancelado';
  atrasado: boolean;
}

export interface GrupoListaCompras {
  fornecedor_id: number | null;
  fornecedor: string;
  pecas: number;
  itens: (PedidoItem & { cliente: string; prazo: string | null })[];
}

export interface ResumoEncomendas {
  a_comprar: number;
  aguardando: number;
  prontos: number;
  atrasados: number;
  sinal_em_aberto: number;
}

export const ROTULO_STATUS_ENCOMENDA: Record<StatusEncomenda, string> = {
  anotado: 'A comprar',
  comprado: 'Comprado',
  chegou: 'Chegou',
  entregue: 'Entregue',
  cancelado: 'Cancelado',
};

export const CATEGORIAS_DESPESA: { valor: string; rotulo: string }[] = [
  { valor: 'embalagem', rotulo: 'Embalagem' },
  { valor: 'entrega', rotulo: 'Entrega / transporte' },
  { valor: 'taxa', rotulo: 'Taxas (maquininha, plataforma)' },
  { valor: 'divulgacao', rotulo: 'Divulgação' },
  { valor: 'material', rotulo: 'Material / acessórios' },
  { valor: 'outros', rotulo: 'Outros' },
];

export const ROTULO_CATEGORIA: Record<string, string> = Object.fromEntries(
  CATEGORIAS_DESPESA.map((c) => [c.valor, c.rotulo]),
);

export interface Periodo {
  de?: string;
  ate?: string;
}

export interface CompraResumo {
  id: number;
  data: string;
  descricao: string | null;
  fornecedores: string[];
  qtd_pecas: number;
  valor_produtos: number;
  frete: number;
  desconto: number;
  comissao: number;
  total_investido: number;
  valor_venda_previsto: number;
  lucro_previsto: number;
}

export interface CompraItem {
  id?: number;
  fornecedor_id: number | null;
  descricao: string;
  tamanho?: string | null;
  quantidade: number;
  custo_unitario: number;
  preco_venda: number;
  custo_efetivo?: number;
  vendidos?: number;
  /** item de encomenda atendido por esta peça */
  pedido_item_id?: number | null;
  /** somente leitura: nome(s) da(s) cliente(s) da encomenda */
  encomenda_de?: string | null;
}

export interface Compra {
  id?: number;
  data: string;
  descricao?: string | null;
  frete: number;
  desconto: number;
  comissao: number;
  observacao?: string | null;
  itens: CompraItem[];
}

export interface ItemEstoque {
  id: number;
  descricao: string;
  tamanho: string | null;
  custo_efetivo: number;
  preco_venda: number;
  fornecedor: string | null;
  data_compra: string;
  disponivel: number;
}

export type Situacao = 'quitada' | 'parcial' | 'aberta' | 'atrasada' | 'cancelada';

export type FormaPagamento =
  | 'dinheiro'
  | 'pix'
  | 'cartao_credito'
  | 'cartao_debito'
  | 'transferencia'
  | 'servico'
  | 'produto'
  | 'outro';

export interface VendaResumo {
  id: number;
  cliente_id: number | null;
  cliente: string;
  telefone: string | null;
  data: string;
  vencimento: string | null;
  observacao: string | null;
  qtd_pecas: number;
  desconto: number;
  total: number;
  custo: number;
  lucro: number;
  recebido: number;
  saldo: number;
  situacao: Situacao;
  dias_atraso: number;
}

export interface VendaItem {
  id?: number;
  compra_item_id: number | null;
  descricao: string;
  quantidade: number;
  preco_unitario: number;
  custo_unitario?: number;
}

export interface Recebimento {
  id: number;
  venda_id: number;
  data: string;
  valor: number;
  forma: FormaPagamento;
  descricao: string | null;
}

export interface VendaDetalhe extends VendaResumo {
  itens: VendaItem[];
  recebimentos: Recebimento[];
}

export interface Venda {
  id?: number;
  cliente_id: number | null;
  data: string;
  vencimento: string | null;
  desconto: number;
  observacao?: string | null;
  itens: VendaItem[];
}

export interface ParteRecebimento {
  valor: number;
  forma: FormaPagamento;
  descricao?: string | null;
}

export interface Inadimplente {
  cliente_id: number | null;
  cliente: string;
  telefone: string | null;
  vendas: number;
  saldo: number;
  maior_atraso: number;
}

export interface ResumoMensal {
  mes: string;
  vendido: number;
  investido: number;
  despesas: number;
  recebido: number;
}

export interface Dashboard {
  vendido: number;
  custo_vendido: number;
  lucro_bruto: number;
  lucro_liquido: number;
  /** margem líquida (lucro líquido / vendido) */
  margem: number;
  qtd_vendas: number;
  pecas_vendidas: number;
  investido: number;
  despesas: number;
  despesas_categoria: { categoria: string; valor: number; qtd: number }[];
  recebido: number;
  saldo_caixa: number;
  a_receber: number;
  inadimplente: number;
  estoque: { pecas: number; valor_custo: number; valor_venda: number };
  formas: { forma: FormaPagamento; valor: number; qtd: number }[];
  inadimplentes: Inadimplente[];
  mensal: ResumoMensal[];
  encomendas: ResumoEncomendas;
}

export interface BackupInfo {
  nome: string;
  caminho: string;
  tamanho: number;
  data: string;
}

export const FORMAS_PAGAMENTO: { valor: FormaPagamento; rotulo: string }[] = [
  { valor: 'dinheiro', rotulo: 'Dinheiro' },
  { valor: 'pix', rotulo: 'Pix' },
  { valor: 'cartao_credito', rotulo: 'Cartão de crédito' },
  { valor: 'cartao_debito', rotulo: 'Cartão de débito' },
  { valor: 'transferencia', rotulo: 'Transferência' },
  { valor: 'servico', rotulo: 'Serviço (permuta)' },
  { valor: 'produto', rotulo: 'Produto (permuta)' },
  { valor: 'outro', rotulo: 'Outro' },
];

export const ROTULO_FORMA: Record<string, string> = Object.fromEntries(
  FORMAS_PAGAMENTO.map((f) => [f.valor, f.rotulo]),
);

export const ROTULO_SITUACAO: Record<Situacao, string> = {
  quitada: 'Quitada',
  parcial: 'Parcial',
  aberta: 'Em aberto',
  atrasada: 'Atrasada',
  cancelada: 'Cancelada',
};
