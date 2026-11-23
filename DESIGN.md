---
name: ControlSkill
description: Statistical process control drawn as an engineering sheet, with flat ink, hairline rules and tolerances shown as dimensions.
colors:
  drawing-ink: "#14365c"
  drawing-ink-hover: "#1d4a7a"
  ink-wash: "#e6edf5"
  ink-mist: "#c6d4e4"
  plan-ground: "#eef2f6"
  sheet-white: "#ffffff"
  graphite-text: "#1c232b"
  slate-secondary: "#566474"
  hairline: "#d3dce6"
  hairline-strong: "#9fb1c4"
  row-hover: "#f6f9fc"
  reject-red: "#b42318"
  reject-red-tint: "#fdeceb"
  caution-amber: "#a15c07"
  caution-amber-tint: "#fdf3e2"
  accept-green: "#1d6b45"
  accept-green-tint: "#e7f4ec"
typography:
  display:
    fontFamily: "Archivo Narrow, Archivo, system-ui, sans-serif"
    fontSize: "44px"
    fontWeight: 700
    lineHeight: 1.05
  headline:
    fontFamily: "Archivo Narrow, Archivo, system-ui, sans-serif"
    fontSize: "30px"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "0.01em"
  figure:
    fontFamily: "Archivo Narrow, Archivo, system-ui, sans-serif"
    fontSize: "30px"
    fontWeight: 700
    lineHeight: 1.1
    fontFeature: "tnum"
  title:
    fontFamily: "Archivo Narrow, Archivo, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 700
    lineHeight: 1.2
  subtitle:
    fontFamily: "Archivo Narrow, Archivo, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "0.02em"
  body:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.45
    fontFeature: "tnum"
  label:
    fontFamily: "Archivo Narrow, Archivo, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    letterSpacing: "0.08em"
  field-label:
    fontFamily: "Archivo Narrow, Archivo, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    letterSpacing: "0.06em"
rounded:
  none: "0px"
spacing:
  xs: "6px"
  sm: "10px"
  md: "16px"
  lg: "24px"
  xl: "48px"
components:
  button-primary:
    backgroundColor: "{colors.drawing-ink}"
    textColor: "{colors.sheet-white}"
    rounded: "{rounded.none}"
    padding: "0 16px"
    height: "40px"
  button-primary-hover:
    backgroundColor: "{colors.drawing-ink-hover}"
  button-secondary:
    backgroundColor: "{colors.sheet-white}"
    textColor: "{colors.drawing-ink}"
    rounded: "{rounded.none}"
    padding: "0 16px"
    height: "40px"
  button-secondary-hover:
    backgroundColor: "{colors.ink-wash}"
  button-danger:
    backgroundColor: "{colors.sheet-white}"
    textColor: "{colors.reject-red}"
    rounded: "{rounded.none}"
    padding: "0 16px"
    height: "40px"
  button-danger-hover:
    backgroundColor: "{colors.reject-red-tint}"
  button-small:
    padding: "0 11px"
    height: "32px"
  input:
    backgroundColor: "{colors.sheet-white}"
    textColor: "{colors.graphite-text}"
    rounded: "{rounded.none}"
    padding: "0 11px"
    height: "40px"
  input-invalid:
    backgroundColor: "{colors.reject-red-tint}"
  sheet:
    backgroundColor: "{colors.sheet-white}"
    rounded: "{rounded.none}"
    padding: "16px"
  top-bar:
    backgroundColor: "{colors.drawing-ink}"
    textColor: "{colors.sheet-white}"
    height: "56px"
    padding: "0 24px"
  control-frame:
    backgroundColor: "{colors.sheet-white}"
    textColor: "{colors.drawing-ink}"
    typography: "{typography.figure}"
    rounded: "{rounded.none}"
  tag:
    backgroundColor: "{colors.sheet-white}"
    textColor: "{colors.drawing-ink}"
    rounded: "{rounded.none}"
    padding: "2px 7px"
  tag-solid:
    backgroundColor: "{colors.drawing-ink}"
    textColor: "{colors.sheet-white}"
  tooltip:
    backgroundColor: "{colors.drawing-ink}"
    textColor: "{colors.sheet-white}"
    padding: "7px 10px"
