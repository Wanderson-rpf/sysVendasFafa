import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { ConfirmService } from '../../core/confirm.service';
import { arred, BrlPipe, DataBrPipe, formatarBrl, hoje } from '../../core/format';
import {
  AbaEncomendas,
  Cliente,
  FORMAS_PAGAMENTO,
  Fornecedor,
  GrupoListaCompras,
  ItemEstoque,
  Pedido,
  PedidoItem,
  PedidoResumo,
  ROTULO_FORMA,
  ROTULO_STATUS_ENCOMENDA,
  StatusEncomenda,
} from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { Modal } from '../../shared/modal';
import { MoedaDirective } from '../../shared/moeda.directive';
import { soDigitos, TelefonePipe } from '../../shared/telefone';

const itemVazio = (): PedidoItem => ({ descricao: '', tamanho: '', cor: '', referencia: '', quantidade: 1, preco: 0, fornecedor_id: null });

interface GerandoVenda {
  pedido: PedidoResumo;
  itens: PedidoItem[];
  total: number;
  sinal: number;
  data: string;
  vencimento: string;
}

@Component({
  selector: 'app-encomendas',
  imports: [FormsModule, BrlPipe, DataBrPipe, TelefonePipe, Modal, MoedaDirective],
  templateUrl: './encomendas.html',
  styleUrl: './encomendas.scss',
})
export class EncomendasPage implements OnInit {
  protected api = inject(ApiService);
  private toast = inject(ToastService);
  private confirmacao = inject(ConfirmService);
  private router = inject(Router);

  protected readonly rotuloStatus = ROTULO_STATUS_ENCOMENDA;
  protected readonly rotuloForma = ROTULO_FORMA;
  protected readonly formas = FORMAS_PAGAMENTO.filter((f) => !['servico', 'produto'].includes(f.valor));

  protected readonly abas: { valor: AbaEncomendas; rotulo: string; dica: string }[] = [
    { valor: 'a_comprar', rotulo: 'A comprar', dica: 'Peças anotadas que ainda não foram compradas' },
    { valor: 'aguardando', rotulo: 'Aguardando chegar', dica: 'Já compradas, esperando o fornecedor entregar' },
    { valor: 'prontos', rotulo: 'Prontas p/ entregar', dica: 'Chegaram: é só avisar a cliente e gerar a venda' },
    { valor: 'finalizados', rotulo: 'Finalizadas', dica: 'Entregues ou canceladas' },
    { valor: 'todos', rotulo: 'Todas', dica: '' },
  ];

  protected readonly aba = signal<AbaEncomendas>('a_comprar');
  protected readonly busca = signal('');
  protected readonly todos = signal<PedidoResumo[]>([]);
  protected readonly clientes = signal<Cliente[]>([]);
  protected readonly fornecedores = signal<Fornecedor[]>([]);

  protected readonly editando = signal<Pedido | null>(null);
  protected readonly listaCompras = signal<GrupoListaCompras[] | null>(null);
  protected readonly reservando = signal<{ item: PedidoItem; estoque: ItemEstoque[]; filtro: string } | null>(null);
  protected readonly gerando = signal<GerandoVenda | null>(null);
  protected readonly ocupado = signal(false);
  protected novoCliente: string | null = null;

  /** Contador de cada aba (peças/encomendas em cada etapa). */
  protected readonly contagem = computed(() => {
    const l = this.todos();
    return {
      a_comprar: l.filter((p) => p.contagem.anotado > 0).length,
      aguardando: l.filter((p) => p.contagem.comprado > 0).length,
      prontos: l.filter((p) => p.contagem.chegou > 0).length,
      finalizados: l.filter((p) => p.situacao !== 'aberto').length,
      todos: l.length,
    } as Record<AbaEncomendas, number>;
  });

