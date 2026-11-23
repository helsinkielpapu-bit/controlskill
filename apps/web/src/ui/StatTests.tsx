// Tarjetas de pruebas estadísticas (RF-407): Anderson-Darling, Levene (Brown-Forsythe), Kruskal-Wallis.
import type { StatisticalTests } from '@controlskill/engine';
import { Icon } from './icons';

const TESTS = [
  { key: 'normality', label: 'Normalidad', sub: 'Anderson-Darling', pass: 'normal', ok: 'Normal', bad: 'No normal' },
  { key: 'homoscedasticity', label: 'Homocedasticidad', sub: 'Levene (Brown-Forsythe)', pass: 'homoscedastic', ok: 'Homocedástico', bad: 'Heterocedástico' },
  { key: 'homogeneity', label: 'Homogeneidad de medias', sub: 'Kruskal-Wallis', pass: 'homogeneous', ok: 'Homogéneo', bad: 'No homogéneo' }
] as const;

export function StatTests({ data }: { data: StatisticalTests }) {
  return (
    <>
      <p style={{ padding: '12px 16px 0', fontSize: 13, color: 'var(--text-2)' }}>
        <b>{data.n_total}</b> observaciones · <b>{data.n_subgroups}</b> subgrupos{data.n_subgroups < 2 && ' · sin subgrupos: Levene y Kruskal-Wallis no aplican'} · α = 0.05
      </p>
      <div className="cols cols-3" style={{ padding: 16 }}>
        {TESTS.map(t => {
          const d = data[t.key] as any;
          if (!d.available) return (
            <div key={t.key} className="sheet" style={{ padding: 14 }}>
              <h3>{t.label}</h3><div className="label" style={{ margin: '2px 0 10px' }}>{t.sub}</div>
              <p style={{ fontSize: 13, color: 'var(--text-2)' }}>{d.reason}</p>
            </div>
          );
          const passed = d[t.pass] as boolean;
          return (
            <div key={t.key} className="sheet" style={{ padding: 14, borderColor: passed ? 'var(--ok)' : 'var(--bad)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <div><h3>{t.label}</h3><div className="label" style={{ marginTop: 2 }}>{t.sub}</div></div>
                <span className={`state ${passed ? 'ok' : 'bad'}`}><Icon name={passed ? 'check' : 'x'} />{passed ? t.ok : t.bad}</span>
              </div>
              <dl className="dl" style={{ margin: '12px 0', gridTemplateColumns: d.df != null || d.df1 != null ? '1fr 1fr 1fr' : '1fr 1fr' }}>
                <div><dt className="label">Estadístico</dt><dd>{d.statistic}</dd></div>
                <div style={{ borderRight: d.df != null || d.df1 != null ? '1px solid var(--rule)' : 0 }}><dt className="label">p-valor</dt><dd className={d.p_value <= 0.05 ? 'bad' : 'ok'}>{d.p_value}</dd></div>
                {(d.df != null || d.df1 != null) && <div style={{ borderRight: 0 }}><dt className="label">G.L.</dt><dd>{d.df ?? `${d.df1}, ${d.df2}`}</dd></div>}
              </dl>
              <p style={{ fontSize: 13 }}><span style={{ color: 'var(--text-2)' }}>H₀: {d.h0}.</span> {d.interpretation}</p>
            </div>
          );
        })}
      </div>
      <p style={{ padding: '0 16px 14px', fontSize: 12, color: 'var(--text-2)' }}>Anderson-Darling con corrección de Stephens (1974) · Levene con mediana (Brown-Forsythe) · Kruskal-Wallis con corrección por empates.</p>
    </>
  );
}
