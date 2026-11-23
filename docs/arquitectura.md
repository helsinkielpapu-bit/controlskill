# Arquitectura

ControlSkill es un monorepo de npm con un motor de cálculo único que comparten la API y la web. La especificación funcional (requisitos RF, fórmulas F, validaciones V, flujos FL y decisiones aprobadas DA) está en [especificacion-funcional.md](especificacion-funcional.md). El lenguaje visual «Hoja de plano» está documentado en [DESIGN.md](../DESIGN.md).

## Principios

1. **Un único motor de cálculo.** El servidor y el navegador importan el mismo paquete, puro y sin dependencias. No hay fórmulas repetidas por pantalla.
2. **Resultados verificables.** Cada fórmula tiene pruebas contra valores de referencia guardados en el repositorio.
3. **Datos en el servidor.** Mediciones, evaluaciones de desempeño y sesiones de monitoreo viven en PostgreSQL, por empresa y proceso. El navegador solo guarda preferencias.
4. **Solo local.** La API escucha en `127.0.0.1:4100` y la web en `127.0.0.1:5173`.

## Paquetes

| Carpeta | Contenido | Tecnología |
|---|---|---|
| `packages/engine` | Estadística, constantes de cartas, cartas de control, reglas, pruebas estadísticas, histograma, capacidad, desempeño, muestreo, lectura de números y el análisis de alto nivel (`analysis.ts`) | TypeScript puro |
| `packages/contracts` | Esquemas de validación y tipos compartidos por API y web | zod |
| `apps/api` | API REST bajo `/api`: autenticación, usuarios, procesos, mediciones, análisis y empresa | Fastify 5, `pg`, `@fastify/jwt`, `@fastify/cookie`, `@fastify/rate-limit`, `@fastify/multipart`, bcryptjs, SheetJS, csv-parse |
| `apps/web` | Aplicación de una página con los módulos Panel, Fase I (Procesos, Entrada de datos, Cartas), Capacidad, Fase II (Monitoreo, Desempeño), Muestreo, Informes, Datos, Administración y Manual | React 19, Vite, React Router, TanStack Query, html2pdf.js, SheetJS; gráficos SVG propios |
| `e2e` | Recorridos completos en el navegador sobre una base de datos de pruebas aislada | Playwright (Edge) |

## Base de datos

PostgreSQL 16. Las migraciones están en `apps/api/db/migrations/` y se aplican solas al arrancar la API.

| Tabla | Uso |
|---|---|
| `companies` | Empresas y estado de suscripción (indicador apagado; no hay pasarela de pagos) |
| `users` | Usuarios por empresa, con rol `admin` o `analyst` y versión de sesión (`token_version`) para revocar sesiones |
| `processes` | Procesos con especificaciones, tipo de carta y tamaño de subgrupo |
| `measurements` | Mediciones de Fase 1 y Fase 2, con subgrupo y tamaño de muestra; `seq` da un orden estable |
| `control_charts`, `spc_events` | Registro de cartas y eventos |
| `performance_evaluations` | Evaluación de desempeño guardada por proceso |
| `monitoring_sessions` | Sesiones de monitoreo guardadas (máximo 50 por empresa) |
| `phase1_limits` | Límites de Fase I congelados por proceso y carta, con la huella de las mediciones usadas para avisar si cambian |

Los valores `NUMERIC` se convierten a número en un solo lugar (`apps/api/src/db.ts`).

## Seguridad

- Sesión con JWT HS256 de 7 días en una cookie `httpOnly` y `SameSite=Strict` (`cs_session`); el token no se guarda en `localStorage`.
- En cada petición se comprueba que el usuario existe y que su versión de sesión coincide con la del token; rol y empresa se leen de la base. Cerrar sesión sube la versión y revoca los tokens emitidos, y un usuario eliminado pierde el acceso al instante.
- Contraseñas con bcrypt de 12 rondas y límite de intentos en el acceso.
- Cada consulta se filtra por la empresa del usuario.
- Los secretos (`.env`) están fuera del control de versiones; `.env.example` solo tiene valores de plantilla.

## Pruebas

| Nivel | Dónde | Qué comprueba |
|---|---|---|
| Motor | `packages/engine/test/reference.test.ts` | Igualdad exacta con los valores de referencia de `test/golden/` |
| Decisiones | `packages/engine/test/decisions.test.ts` | Cada decisión aprobada (DA) que vive en el motor |
| API | `apps/api/test/api.test.ts` | Cálculos con datos guardados, validaciones, mensajes, permisos y aislamiento entre empresas (base `controlskill_test`) |
| Extremo a extremo | `e2e/flows.spec.ts` | Los flujos FL desde la pantalla, con las cifras esperadas |

Comandos: `npm test` (motor y API) y `npm run e2e` (navegador).
