import { Component, computed, model, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { fimDoMes, hoje, inicioDoMes } from '../core/format';

type Preset = 'mes' | 'mes_anterior' | 'ano' | 'tudo';

function periodo(p: Preset): { de: string; ate: string } {
  const h = hoje();
  switch (p) {
    case 'mes':
      return { de: inicioDoMes(h), ate: fimDoMes(h) };
    case 'mes_anterior': {
      const d = new Date(Number(h.slice(0, 4)), Number(h.slice(5, 7)) - 2, 1);
      const ref = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
      return { de: inicioDoMes(ref), ate: fimDoMes(ref) };
    }
    case 'ano':
      return { de: `${h.slice(0, 4)}-01-01`, ate: `${h.slice(0, 4)}-12-31` };
    case 'tudo':
      return { de: '', ate: '' };
  }
}

/** Barra de período: atalhos (segmentado) + intervalo de datas. Uso: [(de)] [(ate)] (alterado). */
@Component({
  selector: 'app-filtro-periodo',
  imports: [FormsModule],
  template: `
    <div class="segmentado" role="group" aria-label="Período">
      @for (p of presets; track p.valor) {
        <button type="button" [class.ativo]="ativo() === p.valor" (click)="escolher(p.valor)">{{ p.rotulo }}</button>
      }
    </div>
    <div class="intervalo">
      <input type="date" aria-label="Data inicial" [ngModel]="de()" (ngModelChange)="de.set($event); alterado.emit()" />
      <span class="muted">até</span>
      <input type="date" aria-label="Data final" [ngModel]="ate()" (ngModelChange)="ate.set($event); alterado.emit()" />
    </div>
  `,
  styles: `
    :host { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
    .intervalo { display: flex; align-items: center; gap: 8px; }
    .intervalo input { width: 150px; }
  `,
})
export class FiltroPeriodo {
  readonly de = model('');
  readonly ate = model('');
  readonly alterado = output<void>();

  protected readonly presets: { valor: Preset; rotulo: string }[] = [
    { valor: 'mes', rotulo: 'Este mês' },
    { valor: 'mes_anterior', rotulo: 'Mês anterior' },
    { valor: 'ano', rotulo: 'Este ano' },
    { valor: 'tudo', rotulo: 'Tudo' },
  ];

  /** Destaca o atalho que corresponde às datas atuais (nenhum, se o intervalo for personalizado). */
  protected readonly ativo = computed(
    () => this.presets.find((p) => {
      const x = periodo(p.valor);
      return x.de === this.de() && x.ate === this.ate();
    })?.valor,
  );

  escolher(p: Preset) {
    const x = periodo(p);
    this.de.set(x.de);
    this.ate.set(x.ate);
    this.alterado.emit();
  }
}
