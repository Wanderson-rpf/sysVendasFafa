import { Pipe, PipeTransform } from '@angular/core';

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const PCT = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 });

export const formatarBrl = (v: number | null | undefined) => BRL.format(v ?? 0);

/** Data local de hoje em yyyy-mm-dd (sem o deslocamento de fuso do toISOString). */
export function hoje(): string {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function inicioDoMes(ref = hoje()): string {
  return ref.slice(0, 8) + '01';
}

export function fimDoMes(ref = hoje()): string {
  const [y, m] = ref.split('-').map(Number);
  const ultimo = new Date(y, m, 0).getDate();
  return `${ref.slice(0, 8)}${String(ultimo).padStart(2, '0')}`;
}

export const arred = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

@Pipe({ name: 'brl' })
export class BrlPipe implements PipeTransform {
  transform(v: number | null | undefined): string {
    return formatarBrl(v);
  }
}

@Pipe({ name: 'pct' })
export class PctPipe implements PipeTransform {
  transform(v: number | null | undefined): string {
    return PCT.format(v ?? 0);
  }
}

/** "2026-10-18" → "18/10/2026" sem passar por Date (evita erro de fuso). */
@Pipe({ name: 'dataBr' })
export class DataBrPipe implements PipeTransform {
  transform(v: string | null | undefined): string {
    if (!v) return '—';
    const [y, m, d] = v.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
  }
}
