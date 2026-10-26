import { Component, HostListener, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ApiService } from './core/api.service';
import { ConfirmService, Pergunta } from './core/confirm.service';
import { ThemeService } from './core/theme.service';
import { ToastService } from './core/toast.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="shell">
      <aside class="sidebar">
        <div class="brand">
          <img class="brand-mark" src="icone.svg" alt="" />
          <span>Loja da Fafá</span>
        </div>
        <nav>
          @for (grupo of menu; track grupo.titulo) {
            @if (grupo.titulo) { <div class="nav-grupo">{{ grupo.titulo }}</div> }
            @for (item of grupo.itens; track item.rota) {
              <a [routerLink]="item.rota" routerLinkActive="ativo">
                <span class="nav-ico" aria-hidden="true">{{ item.icone }}</span>{{ item.rotulo }}
              </a>
            }
          }
        </nav>
        <button type="button" class="tema-toggle" (click)="alternarTema()">
          {{ tema.escuro() ? '☀ Tema claro' : '☾ Tema escuro' }}
        </button>
      </aside>

      <main class="conteudo">
        @if (!api.disponivel) {
          <div class="alerta alerta-erro">
            Você está vendo o Angular no navegador. Para acessar o banco, rode <code>npm start</code> (abre o Electron).
          </div>
        }
        <router-outlet />
      </main>
    </div>

    @if (confirmacao.atual(); as p) {
      <div class="modal-backdrop confirmacao" (mousedown)="fundoConfirmacao($event, p)">
        <div class="modal" role="alertdialog" aria-modal="true" [attr.aria-label]="p.texto">
          <div class="modal-body"><p style="margin: 0">{{ p.texto }}</p></div>
          <footer class="modal-footer">
            <button type="button" class="btn" (click)="p.responder(false)">Voltar</button>
            <button type="button" class="btn" [class.btn-perigo]="p.perigo" [class.btn-primary]="!p.perigo"
                    (click)="p.responder(true)" autofocus>{{ p.confirmar }}</button>
          </footer>
        </div>
      </div>
    }

    <div class="toasts" aria-live="polite">
      @for (t of toast.itens(); track t.id) {
        <div class="toast toast-{{ t.tipo }}" (click)="toast.fechar(t.id)">{{ t.texto }}</div>
      }
    </div>
  `,
})
export class App {
  protected api = inject(ApiService);
  protected tema = inject(ThemeService);
  protected toast = inject(ToastService);
  protected confirmacao = inject(ConfirmService);

  protected menu = [
    { titulo: '', itens: [{ rota: '/dashboard', rotulo: 'Dashboard', icone: '◧' }] },
    {
      titulo: 'Movimento',
      itens: [
        { rota: '/vendas', rotulo: 'Vendas e recebimentos', icone: '♡' },
        { rota: '/encomendas', rotulo: 'Encomendas', icone: '✎' },
        { rota: '/compras', rotulo: 'Entradas de produtos', icone: '⇣' },
        { rota: '/despesas', rotulo: 'Despesas', icone: '⊖' },
      ],
    },
    {
      titulo: 'Cadastros',
      itens: [
        { rota: '/clientes', rotulo: 'Clientes', icone: '☺' },
        { rota: '/fornecedores', rotulo: 'Fornecedores', icone: '⌂' },
      ],
    },
    { titulo: 'Sistema', itens: [{ rota: '/configuracoes', rotulo: 'Configurações', icone: '⚙' }] },
  ];

  alternarTema() {
    this.tema.definir(this.tema.escuro() ? 'claro' : 'escuro');
  }

  protected fundoConfirmacao(e: MouseEvent, p: Pergunta): void {
    if (e.target === e.currentTarget) p.responder(false);
  }

  /** Campos numéricos começam com 0: selecionar tudo ao focar faz a digitação substituir o valor. */
  @HostListener('document:focusin', ['$event'])
  selecionarNumero(e: FocusEvent): void {
    const el = e.target;
    if (el instanceof HTMLInputElement && el.type === 'number') setTimeout(() => el.select());
  }

  @HostListener('document:keydown.escape')
  escConfirmacao(): void {
    const p = this.confirmacao.atual();
    // Adiado: o Modal de baixo também escuta o Esc e precisa ainda ver a confirmação aberta para ignorá-lo.
    if (p) setTimeout(() => p.responder(false));
  }
}
