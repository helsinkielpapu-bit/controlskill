# Documento maestro funcional

> **Propósito:** este documento es la **especificación normativa** de ControlSkill. Todo lo construido debe poder rastrearse hasta un requisito (RF), una fórmula (F), una validación (V) o un flujo (FL) de este documento, y todo lo probado hasta un caso (TC).
> **Prioridad normativa:** (1) las decisiones aprobadas (§1); (2) este documento; (3) el motor de cálculo (`packages/engine`) y sus valores de referencia (`packages/engine/test/golden`).

### Convenciones
- `round(v,d) = Math.round(v·10^d)/10^d`. Se usa redondeo "medio hacia +∞" de JavaScript; la implementación debe reproducirlo exactamente, incluido en negativos (`Math.round(-2.5) = -2`).
- s = desviación estándar muestral con divisor **n − 1**. Si n < 2, s = 0.
- media de un arreglo vacío = 0.
- "Mostrar con d decimales" = `toFixed(d)` solo para presentación; no altera el valor calculado.
- Los textos entre comillas «…» son **literales** y deben conservarse.

---

## 1. Decisiones aprobadas (DA)

| ID | Decisión | Lo que NO cambia |
|---|---|---|
| DA-01 | `/capability` con `simulate_n` devuelve `simulate_n` correctamente | Fórmulas y prioridad de agrupación |
| DA-02 | El 0 es un valor válido para LSI, LSE y nominal; solo se guarda null si el campo está vacío. **La edición es parcial:** lo que no se envía conserva su valor (descripción, `chart_type`, `n_size`) | Validación LSI < LSE |
| DA-03 | Al guardar en Entrada de Datos, los `subgroup_id` nuevos continúan desde el máximo existente de Fase 1 + 1, y el aviso de datos existentes cuenta en el servidor | Que solo se guarden subgrupos completos |
| DA-04 | Muestreo manual acepta NAC = 0 (los campos vacíos usan el valor por defecto; el 0 se respeta). Si el diseño automático da n > N, se mantiene el truncamiento a n = N **y se muestra un aviso explícito** | Algoritmo de diseño y métricas |
| DA-05 | El formulario de proceso incluye **tipo de carta** (`chart_type`) y **n** (`n_size`) | Valores por defecto (`xbar_r`, null) |
| DA-06 | El tipo de carta en Monitoreo se preselecciona con el del proceso; se puede seguir cambiando | Cálculo de límites de Fase I |
| DA-07 | La vista previa de Entrada de Datos usa el **motor único**: X̄-S con S̄/c₄ y A₃/B₃/B₄; p y u con límites por subgrupo; np con el n del proceso | Formato de la vista previa (k ≥ 2, estado, resaltados) |
| DA-08 | Fase II aplica las **mismas 3 reglas** de Fase I (fuera de control, tendencia de 6 y corrimiento de 8), con las mismas opciones de activación, sobre la secuencia de Fase II contra los límites congelados | Límites congelados de Fase I |
| DA-09 | El Cpk del Panel usa **el mismo cálculo que `/capability`**, con todas las mediciones de Fase 1 y la misma prioridad de agrupación; los límites en 0 son válidos | Umbrales del semáforo |
| DA-10 | Monitoreo calcula X̄ y S de cada subgrupo con su **tamaño real** | — |
| DA-11 | Informe y Desempeño leen la Fase II **desde la base de datos**, con el tipo de carta del proceso. La copia en el navegador queda solo como respaldo | Fórmulas de δ, PNC y desempeño |
| DA-12 | No hay **pasarela de pagos**. Se conserva `subscription_status` y su indicador (apagado). Checkout y portal responden «Pagos deshabilitados en modo local.» y `activate-dev` sigue disponible fuera de producción | Modelo de datos de suscripción |
| DA-13 | Se implementan y prueban Nelson, I-MR, `/measurements/import` y `/analysis/validate`. **No se exponen en la interfaz** salvo `/import`, que es solo API | Fórmulas |
| DA-14 | El manual describe el comportamiento real. El corrimiento se rotula «Corrimiento (8 puntos)». El enlace del mensaje de demostración se muestra como enlace | — |
| DA-15 | Una sola Φ en todo el sistema: **A&S 26.2.17 con `z > 0`** (la del backend) | — |
| DA-16 | En las cartas p y u, la regla `ooc` se evalúa contra **el límite de cada punto** (UCLᵢ/LCLᵢ). Tendencia y corrimiento siguen usando la CL. Los límites globales promedio se siguen calculando y mostrando | Fórmulas de los límites |
| DA-17 | La **evaluación de desempeño guardada** y las **sesiones de monitoreo** se guardan en la base de datos, por empresa y proceso. El navegador solo guarda preferencias (modo, sesión activa) | Contenido guardado y límite de 50 sesiones |
| DA-20 | **Sesiones revocables.** En cada petición se comprueba que el usuario sigue existiendo y que su sesión no fue revocada; rol y empresa se leen de la base (no del token). Cerrar sesión revoca todas las sesiones de ese usuario | Duración de 7 días y cookie httpOnly |
| DA-21 | El **tamaño de muestra (n)** de una medición, si se envía, debe ser un **entero ≥ 1**; si una medición de la carga lo incumple no se guarda ninguna | Mediciones sin n (c y variables) |
| DA-22 | Ningún subgrupo puede tener **más de 10 mediciones**: no hay constantes de carta para n > 10 y nunca se usan las de otro tamaño. Lo mismo para el n simulado | Tabla de constantes para n = 2…10 |
| DA-23 | **Subgrupos de tamaños distintos** en X̄-R y X̄-S: σ̂ = promedio de Rᵢ/d₂(nᵢ) (o Sᵢ/c₄(nᵢ)); X̿ ponderada por nᵢ; límites propios de cada subgrupo con su nᵢ (X̄: X̿ ± 3σ̂/√nᵢ; R: D₃(nᵢ)·d₂(nᵢ)σ̂ y D₄(nᵢ)·d₂(nᵢ)σ̂; S: B₃(nᵢ)·c₄(nᵢ)σ̂ y B₄(nᵢ)·c₄(nᵢ)σ̂) y «fuera de control» contra el límite de cada punto. n informado = tamaño más frecuente | Con tamaños iguales el cálculo es el de F-13, F-21 y F-22 |
| DA-24 | La **carta de dispersión** (R o S) se evalúa con las mismas tres reglas y opciones que la carta de medias: por encima del LCS **y por debajo del LCI**, tendencia y corrimiento. Sus señales se listan con el prefijo «Rangos (R): » o «Desviación estándar (S): », en Fase I y en Fase II | Reglas de la carta de medias |
| DA-25 | **Muestreo sin holgura:** la tabla de candidatos solo lista planes con α real ≤ α y β real ≤ β pedidos; en modo automático se informa si el plan final (también si se recortó a N) cumple ambos riesgos | Algoritmo de diseño y métricas |
| DA-26 | **α exacta en atributos:** la probabilidad de falsa alarma de p, np, c y u se calcula con la distribución del conteo bajo control (binomial en p y np, Poisson en c y u) y los límites reales; ARL₀ = 1/α | α = 2(1 − Φ(k)) en cartas por variables; β sin cambio |
| DA-27 | **Límites de Fase I congelados:** al iniciar el primer monitoreo de un proceso y carta se guardan los límites de Fase I; Monitoreo, Desempeño y el Informe evalúan la Fase II contra ellos. Si después cambian las mediciones de Fase I se avisa, y solo se recalculan con la acción explícita «Recalcular límites de Fase I». El ajuste de n del modo Académico es una simulación que no se guarda | Cálculo de los límites |
| DA-19 | La capacidad se informa solo con **índices de corto plazo** (Cp, Cpu, Cpl, Cpk con σ̂ dentro de subgrupos, o σ global si no hay subgrupos). | Cálculo de Cp…Cpk, PPM y estado |
| DA-18 | En **Monitoreo**, la serie de Fase I se muestra como referencia antes de los subgrupos de Fase II en **ambos modos**. El eje fijo se amplía solo si algún punto de Fase I queda fuera del margen. Las señales, los límites y los cálculos no cambian: solo se evalúa la Fase II | Ver la carta de control al iniciar el monitoreo de cualquier proceso, aunque aún no tenga datos de Fase II |

