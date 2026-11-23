---
version: 1
slug: "docs-propuesta-panel-html"
primary_target: "docs/propuesta/panel.html"
related_targets: ["apps/web/src/features/panel"]
---

# Surface: Panel de control (dashboard)

Mode: Operate. Audience: quality engineers (office desk + plant terminal, bright light). Task: see every process's capability state at a glance and jump into the one that needs action. Data: per process name, unit, chart type, measurement count (k × n), LSI/nominal/LSE, x̄, σ̂w and method, Cpk, status (capaz/marginal/no_capaz/sin_datos). Counts: procesos, capaces, marginales, no capaces. Constraint: no new functionality beyond RF-1001/1002; the cota only visualizes values the engine already computes (DA-09).

## Direction contract
THESIS: Each process is read like a dimensioned drawing: tolerance as a cota, the process as a measured bar on it, Cpk in a control frame. Refuses the KPI-card-and-badge dashboard with a left sidebar.
OWN-WORLD: White sheets on cool #eef2f6 ground, drawing-ink navy #14365c shell bar and cota lines, hairline #d3dce6 rules, Archivo + Archivo Narrow with tabular figures, state red #b42318 / amber #a15c07 / green #1d6b45 always paired with icon and word. Square corners, no shadows, 1px rules.
STORY: The engineer sees which processes are not capable and why (off-center vs too wide), trusts the numbers because the method (σ̂ = R̄/d₂, k × n) is printed beside them, and opens the process in Capacidad, Cartas or Monitoreo.
FIRST VIEWPORT: Navy top bar (brand, SPC-cycle nav, company/user). Header row: title "Panel de procesos", context block (empresa, datos Fase I, última actualización), actions "Ingresar datos" and "+ Nuevo proceso". Four-count strip. Full-width process table in creation order (most recent first), headers sortable: name+specs, carta, mediciones (k × n), cota capacity strip 360px, Cpk control frame, estado, row action. Primary action: "+ Nuevo proceso" top right.
FORM: Hoja de plano — candidate 1 of my ordered list (IMPECCABLE'S PICK, chosen by the user). seed:6f1c201c0596e4c0. Signature move: the capacity cota repeated identically at three scales (panel row, capacity header, report).
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
