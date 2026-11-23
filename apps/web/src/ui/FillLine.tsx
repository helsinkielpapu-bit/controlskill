// Escena de la pantalla de acceso: una llenadora de envases con inspección por sensor.
// Línea indexada: avanza un paso, se detiene, la boquilla llena el envase de la estación de llenado
// y el sensor mide el envase de la estación de inspección contra LSI/LSE (495–505 ml).
// Azul = dentro de especificaciones; rojo = fuera, con aviso al lado que dura mientras pasa el siguiente envase.
import { useEffect, useRef, useState } from 'react';

const LSL = 495, USL = 505;
// Volúmenes de llenado en orden, en subgrupos de n = 4 (la carta en vivo grafica la media de cada uno).
// En el ciclo de 10 subgrupos: 4 envases fuera de especificación y 2 medias fuera de control
// (el 4.º por exceso, x̄ = 504.25; el 8.º por falta, x̄ = 495.95).
export const SUBGROUP_N = 4;
const VOLUMES = [
  500.6, 499.1, 501.2, 500.3,
  498.4, 501.7, 499.8, 500.9,
  502.0, 499.4, 501.1, 498.7,
  503.8, 504.6, 502.9, 505.7,
  499.6, 500.8, 497.9, 500.1,
  501.4, 492.6, 500.7, 501.9,
  499.2, 500.5, 501.6, 499.9,
  496.1, 494.2, 497.0, 496.5,
  500.9, 501.3, 499.0, 506.2,
  500.2, 499.7, 500.8, 499.5
];

const S = 84;                     // separación entre envases (unidades SVG)
const FILL_AT = 2, SENSOR_AT = 4; // estaciones, en posiciones de la banda
const LAST = 7;                   // a partir de aquí el envase sale de la escena
const MOVE_MS = 900, DWELL_MS = 900, RED_DWELL_MS = 2600;

const BOTTOM = 166, NECK_TOP = 80;
const xOf = (pos: number) => pos * S - 50;
const liquidH = (v: number) => 44 + (v - 500) * 1.6;      // 495 → 36 px, 505 → 52 px
const outOfSpec = (v: number) => v < LSL || v > USL;

type Bottle = { id: number; pos: number; value: number; filled: boolean; verdict: 'ok' | 'bad' | null };
type Alarm = { id: number; value: number } | null;

function initial(): Bottle[] {
  return Array.from({ length: LAST + 1 }, (_, i) => {   // posiciones 0…LAST, sin huecos
    const pos = LAST - i, value = VOLUMES[i % VOLUMES.length]!;
    return { id: i, pos, value, filled: pos >= FILL_AT, verdict: pos >= SENSOR_AT ? (outOfSpec(value) ? 'bad' : 'ok') : null };
  });
}

const prefersReduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export type SensorReading = { id: number; value: number; bad: boolean };

/** Lecturas previas a la escena inicial: dan historia a la carta en vivo desde el primer instante. */
function history(): SensorReading[] {
  // Un ciclo completo previo (ids −40…−1): 10 subgrupos ya graficados al abrir la pantalla.
  const past = Array.from({ length: VOLUMES.length }, (_, k) => {
    const value = VOLUMES[k]!;
    return { id: k - VOLUMES.length, value, bad: outOfSpec(value) };
  });
  // Envases de la escena inicial que ya pasaron el sensor, en el orden en que lo cruzaron.
  const seen = initial().filter(b => b.verdict).sort((a, b) => b.pos - a.pos).map(b => ({ id: b.id, value: b.value, bad: b.verdict === 'bad' }));
  return [...past, ...seen];
}