**Comportamientos fijados** (documentados, sin cambio): rachas con mediana superior (hasta 200 mediciones); 10 bins en Capacidad y √N en Informe; subgrupos en orden de primera aparición; reglas evaluadas sobre valores redondeados; conversión de celdas de Excel que reemplaza solo la primera coma; borrado masivo con el mismo resultado visible que borrar uno a uno.

---

## 2. Inventario de funcionalidades (RF)

### M0 — Plataforma y seguridad
| ID | Requisito | Criterio de aceptación |
|---|---|---|
| RF-001 | Registro de empresa con nombre de empresa, nombre, email y contraseña | Crea la empresa (`inactive`) y un usuario **admin**; email en minúsculas; devuelve sesión |
| RF-002 | Inicio de sesión con email y contraseña | Token válido por **7 días** con {user_id, company_id, role, versión de sesión} (DA-20) |
| RF-003 | Perfil `/me` | Usuario y empresa con estado y fecha de fin de suscripción |
| RF-004 | Aislamiento por empresa | `company_id` sale del usuario autenticado, comprobado en la base en cada petición (DA-20); ninguna consulta cruza empresas |
| RF-005 | Contraseñas con bcrypt (12 rondas) | — |
| RF-006 | Límite de 10 peticiones/min por IP en login y registro | Mensaje «Demasiados intentos. Intente de nuevo en un minuto.» |
| RF-007 | Control de suscripción con indicador (apagado) | Con el indicador encendido: 402 «Suscripción inactiva o vencida.» |
| RF-008 | Rol admin para la gestión de usuarios | 403 «Se requieren privilegios de administrador.» |
| RF-009 | Sesión expirada (401) → volver al inicio con aviso | «Tu sesión ha expirado. Por favor vuelve a iniciar sesión.» |
| RF-010 | Cerrar sesión | Borra la sesión local y vuelve al inicio |
| RF-011 | Salud del servicio `/health` | {status:"ok", timestamp} |

### M1 — Procesos
| ID | Requisito | Criterio |
|---|---|---|
| RF-101 | Listar procesos: nombre, descripción, unidad, LSI, nominal, LSE, número de mediciones (todas las fases), creador | De más reciente a más antiguo |
| RF-102 | Crear y editar con nombre\*, descripción, unidad, nominal, LSI, LSE, **tipo de carta**, **n** | V-101…V-106; DA-02 y DA-05 |
| RF-103 | Eliminar con confirmación; borra sus mediciones | Texto §5 |
| RF-104 | Ver detalle: descripción, mediciones, unidad, especificaciones, creador y accesos a Capacidad, Monitoreo y Mediciones | — |

### M2 — Entrada de datos de Fase I
| ID | Requisito |
|---|---|
| RF-201 | Selección de proceso (también por `?process_id`). Muestra su tipo de carta y abre la pestaña Variable o Atributo según ese tipo |
| RF-202 | **Variable:** tabla editable de 25 filas iniciales; n de 2 a 10 (por defecto 5); columnas SG, X₁…Xₙ, X̄, R, S (4 decimales); marca de fila completa o parcial; celdas inválidas resaltadas |
| RF-203 | Navegación por teclado (Tab, Enter, flechas), pegado tabulado o con `;`, autoexpansión de 5 filas al escribir en la última y botón «+ Agregar 5 filas» |
| RF-204 | Vista previa en vivo con k ≥ 2: centro, dispersión media, σ̂, k, límites de X̄ y de la carta secundaria, estado y resaltado de puntos fuera de control (DA-07) |
| RF-205 | Cambiar n: al reducirlo con datos pide confirmación y corta columnas |
| RF-206 | **Atributo:** carta p/np/c/u; columnas según la carta (§2.1); vista previa (DA-07) |
| RF-207 | Importar Excel o CSV en el navegador (Formato A y B, §6.2) sin guardar; plantilla descargable `plantilla_fase1_n{n}.xlsx` |
| RF-208 | Guardar: solo subgrupos completos; lista de incompletos omitidos; advertencia por valores fuera de especificación; ids nuevos (DA-03); confirmación con resumen |
| RF-209 | Aviso de datos existentes: «Este proceso ya tiene N mediciones guardadas en K subgrupos.», con accesos a historial, carta y capacidad |
| RF-210 | «Nuevo ingreso» limpia la tabla, con confirmación si hay datos |

### M3 — Historial de datos
| ID | Requisito |
|---|---|
| RF-301 | Tabla paginada de 100 filas: #, fase, valor (4 decimales), subgrupo, fecha y hora, registrado por |
| RF-302 | Filtro de fase Todas, 1 o 2 (también por `?phase`) |
| RF-303 | Selección múltiple en todas las páginas, borrado individual y por lote con progreso, y «Eliminar Fase 2 de este proceso» |

