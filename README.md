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
| `K8P2` | Ana Rodríguez | Visitante |
| `M4T7` | Carlos Méndez | Visitante |
| `S6F3` | Sofía Vargas | Admisión · Desarrollo Web |
| `D9C5` | Diego Castro | Visitante |
| `ADM1` | Administrador ExpoTEC | Administrador de prueba |

## Administrador de prueba

Entra con **`ADM1`** desde el login principal o `/admin`. Abre un panel local con métricas, usuarios, retos, proyectos, fichas de preguntas y respuestas por participante, respaldo y restauración Excel (.xlsx), rifa aleatoria y descarga de métricas CSV. Sus cambios persisten en este navegador; no modifican los archivos del repositorio ni se comparten automáticamente entre dispositivos. Es un acceso público de demostración.

## Recorrido

1. **Login:** ingresa un token de `public/data/users.json`.
2. **Bienvenida:** aparece el nombre de la persona y el botón «Iniciar el camino».
3. **Retos:** en móvil el mapa ocupa aproximadamente un tercio del espacio disponible arriba y los retos se desplazan abajo; en escritorio el mapa aparece junto a la lista. «Ubicación» resalta el edificio y «Hacer reto» abre el formulario.
4. **Especialidades:** dos preguntas de selección única, visualmente «marca con X», más código de stand. Una respuesta incorrecta añade un reto extra y conserva el proyecto pendiente, sin otorgar premios por el fallo.
5. **Más retos:** Visitante recibe retos de dos en dos desde el inicio. Admisión puede generar rondas de dos extras tras completar su ruta base. Completa la ronda antes de pedir otra. Al agotarse el catálogo, añade más entradas al JSON.
6. **Mi resumen:** tiquetes, votos disponibles, retos, votos emitidos y encuesta con bono.
7. **Votar:** busca por nombre de proyecto o especialidad y confirma a cuál entregar un voto. Puedes repartir votos o apoyar varias veces un proyecto si tienes saldo.
8. **Agenda y mapa completo:** accesos independientes desde la navegación principal.

Visitante: cada dos retos completados → **1 tiquete y 1 voto**. Admisión: ruta base completa → **1 tiquete y 1 voto**; cada dos retos extra → **otro tiquete y voto**. Votar consume el voto, pero conserva el tiquete para la rifa. La encuesta entrega un bono inicial de 1, configurable.

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

## Publicar en Vercel

La demo puede publicarse sin variables de entorno usando la rama `implementacion-v0.1`. Consulta [la guía de publicación](docs/vercel.md); `vercel.json` incluye la configuración de Next.js.

## Roles y áreas de afinidad

La rama de este cambio es `correccion-roles-proyectos-tiquetes`. Solo existen tres roles: Admin (`admin`), Visitante (`visitor`) y Admisión (`admission`). El rol controla el acceso, la encuesta y el tamaño del recorrido. El área orienta la asignación de retos. Admisión conserva cinco retos obligatorios; Visitante recibe rondas de dos.

El formulario exige **Área de afinidad** para los participantes. Ofrece Escuela (`school`), Pasitos (`pasitos`), Tercer ciclo (`third_cycle`) y las seis especialidades: Desarrollo Web, Ciberseguridad, Dibujo y Modelado de Edificaciones, Diseño Gráfico Multimedia, Electromecánica y Mecánica de Precisión. No hay opción Cuarto ciclo ni segundo campo de especialidad: se elige la especialidad directamente como `area`.

| Área | Ruta obligatoria de Admisión |
|---|---|
| Pasitos | 2 proyectos de Pasitos + 1 de Escuela + 1 de especialidad + 1 extra |
| Escuela | 2 de Escuela + 1 de Tercer ciclo + 1 de especialidad + 1 extra |
| Tercer ciclo | 2 de Tercer ciclo + 2 de especialidad + 1 extra |
| Una especialidad | 1 de décimo + 1 de undécimo de esa especialidad + otro distinto de ella (décimo o undécimo) + 1 de otra especialidad + 1 extra |

Ejemplo: `{"role":"visitor","area":"Desarrollo Web"}`. `{"role":"admission","area":"Desarrollo Web"}` recibe la ruta completa de cinco, con encuesta de admisión. Los visitantes conservan su encuesta de experiencia. Admin no necesita área y los participantes no pueden acceder al panel.

