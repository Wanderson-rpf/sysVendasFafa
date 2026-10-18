import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { arred, BrlPipe, DataBrPipe, hoje } from '../../core/format';
import {
  Cliente,
  FORMAS_PAGAMENTO,
  FormaPagamento,
  Inadimplente,
  ItemEstoque,
  ParteRecebimento,
  ROTULO_FORMA,
  ROTULO_SITUACAO,
  Venda,
  VendaDetalhe,
  VendaResumo,
} from '../../core/models';
import { ConfirmService } from '../../core/confirm.service';
import { ToastService } from '../../core/toast.service';
import { Modal } from '../../shared/modal';
import { MoedaDirective } from '../../shared/moeda.directive';
import { TelefonePipe } from '../../shared/telefone';

type Aba = 'pendentes' | 'atrasada' | 'quitada' | 'todas' | 'inadimplentes';

interface FormRecebimento {
  venda: VendaResumo;
  data: string;
  partes: ParteRecebimento[];
}

/** Formas em que o "valor" é uma estimativa de algo recebido em troca, e precisa de descrição. */
const PERMUTA: FormaPagamento[] = ['servico', 'produto', 'outro'];

@Component({
  selector: 'app-vendas',
  imports: [FormsModule, BrlPipe, DataBrPipe, Modal, MoedaDirective, TelefonePipe],
  templateUrl: './vendas.html',
  styles: `
    .parte { display: grid; grid-template-columns: 1fr 130px auto auto; gap: 8px; align-items: center; }
  `,
})
export class VendasPage implements OnInit {
  protected api = inject(ApiService);
  private toast = inject(ToastService);
  private confirmacao = inject(ConfirmService);
  private route = inject(ActivatedRoute);

  protected readonly formas = FORMAS_PAGAMENTO;
  protected readonly rotuloForma = ROTULO_FORMA;
  protected readonly rotuloSituacao = ROTULO_SITUACAO;

  protected readonly aba = signal<Aba>('pendentes');
  protected de = '';
  protected ate = '';
  protected busca = signal('');

  protected readonly lista = signal<VendaResumo[]>([]);
  protected readonly inadimplentes = signal<Inadimplente[]>([]);
  protected readonly clientes = signal<Cliente[]>([]);
  protected readonly estoque = signal<ItemEstoque[]>([]);

  protected readonly detalhe = signal<VendaDetalhe | null>(null);
  protected readonly editando = signal<Venda | null>(null);
  protected readonly recebendo = signal<FormRecebimento | null>(null);
  protected readonly ocupado = signal(false);
  protected receberAoSalvar = true;
  protected novoCliente: string | null = null;
  protected escolhaEstoque: number | null = null;

  protected readonly filtrada = computed(() => {
    const termo = this.busca().trim().toLowerCase();
    return termo ? this.lista().filter((v) => v.cliente.toLowerCase().includes(termo)) : this.lista();
  });

  protected readonly totais = computed(() => {
    const l = this.filtrada();
    return {
      total: arred(l.reduce((s, v) => s + v.total, 0)),
      recebido: arred(l.reduce((s, v) => s + v.recebido, 0)),
      saldo: arred(l.reduce((s, v) => s + v.saldo, 0)),
    };
  });

  ngOnInit() {
    const aba = this.route.snapshot.queryParamMap.get('aba') as Aba | null;
    if (aba) this.aba.set(aba);
    const cliente = this.route.snapshot.queryParamMap.get('cliente');
    if (cliente) this.busca.set(cliente);
    this.carregar();
    this.carregarClientes();
  }

  trocarAba(a: Aba) {
    this.aba.set(a);
    this.carregar();
  }

  async carregar() {
    if (!this.api.disponivel) return;
    try {
      const a = this.aba();
      if (a === 'inadimplentes') {
        this.inadimplentes.set(await this.api.vendas.inadimplentes());
        return;
      }
      // Pendências não respeitam período: dívida antiga continua sendo dívida.
      const usaPeriodo = a === 'quitada' || a === 'todas';
      this.lista.set(
        await this.api.vendas.listar({
          situacao: a === 'todas' ? '' : a,
          de: usaPeriodo ? this.de || undefined : undefined,
          ate: usaPeriodo ? this.ate || undefined : undefined,
        }),
      );
    } catch (e) {
      this.toast.erro(e);
    }
  }

  async carregarClientes() {
    if (!this.api.disponivel) return;
    this.clientes.set((await this.api.clientes.listar()).filter((c) => c.ativo !== 0));
  }

  verDoCliente(i: Inadimplente) {
    this.busca.set(i.cliente);
    this.trocarAba('atrasada');
  }

  // ---------------------------------------------------------------- Detalhe
  async abrir(id: number) {
    try {
      this.detalhe.set(await this.api.vendas.obter(id));
    } catch (e) {
      this.toast.erro(e);
    }
  }

  async recarregarDetalhe() {
    const d = this.detalhe();
    if (d) this.detalhe.set(await this.api.vendas.obter(d.id));
    this.carregar();
  }

  async excluirRecebimento(id: number) {
    if (!(await this.confirmacao.perguntar('Estornar este recebimento? O valor volta para o saldo devedor.', { confirmar: 'Estornar' }))) return;
    try {
      await this.api.vendas.excluirRecebimento(id);
      this.toast.sucesso('Recebimento estornado.');
      this.recarregarDetalhe();
    } catch (e) {
      this.toast.erro(e);
    }
  }

