import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { arred, BrlPipe, DataBrPipe, fimDoMes, hoje, inicioDoMes } from '../../core/format';
import { CATEGORIAS_DESPESA, Despesa, ROTULO_CATEGORIA } from '../../core/models';
import { ConfirmService } from '../../core/confirm.service';
import { ToastService } from '../../core/toast.service';
import { FiltroPeriodo } from '../../shared/filtro-periodo';
import { Modal } from '../../shared/modal';
import { MoedaDirective } from '../../shared/moeda.directive';

@Component({
  selector: 'app-despesas',
  imports: [FormsModule, BrlPipe, DataBrPipe, Modal, FiltroPeriodo, MoedaDirective],
  template: `
    <div class="page-header">
      <div>
        <h1>Despesas</h1>
        <p>Gastos do dia a dia que não são peças: embalagem, entrega, taxas, divulgação…</p>
      </div>
      <button class="btn btn-primary" (click)="nova()" [disabled]="!api.disponivel">+ Nova despesa</button>
    </div>

    <div class="filtros">
      <app-filtro-periodo [(de)]="de" [(ate)]="ate" (alterado)="carregar()" />
      <select [ngModel]="categoria()" (ngModelChange)="categoria.set($event); carregar()" aria-label="Categoria">
        <option value="">Todas as categorias</option>
        @for (c of categorias; track c.valor) { <option [value]="c.valor">{{ c.rotulo }}</option> }
      </select>
    </div>

    <div class="grid grid-stats" style="margin-bottom: 16px">
      <div class="card stat"><div class="rotulo">Total no período</div><div class="valor">{{ total() | brl }}</div></div>
      @for (c of porCategoria(); track c.categoria) {
        <div class="card stat"><div class="rotulo">{{ rotulo[c.categoria] }}</div><div class="valor">{{ c.valor | brl }}</div></div>
      }
    </div>

    <div class="card" style="padding: 0">
      <table>
        <thead>
          <tr><th>Data</th><th>Descrição</th><th>Categoria</th><th class="num">Valor</th></tr>
        </thead>
        <tbody>
          @for (d of lista(); track d.id) {
            <tr class="linha-clicavel" (click)="editando.set({ ...d })">
              <td>{{ d.data | dataBr }}</td>
              <td>{{ d.descricao }} @if (d.observacao) { <div class="muted">{{ d.observacao }}</div> }</td>
              <td><span class="badge badge-categoria">{{ rotulo[d.categoria] || d.categoria }}</span></td>
              <td class="num">{{ d.valor | brl }}</td>
            </tr>
          } @empty {
            <tr><td colspan="4" class="vazio">Nenhuma despesa no período.</td></tr>
          }
        </tbody>
      </table>
    </div>

    @if (editando(); as d) {
      <app-modal [titulo]="d.id ? 'Editar despesa' : 'Nova despesa'" (fechar)="editando.set(null)">
        <div class="form-grid">
          <label class="field"><span>Data</span><input type="date" [(ngModel)]="d.data" /></label>
          <label class="field"><span>Valor</span><input moeda [(ngModel)]="d.valor" /></label>
        </div>
        <label class="field"><span>Descrição</span>
          <input [(ngModel)]="d.descricao" placeholder="Ex.: 100 sacolas personalizadas" (keydown.enter)="salvar(d)" />
        </label>
        <div class="field">
          <span>Categoria</span>
          <div class="chips">
            @for (c of categorias; track c.valor) {
              <button type="button" class="chip-opcao" [class.ativo]="d.categoria === c.valor" (click)="d.categoria = c.valor">
                {{ c.rotulo }}
              </button>
            }
          </div>
        </div>
        <label class="field"><span>Observação</span><textarea rows="2" [(ngModel)]="d.observacao"></textarea></label>
        <ng-container rodape>
          @if (d.id) {
            <button class="btn btn-danger" style="margin-right: auto" (click)="excluir(d)">Excluir</button>
          }
          <button class="btn" (click)="editando.set(null)">Cancelar</button>
          <button class="btn btn-primary" (click)="salvar(d)">Salvar</button>
        </ng-container>
      </app-modal>
    }
  `,
  styles: `
    .chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .chip-opcao {
      border: 1px solid var(--border); background: var(--surface); color: var(--text-2);
      border-radius: 999px; padding: 5px 12px; font: inherit; cursor: pointer;
    }
    .chip-opcao.ativo { background: var(--primary-soft); border-color: var(--primary); color: var(--primary); font-weight: 600; }
    .badge-categoria { background: var(--surface-2); color: var(--text-2); }
  `,
})
export class DespesasPage implements OnInit {
  protected api = inject(ApiService);
  private toast = inject(ToastService);
  private confirmacao = inject(ConfirmService);

  protected readonly categorias = CATEGORIAS_DESPESA;
  protected readonly rotulo = ROTULO_CATEGORIA;
  protected de = inicioDoMes();
  protected ate = fimDoMes();
  protected readonly categoria = signal('');
  protected readonly lista = signal<Despesa[]>([]);
  protected readonly editando = signal<Despesa | null>(null);

  protected readonly total = computed(() => arred(this.lista().reduce((s, d) => s + d.valor, 0)));
  protected readonly porCategoria = computed(() => {
    const m = new Map<string, number>();
    for (const d of this.lista()) m.set(d.categoria, arred((m.get(d.categoria) ?? 0) + d.valor));
    return [...m].map(([categoria, valor]) => ({ categoria, valor })).sort((a, b) => b.valor - a.valor);
  });

  ngOnInit() {
    this.carregar();
  }

  async carregar() {
    if (!this.api.disponivel) return;
    try {
      this.lista.set(
        await this.api.despesas.listar({
          de: this.de || undefined,
          ate: this.ate || undefined,
          categoria: this.categoria() || undefined,
        }),
      );
    } catch (e) {
      this.toast.erro(e);
    }
  }

  nova() {
    this.editando.set({ data: hoje(), descricao: '', categoria: 'embalagem', valor: 0, observacao: '' });
  }

  async salvar(d: Despesa) {
    try {
      await this.api.despesas.salvar(d);
      this.toast.sucesso('Despesa salva.');
      this.editando.set(null);
      this.carregar();
    } catch (e) {
      this.toast.erro(e);
    }
  }

  async excluir(d: Despesa) {
    if (!d.id || !(await this.confirmacao.perguntar('Excluir esta despesa?', { confirmar: 'Excluir' }))) return;
    try {
      await this.api.despesas.excluir(d.id);
      this.toast.sucesso('Despesa excluída.');
      this.editando.set(null);
      this.carregar();
    } catch (e) {
      this.toast.erro(e);
    }
  }
}