  protected readonly visiveis = computed(() => {
    const termo = this.busca().trim().toLowerCase();
    let l = this.todos();
    switch (this.aba()) {
      case 'a_comprar': l = l.filter((p) => p.contagem.anotado > 0); break;
      case 'aguardando': l = l.filter((p) => p.contagem.comprado > 0); break;
      case 'prontos': l = l.filter((p) => p.contagem.chegou > 0); break;
      case 'finalizados': l = l.filter((p) => p.situacao !== 'aberto').reverse(); break;
    }
    if (!termo) return l;
    return l.filter((p) => p.cliente.toLowerCase().includes(termo) || p.itens.some((i) => i.descricao.toLowerCase().includes(termo)));
  });

  ngOnInit() {
    this.carregar();
    this.carregarCadastros();
  }

  async carregar() {
    if (!this.api.disponivel) return;
    try {
      this.todos.set(await this.api.pedidos.listar('todos'));
    } catch (e) {
      this.toast.erro(e);
    }
  }

  async carregarCadastros() {
    if (!this.api.disponivel) return;
    const [c, f] = await Promise.all([this.api.clientes.listar(), this.api.fornecedores.listar()]);
    this.clientes.set(c.filter((x) => x.ativo !== 0));
    this.fornecedores.set(f.filter((x) => x.ativo !== 0));
  }

  // ------------------------------------------------------------ cadastro
  nova() {
    this.novoCliente = null;
    this.editando.set({ cliente_id: null, data: hoje(), prazo: null, sinal: 0, sinal_forma: 'pix', observacao: '', itens: [itemVazio()] });
  }

  editar(p: PedidoResumo) {
    this.novoCliente = null;
    this.editando.set({
      id: p.id,
      cliente_id: p.cliente_id,
      data: p.data,
      prazo: p.prazo,
      sinal: p.sinal,
      sinal_forma: p.sinal_forma ?? 'pix',
      observacao: p.observacao,
      itens: p.itens.map((i) => ({ ...i })),
    });
  }

  adicionarItem(p: Pedido) {
    p.itens.push({ ...itemVazio(), fornecedor_id: p.itens.at(-1)?.fornecedor_id ?? null });
  }

  totalPedido(p: Pedido) {
    return arred(p.itens.filter((i) => i.status !== 'cancelado').reduce((s, i) => s + (i.quantidade || 0) * (i.preco || 0), 0));
  }

  async cadastrarCliente(p: Pedido) {
    const nome = this.novoCliente?.trim();
    if (!nome) return;
    try {
      p.cliente_id = await this.api.clientes.salvar({ nome });
      await this.carregarCadastros();
      this.novoCliente = null;
    } catch (e) {
      this.toast.erro(e);
    }
  }

  async salvar(p: Pedido) {
    if (!p.cliente_id) return this.toast.erro('Escolha a cliente da encomenda.');
    if (p.itens.some((i) => !i.descricao.trim())) return this.toast.erro('Preencha a descrição de todas as peças.');
    this.ocupado.set(true);
    try {
      await this.api.pedidos.salvar(p);
      this.toast.sucesso('Encomenda salva.');
      this.editando.set(null);
      this.carregar();
    } catch (e) {
      this.toast.erro(e);
    } finally {
      this.ocupado.set(false);
    }
  }

  async excluir(p: Pedido) {
    if (!p.id) return;
    if (!(await this.confirmacao.perguntar('Excluir esta encomenda e todas as suas peças?', { confirmar: 'Excluir' }))) return;
    try {
      await this.api.pedidos.excluir(p.id);
      this.toast.sucesso('Encomenda excluída.');
      this.editando.set(null);
      this.carregar();
    } catch (e) {
      this.toast.erro(e);
    }
  }

  // ------------------------------------------------------------ status das peças
  async status(item: PedidoItem, novo: StatusEncomenda) {
    if (novo === 'cancelado' && !(await this.confirmacao.perguntar(`Cancelar "${item.descricao}"? Se estava reservada, a peça volta para o estoque.`, { confirmar: 'Cancelar peça' })))
      return;
    try {
      await this.api.pedidos.alterarStatus(item.id!, novo);
      this.carregar();
    } catch (e) {
      this.toast.erro(e);
    }
  }

  async abrirReserva(item: PedidoItem) {
    try {
      const estoque = (await this.api.compras.estoque()).filter((e) => e.disponivel >= item.quantidade);
      // Sugere primeiro as peças com descrição parecida.
      this.reservando.set({ item, estoque, filtro: item.descricao.split(' ')[0] ?? '' });
    } catch (e) {
      this.toast.erro(e);
    }
  }

