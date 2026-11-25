# ControlSkill

Plataforma de Control Estadístico de Procesos: Fase I, capacidad, monitoreo en Fase II, desempeño de la carta, planes de muestreo e informe integral, con el método visible junto a cada resultado.

- Especificación funcional y decisiones aprobadas (DA-01…DA-27): [docs/especificacion-funcional.md](docs/especificacion-funcional.md)
- Arquitectura: [docs/arquitectura.md](docs/arquitectura.md)
- Lenguaje visual «Hoja de plano»: [DESIGN.md](DESIGN.md)

## Requisitos

- Node.js 22 o superior
- PostgreSQL 16, con las bases `controlskill` y `controlskill_test`

Corre en local (`127.0.0.1`) o publicado en línea en Render (ver [Publicación en línea](#publicación-en-línea)). No hay integración de pagos.

## Puesta en marcha

**Atajo:** con las dependencias ya instaladas y el `.env` listo, haz doble clic en `Iniciar ControlSkill.cmd`. Abre la API y la web en dos ventanas minimizadas («no cerrar») y luego el navegador en `http://127.0.0.1:5173`. Si alguna ya estaba encendida, no la duplica. Para apagar, cierra esas dos ventanas.

Paso a paso:

1. Copia `.env.example` a `.env` y completa los valores locales.
2. Instala las dependencias:
   ```
   npm install
   ```
3. Carga los datos de demostración (opcional):
   ```
   npm run seed -w @controlskill/api
   ```
4. Arranca la API en `http://127.0.0.1:4100`. Las migraciones se aplican solas al arrancar.
   ```
   npm run dev -w @controlskill/api
   ```
5. Arranca la web en `http://127.0.0.1:5173`:
   ```
   npm run dev -w @controlskill/web
   ```

## Publicación en línea

El archivo `render.yaml` describe todo lo necesario para [Render](https://render.com): una base PostgreSQL y un servicio web que sirve la API y la web desde la misma dirección.

1. En Render: **New → Blueprint**, conecta GitHub y elige este repositorio.
2. Escribe la clave de la cuenta demo cuando pida `DEMO_PASSWORD` (mínimo 8 caracteres). El correo es `demo@controlskill.test`.
3. Pulsa **Apply**. Al terminar, la app queda en `https://<nombre>.onrender.com`.

Al arrancar se aplican las migraciones y, si no existe, se crea la cuenta demo con sus procesos de ejemplo. Cada `git push` a `main` vuelve a publicar.

En el plan gratuito el servicio se duerme tras 15 minutos sin visitas (la primera visita tarda cerca de un minuto) y la base gratuita caduca a los 30 días.

## Pruebas

| Comando | Qué hace |
|---|---|
| `npm test` | Ejecuta el motor contra los valores de referencia y las pruebas de integración de la API (requiere PostgreSQL) |
| `npm run e2e` | Recorre los flujos completos en el navegador sobre una base de pruebas aislada |
| `npx tsc -p apps/web` y `npx tsc -p apps/api` | Verifican los tipos |

## Estructura

| Carpeta | Contenido |
|---|---|
| `packages/engine` | Motor único de cálculo (estadística, cartas, reglas, pruebas, capacidad, desempeño, muestreo) |
| `packages/contracts` | Esquemas de validación y tipos compartidos |
| `apps/api` | API Fastify + PostgreSQL |
| `apps/web` | Aplicación React (Vite) |
| `e2e` | Pruebas de extremo a extremo (Playwright) |
