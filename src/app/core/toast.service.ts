import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: number;
  tipo: 'sucesso' | 'erro' | 'info';
  texto: string;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private seq = 0;
  readonly itens = signal<Toast[]>([]);

  sucesso(texto: string) {
    this.mostrar('sucesso', texto);
  }

  info(texto: string) {
    this.mostrar('info', texto);
  }

  erro(err: unknown) {
    this.mostrar('erro', err instanceof Error ? err.message : String(err), 7000);
  }

  fechar(id: number) {
    this.itens.update((l) => l.filter((t) => t.id !== id));
  }

  private mostrar(tipo: Toast['tipo'], texto: string, ms = 3500) {
    const id = ++this.seq;
    this.itens.update((l) => [...l, { id, tipo, texto }]);
    setTimeout(() => this.fechar(id), ms);
  }
}
