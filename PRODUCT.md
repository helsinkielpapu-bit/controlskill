# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack
Node.js + PostgreSQL (user's choice, 2026-11-19). Remaining technical choices are recorded in docs/arquitectura.md. Local-only (localhost) until the user authorizes otherwise; no deploy target.

## Users
Primary: **quality engineers** working on production lines or service processes. They collect measurements by subgroup, establish control limits (Phase I), judge process capability against specifications, monitor live production against frozen limits (Phase II), evaluate how well their control plan detects shifts, design attribute acceptance sampling plans, and produce reports for their organization. They have at least basic descriptive statistics and industrial-process knowledge.
Secondary (not the design driver): statistical analysts, plant supervisors, teachers/students (Academic mode), laboratories.

## Product Purpose
ControlSkill is a multi-company web platform for Statistical Process Control. Every calculation, rule, input and output is fixed by its functional specification (docs/especificacion-funcional.md) and verified against reference values. Success: results are exact and traceable, and the work feels like a carefully designed professional product.

## Positioning
One place covering the full SPC cycle: Phase I stabilization → capability → Phase II monitoring → control-plan performance (α, β, ARL, ATS, PPNC, sample-load redesign) → attribute sampling plans → integrated report, with the formulas and assumptions made explicit.

## Operating Context
- Data comes from the shop floor: typed by subgroup, pasted from Excel, or imported from .xlsx/.xls/.csv.
- Phase II entry happens live during a shift; the screen must make out-of-control signals unmistakable.
- Output is shared as a PDF report (A4 portrait).
- Language: Spanish (es-MX number/date formatting); decimals accepted with comma or dot.
- Roles: admin and analyst, per company.

## Capabilities and Constraints
- Charts: X̄-R, X̄-S, p, np, c, u (+ I-MR and Nelson rules in the engine, not exposed in UI).
- Capability (short-term only): Cp, Cpk, Cpu, Cpl, PPM, %PNC; tests Anderson-Darling, Levene (Brown-Forsythe), Kruskal-Wallis, runs test.
- Functional truth is fixed by docs/especificacion-funcional.md and its approved decisions DA-01…DA-27; nothing may be invented beyond it.
- No connection to production services or payment providers; subscription model kept with flag off.
- Nothing is pushed to GitHub or deployed without explicit approval.

## Brand Commitments
- Name: **ControlSkill**.

## Evidence on Hand
- Demo dataset: 60 fill-volume measurements (ml), 12 subgroups of 5, USL 505 / LSL 495 / nominal 500.
- No real customers, testimonials, metrics or logos exist; none may be fabricated.

## Product Principles
1. Numerical fidelity over visual convenience: every displayed number traces to a documented formula.
2. Signals first: what is out of control, incapable or risky must be the first thing seen.
3. Show the method: limits, σ method, n and assumptions are always visible next to results.
4. Floor-ready input: fast keyboard entry, paste and import, tolerant decimal parsing.
5. One engine: the same calculation everywhere, no module-specific variants.

## Accessibility & Inclusion
Status must never rely on color alone (charts and badges also use shape/text). Minimum screen: 1024×768; must work on phone widths for monitoring.