### M4 — Cartas de control de Fase I
| ID | Requisito |
|---|---|
| RF-401 | Cartas X̄-R, X̄-S, p, np, c y u (F-20…F-26) desde las mediciones de Fase 1 |
| RF-402 | Simular subgrupos (solo X̄) con n de 2 a 10: agrupación secuencial |
| RF-403 | Reglas activables: fuera de control, tendencia (6) y corrimiento (8) (F-30) |
| RF-404 | Límites LCS/LC/LCI de la carta principal y de la secundaria; insignias de simulación y de n variable |
| RF-405 | Gráfico principal y secundario con zonas de ±1σ y ±2σ; puntos fuera de control destacados; límites por punto en p y u |
| RF-406 | Lista de señales con severidad y descripción literal |
| RF-407 | Pruebas estadísticas: Anderson-Darling, Levene y Kruskal-Wallis (F-40…F-43), con estadístico, p, grados de libertad e interpretación |
| RF-408 | Tabla desplegable de mediciones agrupadas por subgrupo (X̄ y R o S; atributos: conteo, n y tasa) |
| RF-409 | Sugerencia de simular cuando falla por falta de subgrupos |

### M5 — Capacidad
| ID | Requisito |
|---|---|
| RF-501 | Editor de especificaciones (LSI, nominal, LSE, unidad); se abre solo si faltan límites; guardado parcial (DA-02) |
| RF-502 | Semáforo de estado, Cp, Cpk, Cpu y Cpl, con la etiqueta del método de σ |
| RF-503 | Métricas X̄, σ, n (k × n), tolerancia y distancias coloreadas |
| RF-504 | Aviso de centrado respecto al nominal (F-15) |
| RF-505 | %PNC: cola superior, inferior y total (F-14) |
| RF-506 | Supuestos: normalidad con Q-Q, homocedasticidad con barras de rangos e independencia con gráfico de corridas y prueba de rachas (F-44) |
| RF-507 | Gráfico de capacidad: histograma de densidad + curva normal + anotaciones (F-52) |
| RF-508 | Recomendaciones automáticas (F-60) |

### M6 — Monitoreo de Fase II
| ID | Requisito |
|---|---|
| RF-601 | Selección de proceso y carta (DA-06), modo Industrial o Académico (se recuerda), iniciar |
| RF-602 | Límites de Fase I congelados y guardados al iniciar el primer monitoreo, con aviso si la Fase I cambió y recálculo explícito (DA-27); error «Sin datos de Fase 1 para este proceso. Ingresa datos históricos en Cartas de Control primero.» |
| RF-603 | Carga de la Fase II existente desde la base de datos y aviso «Se cargaron N subgrupos…» |
| RF-604 | Ingreso por subgrupo (X̄: n casillas; atributos: según la carta), con X̄ o tasa en vivo y Δ frente a la media acumulada |
| RF-605 | Guardar cada subgrupo de inmediato (fase 2, `subgroup_id` consecutivo) |
| RF-606 | Deshacer el último (borra sus filas) |
| RF-607 | Pegado masivo de varias filas e importación de Excel por carta, con plantillas y corte tras 5 errores |
| RF-608 | Modo Académico: ajuste de n (2–10) que recalcula los límites con `simulate_n` y muestra la Fase I como referencia |
| RF-609 | Detección de señales (DA-08), aviso, estado, lista de señales e historial con estado por subgrupo |
| RF-610 | Estadísticas: subgrupos, entradas de la sesión, media acumulada con desplazamiento en σ (F-70), último ingreso y estado |
| RF-611 | Sesiones guardadas: nombre, continuar, eliminar (máximo 50), guardadas en la base de datos (DA-17) |
| RF-612 | Restaurar la sesión activa al volver a la página («Continuar sesión» o «Ignorar») |

### M7 — Evaluación del desempeño
| ID | Requisito |
|---|---|
| RF-701 | Carga de la carta del proceso: LCS, LC, LCI, n, σ̂, k = 3 y estado |
| RF-702 | Bloque de Fase II con datos reales: μ₀, μ₁, δ, subgrupos, PNC₀ y PNC₁ (F-71) |
| RF-703 | Parámetros t (4 h) y producción (100 u/h) editables; k, n, δ y %PNC de solo lectura |
| RF-704 | Tarjetas α, β, potencia, ARL₀, ARL₁, ATS₀, ATS₁ y PPNC con niveles (F-80…F-83) |
| RF-705 | Interpretación automática (insignias y notas literales) |
| RF-706 | Tabla de sensibilidad con 11 valores de δ |
| RF-707 | Carga muestral: Plan 1, Plan 2 y mejor plan (F-84) |
| RF-708 | Referencia de fórmulas según el tipo de carta |
| RF-709 | Guardar la evaluación y sus parámetros en la base de datos (DA-17) |

### M8 — Planes de muestreo
| ID | Requisito |
|---|---|
| RF-801 | Modo automático (N, AQL, α, LTPD, β) y modo manual (N, n, NAC, AQL y LTPD de referencia) |
| RF-802 | n, NAC, NCR y fracción; α real y β real; Pa en AQL y LTPD; AOQL; ATI (F-90…F-95) |
| RF-803 | Curva CO y curva AOQ |
| RF-804 | Tabla de candidatos (NAC de 0 a 15) |
| RF-805 | Interpretación automática; aviso de inviabilidad; aviso de n > N (DA-04) |

### M9 — Informe
| ID | Requisito |
|---|---|
| RF-901 | Selección de proceso y pestañas Todas, Fase I, Fase II y Muestreo |
| RF-902 | Secciones, en orden: encabezado; resumen de Fase I; carta y estabilidad; reglas violadas; capacidad y riesgo; pruebas; histograma; evaluación integral; Fase II (DA-11); evaluación guardada; muestreo; conclusión |
| RF-903 | Exportar PDF A4 vertical con tema claro: `SPC_{nombre}_{AAAA-MM-DD}.pdf` |

### M10 — Panel de control
| ID | Requisito |
|---|---|
| RF-1001 | Indicadores: procesos, capaces, marginales y no capaces (DA-09) |
| RF-1002 | Tarjeta por proceso con Cpk (3 decimales), especificaciones y etiqueta; panel de detalle con accesos |

### M11 — Administración
| ID | Requisito |
|---|---|
| RF-1101 | Estado y fecha de fin de la suscripción |
| RF-1102 | Usuarios: listar (con «Tú»), crear (nombre, email, contraseña y rol), eliminar a otros |
| RF-1103 | «Activar demo (dev)» solo en localhost |
| RF-1104 | «Cargar datos de demostración»: proceso y 60 valores fijos (TC-REF-01) |
| RF-1105 | Botones de pago y portal: deshabilitados (DA-12) |

### M12 — Manual
RF-1201: manual de usuario reescrito según el comportamiento real (DA-14).

### 2.1 Columnas por tipo de carta (entrada de atributos)
| Carta | Columnas de entrada | Columna calculada | Lo que se guarda |
|---|---|---|---|
| p | n (muestra), Defectivos | p̂ = D/n | value = D, sample_size = n |
| np | Defectivos (+ n fijo) | — | value = D, sample_size = n fijo |
| c | Defectos | — | value = C, sample_size = null |
| u | n (muestra), Defectos | û = C/n | value = C, sample_size = n |

