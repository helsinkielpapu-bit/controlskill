// Manual del software (RF-1201, DA-14): describe el comportamiento real de ControlSkill.
const SECTIONS = [
  { id: 'objetivo', title: 'Qué es ControlSkill' },
  { id: 'flujo', title: 'Flujo de trabajo' },
  { id: 'procesos', title: 'Procesos' },
  { id: 'entrada', title: 'Entrada de datos' },
  { id: 'cartas', title: 'Cartas de control' },
  { id: 'capacidad', title: 'Capacidad' },
  { id: 'monitoreo', title: 'Monitoreo Fase II' },
  { id: 'desempeno', title: 'Evaluación del desempeño' },
  { id: 'muestreo', title: 'Planes de muestreo' },
  { id: 'informe', title: 'Informe' },
  { id: 'cuenta', title: 'Cuenta y usuarios' },
  { id: 'errores', title: 'Mensajes frecuentes' }
];

export default function Manual() {
  return (
    <>
      <div className="page-head"><div><h1>Manual del software</h1><p className="lede">Cómo usar cada módulo y cómo leer sus resultados.</p></div></div>
      <div className="cols cols-side">
        <nav className="toc sheet" aria-label="Contenido" style={{ padding: 10 }}>{SECTIONS.map(s => <a key={s.id} href={`#${s.id}`}>{s.title}</a>)}</nav>
        <article className="sheet doc" style={{ padding: '8px 28px 28px' }}>
          <h2 id="objetivo">Qué es ControlSkill</h2>
          <p>Plataforma de Control Estadístico de Procesos para ingenieros de calidad. Cubre la Fase I (estabilización y límites de control), la capacidad del proceso, la Fase II (monitoreo contra límites congelados), la evaluación del desempeño de la carta y el diseño de planes de muestreo por atributos.</p>
          <p>Todos los cálculos salen de un único motor estadístico. Junto a cada resultado se muestra el método usado: por ejemplo, σ̂ = R̄/d₂ o S̄/c₄ y el tamaño de subgrupo n.</p>

          <h2 id="flujo">Flujo de trabajo</h2>
          <ol>
            <li><b>Procesos:</b> crea el proceso con su unidad, LSI, nominal, LSE, tipo de carta y n.</li>
            <li><b>Entrada de datos:</b> captura o importa los subgrupos históricos (Fase I).</li>
            <li><b>Cartas de control:</b> verifica la estabilidad con las reglas activas.</li>
            <li><b>Capacidad:</b> evalúa Cp, Cpk y los supuestos.</li>
            <li><b>Monitoreo:</b> registra la producción en vivo contra los límites de Fase I.</li>
            <li><b>Evaluación del desempeño</b> e <b>Informe</b>.</li>
          </ol>
          <p>El proceso elegido se conserva al cambiar de módulo.</p>

          <h2 id="procesos">Procesos</h2>
          <p>El nombre es obligatorio. LSI debe ser menor que LSE. El valor 0 es válido para LSI, LSE y nominal. Al editar, los campos que no cambias conservan su valor.</p>
          <ul>
            <li><b>Tipo de carta:</b> X̄-R o X̄-S para variables; p, np, c o u para atributos. El Informe y la Evaluación del desempeño usan esta carta.</li>
            <li><b>n:</b> de 2 a 10 para cartas de variables. En la carta np es el tamaño de muestra fijo (≥ 2).</li>
          </ul>
          <p>Eliminar un proceso borra también todas sus mediciones.</p>

          <h2 id="entrada">Entrada de datos</h2>
          <p><b>Variables:</b> tabla de subgrupos con n de 2 a 10. Tab y Enter avanzan entre celdas y Ctrl+V pega bloques copiados de Excel (separados por tabulador o punto y coma). Se aceptan punto o coma decimal. Solo se guardan los subgrupos completos; los incompletos se listan y se omiten. Si hay valores fuera de especificación, se muestra una advertencia antes de guardar.</p>
          <p><b>Atributos:</b> por subgrupo se registra el número de defectivos o de defectos y, en p y u, el tamaño de muestra n.</p>
          <p>La vista previa calcula los límites con el mismo motor que la carta definitiva. Los subgrupos nuevos se numeran a continuación de los ya guardados.</p>
          <h3>Importar Excel</h3>
          <ul>
            <li><b>Formato A:</b> una fila por subgrupo; el número de columnas define n (máximo 10).</li>
            <li><b>Formato B:</b> una sola columna. Se pregunta n y se agrupan las observaciones de arriba hacia abajo; las sobrantes al final se descartan.</li>
          </ul>
          <p>La importación carga la tabla, pero no guarda: revisa los datos y pulsa «Guardar en el proceso».</p>

          <h2 id="cartas">Cartas de control</h2>
          <p>Los límites se calculan con todas las mediciones de Fase I.</p>
          <ul>
            <li><b>X̄-R:</b> X̿ ± A₂R̄, con la carta R (D₃R̄, D₄R̄).</li>
            <li><b>X̄-S:</b> X̿ ± A₃S̄, con la carta S (B₃S̄, B₄S̄).</li>
            <li><b>p y u:</b> límites por subgrupo según su n.</li>
            <li><b>np:</b> usa el n fijo del proceso.</li>
            <li><b>c:</b> c̄ ± 3√c̄.</li>
          </ul>
          <p>Reglas configurables:</p>
          <ul>
            <li><b>Fuera de límites (crítica):</b> un punto por encima de LCS o por debajo de LCI. En p y u se compara con los límites de cada subgrupo.</li>
            <li><b>Tendencia:</b> 6 puntos consecutivos estrictamente crecientes o decrecientes.</li>
            <li><b>Corrimiento:</b> 8 puntos consecutivos del mismo lado de la línea central.</li>
          </ul>
          <p>«Simular de forma secuencial» agrupa las mediciones en orden en subgrupos de n, sin modificar los datos guardados.</p>
          <p>Pruebas estadísticas (α = 0.05), que requieren al menos 7 mediciones:</p>
          <ul>
            <li><b>Anderson-Darling:</b> normalidad, con la corrección de Stephens.</li>
            <li><b>Levene, variante Brown-Forsythe:</b> homogeneidad de varianzas.</li>
            <li><b>Kruskal-Wallis:</b> homogeneidad de medianas, con corrección por empates.</li>
          </ul>

          <h2 id="capacidad">Capacidad</h2>
          <p>Requiere LSI y LSE y al menos 2 mediciones.</p>
          <ul>
            <li><b>Con subgrupos:</b> Cp, Cpk, Cpu y Cpl usan σ dentro de subgrupos (R̄/d₂, o S̄/c₄ en procesos X̄-S).</li>
            <li><b>Sin subgrupos:</b> se usa la desviación estándar global.</li>
          </ul>
          <p>Estado: <b>capaz</b> si Cpk ≥ 1.33, <b>marginal</b> entre 1.00 y 1.33, <b>no capaz</b> si es menor que 1.00.</p>
          <p>La <b>cota</b> dibuja la tolerancia LSI–LSE, el nominal y la barra x̄ ± 3σ del proceso a escala; la parte fuera de tolerancia se marca en rojo.</p>
          <p>El %PNC estima las colas con Φ(−Z). Los supuestos se revisan con el gráfico Q-Q, los rangos por subgrupo y la prueba de rachas (≥ 10 observaciones). El Panel usa exactamente el mismo cálculo de Cpk.</p>

          <h2 id="monitoreo">Monitoreo Fase II</h2>
          <p>Elige proceso, carta y modo, y pulsa «Iniciar monitoreo». El primer monitoreo de cada proceso y carta <b>congela y guarda los límites de Fase I</b>; desde entonces la Fase II (aquí, en Desempeño y en el Informe) siempre se evalúa contra ellos, aunque después se agreguen o corrijan datos de Fase I. Si eso pasa, la pantalla lo avisa; para usar los datos nuevos pulsa «Recalcular límites de Fase I».</p>
          <p>Cada subgrupo se guarda al instante; «Deshacer último» lo elimina. Se aplican las mismas tres reglas que en Fase I sobre la secuencia de monitoreo, tanto en la carta de medias como en la de rangos o desviaciones (por encima del LCS y por debajo del LCI).</p>
          <ul>
            <li><b>Modo Industrial:</b> n fijo.</li>
            <li><b>Modo Académico:</b> permite ajustar n como simulación (los límites de Fase I se reagrupan en orden, sin cambiar los límites guardados) y muestra la Fase I como referencia.</li>
          </ul>
          <p>Las sesiones guardadas quedan en la cuenta de la empresa, con un máximo de 50.</p>

          <h2 id="desempeno">Evaluación del desempeño</h2>
          <p>Con los límites reales de la carta del proceso se calculan:</p>
          <ul>
            <li><b>Riesgos:</b> α = 2(1 − Φ(3)) y β según el tipo de carta.</li>
            <li><b>ARL y ATS:</b> ARL₀ = 1/α, ARL₁ = 1/(1 − β) y ATS = ARL × t.</li>
            <li><b>PPNC</b> = ATS₁ × %PNC × tasa de producción.</li>
          </ul>
          <p>δ y %PNC se obtienen de los datos de Fase II guardados; sin ellos se usa δ = 1σ y %PNC = 0.</p>
          <p>La carga muestral CM = n/t propone dos planes: misma n, o mismo t. La evaluación se guarda por proceso.</p>

          <h2 id="muestreo">Planes de muestreo</h2>
          <ul>
            <li><b>Automático:</b> busca el plan de menor n que cumple Pa(NCA) ≥ 1 − α y Pa(NRC) ≤ β.</li>
            <li><b>Manual:</b> evalúa el n y el NAC que ingreses, incluido NAC = 0.</li>
          </ul>
          <p>Incluye las curvas CO y AOQ, el AOQL, el ATI y una tabla de planes candidatos. Si el n requerido supera el tamaño del lote, se avisa y se inspecciona el lote completo.</p>

          <h2 id="informe">Informe</h2>
          <p>Contiene:</p>
          <ul>
            <li>Resumen de Fase I, carta y estabilidad, capacidad y riesgo.</li>
            <li>Pruebas estadísticas e histograma.</li>
            <li>Evaluación integral con recomendaciones priorizadas.</li>
            <li>Fase II con los datos guardados y la evaluación de desempeño guardada.</li>
            <li>Conclusión.</li>
          </ul>
          <p>Las cartas de atributos no forman parte del resumen de Fase I. «Descargar PDF» genera un A4 vertical.</p>

          <h2 id="cuenta">Cuenta y usuarios</h2>
          <p>Quien registra la empresa es administrador. La sesión dura 7 días. Los administradores invitan usuarios (rol administrador o analista, contraseña de al menos 8 caracteres) y pueden eliminar a otros usuarios, pero no a sí mismos.</p>
          <p>En modo local no hay cobros: la suscripción se puede activar en modo desarrollo.</p>

          <h2 id="errores">Mensajes frecuentes</h2>
          <ul>
            <li><b>«Se necesitan al menos 2 subgrupos con ≥ 2 mediciones.»</b> Guarda más subgrupos o usa «Simular de forma secuencial».</li>
            <li><b>«El proceso requiere USL y LSL definidos.»</b> Completa LSI y LSE en Capacidad o en Procesos.</li>
            <li><b>«La carta np requiere n fijo…»</b> Define n en el proceso o guarda todos los subgrupos con el mismo n.</li>
            <li><b>«Tu sesión ha expirado.»</b> Vuelve a iniciar sesión.</li>
            <li><b>«Sin conexión con el servidor.»</b> Verifica que la API local esté en ejecución.</li>
          </ul>
        </article>
      </div>
    </>
  );
}
