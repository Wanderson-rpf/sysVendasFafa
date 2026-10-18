import { Injectable, computed, inject, signal } from '@angular/core';
import { ApiService } from './api.service';

export type Tema = 'claro' | 'escuro' | 'sistema';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private api = inject(ApiService);
  readonly tema = signal<Tema>(this.lerLocal());

  constructor() {
    this.aplicar(this.tema());
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => this.sistemaEscuro.set(e.matches));
    // O banco é a fonte da verdade; localStorage só evita o "piscar" na abertura.
    if (this.api.disponivel) {
      this.api.config.todas().then((c) => {
        const t = c['tema'] as Tema | undefined;
        if (t && t !== this.tema()) this.definir(t, false);
      });
    }
  }

  private readonly sistemaEscuro = signal(matchMedia('(prefers-color-scheme: dark)').matches);
  /** Tema realmente visível, resolvendo "sistema" pela preferência do Windows. */
  readonly escuro = computed(() => this.tema() === 'escuro' || (this.tema() === 'sistema' && this.sistemaEscuro()));

  async definir(tema: Tema, salvar = true): Promise<void> {
    this.tema.set(tema);
    this.aplicar(tema);
    try {
      localStorage.setItem('tema', tema);
    } catch {}
    if (salvar && this.api.disponivel) await this.api.config.definir('tema', tema);
  }

  private aplicar(tema: Tema): void {
    const root = document.documentElement;
    if (tema === 'sistema') delete root.dataset['theme'];
    else root.dataset['theme'] = tema === 'escuro' ? 'dark' : 'light';
  }

  private lerLocal(): Tema {
    try {
      const t = localStorage.getItem('tema');
      if (t === 'claro' || t === 'escuro' || t === 'sistema') return t;
    } catch {}
    return 'sistema';
  }
}