---

## 3. Catálogo de fórmulas (motor único, normativo)

> Todas viven en **un solo módulo de cálculo** compartido por el servidor y el navegador (DA-07 y DA-15). La columna "Redondeo" indica el redondeo **en la salida del motor**; los cálculos intermedios usan precisión completa.

### 3.1 Constantes (F-01)
Tabla de d₂, c₄, A₂, D₃, D₄, A₃, B₃ y B₄ para n = 2…10, en `packages/engine/src/constants.ts`. Fuera de n = 2…10 no se calcula (DA-22). I-MR: 2.66 y 3.267.

### 3.2 Básicas
| ID | Nombre | Definición |
|---|---|---|
| F-02 | media | Σx/n; si el arreglo está vacío, 0 |
| F-03 | s | √(Σ(x − x̄)²/(n − 1)); si n < 2, 0 |
| F-04 | Φ(z) | t = 1/(1 + 0.2316419\|z\|); d = 0.3989423·e^(−z²/2); p = d·t·(0.3193815 + t(−0.3565638 + t(1.7814779 + t(−1.8212560 + t·1.3302744)))); Φ = 1 − p si z > 0, y p en otro caso |
| F-05 | lnΓ | Lanczos g = 7 con 9 coeficientes; reflexión si x < 0.5 |
| F-06 | P(a,x) | Serie si x < a + 1; Lentz en otro caso; EPS 1e-13; FPMIN 1e-300; 300 iteraciones; acotada a [0, 1] |
| F-07 | I_x(a,b) | Fracción continua; simetría si x > (a + 1)/(a + b + 2); acotada |
| F-08 | p de χ² | χ² ≤ 0 → 1; si no, máx(0, 1 − P(df/2, χ²/2)) |
| F-09 | p de F | f ≤ 0 → 1; si no, máx(0, 1 − I(df1·f/(df1·f + df2); df1/2, df2/2)) |
| F-10 | Φ⁻¹ | Acklam (coeficientes estándar), pLow = 0.02425; **solo para el gráfico Q-Q** |
| F-11 | parseDecimal | Reglas en `packages/engine/src/parse.ts` |

### 3.3 Capacidad
| ID | Definición | Redondeo |
|---|---|---|
| F-12 | **Sin subgrupos:** x̄, σ = s; si σ = 0 → null. Cp = (USL − LSL)/6σ; Cpu = (USL − x̄)/3σ; Cpl = (x̄ − LSL)/3σ; Cpk = mín. PPM_U = Φ(−(USL − x̄)/σ)·10⁶; PPM_L = Φ(−(x̄ − LSL)/σ)·10⁶; PPM_T = suma. Estado: Cpk < 1 `no_capaz`; < 1.33 `marginal`; si no, `capaz`. tolerance = USL − LSL; distToUsl = USL − x̄; distToLsl = x̄ − LSL; distToNominal = \|x̄ − nom\| o null | x̄, σ, distancias y tolerancia: 4 · índices: 3 · PPM: 2 |
| F-13 | **Con subgrupos** (tamaños iguales; si son distintos, DA-23): n = tamaño del subgrupo. σ̂w = S̄/c₄ si la carta es `xbar_s`; R̄/d₂ en cualquier otro caso; si es 0 → null. Cp…Cpk con σ̂w. PPM con σ̂w. Agrega sigmaMethod (`sbar_c4` o `rbar_d2`), n_subgroups y subgroup_size | Igual que F-12 |
| F-14 | %PNC (presentación): p_sup = Φ(−(USL − x̄)/σ)·100; p_inf = Φ(−(x̄ − LSL)/σ)·100; total = suma, con σ = σ de la respuesta (ya redondeada) | Se muestra «< 0.0001%» o 4 decimales |
| F-15 | Centrado: dev = \|x̄ − nom\|; ≤ 0.5σ «Proceso centrado respecto al valor nominal»; ≤ 1.5σ «Proceso ligeramente descentrado — desplazamiento de {dev:3} {u} desde el nominal»; más: «Proceso descentrado — desplazamiento de {dev:3} {u} respecto al nominal» | — |
| F-16 | **Selección de método en `/capability`:** (1) `simulate_n` → ⌊N/n⌋ grupos secuenciales (error si son < 2); (2) si hay algún `subgroup_id` → agrupar por id, descartar grupos de tamaño < 2 y exigir ≥ 2 grupos; (3) en otro caso F-12. Pruebas si hay ≥ 7 filas, sobre las filas usadas (en simulación, ids secuenciales) | — |

### 3.4 Cartas de control
| ID | Definición | Redondeo |
|---|---|---|
| F-20 | **Agrupación X̄:** con `simulate_n` en [2, 10], grupos secuenciales (etiquetas «SG 1…»); si no, agrupar por id (null → «default») en orden de primera aparición, descartar grupos de tamaño < 2 y exigir ≥ 2 (etiquetas «SG {id}») | — |
| F-21 | **X̄-R:** X̄ᵢ, Rᵢ = máx − mín; X̿ = media(X̄ᵢ); R̄; UCL/LCL = X̿ ± A₂R̄; R: R̄, D₄R̄, D₃R̄ (n = tamaño del primer grupo) | 4 |
| F-22 | **X̄-S:** Sᵢ = s; X̿ ± A₃S̄; S: S̄, B₄S̄, B₃S̄ | 4 |
| F-23 | **I-MR** (DA-13): MRᵢ = \|xᵢ − xᵢ₋₁\|; I: x̄ ± 2.66·MR̄; MR: MR̄, 3.267·MR̄, LCL = 0 | 4 |
| F-24 | **Agrupación de atributos:** por id (null → «default»); valor del subgrupo = Σvalue; n = Σ(sample_size, o 1 si falta); exige ≥ 2 subgrupos | — |
| F-25 | **p:** p̄ = ΣD/Σn (0 si Σn = 0); pᵢ = Dᵢ/nᵢ (0 si nᵢ = 0); σᵢ = √(p̄(1 − p̄)/nᵢ); UCLᵢ = mín(1, p̄ + 3σᵢ); LCLᵢ = máx(0, p̄ − 3σᵢ). **UCL y LCL globales = media de los límites por punto (ya redondeados)**. variableN; n = round(media de n, 0) | Puntos y límites: 4 |
| F-26 | **np:** n fijo = n_size del proceso; si es < 2, el único sample_size ≥ 2 (con varios distintos, error V-405; sin ninguno, V-406). n̄p = media; p̄ = n̄p/n; σ = √(n·p̄(1 − p̄)); UCL = mín(n, n̄p + 3σ); LCL = máx(0, n̄p − 3σ) | Puntos: 0 · límites: 4 |
| F-27 | **c:** c̄ = media; UCL = c̄ + 3√c̄; LCL = máx(0, c̄ − 3√c̄); n = 1 | Puntos: 0 · límites: 4 |
| F-28 | **u:** ū = ΣC/Σn; uᵢ = Cᵢ/nᵢ; σᵢ = √(ū/nᵢ); UCLᵢ = ū + 3σᵢ; LCLᵢ = máx(0, ū − 3σᵢ); límites globales = media | 4 |
| F-29 | **σ̂w y effectiveN de la carta:** σ̂w = F-13 aplicado a los subgrupos crudos, con la carta como método; si no hay especificaciones, el mismo σ con 4 decimales. effectiveN = n simulado, tamaño del primer grupo, round(n̄) (p, u) o n fijo (np) | 4 |
| F-30 | **Reglas** sobre la serie principal ya redondeada (X̄ o atributo), con UCL, CL y LCL globales (en p y u, `ooc` usa UCLᵢ/LCLᵢ por punto, DA-16): `ooc` crítico si x > UCL o x < LCL; `trend` advertencia si 6 consecutivos son estrictamente monótonos (ventana i−5…i); `shift` advertencia si 8 consecutivos son todos > CL o todos < CL. Sin duplicados (índice, regla). outOfControl = índices únicos. Textos literales en `packages/engine/src/rules.ts` | — |
| F-31 | **Nelson** (DA-13): R1 fuera de límites; R2 9 del mismo lado; R3 6 monótonos; R4 14 alternando (signo de diferencias consecutivas con producto < 0) | — |
| F-32 | **Fase II** (DA-08): F-30 sobre la serie de Fase II (X̄, p = D/n, np = D, c = C, u = C/n, sin redondear) con los límites globales de Fase I | — |

