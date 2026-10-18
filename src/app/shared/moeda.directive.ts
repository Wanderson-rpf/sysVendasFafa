import { Directive, ElementRef, forwardRef, HostListener, inject } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

const FORMATO = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const MAX_CENTAVOS = 99_999_999_99; // R$ 999.999.999,99

/**
 * Máscara de moeda estilo "caixa eletrônico": os dígitos entram pela direita (1 → R$ 0,01,
 * 12 → R$ 0,12, 1234 → R$ 12,34). Não é preciso digitar vírgula, ponto nem "R$".
 * O ngModel continua recebendo um number em REAIS.
 *
 * Uso: <input moeda [(ngModel)]="item.valor" />
 */
@Directive({
  selector: 'input[moeda]',
  host: {
    type: 'text',
    inputmode: 'numeric',
    autocomplete: 'off',
    class: 'input-moeda',
  },
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => MoedaDirective), multi: true }],
})
export class MoedaDirective implements ControlValueAccessor {
  private readonly el = inject<ElementRef<HTMLInputElement>>(ElementRef).nativeElement;
  private centavos = 0;
  private onChange: (v: number) => void = () => {};
  private onTouched: () => void = () => {};

  writeValue(v: number | null | undefined): void {
    this.centavos = Math.min(MAX_CENTAVOS, Math.max(0, Math.round((Number(v) || 0) * 100)));
    this.renderizar();
  }

  registerOnChange(fn: (v: number) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.el.disabled = disabled;
  }

  /** beforeinput cobre teclado, colar, arrastar e apagar — tudo passa por aqui e o DOM nunca é editado direto. */
  @HostListener('beforeinput', ['$event'])
  aoDigitar(e: InputEvent): void {
    e.preventDefault();
    const tudoSelecionado = this.el.selectionStart === 0 && this.el.selectionEnd === this.el.value.length;
    const tipo = e.inputType;

    if (tipo.startsWith('delete')) {
      // Com tudo selecionado, apagar zera; senão remove o último dígito.
      this.atualizar(tudoSelecionado ? 0 : Math.floor(this.centavos / 10));
      return;
    }

    const digitos = (e.data ?? e.dataTransfer?.getData('text') ?? '').replace(/\D/g, '');
    if (!digitos) return;

    if (tipo === 'insertFromPaste' || tipo === 'insertFromDrop') {
      // Colar "R$ 1.234,56" ou "1234.56": interpreta o texto como valor completo.
      this.atualizar(this.deTextoColado(e.data ?? e.dataTransfer?.getData('text') ?? ''));
      return;
    }

    let base = tudoSelecionado ? 0 : this.centavos;
    for (const d of digitos) base = base * 10 + Number(d);
    this.atualizar(base);
  }

  @HostListener('focus')
  aoFocar(): void {
    // Seleciona tudo: o primeiro dígito digitado já substitui o valor anterior.
    setTimeout(() => this.el.select());
  }

  @HostListener('blur')
  aoSair(): void {
    this.onTouched();
  }

  /** Mantém o cursor sempre no fim (onde os dígitos entram), exceto quando o usuário seleciona tudo. */
  @HostListener('click')
  @HostListener('keyup')
  cursorNoFim(): void {
    const fim = this.el.value.length;
    if (this.el.selectionStart === 0 && this.el.selectionEnd === fim) return;
    this.el.setSelectionRange(fim, fim);
  }

  private atualizar(centavos: number): void {
    if (centavos > MAX_CENTAVOS) return;
    this.centavos = centavos;
    this.renderizar();
    this.onChange(centavos / 100);
  }

  private renderizar(): void {
    this.el.value = FORMATO.format(this.centavos / 100);
    if (document.activeElement === this.el) {
      const fim = this.el.value.length;
      this.el.setSelectionRange(fim, fim);
    }
  }

  private deTextoColado(texto: string): number {
    const t = texto.trim();
    // Separador decimal = último "," ou "." seguido de 1-2 dígitos no fim.
    const m = t.match(/^(.*?)[.,](\d{1,2})$/);
    if (m) {
      const inteiro = Number(m[1].replace(/\D/g, '') || 0);
      return Math.min(MAX_CENTAVOS, inteiro * 100 + Number(m[2].padEnd(2, '0')));
    }
    return Math.min(MAX_CENTAVOS, Number(t.replace(/\D/g, '') || 0) * 100);
  }
}
