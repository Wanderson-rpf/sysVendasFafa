import { fromCents, getDb } from '../database';
import { compras, FiltroPeriodo } from './compras';
import { despesas } from './despesas';
import { pedidos } from './pedidos';
import { vendas } from './vendas';

const soma = (xs: number[]) => Math.round(xs.reduce((s, x) => s + x, 0) * 100) / 100;

export const dashboard = {
  resumo(filtro: FiltroPeriodo = {}) {
    const doPeriodo = vendas.listar(filtro).filter((v) => v.situacao !== 'cancelada');
    const todas = vendas.listar().filter((v) => v.situacao !== 'cancelada');
    const comprasPeriodo = compras.listar(filtro);
    const estoque = compras.estoque();

    const params = { de: filtro.de || null, ate: filtro.ate || null };
    const formas = getDb()
      .prepare(
        `SELECT r.forma, SUM(r.valor) AS valor, COUNT(*) AS qtd
           FROM recebimentos r JOIN vendas v ON v.id = r.venda_id AND v.cancelada = 0
          WHERE (:de IS NULL OR r.data >= :de) AND (:ate IS NULL OR r.data <= :ate)
          GROUP BY r.forma ORDER BY valor DESC`,
      )
      .all(params) as any[];

    const vendido = soma(doPeriodo.map((v) => v.total));
    const custoVendido = soma(doPeriodo.map((v) => v.custo));
    const investido = soma(comprasPeriodo.map((c) => c.total_investido));
    const recebido = soma(formas.map((f) => fromCents(f.valor)));
    const despesasCategoria = despesas.porCategoria(filtro);
    const totalDespesas = soma(despesasCategoria.map((d) => d.valor));
    const lucroBruto = soma([vendido, -custoVendido]);
    const lucroLiquido = soma([lucroBruto, -totalDespesas]);

    return {
      vendido,
      custo_vendido: custoVendido,
      lucro_bruto: lucroBruto,
      lucro_liquido: lucroLiquido,
      margem: vendido > 0 ? lucroLiquido / vendido : 0,
      qtd_vendas: doPeriodo.length,
      pecas_vendidas: doPeriodo.reduce((s, v) => s + v.qtd_pecas, 0),
      investido,
      despesas: totalDespesas,
      despesas_categoria: despesasCategoria,
      recebido,
      saldo_caixa: soma([recebido, -investido, -totalDespesas]),
      a_receber: soma(todas.filter((v) => v.saldo > 0).map((v) => v.saldo)),
      inadimplente: soma(todas.filter((v) => v.situacao === 'atrasada').map((v) => v.saldo)),
      estoque: {
        pecas: estoque.reduce((s, e) => s + e.disponivel, 0),
        valor_custo: soma(estoque.map((e) => e.custo_efetivo * e.disponivel)),
        valor_venda: soma(estoque.map((e) => e.preco_venda * e.disponivel)),
      },
      formas: formas.map((f) => ({ forma: f.forma, valor: fromCents(f.valor), qtd: f.qtd })),
      inadimplentes: vendas.inadimplentes().slice(0, 5),
      encomendas: pedidos.resumo(),
      mensal: dashboard.mensal(),
    };
  },

  /** Últimos 12 meses: vendido x investido x despesas x recebido. */
  mensal() {
    const db = getDb();
    const meses: string[] = [];
    const d = new Date();
    d.setDate(1);
    for (let i = 11; i >= 0; i--) {
      const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
      meses.push(`${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`);
    }
    const inicio = `${meses[0]}-01`;

    const porMes = (sql: string) =>
      new Map(
        (db.prepare(sql).all(inicio) as any[]).map((r) => [r.mes as string, Number(r.valor) || 0]),
      );

    const vendido = porMes(
      `SELECT substr(v.data,1,7) AS mes,
              SUM((SELECT COALESCE(SUM(quantidade*preco_unitario),0) FROM venda_itens WHERE venda_id=v.id) - v.desconto) AS valor
         FROM vendas v WHERE v.cancelada = 0 AND v.data >= ? GROUP BY mes`,
    );
    const investido = porMes(
      `SELECT substr(c.data,1,7) AS mes,
              SUM((SELECT COALESCE(SUM(quantidade*custo_unitario),0) FROM compra_itens WHERE compra_id=c.id)
                  + c.frete - c.desconto - c.comissao) AS valor
         FROM compras c WHERE c.data >= ? GROUP BY mes`,
    );
    const recebido = porMes(
      `SELECT substr(r.data,1,7) AS mes, SUM(r.valor) AS valor
         FROM recebimentos r JOIN vendas v ON v.id = r.venda_id AND v.cancelada = 0
        WHERE r.data >= ? GROUP BY mes`,
    );
    const gastoDespesas = porMes(
      `SELECT substr(data,1,7) AS mes, SUM(valor) AS valor FROM despesas WHERE data >= ? GROUP BY mes`,
    );

    return meses.map((mes) => ({
      mes,
      vendido: fromCents(vendido.get(mes)),
      investido: fromCents(investido.get(mes)),
      despesas: fromCents(gastoDespesas.get(mes)),
      recebido: fromCents(recebido.get(mes)),
    }));
  },
};
