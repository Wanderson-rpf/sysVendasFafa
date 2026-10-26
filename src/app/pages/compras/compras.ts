import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { arred, BrlPipe, DataBrPipe, fimDoMes, hoje, inicioDoMes, PctPipe } from '../../core/format';
import { Compra, CompraItem, CompraResumo, Fornecedor, PedidoItem } from '../../core/models';
import { ConfirmService } from '../../core/confirm.service';
import { ToastService } from '../../core/toast.service';
import { FiltroPeriodo } from '../../shared/filtro-periodo';
import { Modal } from '../../shared/modal';
import { MoedaDirective } from '../../shared/moeda.directive';

const itemVazio = (fornecedor_id: number | null = null): CompraItem => ({
  fornecedor_id,
  descricao: '',
  tamanho: '',
  quantidade: 1,
  custo_unitario: 0,
  preco_venda: 0,
});

@Component({
  selector: 'app-compras',
  imports: [FormsModule, BrlPipe, DataBrPipe, PctPipe, Modal, FiltroPeriodo, MoedaDirective],
  templateUrl: './compras.html',
})
export class ComprasPage implements OnInit {
  protected api = inject(ApiService);
  private toast = inject(ToastService);
  private confirmacao = inject(ConfirmService);

  protected de = inicioDoMes();
  protected ate = fimDoMes();
  protected readonly lista = signal<CompraResumo[]>([]);
  protected readonly fornecedores = signal<Fornecedor[]>([]);
  protected readonly editando = signal<Compra | null>(null);
  protected readonly salvando = signal(false);
  protected novoFornecedor: string | null = null;
  protected margemPadrao = 100;
  protected readonly incluindo = signal<{ item: PedidoItem; marcado: boolean }[] | null>(null);

  protected readonly totais = computed(() => {
    const l = this.lista();
    const s = (f: (c: CompraResumo) => number) => arred(l.reduce((a, c) => a + f(c), 0));
    return {
      pecas: l.reduce((a, c) => a + c.qtd_pecas, 0),
      investido: s((c) => c.total_investido),
      economia: s((c) => c.desconto + c.comissao),
      previsto: s((c) => c.valor_venda_previsto),
      lucro: s((c) => c.lucro_previsto),
    };
  });

  ngOnInit() {
    this.carregar();
    this.carregarFornecedores();
  }

  async carregar() {
    if (!this.api.disponivel) return;
    try {
      this.lista.set(await this.api.compras.listar({ de: this.de || undefined, ate: this.ate || undefined }));
    } catch (e) {
      this.toast.erro(e);
    }
  }

  async carregarFornecedores() {
    if (!this.api.disponivel) return;
    this.fornecedores.set((await this.api.fornecedores.listar()).filter((f) => f.ativo !== 0));
  }

  nova() {
    this.editando.set({ data: hoje(), descricao: '', frete: 0, desconto: 0, comissao: 0, observacao: '', itens: [itemVazio()] });
  }

  async abrir(id: number) {
    try {
      this.editando.set(await this.api.compras.obter(id));
    } catch (e) {
      this.toast.erro(e);
    }
  }

  adicionarItem(c: Compra) {
    // Repete o fornecedor da última linha: o caso comum é lançar várias peças do mesmo lugar.
    c.itens.push(itemVazio(c.itens.at(-1)?.fornecedor_id ?? null));
  }

  removerItem(c: Compra, i: number) {
    c.itens.splice(i, 1);
  }

  aplicarMargem(c: Compra) {
    // Peças de encomenda já têm preço combinado com a cliente: não sobrescreve.
    for (const item of c.itens) {
      if (item.pedido_item_id) continue;
      item.preco_venda = arred(item.custo_unitario * (1 + this.margemPadrao / 100));
    }
  }

  // ------------------------------------------------------------ encomendas
  async abrirEncomendas(c: Compra) {
    try {
      const jaNaEntrada = new Set(c.itens.map((i) => i.pedido_item_id).filter(Boolean));
      const pendentes = (await this.api.pedidos.pendentesParaEntrada()).filter((p) => !jaNaEntrada.has(p.id));
      if (!pendentes.length) return this.toast.info('Nenhuma encomenda pendente para incluir.');
      // Pré-marca as do mesmo fornecedor da entrada (se já houver um escolhido).
      const fornecedor = c.itens.find((i) => i.fornecedor_id)?.fornecedor_id;
      this.incluindo.set(pendentes.map((item) => ({ item, marcado: !fornecedor || item.fornecedor_id === fornecedor })));
    } catch (e) {
      this.toast.erro(e);
    }
  }

  incluirEncomendas(c: Compra) {
    const escolhidas = (this.incluindo() ?? []).filter((x) => x.marcado).map((x) => x.item);
    // Se o formulário só tem a linha vazia inicial, substitui ela.
    if (c.itens.length === 1 && !c.itens[0].descricao.trim()) c.itens.splice(0, 1);
    for (const p of escolhidas) {
      c.itens.push({
        fornecedor_id: p.fornecedor_id ?? null,
        descricao: [p.descricao, p.cor].filter(Boolean).join(' '),
        tamanho: p.tamanho ?? '',
        quantidade: p.quantidade,
        custo_unitario: 0,
        preco_venda: p.preco,
        pedido_item_id: p.id!,
        encomenda_de: p.cliente,
      });
    }
    this.incluindo.set(null);
    if (escolhidas.length) this.toast.info(`${escolhidas.length} peça(s) de encomenda incluída(s). Preencha o custo de cada uma.`);
  }

  async cadastrarFornecedor(c: Compra) {
    const nome = this.novoFornecedor?.trim();
    if (!nome) return;
    try {
      const id = await this.api.fornecedores.salvar({ nome });
      await this.carregarFornecedores();
      const vazio = c.itens.find((i) => !i.fornecedor_id);
      if (vazio) vazio.fornecedor_id = id;
      this.novoFornecedor = null;
      this.toast.sucesso(`Fornecedor "${nome}" cadastrado.`);
    } catch (e) {
      this.toast.erro(e);
    }
  }

  calculo(c: Compra) {
    const produtos = arred(c.itens.reduce((s, i) => s + (i.quantidade || 0) * (i.custo_unitario || 0), 0));
    const investido = arred(produtos + (c.frete || 0) - (c.desconto || 0) - (c.comissao || 0));
    const venda = arred(c.itens.reduce((s, i) => s + (i.quantidade || 0) * (i.preco_venda || 0), 0));
    const lucro = arred(venda - investido);
    return { produtos, investido, venda, lucro, margem: venda > 0 ? lucro / venda : 0 };
  }

  async salvar(c: Compra) {
    if (c.itens.some((i) => !i.descricao.trim())) {
      this.toast.erro('Preencha a descrição de todas as peças.');
      return;
    }
    this.salvando.set(true);
    try {
      await this.api.compras.salvar(c);
      this.toast.sucesso('Entrada salva.');
      this.editando.set(null);
      this.carregar();
    } catch (e) {
      this.toast.erro(e);
    } finally {
      this.salvando.set(false);
    }
  }

  async excluir(c: Compra) {
    if (!c.id || !(await this.confirmacao.perguntar('Excluir esta entrada? Essa ação não pode ser desfeita.', { confirmar: 'Excluir' }))) return;
    try {
      await this.api.compras.excluir(c.id);
      this.toast.sucesso('Entrada excluída.');
      this.editando.set(null);
      this.carregar();
    } catch (e) {
      this.toast.erro(e);
    }
  }
}