### 3.5 Pruebas estadísticas (α = 0.05)
| ID | Definición | Redondeo |
|---|---|---|
| F-40 | **Agrupación:** por id; se excluyen los null; grupos con tamaño ≥ 2; Levene y Kruskal-Wallis solo con ≥ 2 grupos | — |
| F-41 | **Anderson-Darling:** n ≥ 7 y s > 0; S = Σ(2i − 1)[ln máx(Φ(zᵢ), 1e-15) + ln máx(1 − Φ(z₍ₙ₊₁₋ᵢ₎), 1e-15)]; A² = −n − S/n; A²* = A²(1 + 0.75/n + 2.25/n²); p por los 4 tramos de Stephens, acotada a [0, 1]; normal si p > 0.05 | Estadístico y p: 4 |
| F-42 | **Levene (Brown-Forsythe):** Z = \|x − mediana del grupo\|; W = (N − k)ΣnᵢΔᵢ²/((k − 1)ΣΣ(Z − Z̄ᵢ)²); p = F-09(W, k − 1, N − k); si el denominador es 0 → no disponible | 4 |
| F-43 | **Kruskal-Wallis:** rangos promedio en empates; H = 12/(N(N+1))ΣRᵢ²/nᵢ − 3(N + 1); C = 1 − Σ(t³ − t)/(N³ − N); H_adj = H/C (si C > 0); p = F-08(H_adj, k − 1) | 4 |
| F-44 | **Rachas** (presentación; 200 mediciones más recientes de Fase 1 en orden cronológico; requiere ≥ 10): mediana = ordenado[⌊n/2⌋]; arriba si x > mediana; rachas = cambios + 1; E = 1 + 2n₁n₂/(n₁ + n₂); Var = 2n₁n₂(2n₁n₂ − n₁ − n₂)/((n₁ + n₂)²(n₁ + n₂ − 1)); si Var ≤ 0 → no disponible; z = (rachas − E)/√Var; p = 2(1 − Φ(\|z\|)) | Se muestra p con 4 decimales y E con 1 |

Interpretaciones literales: «Con p = {p} > 0.05, los datos son consistentes con normalidad.» / «Con p = {p} ≤ 0.05, los datos NO siguen una distribución normal.» y sus equivalentes para Levene («…las varianzas son homogéneas en los {k} grupos.» / «…NO son homogéneas entre los {k} grupos.») y Kruskal-Wallis («…las medianas son homogéneas en los {k} grupos.» / «…existen diferencias significativas entre los {k} grupos.»). Resultado: «No se rechaza H₀» / «Se rechaza H₀».

### 3.6 Histograma y curvas
| ID | Definición |
|---|---|
| F-50 | Histograma: w = (máx − mín)/bins, o 1 si el rango es 0; intervalo [mín + iw, mín + (i + 1)w), el último cerrado; etiquetas con 3 decimales; puntos medios y binWidth con 4 decimales |
| F-51 | Curva normal de la API: de mín − σ a máx + σ, 100 pasos (101 puntos); y = e^(−½((x − x̄)/σ)²)/(σ√2π); x con 4 decimales, y con 6. bins limitados a [5, 30]; requiere ≥ 3 mediciones |
| F-52 | Gráfico de capacidad: centro c = nominal o x̄; spread = máx(\|USL − c\|, \|LSL − c\|, 4σ); X ∈ c ± 1.35·spread; 161 puntos; Ymax = 1.25·máx(y); barras = frecuencia/(N·w); en rojo las de punto medio fuera de [LSL, USL] |
| F-53 | Zonas de la carta: σ = (UCL − CL)/3; bandas de ±1σ y ±2σ. Carta secundaria: rojo si > UCL; naranja oscuro si > CL + 2σ |
| F-54 | Informe: bins = clamp(round(√N), 5, 30) |

### 3.7 Interpretación automática
| ID | Regla |
|---|---|
| F-60 | Recomendaciones de capacidad (textos literales en `apps/web/src/features/Capability.tsx`) |
| F-61 | Estabilidad del informe (§6.9.2) |
| F-62 | Escala de Cpk y riesgo del informe (§6.9.3); descentrado si Cpk < Cp − 0.05 |
| F-63 | Recomendaciones cruzadas (9 reglas), matriz integral (8 casos) y conclusión (3 párrafos): textos literales en `apps/web/src/features/Report.tsx` |
| F-64 | Histograma del informe: sesgo según la posición de la moda frente a bins/2 ± 1; huecos si > 30 % de intervalos vacíos; nota sobre el número de intervalos (< 8 o > 20) |