  estoqueFiltrado(r: { estoque: ItemEstoque[]; filtro: string }) {
    const t = r.filtro.trim().toLowerCase();
    return t ? r.estoque.filter((e) => `${e.descricao} ${e.tamanho ?? ''} ${e.fornecedor ?? ''}`.toLowerCase().includes(t)) : r.estoque;
  }

  async reservar(item: PedidoItem, peca: ItemEstoque) {
    try {
      await this.api.pedidos.reservarDoEstoque(item.id!, peca.id);
      this.toast.sucesso(`"${peca.descricao}" reservada para a encomenda.`);
      this.reservando.set(null);
      this.carregar();
    } catch (e) {
      this.toast.erro(e);
    }
  }

  // ------------------------------------------------------------ venda e aviso
  abrirGerarVenda(p: PedidoResumo) {
    const itens = p.itens.filter((i) => i.status === 'chegou');
    const total = arred(itens.reduce((s, i) => s + i.quantidade * i.preco, 0));
    const d = hoje();
    this.gerando.set({ pedido: p, itens, total, sinal: Math.min(p.sinal_restante, total), data: d, vencimento: d });
  }

  async gerarVenda(g: GerandoVenda) {
    this.ocupado.set(true);
    try {
      const vendaId = await this.api.pedidos.gerarVenda(g.pedido.id, g.data, g.vencimento || null);
      this.gerando.set(null);
      this.carregar();
      const falta = arred(g.total - g.sinal);
      this.toast.sucesso(
        falta > 0 ? `Venda #${vendaId} criada. Falta receber ${formatarBrl(falta)} — veja em Vendas.` : `Venda #${vendaId} criada e já quitada pelo sinal.`,
      );
    } catch (e) {
      this.toast.erro(e);
    } finally {
      this.ocupado.set(false);
    }
  }

  irParaVendas() {
    this.router.navigate(['/vendas'], { queryParams: { aba: 'pendentes' } });
  }

  /** Link do WhatsApp com a mensagem pronta avisando o que chegou. */
  linkWhatsApp(p: PedidoResumo): string | null {
    const numero = soDigitos(p.telefone);
    if (numero.length < 10) return null;
    const chegaram = p.itens.filter((i) => i.status === 'chegou').map((i) => `• ${[i.descricao, i.tamanho, i.cor].filter(Boolean).join(' ')}`);
    const nome = p.cliente.split(' ')[0];
    const texto = `Oi ${nome}! 💕 Sua encomenda chegou:\n${chegaram.join('\n')}\n\nQuando quiser buscar, é só me avisar!`;
    return `https://wa.me/55${numero}?text=${encodeURIComponent(texto)}`;
  }

  // ------------------------------------------------------------ lista de compras
  async abrirListaCompras() {
    try {
      this.listaCompras.set(await this.api.pedidos.listaCompras());
    } catch (e) {
      this.toast.erro(e);
    }
  }

  async copiarLista(grupos: GrupoListaCompras[]) {
    const texto = grupos
      .map((g) =>
        [
          `🛍 ${g.fornecedor} (${g.pecas} peça${g.pecas > 1 ? 's' : ''})`,
          ...g.itens.map((i) => `  - ${i.quantidade}x ${[i.descricao, i.tamanho, i.cor].filter(Boolean).join(' · ')} — p/ ${i.cliente}${i.referencia ? `\n    ${i.referencia}` : ''}`),
        ].join('\n'),
      )
      .join('\n\n');
    try {
      await navigator.clipboard.writeText(texto);
      this.toast.sucesso('Lista copiada! Cole no WhatsApp ou nas notas.');
    } catch {
      this.toast.erro('Não foi possível copiar a lista.');
    }
  }

  detalhes(i: PedidoItem) {
    return [i.tamanho, i.cor].filter(Boolean).join(' · ');
  }

  ehLink(v: string | null | undefined) {
    return !!v && /^https?:\/\//i.test(v);
  }
}