---

# Design System: ControlSkill

## Overview

**Creative North Star: "Hoja de plano"**

The interface is an engineering drawing sheet. White sheets sit on a cool blue-grey ground, ruled with 1px hairlines and inked in one drafting navy. Nothing floats: there are no drop shadows, no rounded containers, no gradients. Hierarchy comes from rule weight (1px hairline, 1.5px control stroke, 2px ink rule under headers and around title blocks), from the condensed Archivo Narrow used for every heading, label and figure, and from the deliberate restraint of the palette, so the three state colours are the loudest things on any screen.

The world is dense and operational. Tables carry the work; figures are set large in tabular numerals; method context (σ estimator, n, limits) sits in ruled context strips next to results. The one signature device is the capacity **cota**: the specification tolerance LSI to LSE drawn as a dimension line with arrowheads over a pale ink band, a dashed nominal axis, and the process x̄ ± 3σ bar drawn to the same scale, with any part beyond tolerance in red. Cpk beside it is set in a GD&T-style control frame. The same cota appears at three scales: a panel table row, the capability header, and the printed report.


**Key Characteristics:**
- One ink (drafting navy) for all interactive and structural emphasis; white sheets on a pale plan ground.
- Square corners everywhere a container or control appears; depth by rules, never by shadow.
- Archivo Narrow for headings, labels and figures; Archivo for running text; tabular numerals throughout.
- State colour always paired with an icon and a word.
- The cota and the control frame are the reusable signature, repeated at row, header and report scale.

## Colors

A single-ink drafting palette: navy on white over a cool grey ground, with three state colours reserved for judgments.

