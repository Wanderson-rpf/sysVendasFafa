import { Directive, ElementRef, forwardRef, HostListener, inject, Pipe, PipeTransform } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

const MAX_DIGITOS = 11; // DDD + 9 dígitos (celular)

export const soDigitos = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '').slice(0, MAX_DIGITOS);

/**
 * Formata no padrão brasileiro conforme a quantidade de dígitos:
 * fixo (10) → (31) 3333-4444 · celular (11) → (31) 99999-0000.
 * Com menos dígitos, formata parcialmente (útil enquanto digita).
 */
export function formatarTelefone(v: string | null | undefined): string {
  const d = soDigitos(v);
  if (!d) return '';
  if (d.length <= 2) return `(${d}`;
  const ddd = d.slice(0, 2);
  const resto = d.slice(2);
  if (resto.length <= 4) return `(${ddd}) ${resto}`;
  const meio = resto.length === 9 ? 5 : 4; // 9 dígitos após o DDD = celular
  return `(${ddd}) ${resto.slice(0, meio)}-${resto.slice(meio)}`;
}

/**
 * Máscara de telefone: digite só os números, os parênteses, espaço e hífen aparecem sozinhos.
 * O ngModel recebe o texto já formatado (ou null quando vazio).
 *
 * Uso: <input telefone [(ngModel)]="cliente.telefone" />
 */
@Directive({
  selector: 'input[telefone]',
  host: { type: 'tel', inputmode: 'tel', autocomplete: 'off', placeholder: '(00) 00000-0000' },
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => TelefoneDirective), multi: true }],
})
export class TelefoneDirective implements ControlValueAccessor {
  private readonly el = inject<ElementRef<HTMLInputElement>>(ElementRef).nativeElement;
  private onChange: (v: string | null) => void = () => {};
  private onTouched: () => void = () => {};

  writeValue(v: string | null | undefined): void {
    this.el.value = formatarTelefone(v);
  }

  registerOnChange(fn: (v: string | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.el.disabled = disabled;
  }

  /**
   * Reformata a cada alteração (digitar, colar, apagar) preservando a posição do cursor
   * em relação aos dígitos — assim dá para corrigir um número no meio sem o cursor pular pro fim.
   */
  @HostListener('input', ['$event'])
  aoDigitar(e: Event): void {
    const tipo = (e as InputEvent).inputType;
    if (tipo === 'insertFromPaste' || tipo === 'insertFromDrop') this.limparColado();
    const cursor = this.el.selectionStart ?? this.el.value.length;
    const digitosAntesDoCursor = soDigitos(this.el.value.slice(0, cursor)).length;

    const formatado = formatarTelefone(this.el.value);
    this.el.value = formatado;

    let pos = 0;
    for (let vistos = 0; pos < formatado.length && vistos < digitosAntesDoCursor; pos++) {
      if (/\d/.test(formatado[pos])) vistos++;
    }
    this.el.setSelectionRange(pos, pos);
    this.onChange(formatado || null);
  }

  /**
   * Backspace/Delete encostados num "(", ")", espaço ou "-" apagariam só o símbolo, que a formatação
   * recolocaria em seguida (parece que a tecla travou). Move o cursor por cima dos símbolos para
   * que a tecla apague o dígito vizinho.
   */
  @HostListener('keydown', ['$event'])
  aoTeclar(e: KeyboardEvent): void {
    const { selectionStart: ini, selectionEnd: fim, value } = this.el;
    if (ini === null || ini !== fim) return;
    let p = ini;
    if (e.key === 'Backspace') while (p > 0 && !/\d/.test(value[p - 1])) p--;
    else if (e.key === 'Delete') while (p < value.length && !/\d/.test(value[p])) p++;
    else return;
    if (p !== ini) this.el.setSelectionRange(p, p);
  }

  /**
   * Número colado de outro lugar costuma vir com código do país ou de operadora:
   * "+55 31 97777-6666" ou "0 31 97777-6666". Só ao colar removemos esse prefixo — ao digitar
   * não dá para distinguir, porque 55 também é um DDD válido (RS).
   */
  private limparColado(): void {
    let d = this.el.value.replace(/\D/g, '');
    if (d.length > MAX_DIGITOS && d.startsWith('55')) d = d.slice(2);
    if (d.length > MAX_DIGITOS - 1 && d.startsWith('0')) d = d.replace(/^0+/, '');
    this.el.value = d;
    this.el.setSelectionRange(d.length, d.length);
  }

  @HostListener('blur')
  aoSair(): void {
    this.onTouched();
  }
}

/** Exibe telefones já gravados (inclusive os antigos, digitados sem formato) no padrão brasileiro. */
@Pipe({ name: 'telefone' })
export class TelefonePipe implements PipeTransform {
  transform(v: string | null | undefined): string {
    return formatarTelefone(v) || '—';
  }
}