### 3.8 Fase II
| ID | Definición |
|---|---|
| F-70 | Desplazamiento en Monitoreo: σ = (UCL − CL)/3 de la carta X̄; shift = (media de medias − CL)/σ; clases < 0.5, < 1.0, < 1.5, ≥ 1.5 |
| F-71 | Desempeño: μ₁ = media de las medias de Fase II; μ₀ = CL de Fase I; σP = σ̂w de la carta (o (UCL − CL)√n/3); δ = (μ₁ − μ₀)/σP; PNC = Φ((LSL − μ)/σP) + 1 − Φ((USL − μ)/σP) |
| F-72 | Informe: μ₀ = CL del resumen (o la media); σ = σ de capacidad; μ₀, σ y n salen de los límites de Fase I congelados si existen (DA-27); si no, n = n_size o el tamaño del primer subgrupo de Fase II; σX̄ = σ/√n; monShift = (μ₁ − μ₀)/σX̄; shiftProcess = (μ₁ − μ₀)/σ; PNC en %; Δ en puntos porcentuales; avisos con \|shift\| ≥ 0.5 y ≥ 1 |
| F-73 | Medias de sesión: X̄ = media real (DA-10); p = D/n; u = C/n; np = D; c = C |

### 3.9 Desempeño de la carta
| ID | Definición |
|---|---|
| F-80 | k = 3; α = 2(1 − Φ(k)) en variables y exacta en atributos (DA-26); entradas saneadas: h = máx(0.01, t o 4); δ = máx(0.01, δ o 1); PNC = clamp(%, 0, 100)/100 (0.025 si no es número); producción = máx(0, valor o 100) |
| F-81 | β: X̄ = Φ(k − δ√n) − Φ(−k − δ√n). p, np, c y u según `packages/engine/src/performance.ts`, con mínimos de 1e-9. Sin CL o UCL se usa la fórmula de X̄ |
| F-82 | Potencia = máx(1e-9, 1 − β); ARL₀ = 1/α; ARL₁ = 1/potencia; ATS = ARL·h; PPNC = ATS₁·PNC·producción |
| F-83 | Niveles y textos (textos literales en `packages/engine/src/performance.ts`) |
| F-84 | Carga muestral: CM = n/t; objetivo = CM(1 + Δ), con Δ ∈ [0, 1] (por defecto 0.2); Plan 1 (n, n/obj); Plan 2 (máx(1, obj·t), t); β acotada a [1e-9, 1 − 1e-9]; mejor = menor ATS₁ entre los que cumplen CM ≥ objetivo; si ninguno: «Ningún plan alcanza la CM objetivo de {x} u/h. Aumenta Δ%.» |
| F-85 | Sensibilidad: δ ∈ {0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4, 5}; desplazamiento real = δ·σP; fila actual si \|δ − actual\| < 0.001 |
| F-86 | Inferir n desde la carta: a = (UCL − CL)/CL₂; el n con A₂ o A₃ más cercano si la diferencia es < 0.08. Prioridad de n: effectiveN, luego el inferido, luego n_size, luego 5 |

### 3.10 Muestreo
| ID | Definición |
|---|---|
| F-90 | Pa(n, c, p) binomial |
| F-91 | n del consumidor: el menor n en [1, 5000] con Pa(n, c, LTPD) ≤ β, por búsqueda binaria |
| F-92 | Diseño: c = 0…50; candidato si Pa(n, c, AQL) ≥ 1 − α; se elige el de menor n; AQL ≥ LTPD → V-801 |
| F-93 | AOQ = p·Pa·(N − n)/N; AOQL = máximo para p = i/1000, i = 1…200 |
| F-94 | ATI = n·Pa + N(1 − Pa) |
| F-95 | Gráficos y candidatos: CO con 121 puntos hasta mín(máx(3·LTPD, 0.25), 1); AOQ con p = i/500, i = 1…100; candidatos c = 0…15, n ≤ N, α real ≤ α y β real ≤ β (DA-25); insignias y píldoras con los umbrales de `packages/engine/src/sampling.ts` |

---

## 4. Diccionario de datos

### 4.1 Entidades persistentes
| Entidad | Campo | Tipo | Regla |
|---|---|---|---|
| Empresa | id | UUID | PK |
| | name | texto ≤ 200 | obligatorio |
| | email | texto ≤ 200 | único |
| | subscription_status | `inactive`/`active`/`past_due`/`canceled` | por defecto `inactive` |
| | subscription_end_date | fecha y hora | opcional |
| | created_at | fecha y hora | automática |
| Usuario | id, company_id | UUID | FK con borrado en cascada |
| | name | texto ≤ 150 | obligatorio |
| | email | texto ≤ 200 | **único global**, en minúsculas |
| | password_hash | texto | bcrypt |
| | role | `admin`/`analyst` | por defecto `analyst` |
| Proceso | name | texto ≤ 200 | obligatorio |
| | description | texto | opcional |
| | unit | texto ≤ 50 | opcional |
| | usl, lsl, nominal | decimal | opcionales; el 0 es válido (DA-02) |
| | chart_type | `xbar_r`/`xbar_s`/`p`/`np`/`c`/`u` | por defecto `xbar_r` |
| | n_size | entero | opcional (V-106) |
| | created_by, created_at | — | automáticos |
| Medición | process_id, company_id | UUID | FK |
| | value | decimal | obligatorio |
| | subgroup_id | entero | opcional |
| | phase | 1 o 2 | por defecto 1 |
| | sample_size | entero ≥ 1 | opcional (DA-21) |
| | recorded_at, recorded_by | — | por defecto la fecha actual y el usuario |

Se conservan como estructura (DA-13), aunque no se usen: carta guardada (chart_type, cl, ucl, lcl) y evento SPC (chart_type, rule, severity, sg_index, description, acknowledged).

Nuevas por DA-17:
- **Evaluación de desempeño:** id, company_id, process_id (único), chart_type, saved_at, config {t, prod, cmDelta}, mu0, mu1, sigmaP, n, deltaReal, shiftXbar, pnc0, pnc1, usl, lsl, sgCount, performance {…}, cmPlans {…}.
- **Sesión de monitoreo:** id, company_id, process_id, name, chart_type, chart_label, mode, sg_size, subgroup_count, saved_at. Máximo 50 por empresa: al superarlo se descarta la más antigua.

### 4.2 Diccionario de variables
Los nombres canónicos del motor son (`xbar`, `sigma`, `cp`… `ppmTotal`, `points`, `cl`, `ucl`, `lcl`, `pointLimits`, `variableN`, `effectiveN`, `sigmaWithin`, `violations{index, rule, description, severity}`, `outOfControl`).

---

## 5. Reglas de validación y mensajes (V)