  async cancelar(v: VendaDetalhe) {
    const cancelar = v.situacao !== 'cancelada';
    if (cancelar && !(await this.confirmacao.perguntar('Cancelar esta venda? As peças voltam para o estoque.', { confirmar: 'Cancelar venda' }))) return;
    try {
      await this.api.vendas.cancelar(v.id, cancelar);
      this.toast.sucesso(cancelar ? 'Venda cancelada.' : 'Venda reativada.');
      this.recarregarDetalhe();
    } catch (e) {
      this.toast.erro(e);
    }
  }

  async excluir(v: VendaDetalhe) {
    if (!(await this.confirmacao.perguntar('Excluir definitivamente esta venda e seus recebimentos?', { confirmar: 'Excluir' }))) return;
    try {
      await this.api.vendas.excluir(v.id);
      this.toast.sucesso('Venda excluída.');
      this.detalhe.set(null);
      this.carregar();
    } catch (e) {
      this.toast.erro(e);
    }
  }

  // ---------------------------------------------------------------- Venda (form)
  async nova() {
    await this.carregarEstoque();
    const d = hoje();
    this.receberAoSalvar = true;
    this.editando.set({ cliente_id: null, data: d, vencimento: d, desconto: 0, observacao: '', itens: [] });
  }

  async editar(v: VendaDetalhe) {
    await this.carregarEstoque();
    this.receberAoSalvar = false;
    this.detalhe.set(null);
    this.editando.set({
      id: v.id,
      cliente_id: v.cliente_id,
      data: v.data,
      vencimento: v.vencimento,
      desconto: v.desconto,
      observacao: v.observacao,
      itens: v.itens.map((i) => ({ ...i })),
    });
  }

  private async carregarEstoque() {
    this.estoque.set(await this.api.compras.estoque());
  }

  adicionarDoEstoque(v: Venda) {
    const peca = this.estoque().find((e) => e.id === this.escolhaEstoque);
    this.escolhaEstoque = null;
    if (!peca) return;
    const existente = v.itens.find((i) => i.compra_item_id === peca.id);
    if (existente) {
      existente.quantidade++;
      return;
    }
    v.itens.push({
      compra_item_id: peca.id,
      descricao: peca.descricao + (peca.tamanho ? ` (${peca.tamanho})` : ''),
      quantidade: 1,
      preco_unitario: peca.preco_venda,
    });
  }

  adicionarAvulso(v: Venda) {
    v.itens.push({ compra_item_id: null, descricao: '', quantidade: 1, preco_unitario: 0, custo_unitario: 0 });
  }

  totalVenda(v: Venda) {
    const bruto = arred(v.itens.reduce((s, i) => s + (i.quantidade || 0) * (i.preco_unitario || 0), 0));
    return { bruto, total: arred(bruto - (v.desconto || 0)) };
  }

  async cadastrarCliente(v: Venda) {
    const nome = this.novoCliente?.trim();
    if (!nome) return;
    try {
      v.cliente_id = await this.api.clientes.salvar({ nome });
      await this.carregarClientes();
      this.novoCliente = null;
    } catch (e) {
      this.toast.erro(e);
    }
  }

  async salvarVenda(v: Venda) {
    if (!v.itens.length) return this.toast.erro('Adicione ao menos uma peça.');
    if (v.itens.some((i) => !i.descricao.trim())) return this.toast.erro('Preencha a descrição de todas as peças.');

    this.ocupado.set(true);
    try {
      const id = await this.api.vendas.salvar(v);
      this.toast.sucesso('Venda salva.');
      this.editando.set(null);
      await this.carregar();
      if (this.receberAoSalvar) {
        const resumo = (await this.api.vendas.obter(id)) as VendaResumo;
        if (resumo.saldo > 0) this.receber(resumo);
      }
    } catch (e) {
      this.toast.erro(e);
    } finally {
      this.ocupado.set(false);
    }
  }

  // ---------------------------------------------------------------- Recebimento
  receber(venda: VendaResumo) {
    this.recebendo.set({ venda, data: hoje(), partes: [{ forma: 'pix', valor: venda.saldo, descricao: '' }] });
  }

  adicionarParte(r: FormRecebimento) {
    r.partes.push({ forma: 'dinheiro', valor: Math.max(0, this.restante(r)), descricao: '' });
  }

  removerParte(r: FormRecebimento, i: number) {
    r.partes.splice(i, 1);
  }

  /** Coloca o saldo que falta na parte indicada (atalho "receber o resto aqui"). */
  completar(r: FormRecebimento, i: number) {
    const outras = r.partes.reduce((s, p, j) => (j === i ? s : s + (p.valor || 0)), 0);
    r.partes[i].valor = Math.max(0, arred(r.venda.saldo - outras));
  }

  somaPartes(r: FormRecebimento) {
    return arred(r.partes.reduce((s, p) => s + (p.valor || 0), 0));
  }

  restante(r: FormRecebimento) {
    return arred(r.venda.saldo - this.somaPartes(r));
  }

  exigeDescricao(f: FormaPagamento) {
    return PERMUTA.includes(f);
  }

  async confirmarRecebimento(r: FormRecebimento) {
    if (this.restante(r) < 0) return this.toast.erro('O valor recebido ultrapassa o saldo da venda.');
    this.ocupado.set(true);
    try {
      await this.api.vendas.receber(r.venda.id, r.data, r.partes);
      const restante = this.restante(r);
      this.toast.sucesso(restante > 0 ? `Recebimento registrado. Ainda faltam ${restante.toFixed(2).replace('.', ',')}.` : 'Venda quitada!');
      this.recebendo.set(null);
      this.recarregarDetalhe();
    } catch (e) {
      this.toast.erro(e);
    } finally {
      this.ocupado.set(false);
    }
  }
}
