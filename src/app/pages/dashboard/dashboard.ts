import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { BrlPipe, fimDoMes, inicioDoMes, PctPipe } from '../../core/format';
import { Dashboard, ROTULO_CATEGORIA, ROTULO_FORMA } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { FiltroPeriodo } from '../../shared/filtro-periodo';
import { GraficoMensal } from './grafico-mensal';

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, BrlPipe, PctPipe, GraficoMensal, FiltroPeriodo],
  templateUrl: './dashboard.html',
  styles: `
    .destaque { border-top: 3px solid var(--primary); }
    .barras { display: flex; flex-direction: column; gap: 12px; }
    .barra-linha { display: grid; grid-template-columns: 1fr auto; gap: 4px 12px; align-items: center; }
    .barra { grid-column: 1 / -1; height: 8px; background: var(--surface-2); border-radius: 4px; overflow: hidden; }
    .barra i { display: block; height: 100%; background: var(--serie-1); border-radius: 0 4px 4px 0; }
    .sub a { color: var(--primary); }
  `,
})
export class DashboardPage implements OnInit {
  protected api = inject(ApiService);
  private toast = inject(ToastService);

  protected readonly rotuloForma = ROTULO_FORMA;
  protected readonly rotuloCategoria = ROTULO_CATEGORIA;
  protected de = inicioDoMes();
  protected ate = fimDoMes();
  protected readonly dados = signal<Dashboard | null>(null);

  protected readonly maiorForma = computed(() => Math.max(1, ...(this.dados()?.formas.map((f) => f.valor) ?? [])));
  protected readonly maiorDespesa = computed(() =>
    Math.max(1, ...(this.dados()?.despesas_categoria.map((c) => c.valor) ?? [])),
  );

  ngOnInit() {
    this.carregar();
  }

  async carregar() {
    if (!this.api.disponivel) return;
    try {
      this.dados.set(await this.api.dashboard.resumo({ de: this.de || undefined, ate: this.ate || undefined }));
    } catch (e) {
      this.toast.erro(e);
    }
  }
}
