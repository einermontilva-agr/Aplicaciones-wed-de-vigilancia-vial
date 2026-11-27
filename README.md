# Vigía Vial Santa Marta · Reto No. 2

Aplicación web ciudadana y operativa para reportar mal parqueo e invasión del espacio público en la **Calle 29H3 y Villa Marbella (Santa Marta)**, calcular el índice de criticidad con reglas explícitas y visualizar el mapa de calor en tiempo real.

> **Curso:** Introducción a la Ingeniería de Sistemas (2026-2) · Universidad del Magdalena  
> **Reto:** Control de mal parqueo e invasión del espacio público en Santa Marta

## Equipo y roles (Plantilla para sustentación)

| Rol | Integrante | Responsabilidad principal |
| :--- | :--- | :--- |
| **Analista de campo y privacidad** | *[EINER BARRERA]* | Clasificación de cuadras (`vias.json`), recorridos pico/valle (32 registros) y verificación de pixelación de rostros/placas |
| **Integrador del mapa e instrucciones IA** | *[Nombre del integrante 2]* | Mapa base OpenStreetMap, capa de calor (`Leaflet.heat`), zonas agrupadas (15–30 m), buscador y ajuste de prompts |
| **Ingeniero de lógica y clasificación** | *[Nombre del integrante 3]* | Reglas de `criterios.json`, índice de criticidad, filtros sin recarga y resumen operativo Top 5 (`R1`–`R5`) |
| **Diseñador de interfaz y documentador** | *[JORGE CURVELO]* | Captura rápida (<30 s), tablero con modo oscuro, bitácora de iteración y diagrama de arquitectura |

## Cómo ejecutar el proyecto

```bash
npm install
npm run dev
```

La aplicación queda disponible en `http://localhost:3000`. Para generar compilación de producción:

```bash
npm run build
```

## Requerimientos implementados (RF-01 a RF-06)

- **RF-01 Captura rápida (<30 s):** Selección en mapa, GPS o buscador de direcciones; cronómetro integrado; carga de foto tolerante a desenfoque (bloquea únicamente si no incluye ningún vehículo) y pixelación selectiva de rostros y placas.
- **RF-02 Índice de criticidad:** Suma automática de `categoría` + `tipo_via` (`public/datos/vias.json`) + `franja` (`criterios.json`), clasificada en Bajo (`0–4`), Medio (`5–6`) y Alto (`7–9`).
- **RF-03 Mapa de calor y zonas de proximidad:** Capa `Leaflet.heat` en panel translúcido para mantener visibles calles y edificaciones, ponderada por criticidad, confirmaciones `(+1)`, antigüedad y estado (`activo`/`solucionado`), más agrupación automática por radio configurable (`15–30 m`).
- **RF-04 Filtros sin recarga:** Sector, cuadra, franja horaria, rango de hora, categoría, actor y nivel de criticidad actualizando mapa y conteos al instante.
- **RF-05 Resumen operativo imprimible:** Top 5 cuadras críticas con acción sugerida y regla (`R1`–`R5`) explícita.
- **RF-06 Exportar e importar JSON:** Descarga e importación de reportes de otros dispositivos evitando duplicados por `id`.

## Estructura del proyecto

- `public/datos/vias.json`: 6 cuadras clasificadas en Calle 29H3 (`arterial`) y Villa Marbella (`secundaria`).
- `public/datos/criterios.json`: Pesos de categoría, vía, franja, horas pico y rangos de nivel.
- `public/datos/reportes.json`: 32 registros levantados en dos recorridos (hora valle y hora pico).
- `src/logic/`: Módulos puros (`criticidad.ts`, `filtros.ts`, `resumen.ts`, `proximidad.ts`, `captura.ts`, `busqueda.ts`, `leafletSetup.ts`, `tema.ts`).
- `src/components/`: Vistas (`TableroOperativo.tsx`, `CapturaRapida.tsx`, `TablaRegistros.tsx`, `ModeloReglas.tsx`, `MapaSantaMarta.tsx`, `BuscadorUbicacion.tsx`).
- `server.ts`: Servidor Express + Vite con proxy seguro para `/api/validar-evidencia`, `/api/detectar-privacidad` y `/api/buscar-direccion`.
