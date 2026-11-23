// Panel de control (RF-1001, RF-1002, DA-09). Composición aprobada: docs/propuesta/panel.html.
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { CHART_LABELS, type ChartType } from '@controlskill/contracts';
import { endpoints } from '../app/api';
import { useSession } from '../app/session';
import { Alert, ControlFrame, Drawer, Empty, Figure, Loading, StatusMark, STATUS_CLASS, cpkLabel, decimalsOf, fmt, fmtDate, sym, type Status } from '../ui/components';
import { Cota, CotaLegend } from '../ui/Cota';
import { Icon } from '../ui/icons';

interface Summary {
  id: string; name: string; unit: string | null; usl: number | null; lsl: number | null; nominal: number | null;
  chart_type: ChartType; n: number; cpk: number | null; status: Status; created_at: string;
  capability: null | { xbar: number; sigma: number; cp: number; cpu: number; cpl: number; cpk: number; sigmaMethod?: string; n_subgroups?: number; subgroup_size?: number };
}

/** Causa resumida con las reglas de recomendaciones de Capacidad (F-60). */
function cause(s: Summary): string {
  const c = s.capability; if (!c || s.usl == null || s.lsl == null) return '';
  if (s.status === 'capaz') return Math.abs(c.cpk - c.cp) > 0.1 ? 'Descentrado' : '';
  if (s.status === 'marginal') return c.cpu < c.cpl ? 'Sesgado hacia LSE' : c.cpl < c.cpu ? 'Sesgado hacia LSI' : '';
  if (c.cp < 1) return 'Variabilidad excesiva';
  return s.nominal != null && Math.abs(c.xbar - s.nominal) > (s.usl - s.lsl) * 0.1 ? 'Descentrado del nominal' : '';
}
const methodLabel = (m?: string) => (m === 'sbar_c4' ? 'S̄/c₄' : m === 'rbar_d2' ? 'R̄/d₂' : 's global');

type SortKey = 'name' | 'n' | 'cpk' | null;

