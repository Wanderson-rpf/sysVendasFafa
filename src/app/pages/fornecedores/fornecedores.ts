import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { BrlPipe, DataBrPipe } from '../../core/format';
import { Fornecedor } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { Modal } from '../../shared/modal';

@Component({
  selector: 'app-fornecedores',
  imports: [FormsModule, BrlPipe, DataBrPipe, Modal],
  template: `
    <div class="page-header">
      <div>
        <h1>Fornecedores</h1>
        <p>Onde você compra as peças e quanto já comprou de cada um.</p>
      </div>
      <button class="btn btn-primary" (click)="editando.set({ nome: '', ativo: 1 })" [disabled]="!api.disponivel">
        + Novo fornecedor
      </button>
    </div>

    <div class="filtros">
      <input [ngModel]="busca()" (ngModelChange)="busca.set($event)" placeholder="Buscar fornecedor…" style="width: 280px" />
      <label class="muted"><input type="checkbox" [ngModel]="mostrarInativos()" (ngModelChange)="mostrarInativos.set($event)" /> Mostrar inativos</label>
    </div>

    <div class="card" style="padding: 0">
      <table>
        <thead>
          <tr>
            <th>Fornecedor</th><th>Plataforma</th><th>Contato</th>
            <th class="num">Peças compradas</th><th class="num">Total comprado</th><th>Última compra</th>
          </tr>
        </thead>
        <tbody>
          @for (f of filtrados(); track f.id) {
            <tr class="linha-clicavel" [class.inativo]="f.ativo === 0" (click)="editando.set({ ...f })">
              <td><strong>{{ f.nome }}</strong> @if (f.ativo === 0) { <span class="badge badge-cancelada">Inativo</span> }</td>
              <td>{{ f.plataforma || '—' }}</td>
              <td class="muted">{{ f.contato || '—' }}</td>
              <td class="num">{{ f.pecas }}</td>
              <td class="num">{{ f.total_comprado | brl }}</td>
              <td>{{ f.ultima_compra | dataBr }}</td>
            </tr>
          } @empty {
            <tr><td colspan="6" class="vazio">Nenhum fornecedor encontrado.</td></tr>
          }
        </tbody>
      </table>
    </div>

    @if (editando(); as f) {
      <app-modal [titulo]="f.id ? 'Editar fornecedor' : 'Novo fornecedor'" (fechar)="editando.set(null)">
        <label class="field"><span>Nome</span><input [(ngModel)]="f.nome" placeholder="Ex.: Loja Bella" /></label>
        <label class="field"><span>Plataforma</span>
          <input [(ngModel)]="f.plataforma" placeholder="Shopee, Shein, AliExpress, loja física…" list="plataformas" />
          <datalist id="plataformas">
            <option value="Shopee"></option><option value="Shein"></option><option value="AliExpress"></option>
            <option value="Mercado Livre"></option><option value="Instagram"></option><option value="Loja física"></option>
          </datalist>
        </label>
        <label class="field"><span>Contato</span><input [(ngModel)]="f.contato" placeholder="Link da loja, WhatsApp…" /></label>
        <label class="field"><span>Observação</span><textarea rows="3" [(ngModel)]="f.observacao"></textarea></label>
        @if (f.id) {
          <label><input type="checkbox" [ngModel]="f.ativo !== 0" (ngModelChange)="f.ativo = $event ? 1 : 0" /> Ativo (aparece nas entradas)</label>
        }
        <ng-container rodape>
          <button class="btn" (click)="editando.set(null)">Cancelar</button>
          <button class="btn btn-primary" (click)="salvar(f)">Salvar</button>
        </ng-container>
      </app-modal>
    }
  `,
  styles: `tr.inativo td { opacity: 0.6; }`,
})
export class FornecedoresPage implements OnInit {
  protected api = inject(ApiService);
  private toast = inject(ToastService);

  protected readonly lista = signal<Fornecedor[]>([]);
  protected readonly editando = signal<Fornecedor | null>(null);
  protected readonly busca = signal('');
  protected readonly mostrarInativos = signal(false);

  protected readonly filtrados = computed(() => {
    const termo = this.busca().trim().toLowerCase();
    return this.lista().filter(
      (f) => (this.mostrarInativos() || f.ativo !== 0) && (!termo || f.nome.toLowerCase().includes(termo)),
    );
  });

  ngOnInit() {
    this.carregar();
  }

  async carregar() {
    if (!this.api.disponivel) return;
    this.lista.set(await this.api.fornecedores.listar());
  }

  async salvar(f: Fornecedor) {
    if (!f.nome?.trim()) return this.toast.erro('Informe o nome.');
    try {
      await this.api.fornecedores.salvar(f);
      this.toast.sucesso('Fornecedor salvo.');
      this.editando.set(null);
      this.carregar();
    } catch (e) {
      this.toast.erro(e);
    }
  }
}