export function FillLine({ onReading }: { onReading?: (r: SensorReading) => void } = {}) {
  const emit = useRef(onReading);
  emit.current = onReading;
  const [bottles, setBottles] = useState<Bottle[]>(initial);
  const [nozzle, setNozzle] = useState(false);
  const [reading, setReading] = useState<{ id: number; value: number } | null>(null);
  const [alarm, setAlarm] = useState<Alarm>(null);
  const list = useRef<Bottle[]>(bottles); // fuente de verdad de la secuencia; el estado solo la refleja
  const next = useRef(LAST + 1); // ids 0…LAST ya usados por la escena inicial

  useEffect(() => {
    const commit = (l: Bottle[]) => { list.current = l; setBottles(l); };
    for (const r of history()) emit.current?.(r);
    if (prefersReduced()) {
      // Movimiento reducido: una escena fija, con un envase rechazado en el sensor.
      commit(list.current.map(x => (x.pos === SENSOR_AT ? { ...x, value: 492.4, verdict: 'bad' } : x)));
      setReading({ id: -1, value: 492.4 });
      setAlarm({ id: -1, value: 492.4 });
      return;
    }
    let timer: ReturnType<typeof setTimeout>;
    let alive = true;
    const later = (fn: () => void, ms: number) => { timer = setTimeout(() => { if (alive) fn(); }, ms); };

    const advance = () => {
      if (document.hidden) return later(advance, 500); // sin trabajo con la pestaña oculta
      const moved = list.current.map(b => ({ ...b, pos: b.pos + 1 })).filter(b => b.pos <= LAST + 1);
      const id = next.current++;
      commit([...moved, { id, pos: 0, value: VOLUMES[id % VOLUMES.length]!, filled: false, verdict: null }]);
      later(dwell, MOVE_MS);
    };

    const dwell = () => {
      const inspected = list.current.find(b => b.pos === SENSOR_AT);
      const bad = !!inspected && outOfSpec(inspected.value);
      setNozzle(true);
      commit(list.current.map(b => b.pos === FILL_AT ? { ...b, filled: true }
        : b === inspected ? { ...b, verdict: bad ? 'bad' : 'ok' } : b));
      if (inspected) {
        setReading({ id: inspected.id, value: inspected.value });
        emit.current?.({ id: inspected.id, value: inspected.value, bad });
        // Un rechazo muestra el aviso; se quita cuando el siguiente envase pasa el sensor dentro de especificación.
        setAlarm(bad ? { id: inspected.id, value: inspected.value } : null);
      }
      later(() => { setNozzle(false); later(advance, 150); }, (bad ? RED_DWELL_MS : DWELL_MS) - 150);
    };

    later(advance, 700);
    return () => { alive = false; clearTimeout(timer); };
  }, []);

  const sensorX = xOf(SENSOR_AT) + 17, fillX = xOf(FILL_AT) + 17;
  const tick = (v: number) => BOTTOM - liquidH(v);

  return (
    <div className="fill-line" aria-hidden="true">
      <svg viewBox="0 0 600 198" className="fill-scene">
        <defs>
          <clipPath id="fl-bottle" clipPathUnits="userSpaceOnUse">
            <path d={`M3 ${BOTTOM}V108q0-8 8-12l2-4V${NECK_TOP}h8v12l2 4q8 4 8 12V${BOTTOM}z`} />
          </clipPath>
        </defs>

        {/* Llenadora: tolva y boquilla sobre la estación de llenado */}
        <g className="fl-machine">
          <rect x={fillX - 34} y={6} width={68} height={30} />
          <text x={fillX} y={25} textAnchor="middle">LLENADORA</text>
          <rect x={fillX - 4} y={36} width={8} height={10} />
        </g>
        <g className="fl-nozzle" data-down={nozzle || undefined}>
          <rect x={fillX - 2.5} y={44} width={5} height={24} />
          <rect className="fl-stream" x={fillX - 1} y={68} width={2} height={14} />
        </g>

        {/* Sensor: haz vertical y escala LSI/LSE al lado del envase inspeccionado */}
        <g className="fl-sensor">
          <rect x={sensorX - 14} y={20} width={28} height={14} />
          <text x={sensorX} y={14} textAnchor="middle">SENSOR</text>
          <line key={reading?.id ?? 'idle'} className="fl-beam" x1={sensorX} x2={sensorX} y1={34} y2={BOTTOM} />
          <g className="fl-scale">
            <line x1={sensorX + 26} x2={sensorX + 26} y1={tick(USL) - 10} y2={tick(LSL) + 10} />
            <line x1={sensorX + 22} x2={sensorX + 30} y1={tick(USL)} y2={tick(USL)} />
            <line x1={sensorX + 22} x2={sensorX + 30} y1={tick(LSL)} y2={tick(LSL)} />
            <text x={sensorX + 34} y={tick(USL) + 3}>LSE {USL}</text>
            <text x={sensorX + 34} y={tick(LSL) + 3}>LSI {LSL}</text>
          </g>
          <text className="fl-reading" x={sensorX} y={BOTTOM + 26} textAnchor="middle">{reading ? `${reading.value.toFixed(1)} ml` : '— ml'}</text>
        </g>

        {/* Banda transportadora */}
        <g className="fl-belt">
          <line x1={0} x2={600} y1={BOTTOM + 1} y2={BOTTOM + 1} />
          <line x1={0} x2={600} y1={BOTTOM + 9} y2={BOTTOM + 9} />
          {Array.from({ length: 11 }, (_, i) => <circle key={i} cx={i * 60 + 12} cy={BOTTOM + 5} r={3} />)}
        </g>

        {bottles.map(b => (
          <g key={b.id} className="fl-bottle" data-verdict={b.verdict ?? undefined} style={{ transform: `translateX(${xOf(b.pos)}px)` }}>
            <g clipPath="url(#fl-bottle)">
              <rect className="fl-liquid" data-filled={b.filled || undefined} x={0} y={BOTTOM - liquidH(b.value)} width={34} height={liquidH(b.value)} />
            </g>
            <path className="fl-glass" d={`M3 ${BOTTOM}V108q0-8 8-12l2-4V${NECK_TOP}h8v12l2 4q8 4 8 12V${BOTTOM}z`} />
          </g>
        ))}
      </svg>

      <div className="fill-alarm" data-show={alarm ? true : undefined}>
        <strong><span aria-hidden="true">⚠</span> Fuera de especificaciones</strong>
        <span>{alarm ? `${alarm.value.toFixed(1)} ml ${alarm.value < LSL ? `< LSI ${LSL}` : `> LSE ${USL}`} ml` : ' '}</span>
      </div>
    </div>
  );
}