Los catálogos anteriores se normalizan al leer: los roles de nivel pasan a `admission` con su área, `assignedSpecialty` se traslada a `area` y `kind` desaparece del usuario normalizado y de los respaldos nuevos. Los visitantes antiguos se convierten a rondas de dos al volver a entrar, conservando su historial y las asignaciones existentes; al crearlos o editarlos desde el panel se exige elegir área. Las rutas ya iniciadas, respuestas y tokens se conservan, y cambiar de área se bloquea si invalida una ruta asignada.

Web y Ciberseguridad comparten el edificio TICs (`17`). Los proyectos tienen categoría, especialidad y nivel; los extras son actividades sin proyecto. Si falta catálogo suficiente para preparar una ruta completa, se informa antes de asignarla.

## Tiquetes manuales y rifa local

En Admin → **Tiquetes**, introduce el token del participante y pulsa **Crear**. Cada emisión otorga un tiquete y un voto, sin completar retos ficticios. Se conserva ID, fecha y emisor; los tiquetes manuales se incluyen en métricas y resumen.

En Admin → **Rifa**, el sorteo con ruleta visual incluye tiquetes digitales y manuales y muestra nombre, correo y tiquete del ganador y guarda ID ganador, premio opcional, fecha y administrador. Usa `crypto.getRandomValues` con selección uniforme. Un tiquete ganador no participa de nuevo, pero una persona puede ganar con otro tiquete. Todo permanece en este navegador: aún no hay sincronización entre dispositivos.

La demo incluye dos proyectos de décimo y dos de undécimo por especialidad para probar distintas asignaciones. Son ejemplos ficticios. Para probar estos cambios en un despliegue de Vercel debe seleccionarse la rama `correccion-roles-proyectos-tiquetes`.

Los usuarios nuevos creados desde el administrador reciben automáticamente un token único de cuatro caracteres al guardar. El formulario no solicita token; al editar una persona se conserva su código de acceso.

El registro solicita un correo electrónico válido y obligatorio; se guarda en el catálogo y se incluye en el CSV administrativo. Los usuarios de catálogos anteriores sin correo siguen siendo compatibles; al editarlos se solicita completarlo. El acceso continúa mediante token.

El formulario de usuarios pide Nombre, Apellido 1 y Apellido 2 por separado, todos obligatorios. Se guardan como `firstName`, `firstSurname` y `secondSurname`; `name` conserva el nombre completo para el resto de la aplicación. Los registros anteriores siguen funcionando y deben completar los apellidos al editarse; no se deducen automáticamente del nombre anterior.

Los retos de santo usan una pregunta de marque con X (2–6 opciones y opción correcta configurable). Si falla, se registra el intento y se sustituye por otro reto extra no asignado ni fallado, sin sumar completados ni premios. El administrador ve el intento y su reemplazo en Respuestas. Si se agotan los suplentes, se solicita añadir otro reto extra sin borrar el avance. Los retos de santo antiguos se presentan con opciones y sus respuestas históricas se conservan.

Una respuesta incorrecta en un quiz o un código válido pero equivocado añade otro reto extra sin repetir. El reto original queda pendiente para conservar las cuotas de proyectos; los errores de formato o campos vacíos no generan extras. Los extras asignados por fallo pueden completarse antes de terminar la base, y siguen las reglas habituales de premios; el fallo no concede tiquetes ni votos. Se guardan el intento y el extra generado en Respuestas del administrador. Los santos conservan su sustitución por otro extra.

El panel incluye Agenda para crear, editar y eliminar actividades de viernes 13, sábado 14 y domingo 15 de noviembre, con inicio, fin opcional, categoría, edificio y descripción. Los cambios aparecen automáticamente en la agenda y el mapa del usuario en otras pestañas del mismo navegador; no se sincronizan entre dispositivos. Se incluyen en el respaldo del catálogo. Las eliminaciones de una agenda administrada se conservan al recargar.

## Visitantes: rondas de dos

Al iniciar reciben dos retos, priorizando proyectos de su área de afinidad y completando la pareja con otros retos disponibles si falta catálogo afín. Cada dos retos completados otorgan un tiquete y un voto, sin exigir cinco base. La siguiente ronda se solicita con **Recibir otros 2 retos** y no repite retos ni proyectos. Se termina la ronda y los extras pendientes por fallos antes de pedir otra. Si solo queda un reto en el catálogo, la última ronda contiene ese reto; los premios siguen contando parejas completas. La encuesta de experiencia y su bono se habilitan tras los dos primeros completados. Admisión mantiene sus cinco retos iniciales y sus reglas anteriores.

