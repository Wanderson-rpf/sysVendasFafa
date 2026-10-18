import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { BrlPipe, DataBrPipe } from '../../core/format';
import { Cliente } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { Modal } from '../../shared/modal';
import { soDigitos, TelefoneDirective, TelefonePipe } from '../../shared/telefone';

@Component({
  selector: 'app-clientes',
  imports: [FormsModule, RouterLink, BrlPipe, DataBrPipe, Modal, TelefoneDirective, TelefonePipe],
  template: `
    <div class="page-header">
      <div>
        <h1>Clientes</h1>
        <p>Quem compra com você, quanto já comprou e quanto ainda deve.</p>
      </div>
      <button class="btn btn-primary" (click)="editando.set({ nome: '', ativo: 1 })" [disabled]="!api.disponivel">
        + Novo cliente
      </button>
    </div>

    <div class="filtros">
      <input [ngModel]="busca()" (ngModelChange)="busca.set($event)" placeholder="Buscar cliente…" style="width: 280px" />
      <div class="toolbar">
        <label class="muted"><input type="checkbox" [ngModel]="soDevedores()" (ngModelChange)="soDevedores.set($event)" /> Só quem está devendo</label>
        <label class="muted"><input type="checkbox" [ngModel]="mostrarInativos()" (ngModelChange)="mostrarInativos.set($event)" /> Mostrar inativos</label>
      </div>
    </div>

    <div class="card" style="padding: 0">
      <table>
        <thead>
          <tr>
            <th>Cliente</th><th>Telefone</th><th class="num">Compras</th>
            <th class="num">Total comprado</th><th class="num">Deve</th><th>Última compra</th>
          </tr>
        </thead>
        <tbody>
          @for (c of filtrados(); track c.id) {
            <tr class="linha-clicavel" [class.inativo]="c.ativo === 0" (click)="editando.set({ ...c })">
              <td><strong>{{ c.nome }}</strong> @if (c.ativo === 0) { <span class="badge badge-cancelada">Inativo</span> }</td>
              <td>{{ c.telefone | telefone }}</td>
              <td class="num">{{ c.qtd_compras }}</td>
              <td class="num">{{ c.total_comprado | brl }}</td>
              <td class="num" [class.neg]="(c.saldo_devedor ?? 0) > 0">{{ c.saldo_devedor | brl }}</td>
              <td>{{ c.ultima_compra | dataBr }}</td>
            </tr>
          } @empty {
            <tr><td colspan="6" class="vazio">Nenhum cliente encontrado.</td></tr>
          }
        </tbody>
      </table>
    </div>

    @if (editando(); as c) {
      <app-modal [titulo]="c.id ? c.nome : 'Novo cliente'" (fechar)="editando.set(null)">
        @if (c.id) {
          <div class="resumo-linhas">
            <span>Compras</span><span class="num">{{ c.qtd_compras }}</span>
            <span>Total comprado</span><span class="num">{{ c.total_comprado | brl }}</span>
            <span>Já pagou</span><span class="num">{{ c.total_pago | brl }}</span>
            <span class="total">Deve</span><span class="num total" [class.neg]="(c.saldo_devedor ?? 0) > 0">{{ c.saldo_devedor | brl }}</span>
          </div>
        }
        <label class="field"><span>Nome</span><input [(ngModel)]="c.nome" /></label>
        <label class="field"><span>Telefone / WhatsApp</span><input telefone [(ngModel)]="c.telefone" /></label>
        <label class="field"><span>Observação</span><textarea rows="3" [(ngModel)]="c.observacao" placeholder="Tamanho que usa, preferências…"></textarea></label>
        @if (c.id) {
          <label><input type="checkbox" [ngModel]="c.ativo !== 0" (ngModelChange)="c.ativo = $event ? 1 : 0" /> Ativo (aparece nas vendas)</label>
        }
        <ng-container rodape>
          @if (c.id && (c.saldo_devedor ?? 0) > 0) {
            <a class="btn" style="margin-right: auto" routerLink="/vendas" [queryParams]="{ aba: 'pendentes', cliente: c.nome }"
               (click)="editando.set(null)">Ver o que deve</a>
          }
          <button class="btn" (click)="editando.set(null)">Cancelar</button>
          <button class="btn btn-primary" (click)="salvar(c)">Salvar</button>
        </ng-container>
      </app-modal>
    }
  `,
  styles: `tr.inativo td { opacity: 0.6; }`,
})
export class ClientesPage implements OnInit {
  protected api = inject(ApiService);
  private toast = inject(ToastService);

  protected readonly lista = signal<Cliente[]>([]);
  protected readonly editando = signal<Cliente | null>(null);
  protected readonly busca = signal('');
  protected readonly soDevedores = signal(false);
  protected readonly mostrarInativos = signal(false);

  protected readonly filtrados = computed(() => {
    const termo = this.busca().trim().toLowerCase();
    return this.lista().filter(
      (c) =>
        (this.mostrarInativos() || c.ativo !== 0) &&
        (!this.soDevedores() || (c.saldo_devedor ?? 0) > 0) &&
        (!termo ||
          c.nome.toLowerCase().includes(termo) ||
          // Busca por telefone compara só os dígitos: "9999" encontra "(31) 99999-0000".
          (!!soDigitos(termo) && soDigitos(c.telefone).includes(soDigitos(termo)))),
    );
  });

  ngOnInit() {
    this.carregar();
  }

  async carregar() {
    if (!this.api.disponivel) return;
    this.lista.set(await this.api.clientes.listar());
  }

  async salvar(c: Cliente) {
    if (!c.nome?.trim()) return this.toast.erro('Informe o nome.');
    try {
      await this.api.clientes.salvar(c);
      this.toast.sucesso('Cliente salvo.');
      this.editando.set(null);
      this.carregar();
    } catch (e) {
      this.toast.erro(e);
    }
  }
}
