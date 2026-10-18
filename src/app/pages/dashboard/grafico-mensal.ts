import { Component, computed, input, signal } from '@angular/core';
import { BrlPipe, formatarBrl } from '../../core/format';
import { ResumoMensal } from '../../core/models';

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const W = 720;
const H = 240;
const PAD = { top: 12, right: 8, bottom: 26, left: 64 };

/** Arredonda o topo da escala para um valor "redondo" (1, 2, 2.5, 5 × 10^n). */
function topoBonito(v: number): number {
  if (v <= 0) return 100;
  const base = 10 ** Math.floor(Math.log10(v));
  const passo = [1, 2, 2.5, 5, 10].find((m) => m * base >= v)!;
  return passo * base;
}

/** Barra com topo arredondado (4px) e base reta, ancorada na linha zero. */
function barra(x: number, y: number, w: number, h: number): string {
  if (h <= 0) return '';
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

@Component({
  selector: 'app-grafico-mensal',
  imports: [BrlPipe],
  template: `
    <div class="viz-legenda">
      <span><i class="chip s1"></i>Vendido</span>
      <span><i class="chip s2"></i>Gastos (compras + despesas)</span>
      <button type="button" class="btn btn-sm" (click)="verTabela.set(!verTabela())">
        {{ verTabela() ? 'Ver gráfico' : 'Ver tabela' }}
      </button>
    </div>

    @if (verTabela()) {
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>Mês</th><th class="num">Vendido</th><th class="num">Compras</th><th class="num">Despesas</th><th class="num">Recebido</th></tr>
          </thead>
          <tbody>
            @for (m of dados(); track m.mes) {
              <tr>
                <td>{{ rotuloMes(m.mes, true) }}</td>
                <td class="num">{{ m.vendido | brl }}</td>
                <td class="num">{{ m.investido | brl }}</td>
                <td class="num">{{ m.despesas | brl }}</td>
                <td class="num">{{ m.recebido | brl }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    } @else {
      <div class="viz" (mouseleave)="hover.set(-1)">
        <svg [attr.viewBox]="'0 0 ' + W + ' ' + H" role="img" aria-label="Vendido e gastos por mês, últimos 12 meses">
          @for (t of geo().ticks; track t.v) {
            <line class="grid" [attr.x1]="PAD.left" [attr.x2]="W - PAD.right" [attr.y1]="t.y" [attr.y2]="t.y" />
            <text class="eixo" [attr.x]="PAD.left - 8" [attr.y]="t.y + 4" text-anchor="end">{{ t.rotulo }}</text>
          }
          @for (c of geo().colunas; track c.mes; let i = $index) {
            @if (hover() === i) {
              <rect class="foco" [attr.x]="c.x0" [attr.y]="PAD.top" [attr.width]="c.largura" [attr.height]="plotH" />
            }
            <path class="s1" [attr.d]="c.b1" />
            <path class="s2" [attr.d]="c.b2" />
            <text class="eixo" [attr.x]="c.cx" [attr.y]="H - 8" text-anchor="middle">{{ c.rotulo }}</text>
            <rect class="alvo" [attr.x]="c.x0" [attr.y]="PAD.top" [attr.width]="c.largura" [attr.height]="plotH"
                  (mouseenter)="hover.set(i)" />
          }
          <line class="base" [attr.x1]="PAD.left" [attr.x2]="W - PAD.right" [attr.y1]="PAD.top + plotH" [attr.y2]="PAD.top + plotH" />
        </svg>

        @if (tooltip(); as t) {
          <div class="viz-tooltip" [style.left.%]="t.esquerda">
            <strong>{{ t.titulo }}</strong>
            <div><i class="chip s1"></i>Vendido <b>{{ t.vendido }}</b></div>
            <div><i class="chip s2"></i>Gastos <b>{{ t.gastos }}</b></div>
            <div class="muted">Compras {{ t.investido }} · despesas {{ t.despesas }}</div>
            <div class="muted">Recebido {{ t.recebido }}</div>
          </div>
        }
      </div>
    }
  `,
  styles: `
    :host { display: block; }
    .viz { position: relative; }
    svg { width: 100%; height: auto; display: block; overflow: visible; }
    .grid { stroke: var(--grid); stroke-width: 1; }
    .base { stroke: var(--border); stroke-width: 1; }
    .eixo { fill: var(--text-3); font-size: 11px; font-variant-numeric: tabular-nums; }
    .s1 { fill: var(--serie-1); }
    .s2 { fill: var(--serie-2); }
    .foco { fill: var(--surface-2); }
    .alvo { fill: transparent; cursor: default; }
    .viz-legenda { display: flex; align-items: center; gap: 16px; margin-bottom: 10px; color: var(--text-2); font-size: 12.5px; }
    .viz-legenda button { margin-left: auto; }
    .chip { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 6px; vertical-align: -1px; }
    .chip.s1 { background: var(--serie-1); } .chip.s2 { background: var(--serie-2); }
    .viz-tooltip {
      position: absolute; top: 4px; transform: translateX(-50%); pointer-events: none;
      background: var(--surface); border: 1px solid var(--border); box-shadow: var(--shadow);
      border-radius: 8px; padding: 8px 12px; font-size: 12.5px; color: var(--text-2); white-space: nowrap;
    }
    .viz-tooltip strong { display: block; color: var(--text); margin-bottom: 4px; }
    .viz-tooltip b { color: var(--text); font-variant-numeric: tabular-nums; margin-left: 6px; }
  `,
})
export class GraficoMensal {
  readonly dados = input.required<ResumoMensal[]>();
  protected readonly hover = signal(-1);
  protected readonly verTabela = signal(false);

  protected readonly W = W;
  protected readonly H = H;
  protected readonly PAD = PAD;
  protected readonly plotH = H - PAD.top - PAD.bottom;

  protected readonly geo = computed(() => {
    const dados = this.dados();
    const plotW = W - PAD.left - PAD.right;
    const max = topoBonito(Math.max(...dados.flatMap((d) => [d.vendido, d.investido + d.despesas]), 0));
    const y = (v: number) => PAD.top + this.plotH - (v / max) * this.plotH;
    const largura = plotW / Math.max(dados.length, 1);
    const bw = Math.min(18, largura * 0.3);
    const gap = 2;

    const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({
      v: f * max,
      y: y(f * max),
      rotulo: formatarBrl(f * max).replace(/,00$/, ''),
    }));

    const colunas = dados.map((d, i) => {
      const x0 = PAD.left + i * largura;
      const cx = x0 + largura / 2;
      return {
        mes: d.mes,
        x0,
        cx,
        largura,
        rotulo: this.rotuloMes(d.mes),
        b1: barra(cx - bw - gap / 2, y(d.vendido), bw, PAD.top + this.plotH - y(d.vendido)),
        b2: barra(cx + gap / 2, y(d.investido + d.despesas), bw, PAD.top + this.plotH - y(d.investido + d.despesas)),
      };
    });
    return { ticks, colunas };
  });

  protected readonly tooltip = computed(() => {
    const i = this.hover();
    const d = this.dados()[i];
    if (!d) return null;
    const c = this.geo().colunas[i];
    // Mantém o tooltip dentro da área do gráfico nas bordas.
    const esquerda = Math.min(88, Math.max(14, (c.cx / W) * 100));
    return {
      esquerda,
      titulo: this.rotuloMes(d.mes, true),
      vendido: formatarBrl(d.vendido),
      investido: formatarBrl(d.investido),
      despesas: formatarBrl(d.despesas),
      gastos: formatarBrl(d.investido + d.despesas),
      recebido: formatarBrl(d.recebido),
    };
  });

  protected rotuloMes(mes: string, comAno = false): string {
    const [y, m] = mes.split('-');
    const nome = MESES[Number(m) - 1];
    return comAno ? `${nome}/${y}` : nome;
  }
}