### Primary
- **Drawing Ink** (#14365c): the top bar, primary buttons, active tab underline, focus outline, header rule under table heads (2px), modal and drawer borders, tooltips, cota tolerance strokes and arrowheads, chart centre lines. Text selection is ink on white.
- **Drawing Ink Hover** (#1d4a7a): hover state of primary buttons only.
- **Ink Wash** (#e6edf5): the cota tolerance band, selected table rows, secondary-button hover, menu hover, info alert ground, focused entry cell.
- **Ink Mist** (#c6d4e4): inactive nav text on the ink bar, secondary text on ink grounds, input hover border.

### Neutral
- **Plan Ground** (#eef2f6): page background, disabled and read-only inputs, the subgroup index column in the capture grid.
- **Sheet White** (#ffffff): every content container (sheets, tables, figures strips, drawer, modal, report).
- **Graphite Text** (#1c232b): body text and the in-tolerance process bar of the cota.
- **Slate Secondary** (#566474): ledes, labels, units, captions, chart tick text.
- **Hairline** (#d3dce6): internal dividers: row rules, sheet-head and foot rules, figure cell borders, chart gridlines.
- **Hairline Strong** (#9fb1c4): outer sheet borders, input borders at rest, context strip frame, chart axes, scrollbar thumb.
- **Row Hover** (#f6f9fc): table row hover.

### State
- **Reject Red** (#b42318) on **Reject Red Tint** (#fdeceb): no capaz, out-of-control signal, out-of-tolerance cota segment, control limits on charts, invalid input, flagged rows, danger buttons, the alarm signal strip.
- **Caution Amber** (#a15c07) on **Caution Amber Tint** (#fdf3e2): marginal capability, warnings, partially filled subgroups.
- **Accept Green** (#1d6b45) on **Accept Green Tint** (#e7f4ec): capaz, completed subgroups, success alerts, in-control signal strip.

### Named Rules
**The One Ink Rule.** Drafting navy is the only non-state hue. A second accent colour does not exist in this system; emphasis comes from ink weight, not from another hue.

**The Icon-and-Word Rule.** Red, amber and green never carry meaning alone. Every state mark pairs the colour with an icon (check, half-disc, cross, dash, alert triangle) and a word (Capaz, Marginal, No capaz, Sin datos); chart limit lines carry text labels and out-of-control points change shape.

## Typography

**Display Font:** Archivo Narrow (with Archivo, system-ui fallback), self-hosted woff2, weights 400 to 700
**Body Font:** Archivo (with system-ui fallback), self-hosted variable woff2, weights 100 to 900

**Character:** A condensed grotesque for the drawing's lettering (titles, column heads, figures, control frames) over a neutral grotesque for reading. Both run tabular figures on the root, so columns of numbers align without per-element settings.

### Hierarchy
- **Display** (700, 44px, 1.05): the access screen statement on the ink panel only; 30px on phones.
- **Headline** (700, 30px, 1.1, 0.01em): page titles; 25px under 860px.
- **Figure** (700, 30px, 1.1; 40px large): key numbers in the figures strip.
- **Title** (700, 18px, 1.2): sheet headings and modal titles; 20px with a 2px ink underline inside the report; 22px in the drawer head and manual.
- **Subtitle** (700, 15px, 1.25, 0.02em): sub-blocks inside a sheet (secondary chart titles, test cards).
- **Body** (400, 15px, 1.45): running text; ledes cap at 72ch, manual paragraphs at 72ch with 1.6 leading.
- **Label** (600, 11px, 0.08em, uppercase): context-strip terms, figure captions, stacked-table cell captions, cota tick values. Table column heads use the same face at 12px; field labels at 12px with 0.06em.

### Named Rules
**The Notation Rule.** Statistical symbols (σ, x̄, R̄, S̄, μ₀, Cp/Cpk, d₂, c₄, α, β, δ) inside uppercase labels are wrapped as notation: no case transform, no letter-spacing, set in Archivo (which draws the x̄ macron correctly). An uppercase label must never turn σ into Σ or Cpk into CPK.

**The Narrow-for-Drawing Rule.** Archivo Narrow sets what a draughtsman would letter (headings, labels, figures, control frames); Archivo sets what a reader reads. Do not swap them.

## Layout

A top-bar shell, never a sidebar. The ink bar is 56px tall and sticky, with the wordmark, primary nav and a company/avatar cluster; module pages may add a white sub-nav strip ruled underneath. Content sits in a centred column up to 1400px with 24px side padding (14px under 860px) and 56px bottom padding.

Pages open with a page head: headline and lede on the left, actions bottom-aligned on the right, then a ruled context strip. Sheets stack with a 16px gap; multi-column layouts use 2- or 3-column equal grids and a 300 to 380px side column, all collapsing at 1100px (three to two, side to stacked) and 860px (everything to one column). The figures strip is a flex row of cells (basis 170px, 140px on phones) that grow to fill the last row so no orphan cell is left.

Under 860px the nav collapses into a menu button and a full-width ruled list, data tables re-flow into two-column stacked cards with uppercase cell captions, and the capability header stacks the cota above the frames. The report is an A4-portrait sheet up to 960px with 32px padding.

## Elevation & Depth

Flat. No surface casts a shadow. Depth and grouping are expressed with rule weight and tone: hairline (#d3dce6) inside sheets, strong hairline (#9fb1c4) around them, 1.5px ink on controls, 2px ink under table heads, around the title block and on modal and drawer edges. Overlays separate by border and by a translucent ink scrim (rgba(20,54,92,.35)) behind modal dialogs; the drawer slides in from the right with a 2px ink left edge.

### Named Rules
**The Ruled-Not-Raised Rule.** If something needs to stand apart, give it a heavier rule or an ink-wash ground, never a drop shadow. The only box-shadow in the system is an inset ink stroke that thickens a focused input's border.

## Shapes

Square corners on every container, control, tag, frame and overlay (0px). Borders are the form language: hairlines divide, 1.5px ink strokes outline controls, 2px ink rules close headers and frame title blocks. Dashed lines are native to the drawing and carry meaning: the cota's nominal axis, chart centre lines and limit lines, and the outline of an unavailable cota. Circles appear only where geometry requires them: the loading spinner and the stroked icon set.

## Components

### Buttons
Drafted, not pressed: a 1.5px ink outline at 40px height.
- **Shape:** square (0px), 1.5px border, 0 16px padding, 600 weight, 8px icon gap.
- **Primary:** ink ground, white text; hover moves to the lighter ink.
- **Secondary (default):** white ground, ink text and border; hover fills with ink wash.
- **Danger:** red border and text on white; hover fills with red tint.
- **Small / icon:** 32px height, 0 11px padding at 14px; icon-only is a 32px square.
- **Disabled:** 45% opacity, not-allowed cursor. Background transitions over 150ms.
- **Segmented control:** a 1.5px ink outline split by 1px ink rules; the pressed segment fills with ink.

### Tags
- **Style:** 12px Archivo 600 with 0.06em tracking, 2px 7px padding, strong-hairline border on white, ink text (chart-type codes such as X̄-R).
- **Solid:** ink ground, white text, for counts.
- **Priority marks:** 56px-min outlined boxes in red, amber or green for high, medium, low.

### Cards / Containers
- **Corner Style:** square (0px).
- **Background:** sheet white on the plan ground.
- **Shadow Strategy:** none (see Elevation & Depth).
- **Border:** 1px strong hairline outside; hairline rules between head (12px 16px), body (16px) and foot (10px 16px, 12px slate caption text).
- **Figures strip:** a ruled grid of cells, each with a two-line uppercase caption pinned to the baseline so every figure in a row shares one baseline.
- **Context strip:** a white, strong-hairline frame of term/value cells divided by hairlines, sized to content.

### Inputs / Fields
- **Style:** 40px, 1.5px strong-hairline border, white ground, square, 0 11px padding; label above in 12px uppercase Archivo Narrow, hint below at 12px slate.
- **Hover / Focus:** hover shifts the border to ink mist; focus sets an ink border thickened by a 1px inset ink stroke, no outer glow.
- **Error / Disabled:** invalid fields get a red border on red tint; disabled and read-only fall to the plan ground with slate text.
- **Capture grid:** borderless right-aligned cells inside a hairline grid; the focused cell fills with ink wash and a 2px inset ink stroke; subgroup index cells turn green or amber as rows complete.

### Navigation
- **Top bar:** ink ground, 18px uppercase Archivo Narrow wordmark at 0.06em with a small square outline mark; nav links in ink mist at 500, white on hover, white at 600 with a 3px white underline when active.
- **Sub-nav:** white strip under a strong hairline; slate links, active in ink with a 2px ink underline.
- **Mobile:** a 1.5px white-outlined menu button opens a full-width white list ruled by hairlines, the active item on ink wash in ink at 700.
- **Manual TOC:** sticky list with a 2px hairline left rule that turns ink on hover.

### Tables
- **Head:** 12px uppercase Archivo Narrow at 0.08em, slate, sticky, closed by a 2px ink rule. Sortable heads are bare buttons that turn ink on hover.
- **Rows:** 10px 14px cells divided by hairlines; hover on row-hover, selected on ink wash, flagged rows on red tint. Numeric columns right-aligned. Dense variant 6px 10px.

### Alerts and Signal Strip
- **Alerts:** 1.5px border in the state colour on its tint, icon first, darkened text for contrast (#7a1810 error, #124a2f success, #6b3d04 warning, ink for info).
- **Signal strip:** a full-width solid band (red for out of control, green in control, ink idle) with white 600 text; the one place state colour floods a surface, reserved for live Phase II status.

### Capacity Cota (signature)
The tolerance drawn as a dimension. An ink-wash band spans LSI to LSE between two 1.5px ink extension lines; a dimension line with 7px arrowheads runs across its top; a dashed ink line marks the nominal. Below, the process x̄ ± 3σ bar is drawn to the same scale in graphite, with any portion outside tolerance in reject red, and a 2.5px graphite tick marks x̄. Tick values sit under the extension lines in 11px Archivo Narrow. Two sizes: 56px tall (row scale, max 380px) and 84px tall (header and report scale, full width at 1:1 so labels never shrink). On mount the process bar draws outward from x̄ in 500ms on cubic-bezier(.16,1,.3,1). It always carries an accessible text description of tolerance and process span, and a legend sits in the sheet head. When specs are missing it is replaced by a dashed strong-hairline box with a slate explanation.

### Blueprint Field (sign-in background)
The sign-in panel's ink ground is a live drawing sheet on a canvas behind its content: a 28px drafting grid (4% white, every fifth line 8.5%). Around the pointer, within 190px, grid nodes brighten and push outward up to 9px, under a soft light-blue (#6aa9ff) glow; a dashed full-bleed crosshair with a ring reticle follows the pointer with its coordinates as "X 100.0  Y 100.0 mm" (1 square = 5 mm) in 11px Archivo Narrow. Each click sends two light-blue measurement rings outward over 1.2s with a cubic ease-out. With no pointer (touch, or pointer outside) a probe drifts on a slow Lissajous path showing only the glow and nodes. Over readable content (brand, headline, text, Sensor Chart, Filling Line, with an 18px margin) the crosshair and readout fade out and the glow drops to 30%, so nothing draws across type. It never intercepts clicks or selection, is aria-hidden, and under reduced motion only the static grid remains.

### Sign-in sheet, title block and QC stamp
The white side of sign-in is a drawing sheet: an outer strong-hairline border 14px in, zone markers A–F (top and bottom) and 1–6 (left and right) in 10px Archivo Narrow separated by hairlines, and an inner 2px ink frame. The form sits in a 1.5px ink block with an ink header strip ("Acceso al sistema" · "Doc. CS-ACC-01"), dimensioned like a drawing: a width dimension above and a height dimension to the left, with arrowheads, extension lines and the block's real on-screen size in mm at 96 dpi. A title block (cajetín) of 1.5px ink cells sits in the bottom-right corner: brand and subtitle, title, sheet 1/1, scale 1:1, revision A and today's date. On success a double-ruled QC stamp «Aprobado · Conforme · Control de calidad» in state green lands over the block (scale 1.7 → 1, rotated −9°, 260ms ease-out), and the app opens 950ms later; on a wrong password the block shakes (340ms, without remounting the form, so typed values stay) and a red «No conforme · Revisar y repetir» stamp shows for 2.2s next to the error alert. Below 860px the zone frame and dimensions hide and the title block flows under the form.

### Capability Live (sign-in)
From 1600×940 a card under the headline shows capability from the last 40 sensor readings: a 1 ml histogram (bars outside LSI/LSE in red), the fitted normal curve in white, red LSI/LSE lines, a dashed x̄ line with its value, and a side column with Cp, Cpk and σ̂ = R̄/d₂ (n = 4). Classification uses the engine (capaz ≥ 1.33, marginal ≥ 1.00) and the app's words, with icon and colour in the card head. With the volume cycle the process reads «No capaz» (Cpk ≈ 0.88), consistent with the rejects on the line.

### Opening draw
Once per load the sign-in page draws itself in about 2s: the brand and headline reveal left to right (clip, 600–800ms ease-out), the paragraph rises, the machine, sensor, belt and scale strokes plot in (stroke-dashoffset, 1.2s ease-in-out from 500ms), chart limit lines, trace and bell curve plot from 900ms, labels fade in at 1.3s, the cards reveal, and on the white side the sheet frame reveals, the form block rises at 350ms and the title block at 650ms. Under reduced motion everything appears in its final state.

### Sensor Chart and sign-in composition
From 1340px wide the ink panel is a three-band drawing: brand across the top; headline (left) beside a live **Sensor Chart** (right, up to 640px); the Filling Line across the bottom at up to 860px with its alert beside it. The Sensor Chart is a live X̄ chart with subgroups of n = 4: every four consecutive sensor readings from the Filling Line close a subgroup whose mean is plotted against Phase I control limits for a known σ = 2.0 ml (LC 500.0, LCS 503.0, LCI 497.0 = 500 ± 3·2/√4), drawn as a light-blue band between red limit lines with a dashed centre line and right-hand labels. In-control means are light-blue dots, out-of-control means red diamonds, and each new mean pings once (900ms ease-out). The volume cycle (10 subgroups, seeded once so the chart opens with history) puts 4 bottles out of specification and 2 means out of control. A frame of 1px 28% white with a hairline-ruled head ("Carta X̄ en vivo · n = 4" and the subgroup in progress as four squares filling 1/4…4/4) and a three-cell foot: subgroups, out-of-control count with percentage (red when non-zero) and the grand mean X̿ in ml. Specification (LSI/LSE) belongs to the bottles and the alert; control limits belong to the chart, and the two are never drawn together. Below 1340px the chart is hidden and the panel keeps its single-column order.

### Filling Line (sign-in scene)
The sign-in panel's only illustration: a line-drawn filling line on the ink ground. Bottles index along a conveyor one station at a time (900ms, cubic-bezier(0.77,0,0.175,1)), stop while the nozzle drops 8px and fills the bottle under it (liquid grows from the base, 700ms, cubic-bezier(0.23,1,0.32,1)), and the bottle under the overhead sensor is measured against an LSE 505 / LSI 495 scale drawn beside it, with its volume read out below. In-spec bottles turn light blue (#6aa9ff); out-of-spec bottles turn light red (#ff6b5e), the line holds 2.6s, and an alert with a 3px red edge, "⚠ Fuera de especificaciones" and the volume against the broken limit, appears beside the scene. The alert stays until the next in-spec bottle passes the sensor. Strokes are 60% white, labels Archivo Narrow in ink-soft. The scene is decorative (aria-hidden), pauses while the tab is hidden, and under reduced motion shows one still frame with a rejected bottle. The two light state colours exist only on the ink ground; elsewhere state colour stays #b42318 / #1d6b45.

### Control Frame (signature)
A GD&T-style feature control frame: a 1.5px ink box split by a 1.5px ink rule into a symbol cell (Cpk, 13px Archivo Narrow 600 in ink) and a value cell (19px, right-aligned, 700, coloured by state). Large variant 15px / 30px for the capability header. With no value the frame mutes to strong-hairline strokes and an em dash.

### Drawer and Modal
- **Drawer:** 440px white panel under the bar, 2px ink left edge, slides in over 280ms on cubic-bezier(.16,1,.3,1); head, scrolling body, and a footer of equal-width buttons. Escape closes it.
- **Modal:** native dialog, 2px ink border, up to 640px, ink scrim, hairline-ruled head and foot. The close control in both is a 34px square with a strong-hairline border that turns ink on hover.

### Report
A white sheet with section titles over 2px ink rules, a drawing title block (2px ink frame, 2:1:1 cells ruled in strong hairline), and the cota at report scale. Printing hides the shell and removes the sheet border.

## Do's and Don'ts

### Do:
- **Do** use drafting navy (#14365c) as the only accent; express emphasis by ink weight and ink-wash grounds.
- **Do** pair every red, amber or green with an icon and a word.
- **Do** wrap statistical symbols as notation inside uppercase labels so σ, x̄ and Cpk keep their case.
- **Do** set headings, labels, column heads, figures and control frames in Archivo Narrow, and running text in Archivo, all with tabular numerals.
- **Do** separate surfaces with rules: 1px hairline inside, 1px strong hairline outside, 1.5px ink on controls, 2px ink under table heads and around overlays.
- **Do** reuse the cota and control frame wherever capability is shown, at row, header or report scale, drawn to scale.
- **Do** honour reduced motion: every animation and transition is removed under prefers-reduced-motion.

### Don't:
- **Don't** add drop shadows, glows, gradients or glass blur; the sheet is flat.
- **Don't** round the corners of containers, controls, tags or frames.
- **Don't** flood a surface with state colour outside the Phase II signal strip; elsewhere state colour lives on text, strokes and tints.
- **Don't** introduce a second accent hue or decorative colour for charts; chart series use ink, graphite and the state colours.