| ID | Contexto | Regla | Mensaje literal |
|---|---|---|---|
| V-001 | Registro | Los 4 campos | «Todos los campos son obligatorios.» |
| V-002 | Registro e invitación | Contraseña ≥ 8 | «La contraseña debe tener al menos 8 caracteres.» |
| V-003 | Registro e invitación | Email único | «El email ya está registrado.» |
| V-004 | Inicio de sesión | Email y contraseña | «Email y contraseña son requeridos.» / «Credenciales incorrectas.» |
| V-005 | Token | Presente y válido | «Token de autenticación requerido.» / «Token inválido o expirado.» |
| V-006 | Invitación | Rol | «Rol inválido. Use: admin \| analyst.» · «Nombre, email y contraseña son obligatorios.» |
| V-007 | Usuarios | No borrarse a sí mismo | «No puedes eliminar tu propio usuario.» |
| V-101 | Proceso | Nombre | «El nombre del proceso es obligatorio.» (servidor) / «El nombre es obligatorio.» (formulario) |
| V-102 | Proceso | Nominal numérico | «Valor nominal inválido.» |
| V-103 | Proceso | LSI y LSE numéricos | «LSI inválido.» / «LSE inválido.» |
| V-104 | Proceso | LSI < LSE | «LSI debe ser menor que LSE.» (Procesos) / «LSE debe ser mayor que LSI.» (Capacidad) |
| V-105 | Proceso | chart_type válido o por defecto | — |
| V-106 | Proceso (DA-05) | n_size: entero ≥ 2; ≤ 10 para X̄ | «n debe ser un entero entre 2 y 10.» (X̄) / «n debe ser un entero ≥ 2.» (atributos) — *texto nuevo* |
| V-201 | Entrada | Proceso elegido | «Selecciona un proceso primero.» |
| V-202 | Entrada | Tabla con datos | «La tabla está vacía. Ingresa mediciones primero.» (variable) / «La tabla está vacía. Ingresa datos primero.» (atributo) |
| V-203 | Entrada | ≥ 1 subgrupo completo | «No hay subgrupos completos para guardar.» |
| V-204 | Entrada | Confirmación | «Se guardarán {N} mediciones en {K} subgrupos.» + «Subgrupos INCOMPLETOS (se omitirán): …» + «⚠ ADVERTENCIA: los subgrupos … tienen valores FUERA de especificación (LSI=…, LSE=…).» |
| V-205 | Excel | n de 2 a 10 | «n debe estar entre 2 y 10.» · «El archivo está vacío.» · «No se encontraron filas de datos en el archivo.» · «No hay suficientes datos para formar un subgrupo.» |
| V-301 | API de mediciones | process_id | «Se requiere process_id.» / «Se requiere process_id y value.» |
| V-302 | Importación | Archivo | «Se requiere un archivo CSV o Excel.» · «El archivo está vacío o sin datos reconocibles.» · «Fila {i}: valor inválido "{v}"» |
| V-401 | Análisis | Mínimo de datos | «Se necesitan al menos 2 mediciones.» |
| V-402 | Capacidad | Especificaciones | «El proceso requiere USL y LSL definidos.» · «No se pudo calcular la capacidad (σ = 0).» |
| V-403 | Carta y capacidad | Subgrupos | «Se necesitan al menos 2 subgrupos con ≥ 2 mediciones.» · simulación: «Insuficiente: se necesitan al menos {2n} mediciones para n={n} (hay {N}).» (carta) / «Datos insuficientes: …» (capacidad) |
| V-404 | Carta | Tipo de carta | «Tipo de carta inválido. Use: xbar_r, xbar_s, p, np, c, u.» · «Se necesitan al menos 2 subgrupos para la carta {t}.» |
| V-405 / V-406 | np | n fijo | «La carta np requiere n fijo, pero las mediciones tienen tamaños distintos ({lista}). Verifica los datos guardados.» / «No se pudo determinar el tamaño de muestra n. Configura n_size en el proceso o guarda datos con n fijo desde la entrada de datos.» |
| V-409 | Mediciones | n entero ≥ 1 | «El tamaño de muestra (n) debe ser un número entero mayor o igual a 1.» (DA-21) |
| V-410 | Carta, capacidad e informe | Subgrupos de 2…10 | «Cada subgrupo puede tener como máximo 10 mediciones; el subgrupo {id} tiene {N}. Revisa los números de subgrupo de los datos.» · «El tamaño de subgrupo simulado debe estar entre 2 y 10.» (DA-22) |
| V-411 | Sesión | Sesión vigente | «Sesión no válida. Inicia sesión de nuevo.» (DA-20) |
| V-407 | Histograma y pruebas | Mínimos | «Se necesitan al menos 3 mediciones.» · «Se necesitan al menos 7 mediciones para las pruebas estadísticas (hay {N}).» |
| V-408 | Validación de valores | Arreglo, 7…2000 valores | «values debe ser un arreglo.» · «Se necesitan al menos 7 valores…» · «Máximo 2000 valores por solicitud.» · «…7 valores numéricos válidos.» |
| V-601 | Fase II | Entradas | «Selecciona un proceso antes de iniciar.» · «Completa todos los valores del subgrupo.» · «Ingresa un número válido de defectuosos.» · «Ingresa un conteo válido de defectos.» · «Inicia el monitoreo primero antes de importar datos.» · «Inicia el monitoreo antes de guardar.» |
| V-801 | Muestreo | AQL < LTPD | «NCA debe ser menor que NRC (AQL < LTPD).» · «No se encontró un plan factible con los parámetros dados. Prueba a aumentar α o β, o a ampliar la separación entre NCA y NRC.» |
| V-802 | Muestreo (DA-04) | n > N | «El plan requiere n = {n} > N = {N}; se inspecciona el lote completo.» — *texto nuevo* |

Entradas numéricas por defecto (si están vacías o no son números): Muestreo N = 1000, AQL = 1, α = 5, LTPD = 5, β = 10, n = 80, NAC = 2 (**el 0 se respeta**, DA-04); Desempeño t = 4, producción = 100, Δ = 0.2.

---

## 6. Flujos de trabajo (FL)

| ID | Flujo | Pasos | Resultado |
|---|---|---|---|
| FL-01 | Alta | Registro → sesión → Panel | Empresa y admin creados |
| FL-02 | Fase I con tabla | Proceso (especificaciones, carta, n) → Entrada → tabla → vista previa → Guardar (ids continuos) → Cartas → Capacidad → Informe | Mediciones de fase 1 y análisis coherentes |
| FL-03 | Fase I con Excel | Entrada → Importar (A o B) → revisar → Guardar | Igual que FL-02 |
| FL-04 | Fase I simulada | Cartas → «Simular» n → límites | Agrupación secuencial (sin persistir) |
| FL-05 | Fase II | Monitoreo → proceso (carta preseleccionada) → modo → Iniciar → límites de Fase I → ingresos (guardado inmediato) → señales (3 reglas) → deshacer o sesión | Mediciones de fase 2 |
| FL-06 | Evaluación | Desempeño → proceso → Fase II desde la base de datos → δ y PNC → t y producción → planes → guardar | Evaluación guardada (DA-17) |
| FL-07 | Informe | Informe → proceso → pestaña → PDF | Archivo PDF |
| FL-08 | Muestreo | Diseño → automático o manual → resultados | En el navegador |
| FL-09 | Administración | Usuarios, demostración, activar en desarrollo | — |
| FL-10 | Limpieza | Historial → filtro → selección → borrar | — |