export function Panel() {
  const { company } = useSession();
  const { data, isLoading, error, dataUpdatedAt } = useQuery({ queryKey: ['dashboard'], queryFn: endpoints.dashboard });
  const [sort, setSort] = useState<SortKey>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const rows = useMemo(() => {
    const list = [...((data ?? []) as Summary[])];
    if (sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name, 'es'));
    if (sort === 'n') list.sort((a, b) => b.n - a.n);
    if (sort === 'cpk') list.sort((a, b) => (a.cpk ?? 99) - (b.cpk ?? 99));
    return list;
  }, [data, sort]);
  const count = (s: Status) => rows.filter(r => r.status === s).length;
  const open = rows.find(r => r.id === openId) ?? null;

  const SortBtn = ({ k, children }: { k: SortKey; children: string }) => (
    <button className="sort" onClick={() => setSort(sort === k ? null : k)} aria-sort={sort === k ? 'ascending' : undefined}>{children}<Icon name="sort" size={13} /></button>
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Panel de procesos</h1>
          <dl className="context">
            <div><dt>Empresa</dt><dd>{company?.name}</dd></div>
            <div className="hide-sm"><dt>Datos</dt><dd>Fase I · todas las mediciones</dd></div>
            <div className="hide-sm"><dt>Capacidad</dt><dd>σ dentro de subgrupos</dd></div>
            <div><dt>Actualizado</dt><dd>{dataUpdatedAt ? fmtDate(new Date(dataUpdatedAt).toISOString()) : '—'}</dd></div>
          </dl>
        </div>
        <div className="actions">
          <Link className="btn" to="/fase-1/entrada"><Icon name="pen" />Ingresar datos</Link>
          <Link className="btn primary" to="/fase-1/procesos?nuevo=1"><Icon name="plus" />Nuevo proceso</Link>
        </div>
      </div>

      <dl className="figures" style={{ marginBottom: 'var(--gap)' }}>
        <Figure label="Procesos activos" value={rows.length} large />
        <Figure label="Capaces · Cpk ≥ 1.33" value={count('capaz')} tone="ok" large unit={<StatusMark status="capaz" />} />
        <Figure label="Marginales · 1.00 a 1.33" value={count('marginal')} tone="warn" large unit={<StatusMark status="marginal" />} />
        <Figure label="No capaces · Cpk < 1.00" value={count('no_capaz')} tone="bad" large unit={<StatusMark status="no_capaz" />} />
      </dl>

      <section className="sheet" aria-labelledby="t-procesos">
        <div className="sheet-head"><h2 id="t-procesos">Procesos</h2><CotaLegend /></div>
        {error && <div className="sheet-body"><Alert>Error al cargar los procesos: {(error as Error).message}</Alert></div>}
        {isLoading && <Loading text="Cargando procesos…" />}
        {!isLoading && !error && rows.length === 0 && (
          <Empty title="Sin procesos definidos" action={<Link className="btn primary" to="/fase-1/procesos?nuevo=1"><Icon name="plus" />Crear proceso</Link>}>
            Crea tu primer proceso para comenzar el análisis de capacidad.
          </Empty>
        )}
        {rows.length > 0 && (
          <div className="table-wrap">
            <table className="data stack-sm">
              <thead><tr>
                <th scope="col"><SortBtn k="name">Proceso</SortBtn></th>
                <th scope="col" className="hide-md">Carta</th>
                <th scope="col" className="hide-md"><SortBtn k="n">Mediciones</SortBtn></th>
                <th scope="col">Tolerancia y proceso</th>
                <th scope="col"><SortBtn k="cpk">{sym('Cpk') as never}</SortBtn></th>
                <th scope="col">Estado</th>
                <th scope="col"><span className="sr-only">Abrir</span></th>
              </tr></thead>
              <tbody>
                {rows.map(p => {
                  const d = decimalsOf(p.lsl, p.usl, p.nominal);
                  const c = p.capability;
                  return (
                    <tr key={p.id} className="clickable" tabIndex={0} aria-selected={openId === p.id}
                      onClick={() => setOpenId(p.id)} onKeyDown={e => { if (e.key === 'Enter') setOpenId(p.id); }}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{p.name}</div>
                        <div className="muted">{p.lsl != null && p.usl != null
                          ? `${p.unit ?? ''} · LSI ${p.lsl.toFixed(d)}${p.nominal != null ? ` · Nom. ${p.nominal.toFixed(d)}` : ''} · LSE ${p.usl.toFixed(d)}`
                          : 'Sin especificación'}</div>
                      </td>
                      <td className="hide-md" data-label="Carta"><span className="tag">{CHART_LABELS[p.chart_type]}</span></td>
                      <td className="hide-md" data-label="Mediciones"><b>{p.n}</b>{c?.n_subgroups != null && <div className="muted">{c.n_subgroups} × {c.subgroup_size} · σ<sub>w</sub> = {methodLabel(c.sigmaMethod)}</div>}</td>
                      <td className="span">{c && p.lsl != null && p.usl != null
                        ? <Cota lsl={p.lsl} usl={p.usl} nominal={p.nominal} xbar={c.xbar} sigma={c.sigma} unit={p.unit} />
                        : <div className="cota-na">{['p', 'np', 'c', 'u'].includes(p.chart_type) && p.usl == null ? 'Carta de atributos: capacidad no aplica' : p.n < 2 ? 'Sin mediciones de Fase I' : 'Faltan LSI y LSE'}</div>}
                      </td>
                      <td><ControlFrame label="Cpk" value={p.cpk} status={p.status} /></td>
                      <td><StatusMark status={p.status} /><div className="muted">{cause(p)}</div></td>
                      <td className="hide-sm" style={{ color: 'var(--ink)' }}><Icon name="chevron" /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {rows.length > 0 && <div className="sheet-foot"><span>{rows.length} procesos · {count('sin_datos')} sin datos de capacidad</span><span>Orden: más reciente primero · haz clic en un encabezado para ordenar</span></div>}
      </section>

      <Drawer open={!!open} title={open?.name ?? ''} onClose={() => setOpenId(null)}
        subtitle={open ? `${open.unit ?? 'sin unidad'} · ${CHART_LABELS[open.chart_type]}` : undefined}
        footer={open && <>
          <Link className="btn primary" to={`/capacidad?process_id=${open.id}`}>Capacidad</Link>
          <Link className="btn" to={`/fase-1/cartas?process_id=${open.id}`}>Cartas</Link>
          <Link className="btn" to={`/fase-2/monitoreo?process_id=${open.id}`}>Monitoreo</Link>
        </>}>
        {open && <>
          <div className={`alert ${open.status === 'sin_datos' ? 'info' : open.status === 'capaz' ? 'success' : open.status === 'marginal' ? 'warning' : 'error'}`}>
            <ControlFrame label="Cpk" value={open.cpk} status={open.status} large />
            <div><b className={STATUS_CLASS[open.status]}>{cpkLabel(open.cpk)}</b><div>{open.n} mediciones · {open.unit ?? 'sin unidad'}</div></div>
          </div>
          {open.capability && open.lsl != null && open.usl != null && <Cota lsl={open.lsl} usl={open.usl} nominal={open.nominal} xbar={open.capability.xbar} sigma={open.capability.sigma} unit={open.unit} />}
          <dl className="dl">
            <div><dt className="label">{sym('x̄')}</dt><dd>{fmt(open.capability?.xbar)}</dd></div>
            <div><dt className="label">{sym(`σ (${methodLabel(open.capability?.sigmaMethod)})`)}</dt><dd>{fmt(open.capability?.sigma)}</dd></div>
            <div><dt className="label">LSI</dt><dd>{open.lsl ?? '—'}</dd></div>
            <div><dt className="label">LSE</dt><dd>{open.usl ?? '—'}</dd></div>
            <div><dt className="label">Nominal</dt><dd>{open.nominal ?? '—'}</dd></div>
            <div><dt className="label">Mediciones</dt><dd>{open.n}</dd></div>
          </dl>
        </>}
      </Drawer>
    </>
  );
}
