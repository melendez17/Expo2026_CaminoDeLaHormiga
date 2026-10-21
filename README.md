# El camino de la hormiga · Demo local JSON

Frontend de ExpoTEC para CEDES Don Bosco, con **Next.js, React y TypeScript**. Esta versión funciona con archivos JSON y progreso guardado en el navegador: **no necesita Supabase, credenciales ni una API**.

## Probar en VS Code

Requisitos: Node.js 24 LTS y npm. Abre la carpeta del proyecto y ejecuta:

```bash
npm ci
npm run dev
```

Abre la dirección que muestra la terminal (puerto 3000 por defecto). No hace falta crear `.env.local`. Para detenerlo, presiona Ctrl+C.

| Token | Persona ficticia | Perfil |
|---|---|---|
| `K8P2` | Ana Rodríguez | Postulante |
| `M4T7` | Carlos Méndez | Visitante |
| `S6F3` | Sofía Vargas | Postulante |
| `D9C5` | Diego Castro | Visitante |
| `ADM1` | Administrador ExpoTEC | Administrador de prueba |

## Administrador de prueba

Entra con **`ADM1`** desde el login principal o `/admin`. Abre un panel local con métricas, usuarios, retos, proyectos, fichas de preguntas y respuestas por participante, exportación/importación del catálogo JSON y descarga de métricas CSV. Sus cambios persisten en este navegador; no modifican los archivos del repositorio ni se comparten automáticamente entre dispositivos. Es un acceso público de demostración.

## Recorrido

1. **Login:** ingresa un token de `public/data/users.json`.
2. **Bienvenida:** aparece el nombre de la persona y el botón «Iniciar el camino».
3. **Retos:** el mapa ocupa aproximadamente un tercio del espacio disponible arriba; los retos se desplazan en los dos tercios inferiores. «Ubicación» resalta el edificio y «Hacer reto» abre el formulario.
4. **Especialidades:** dos preguntas de selección única, visualmente «marca con X», más código de stand. Las respuestas incorrectas permiten volver a intentar sin otorgar premios.
5. **Más retos:** tras los cinco base, genera rondas de dos extras sin repetir. Completa la ronda antes de pedir otra. Al agotarse el catálogo, añade más entradas al JSON.
6. **Mi resumen:** tiquetes, votos disponibles, retos, votos emitidos, insignias y encuesta con bono.
7. **Votar:** busca por nombre de proyecto o especialidad y confirma a cuál entregar un voto. Puedes repartir votos o apoyar varias veces un proyecto si tienes saldo.
8. **Agenda y mapa completo:** accesos independientes desde la navegación principal.

Cinco retos base → **1 tiquete y 1 voto**. Cada dos retos extra → **otro tiquete y voto**. Votar consume el voto, pero conserva el tiquete para la rifa. La encuesta entrega un bono inicial de 1, configurable.

Los usuarios, proyectos, horarios, respuestas y ubicaciones de actividades son ejemplos para pruebas; los polígonos y mapas vienen del HTML adjunto. Cada diálogo tiene «Ayuda para probar este reto» con sus respuestas/código de ejemplo. Esos datos son públicos deliberadamente en esta demo; no es autenticación ni validación antifraude de producción.

## Editar los JSON

| Archivo | Contenido |
|---|---|
| `public/data/users.json` | Personas, tokens de cuatro caracteres y perfiles |
| `public/data/projects.json` | Proyectos buscables para votación |
| `public/data/challenges.json` | Retos base y extras, ubicación, preguntas, respuestas y códigos |
| `public/data/agenda.json` | Agenda general, pastoral y radio |
| `public/data/settings.json` | Reglas de tiquetes, tamaño de ronda, bono, versión y transmisión opcional |
| `src/lib/campus.json` | Nombres y polígonos del mapa original |

Mantén exactamente cinco retos con `isBase: true`, IDs y tokens únicos, y zonas válidas del mapa (1–19). `correctIndex` empieza en cero. Los datos se validan al cargar. Revisa [la guía de la demo](docs/local-demo.md) para añadir contenido.

El navegador no puede modificar automáticamente los archivos del repositorio. Guarda el avance como JSON en **localStorage**, separado por usuario. Desde **Mi resumen → Guardar, importar o reiniciar mi prueba** puedes exportar un archivo JSON, importarlo para la misma persona o reiniciar solo su prueba. Cambiar de usuario conserva los avances. Nada se comparte automáticamente entre dispositivos.

## Pruebas y modo sin conexión

```bash
npm run typecheck
npm test
npm run build
npm start
```

Con `npm start` activo en otra terminal:

```bash
npx playwright install chromium
npm run test:browser
```

Con Chromium del sistema: `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:browser`. `BASE_URL` permite usar otro puerto. La prueba del navegador recorre el flujo completo con los JSON reales, incluyendo login, quiz incorrecto/correcto, tiquetes, votos, extras, encuesta, importación/exportación, cambio de usuario y funcionamiento sin conexión. No simula una API.

Para probar offline, abre primero la aplicación con conexión y espera la instalación del service worker. Después de preparar el build de producción, podrás recargar, entrar con otro usuario JSON y completar retos sin conexión. El servidor de desarrollo puede cambiar los archivos de JavaScript durante la edición; verifica offline sobre `npm run build` + `npm start`.

## Estructura

- `src/components/journey.tsx`: pantallas y navegación local.
- `src/components/campus-map.tsx`: mapa 2D/3D con polígonos seleccionables.
- `src/lib/local-game.ts`: validación, premios, generación de extras y votación.
- `public/data/`: fuente de datos de la demo.
- `tests/local-game.test.ts` y `tests/browser.ts`: pruebas de la experiencia local.

El trabajo previo de API/Supabase se conserva como referencia en `src/app/api/`, `src/lib/server.ts` y `supabase/`, pero **no participa en este frontend**. `/admin` abre el acceso administrativo local con `ADM1`, sin Supabase. Las guías de [arquitectura](docs/architecture.md), [base de datos](docs/database.md), [API](docs/api.md) y [operación](docs/operations.md) describen esa futura integración; la guía vigente para esta entrega es [Demo local JSON](docs/local-demo.md).