### 6.1 Ciclo de vida de los datos
- **Fase 1:** se crea en Entrada de Datos, la demostración o `/import`. La consumen Cartas, Capacidad, Panel, Informe y Monitoreo (como límites). Se borra en Historial o al eliminar el proceso.
- **Fase 2:** se crea en Monitoreo (subgrupo, Excel o pegado). La consumen Monitoreo, Desempeño e Informe. Se borra con deshacer, en Historial o al eliminar el proceso.
- **Análisis:** siempre sobre la fase 1, ordenada por `recorded_at` ascendente.

### 6.2 Formatos de importación
- **Fase I (navegador):**
  - **Formato A:** varias columnas; encabezado opcional (se detecta si todas las celdas son no numéricas); n = clamp(columnas, 2, 10); se reemplaza la **primera** coma por punto; las celdas extra se ignoran.
  - **Formato B:** una columna; se pregunta n; el sobrante se descarta.
- **Fase II:** encabezado obligatorio; X̄ = filas con ≥ 2 numéricos; columnas por nombre (p: `defectuosos|defectives|def|d` y `n|tamaño|size|muestra|inspectados`; np: `…|np`; c y u: `defectos|defects|count|c|conteo` y `n|tamaño|size|unidades|units`); posiciones por defecto 0 y 1.
- **API `/import`:** columnas de valor y de subgrupo por nombre.

---

## 7. Matriz de trazabilidad (resumen)

| Módulo | RF | Fórmulas | Validaciones | Implementación | Casos de prueba |
|---|---|---|---|---|---|
| Plataforma | 001–011 | — | V-00x | `api/src/auth.ts`, `modules/auth.ts`, `features/Access.tsx` | TC-AUTH-* |
| Procesos | 101–104 | — | V-10x | `modules/processes.ts`, `features/Processes.tsx` | TC-PROC-* |
| Entrada | 201–210 | F-11, 21, 22, 25–28, 30 | V-20x | `features/DataEntry.tsx` | TC-DE-* |
| Historial | 301–303 | — | V-301 | `modules/measurements.ts`, `features/History.tsx` | TC-MEAS-* |
| Cartas | 401–409 | F-20–31, 40–43 | V-40x | `engine/src/analysis.ts`, `features/ControlCharts.tsx` | TC-CC-*, TC-ST-* |
| Capacidad | 501–508 | F-12–16, 44, 50–52, 60 | V-104, V-402 | `engine/src/capability.ts`, `features/Capability.tsx` | TC-CAP-* |
| Monitoreo | 601–612 | F-30, 32, 70, 73 | V-601 | `features/Monitoring.tsx` | TC-MON-* |
| Desempeño | 701–709 | F-71, 80–86 | — | `engine/src/performance.ts`, `features/Performance.tsx` | TC-PERF-* |
| Muestreo | 801–805 | F-90–95 | V-801–802 | `engine/src/sampling.ts`, `features/Sampling.tsx` | TC-SMP-* |
| Informe | 901–903 | F-54, 61–64, 72 | — | `engine/src/analysis.ts` (`buildReport`), `features/Report.tsx` | TC-REP-* |
| Panel | 1001–1002 | F-16 (DA-09) | — | `features/Panel.tsx` | TC-DASH-* |
| Administración | 1101–1105 | — | V-006, V-007 | `modules/users.ts`, `features/Admin.tsx` | TC-ADM-* |

---

## 8. Plan de pruebas contra valores de referencia

### 8.1 Estrategia
1. **Valores de referencia:** los conjuntos de §8.2 con sus salidas esperadas, guardados en `packages/engine/test/golden/`.
2. **Comparación:** el motor debe dar **igualdad exacta** en todo valor redondeado y diferencia ≤ 1e-12 en los valores sin redondear. Para las decisiones aprobadas (DA) se escribe un caso que demuestre el **nuevo** comportamiento y otro que muestre que lo demás no cambió.
3. **Extremo a extremo:** cada módulo se prueba desde la captura hasta la pantalla final, en localhost, con el navegador.

### 8.2 Conjuntos de datos
| ID | Conjunto |
|---|---|
| TC-REF-01 | Demostración de Admin: 60 valores en 12 subgrupos de n = 5, LSE 505, LSI 495, nominal 500 |
| TC-REF-02 | Los mismos 60 valores **sin** subgroup_id (σ global y simulación con n = 2…10) |
| TC-REF-03 | Subgrupos de tamaño desigual (primer subgrupo de 4 y el resto de 5) |
| TC-REF-04 | Todos los valores iguales (σ = 0 → null y pruebas no disponibles) |
| TC-REF-05 | Series sintéticas que disparan exactamente `ooc`, `trend` (6), `shift` (8), Nelson R2 (9) y R4 (14), y sus casos «casi» (5, 7, 8, 13) |
| TC-REF-06 | Atributos: p con n variable, p con n fijo, np con n_size, np con sample_size, np con tamaños mezclados (error), c, u y u con n = 0 |
| TC-REF-07 | Muestras de 6, 7, 10, 30 y 200 valores para Anderson-Darling (límites de tramos 0.2, 0.34, 0.6 y 13), Levene (denominador 0), Kruskal-Wallis con empates y rachas (n par e impar) |
| TC-REF-08 | Φ en z ∈ {−8, −3, −1.96, −0.5, 0, 0.5, 1.96, 3, 8}; lnΓ, P(a,x) e I_x en puntos de control |
| TC-REF-09 | Desempeño: X̄ con n = 5 y δ ∈ rango de sensibilidad; p, np, c y u con límites reales; casos sin Fase II (δ = 1, PNC 0) |
| TC-REF-10 | Muestreo: valores por defecto; AQL = LTPD; caso inviable; NAC = 0 manual (DA-04); n > N (DA-04) |
| TC-REF-11 | `parseDecimal`: "499,2", "1.234,56", "1,234.56", "1,234,567", "1.234.567", " 10 ", "", "abc" |
| TC-REF-12 | Límites de especificación en 0 (DA-02) y edición parcial |
| TC-REF-13 | Doble guardado en Entrada (DA-03): la segunda tanda debe tener ids nuevos |

### 8.3 Criterio de módulo terminado
Un módulo se declara terminado solo si: (a) todos sus TC unitarios pasan contra los valores de referencia; (b) su flujo FL pasa de extremo a extremo en localhost; (c) cada RF tiene evidencia (prueba o captura); (d) no hay diferencias no justificadas por una DA.

---

## 9. Fuera de alcance
Despliegue, pagos reales, servicios de producción, publicación en GitHub (cada uno requiere tu autorización expresa) y cualquier funcionalidad que no esté en este documento ni en una DA.

*Fin del documento maestro.*