El progreso guarda `visitorRounds` y `visitorRoundIndex`. Los visitantes anteriores se adaptan al entrar sin borrar respuestas, votos, encuesta ni tiquetes manuales; sus asignaciones previas se presentan en parejas sucesivas. Los nuevos tiquetes digitales se calculan por parejas completadas, por lo que un visitante antiguo puede recibir tiquetes adicionales al migrar.

## Asignación desde el administrador

Admin → **Asignación** tiene dos apartados:

- **Distribución por área:** tamaño de ronda para visitantes (2 por defecto) y cantidades para cada área de admisión. Pasitos inicia con 2 Pasitos, 1 Escuela, 1 especialidad y 1 extra; Escuela con 2 Escuela, 1 Tercer ciclo, 1 especialidad y 1 extra; Tercer ciclo con 2 propios, 2 especialidades y 1 extra. Cada especialidad conserva 1 propio de décimo, 1 de undécimo, otro propio de cualquier nivel, 1 de otra especialidad y 1 extra. Las cantidades son editables y se valida disponibilidad antes de guardarlas. El premio del visitante sigue siendo un tiquete por dos completados, independientemente del tamaño de la ronda.
- **Retos por persona:** buscar por nombre o token, preparar una ruta si aún no empezó, reemplazar o quitar un pendiente y añadir otro reto. Las excepciones manuales pueden cambiar la distribución y la meta de esa persona, con motivo e historial de administrador y fecha. Los completados están protegidos. Una ruta completada no recibe nuevos obligatorios que puedan revocar sus premios: se añaden extras.

Las reglas nuevas se guardan en `assignmentRules` dentro del catálogo JSON local y afectan solo asignaciones nuevas. Cada ruta de admisión guarda `routeRule`; los cambios individuales quedan en `assignmentEdits`. Las respuestas, votos, tiquetes y sorteos existentes se conservan. Los usuarios ven las actualizaciones entre pestañas del mismo navegador; todavía no hay sincronización entre dispositivos.

En **Proyectos** se puede desmarcar **Disponible para nuevas asignaciones** si el puesto cerró. Se excluye de rutas nuevas y de los reemplazos, manteniendo las asignaciones anteriores para que el administrador decida qué cambiar. El proyecto sigue disponible para votar. Los retos retirados de una persona no vuelven a generarse para ella.

El catálogo de ejemplo incluye un segundo proyecto de Pasitos y otro de Escuela. La revisión 4 los agrega a catálogos anteriores sin sobrescribir ediciones ni recuperar otros proyectos eliminados. Se puede verificar la gestión con `npm run test:assignments-browser` y las mismas variables `BASE_URL` y `PLAYWRIGHT_CHROMIUM_EXECUTABLE` del test general.

## Respaldo Excel y ajustes administrativos

Admin → **Respaldo** descarga un Excel real `.xlsx` con catálogo editable (usuarios, proyectos, retos, preguntas, agenda y distribución) y hojas de consulta de participación, encuestas, preguntas pendientes, respuestas e intentos incorrectos, votos, tiquetes, rifas y cambios de asignación. El archivo incluye una copia íntegra de los datos originales del navegador para restaurar el avance. Al importarlo se muestra una revisión antes de reemplazar los datos y se guarda una copia interna del estado anterior. Las hojas de respuestas y métricas son de consulta; editarlas no altera el progreso restaurado. No combina avances de varios dispositivos.

Al crear un reto de especialidad se eligen especialidad, décimo o undécimo y un proyecto compatible. En Asignación → Retos por persona, **Cambiar** permite elegir categoría (incluidos extras, TICs y Electromecánica/EMA) y opcionalmente nivel. Se muestra el próximo reto disponible de esa categoría antes de confirmar; si no hay uno, no se sustituye por otra categoría. Se excluyen proyectos cerrados y visitas ya asignadas.

Crear usuarios o agregar entradas al catálogo ya no queda bloqueado por el avance dañado de otra persona. Los cambios que podrían invalidar sus respuestas siguen protegidos. Los avances antiguos compatibles se adaptan al iniciar sesión conservando una copia original. Si los datos no se pueden leer con seguridad, el token válido abre una pantalla de recuperación con descarga del archivo original y reintento; no se reinicia el progreso automáticamente.

Verificación adicional: `npm run test:admin-repairs-browser` prueba creación de usuarios, nivel de retos, reemplazos por categoría, rifa, respaldo/restauración Excel y recuperación de avances. Usa las mismas variables de Chromium y puerto que los demás tests de navegador.
