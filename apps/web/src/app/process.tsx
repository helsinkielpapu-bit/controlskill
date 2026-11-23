// Proceso activo persistente entre módulos. Fuente: ?process_id; respaldo: preferencia local.
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { useCallback, useEffect } from 'react';
import { CHART_LABELS, type Process } from '@controlskill/contracts';
import { endpoints } from './api';

const KEY = 'cs_active_process';
const readPref = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
const writePref = (v: string | null) => { try { v ? localStorage.setItem(KEY, v) : localStorage.removeItem(KEY); } catch { /* sin almacenamiento */ } };

export function useProcesses() {
  return useQuery({ queryKey: ['processes'], queryFn: endpoints.processes });
}

export function useActiveProcess() {
  const [params, setParams] = useSearchParams();
  const { data: processes } = useProcesses();
  const fromUrl = params.get('process_id');
  const id = fromUrl ?? readPref();
  const process = processes?.find(p => p.id === id) ?? null;

  useEffect(() => {
    // Restaura el último proceso solo si la URL sigue sin uno: si el usuario ya eligió otro, no se pisa su elección.
    if (!fromUrl && id && process) setParams(p => { if (!p.get('process_id')) p.set('process_id', id); return p; }, { replace: true });
    if (processes && id && !process) writePref(null);
  }, [fromUrl, id, process, processes, setParams]);

  const select = useCallback((next: string) => {
    writePref(next || null);
    setParams(p => { if (next) p.set('process_id', next); else p.delete('process_id'); return p; });
  }, [setParams]);

  return { processId: process ? process.id : null, process, processes: processes ?? [], select };
}

export function ProcessPicker({ value, processes, onChange, showChart = true }: { value: string | null; processes: Process[]; onChange: (id: string) => void; showChart?: boolean }) {
  return (
    <label className="field" style={{ minWidth: 260 }}>
      <span>Proceso</span>
      <select className="input" value={value ?? ''} onChange={e => onChange(e.target.value)}>
        <option value="">— Selecciona un proceso —</option>
        {processes.map(p => <option key={p.id} value={p.id}>{p.name}{p.unit ? ` (${p.unit})` : ''}{showChart ? ` · ${CHART_LABELS[p.chart_type]}` : ''}</option>)}
      </select>
    </label>
  );
}
