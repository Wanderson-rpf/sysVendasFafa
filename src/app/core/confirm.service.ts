import { Injectable, signal } from '@angular/core';

export interface Pergunta {
  texto: string;
  confirmar: string;
  perigo: boolean;
  responder: (ok: boolean) => void;
}

/**
 * Substitui o window.confirm() nativo: no Electron (Windows) o diálogo nativo do renderer pode deixar a
 * janela sem foco de teclado, e os campos param de aceitar digitação até a janela ser reativada.
 */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  readonly atual = signal<Pergunta | null>(null);

  perguntar(texto: string, opcoes: { confirmar?: string; perigo?: boolean } = {}): Promise<boolean> {
    return new Promise((resolve) => {
      this.atual.set({
        texto,
        confirmar: opcoes.confirmar ?? 'Confirmar',
        perigo: opcoes.perigo ?? true,
        responder: (ok) => {
          this.atual.set(null);
          resolve(ok);
        },
      });
    });
  }
}
