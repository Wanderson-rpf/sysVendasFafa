import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { BackupInfo } from '../../core/models';
import { Tema, ThemeService } from '../../core/theme.service';
import { ToastService } from '../../core/toast.service';

@Component({
  selector: 'app-configuracoes',
  imports: [FormsModule],
  template: `
    <div class="page-header">
      <div>
        <h1>Configurações</h1>
        <p>Aparência e segurança dos seus dados.</p>
      </div>
    </div>

    <div class="grid grid-2">
      <div class="card">
        <h2>Tema</h2>
        <div class="temas">
          @for (t of temas; track t.valor) {
            <label class="tema" [class.ativo]="tema.tema() === t.valor">
              <input type="radio" name="tema" [value]="t.valor" [checked]="tema.tema() === t.valor" (change)="tema.definir(t.valor)" />
              <span class="amostra amostra-{{ t.valor }}"></span>
              {{ t.rotulo }}
            </label>
          }
        </div>
      </div>

      <div class="card">
        <h2>Backup do banco de dados</h2>
        <p class="muted" style="margin-top: 0">
          Salve uma cópia em um pendrive ou na nuvem (Google Drive, OneDrive) com frequência.
        </p>
        <div class="toolbar">
          <button class="btn btn-primary" (click)="exportar()" [disabled]="!api.disponivel">Salvar backup em…</button>
          <button class="btn" (click)="restaurar()" [disabled]="!api.disponivel">Restaurar de arquivo…</button>
        </div>
        <label style="display: block; margin-top: 16px">
          <input type="checkbox" [ngModel]="automatico()" (ngModelChange)="definirAutomatico($event)" />
          Fazer backup automático ao fechar o sistema (mantém os 15 mais recentes)
        </label>
      </div>
    </div>

    <div class="card" style="margin-top: 16px">
      <div class="card-header">
        <h2>Backups automáticos</h2>
        <div class="toolbar">
          <button class="btn btn-sm" (click)="backupAgora()">Fazer backup agora</button>
          <button class="btn btn-sm" (click)="api.backup.abrirPasta()">Abrir pasta</button>
        </div>
      </div>
      <table>
        <thead><tr><th>Arquivo</th><th>Data</th><th class="num">Tamanho</th><th></th></tr></thead>
        <tbody>
          @for (b of backups(); track b.caminho) {
            <tr>
              <td>{{ b.nome }}</td>
              <td>{{ formatarData(b.data) }}</td>
              <td class="num">{{ (b.tamanho / 1024).toFixed(0) }} KB</td>
              <td class="acoes"><button class="btn btn-sm" (click)="restaurar(b.caminho)">Restaurar</button></td>
            </tr>
          } @empty {
            <tr><td colspan="4" class="vazio">Nenhum backup automático ainda.</td></tr>
          }
        </tbody>
      </table>
      @if (info(); as i) {
        <p class="muted" style="margin-bottom: 0">Banco em uso: <code>{{ i.banco }}</code> · versão {{ i.versao }}</p>
      }
    </div>
  `,
  styles: `
    .temas { display: flex; gap: 12px; flex-wrap: wrap; }
    .tema {
      display: flex; flex-direction: column; align-items: center; gap: 8px; cursor: pointer;
      border: 1px solid var(--border); border-radius: 10px; padding: 12px 18px;
    }
    .tema.ativo { border-color: var(--primary); outline: 1px solid var(--primary); }
    .tema input { display: none; }
    .amostra { width: 88px; height: 56px; border-radius: 6px; border: 1px solid var(--border); }
    .amostra-claro { background: linear-gradient(90deg, #ffffff 30%, #f8eff3 30%); }
    .amostra-escuro { background: linear-gradient(90deg, #211b20 30%, #2b232a 30%); }
    .amostra-sistema { background: linear-gradient(135deg, #ffffff 50%, #211b20 50%); }
  `,
})
export class ConfiguracoesPage implements OnInit {
  protected api = inject(ApiService);
  protected tema = inject(ThemeService);
  private toast = inject(ToastService);

  protected readonly temas: { valor: Tema; rotulo: string }[] = [
    { valor: 'claro', rotulo: 'Claro' },
    { valor: 'escuro', rotulo: 'Escuro' },
    { valor: 'sistema', rotulo: 'Seguir o Windows' },
  ];
  protected readonly backups = signal<BackupInfo[]>([]);
  protected readonly automatico = signal(true);
  protected readonly info = signal<{ versao: string; banco: string } | null>(null);

  async ngOnInit() {
    if (!this.api.disponivel) return;
    const [cfg, info] = await Promise.all([this.api.config.todas(), this.api.app.info()]);
    this.automatico.set(cfg['backup_automatico'] !== '0');
    this.info.set(info);
    this.carregarBackups();
  }

  async carregarBackups() {
    this.backups.set(await this.api.backup.listar());
  }

  async definirAutomatico(v: boolean) {
    this.automatico.set(v);
    await this.api.config.definir('backup_automatico', v ? '1' : '0');
  }

  async exportar() {
    try {
      const destino = await this.api.backup.exportar();
      if (destino) this.toast.sucesso(`Backup salvo em ${destino}`);
    } catch (e) {
      this.toast.erro(e);
    }
  }

  async backupAgora() {
    try {
      await this.api.backup.agora();
      this.toast.sucesso('Backup criado.');
      this.carregarBackups();
    } catch (e) {
      this.toast.erro(e);
    }
  }

  async restaurar(caminho?: string) {
    try {
      const seguranca = await this.api.backup.restaurar(caminho);
      if (!seguranca) return;
      this.toast.sucesso('Backup restaurado. Recarregando…');
      setTimeout(() => location.reload(), 1200);
    } catch (e) {
      this.toast.erro(e);
    }
  }

  formatarData(iso: string) {
    return new Date(iso).toLocaleString('pt-BR');
  }
}
