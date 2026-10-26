import { Component, HostListener, inject, input, OnDestroy, output } from '@angular/core';
import { ConfirmService } from '../core/confirm.service';

@Component({
  selector: 'app-modal',
  template: `
    <div class="modal-backdrop" (mousedown)="cliqueFundo($event)">
      <div class="modal" [class.modal-lg]="largo()" role="dialog" aria-modal="true" [attr.aria-label]="titulo()">
        <header class="modal-header">
          <h2>{{ titulo() }}</h2>
          <button type="button" class="btn-icon" (click)="fechar.emit()" aria-label="Fechar">✕</button>
        </header>
        <div class="modal-body"><ng-content /></div>
        <footer class="modal-footer"><ng-content select="[rodape]" /></footer>
      </div>
    </div>
  `,
})
export class Modal implements OnDestroy {
  /** Modais abertos, do mais antigo ao do topo: com um modal sobre outro, o Esc fecha só o de cima. */
  private static pilha: Modal[] = [];

  readonly titulo = input.required<string>();
  readonly largo = input(false);
  readonly fechar = output<void>();
  private readonly confirmacao = inject(ConfirmService);

  constructor() {
    Modal.pilha.push(this);
  }

  ngOnDestroy(): void {
    Modal.pilha = Modal.pilha.filter((m) => m !== this);
  }

  /**
   * Fecha só quando o clique é no fundo escuro. Precisa ser um método sem retorno: se a expressão do
   * template avaliar para `false`, o Angular chama preventDefault() e o clique deixa de focar os campos.
   */
  cliqueFundo(e: MouseEvent): void {
    if (e.target === e.currentTarget) this.fechar.emit();
  }

  @HostListener('document:keydown.escape')
  esc() {
    // Com uma confirmação ou outro modal aberto por cima, o Esc pertence a eles.
    if (this.confirmacao.atual() || Modal.pilha.at(-1) !== this) return;
    this.fechar.emit();
  }
}
