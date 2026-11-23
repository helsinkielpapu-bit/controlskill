// Fondo interactivo del panel de acceso: una hoja de plano viva.
// Retícula de dibujo; alrededor del puntero los nodos se iluminan y se apartan, una cruz de trazado
// lo sigue con sus coordenadas en mm, y cada clic emite una onda de medición. Sin puntero, una sonda
// recorre la hoja sola. Dibujado en <canvas> detrás del contenido; no intercepta clics ni selección.
import { useEffect, useRef } from 'react';

const STEP = 28;            // retícula menor (px); la mayor cada 5
const MM = 5 / STEP;        // escala de la lectura: 1 cuadro = 5 mm
const R = 190;              // radio de influencia del puntero
const PUSH = 9;             // desplazamiento máximo de los nodos
const RIPPLE_MS = 1200;

export function BlueprintField() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current, host = canvas?.parentElement;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !host || !ctx) return;
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

    let w = 0, h = 0, dpr = 1, raf = 0;
    let grid: HTMLCanvasElement | null = null;
    const target = { x: 0, y: 0, active: false };
    const probe = { x: -999, y: -999, presence: 0, focus: 0 }; // focus: cruz y lectura solo con el puntero encima
    const ripples: { x: number; y: number; t: number }[] = [];
    const start = performance.now();

    function buildGrid() {
      // Con el panel aún sin tamaño (0 px) no hay retícula que dibujar: drawImage fallaría con un lienzo vacío.
      if (w < 1 || h < 1) { grid = null; return; }
      grid = document.createElement('canvas');
      grid.width = w * dpr; grid.height = h * dpr;
      const g = grid.getContext('2d')!;
      g.scale(dpr, dpr);
      for (const major of [false, true]) {
        g.beginPath();
        g.strokeStyle = major ? 'rgba(255,255,255,.085)' : 'rgba(255,255,255,.04)';
        g.lineWidth = 1;
        for (let x = 0, i = 0; x <= w; x += STEP, i++) if ((i % 5 === 0) === major) { g.moveTo(Math.round(x) + .5, 0); g.lineTo(Math.round(x) + .5, h); }
        for (let y = 0, i = 0; y <= h; y += STEP, i++) if ((i % 5 === 0) === major) { g.moveTo(0, Math.round(y) + .5); g.lineTo(w, Math.round(y) + .5); }
        g.stroke();
      }
    }

    function resize() {
      const r = host!.getBoundingClientRect();
      w = r.width; h = r.height; dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas!.width = Math.round(w * dpr); canvas!.height = Math.round(h * dpr);
      canvas!.style.width = `${w}px`; canvas!.style.height = `${h}px`;
      buildGrid();
      if (reduce) draw(performance.now());
    }

    function draw(now: number) {
      if (w < 1 || h < 1) return;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx!.clearRect(0, 0, w, h);
      if (grid) ctx!.drawImage(grid, 0, 0, w, h);
      const { x: px, y: py, presence: s } = probe;
      if (s < 0.01) return;

      // Resplandor bajo el puntero
      const glow = ctx!.createRadialGradient(px, py, 0, px, py, R * 1.5);
      glow.addColorStop(0, `rgba(106,169,255,${0.18 * s})`);
      glow.addColorStop(1, 'rgba(106,169,255,0)');
      ctx!.fillStyle = glow;
      ctx!.fillRect(px - R * 1.5, py - R * 1.5, R * 3, R * 3);

      // Nodos de la retícula: se iluminan y se apartan del puntero
      const i0 = Math.max(0, Math.floor((px - R) / STEP)), i1 = Math.ceil((px + R) / STEP);
      const j0 = Math.max(0, Math.floor((py - R) / STEP)), j1 = Math.ceil((py + R) / STEP);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
        const gx = i * STEP, gy = j * STEP, dx = gx - px, dy = gy - py, d = Math.hypot(dx, dy);
        if (d > R) continue;
        const k = 1 - d / R, e = k * k;
        const ox = d > 0.5 ? (dx / d) * PUSH * e : 0, oy = d > 0.5 ? (dy / d) * PUSH * e : 0;
        const major = i % 5 === 0 && j % 5 === 0;
        ctx!.fillStyle = `rgba(${major ? '255,255,255' : '190,215,255'},${(0.12 + 0.75 * e) * s})`;
        const r = (major ? 1.6 : 1) + 1.6 * e;
        ctx!.fillRect(gx + ox - r, gy + oy - r, r * 2, r * 2);
      }

      // Cruz de trazado con lectura de coordenadas (solo mientras el usuario apunta)
      const f = probe.focus;
      if (f > 0.01) {
      ctx!.strokeStyle = `rgba(255,255,255,${0.16 * f})`;
      ctx!.setLineDash([4, 6]);
      ctx!.beginPath();
      ctx!.moveTo(0, Math.round(py) + .5); ctx!.lineTo(w, Math.round(py) + .5);
      ctx!.moveTo(Math.round(px) + .5, 0); ctx!.lineTo(Math.round(px) + .5, h);
      ctx!.stroke();
      ctx!.setLineDash([]);
      ctx!.strokeStyle = `rgba(255,255,255,${0.7 * f})`;
      ctx!.beginPath();
      ctx!.arc(px, py, 9, 0, Math.PI * 2);
      ctx!.moveTo(px - 15, py); ctx!.lineTo(px - 5, py); ctx!.moveTo(px + 5, py); ctx!.lineTo(px + 15, py);
      ctx!.moveTo(px, py - 15); ctx!.lineTo(px, py - 5); ctx!.moveTo(px, py + 5); ctx!.lineTo(px, py + 15);
      ctx!.stroke();
      const label = `X ${(px * MM).toFixed(1)}  Y ${(py * MM).toFixed(1)} mm`;
      ctx!.font = '600 11px "Archivo Narrow", "Archivo", system-ui, sans-serif';
      const tw = ctx!.measureText(label).width;
      const lx = px + 18 + tw > w - 8 ? px - 18 - tw : px + 18, ly = py - 14 < 14 ? py + 26 : py - 14;
      ctx!.fillStyle = `rgba(198,212,228,${0.85 * f})`;
      ctx!.fillText(label, lx, ly);
      }

      // Ondas de medición (clic)
      for (let n = ripples.length - 1; n >= 0; n--) {
        const rp = ripples[n]!, t = (now - rp.t) / RIPPLE_MS;
        if (t >= 1) { ripples.splice(n, 1); continue; }
        const e = 1 - Math.pow(1 - t, 3);   // salida rápida que se asienta
        ctx!.strokeStyle = `rgba(106,169,255,${0.6 * (1 - t)})`;
        ctx!.lineWidth = 1.25;
        for (const f of [1, 0.6]) { ctx!.beginPath(); ctx!.arc(rp.x, rp.y, 18 + 200 * e * f, 0, Math.PI * 2); ctx!.stroke(); }
        ctx!.lineWidth = 1;
      }
    }

    function frame(now: number) {
      let tx = target.x, ty = target.y;
      if (!target.active) { // sonda autónoma: recorrido lento tipo Lissajous por la zona libre del panel
        const t = (now - start) / 1000;
        tx = w * (0.66 + 0.24 * Math.sin(t * 0.21)); ty = h * (0.42 + 0.28 * Math.sin(t * 0.29 + 1.3));
      }
      if (probe.x < -900) { probe.x = tx; probe.y = ty; }
      const follow = target.active ? 0.18 : 0.04;
      probe.x += (tx - probe.x) * follow; probe.y += (ty - probe.y) * follow;
      // Sobre el texto, la carta o la llenadora la sonda se atenúa y la cruz se oculta, para no ensuciar la lectura.
      const covered = overContent(probe.x, probe.y);
      probe.presence += ((covered ? 0.3 : target.active ? 1 : 0.6) - probe.presence) * 0.08;
      probe.focus += ((target.active && !covered ? 1 : 0) - probe.focus) * 0.15;
      draw(now);
      raf = requestAnimationFrame(frame);
    }

    // Zonas con contenido legible (título, texto, carta en vivo, llenadora), con un margen de respiro.
    function overContent(x: number, y: number) {
      const base = host!.getBoundingClientRect(), pad = 18;
      for (const el of host!.querySelectorAll<HTMLElement>('.auth-head > *, .brand, .sensor-chart, .fill-line')) {
        const r = el.getBoundingClientRect();
        if (!r.width) continue;
        if (x >= r.left - base.left - pad && x <= r.right - base.left + pad && y >= r.top - base.top - pad && y <= r.bottom - base.top + pad) return true;
      }
      return false;
    }

    const local = (e: PointerEvent) => { const r = host.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const onMove = (e: PointerEvent) => {
      const p = local(e); target.x = p.x; target.y = p.y; target.active = true;
      if (reduce) { const c = overContent(p.x, p.y); probe.x = p.x; probe.y = p.y; probe.presence = c ? 0.3 : 1; probe.focus = c ? 0 : 1; draw(performance.now()); }
    };
    const onLeave = () => { target.active = false; if (reduce) { probe.presence = 0; draw(performance.now()); } };
    const onDown = (e: PointerEvent) => { if (!reduce) { const p = local(e); ripples.push({ x: p.x, y: p.y, t: performance.now() }); } };

    const ro = new ResizeObserver(resize);
    ro.observe(host);
    resize();
    host.addEventListener('pointermove', onMove);
    host.addEventListener('pointerleave', onLeave);
    host.addEventListener('pointerdown', onDown);
    if (!reduce) raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf); ro.disconnect();
      host.removeEventListener('pointermove', onMove);
      host.removeEventListener('pointerleave', onLeave);
      host.removeEventListener('pointerdown', onDown);
    };
  }, []);

  return <canvas ref={ref} className="auth-field" aria-hidden="true" />;
}
