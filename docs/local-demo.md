# Demo local con JSON

Esta es la experiencia activa. La integración Supabase queda para otra etapa. No se requieren variables de entorno ni se hacen llamadas a `/api` desde el recorrido.

## Datos iniciales y progreso

Los cinco archivos de `public/data` se leen desde el mismo origen y se validan con Zod. No se instalan servicios de base de datos. Los tokens, respuestas y códigos están a la vista para permitir pruebas de interfaz: usa solo datos ficticios.

El progreso se guarda bajo `camino-local:<dataVersion>:<userId>` en localStorage. El usuario activo se guarda en sessionStorage. Al recargar vuelve a sus retos si ya inició el camino. Si aún no ha pulsado «Iniciar el camino», conserva la pantalla de bienvenida. Cerrar sesión borra la sesión activa, pero no los avances de ninguna persona.

Cada progreso registra:

```json
{
  "version": 1,
  "dataVersion": "demo-2026-v1",
  "userId": "ana",
  "startedAt": null,
  "completed": [],
  "extraIds": [],
  "votes": [],
  "survey": null
}
```

Los tiquetes y votos disponibles se calculan a partir de retos, encuesta y votos emitidos; no se aceptan totales importados. Una importación se valida contra usuario, versión, catálogo, respuestas, duplicados y saldo. No sobreescribe el archivo del proyecto ni cambia datos de otras personas. Aun así, al ser una demo de frontend se puede manipular desde las herramientas del navegador; no usar para sorteos reales ni votaciones oficiales.

Si cambias preguntas, códigos o reglas después de iniciar pruebas, usa una nueva `settings.dataVersion` para empezar una edición de demo sin mezclar respuestas anteriores. Si solo agregas nuevos retos o proyectos, conserva los IDs existentes y podrás continuar. Las importaciones de otra versión se rechazan. Exporta los avances antes de reiniciarlos.

## Agregar un usuario

En `users.json` agrega un objeto con ID y token únicos. Los tokens son cuatro letras mayúsculas o números. No son contraseñas reales.

```json
{ "id": "lucia", "name": "Lucía Ejemplo", "token": "L2C8", "kind": "visitor" }
```

`kind` admite `visitor` o `applicant`. La encuesta de postulantes se identifica como admisión de prueba; todos pueden seguir jugando tras completar los cinco retos base.

## Agregar un proyecto buscable

En `projects.json`:

```json
{
  "id": "huerta",
  "name": "Huerta inteligente",
  "buildingId": "17",
  "specialty": "TICs",
  "description": "Sensores para mejorar el cuidado de una huerta."
}
```

La búsqueda compara nombre y especialidad, ignorando mayúsculas y tildes. El voto tiene una confirmación antes de consumir saldo. Se permite más de un voto al mismo proyecto si hay tiquetes disponibles. Los tiquetes permanecen para la rifa; esta entrega no incluye una rifa oficial ni un recuento central entre dispositivos.

## Agregar una especialidad como reto extra

En `challenges.json`, referencia un proyecto existente y una zona válida:

```json
{
  "id": "huerta-reto",
  "title": "Una huerta que se cuida mejor",
  "buildingId": "17",
  "kind": "quiz",
  "isBase": false,
  "description": "Descubre el proyecto y pregunta por el código del stand.",
  "projectId": "huerta",
  "code": "H2R8",
  "questions": [
    {
      "id": "objective",
      "prompt": "¿Cuál es el objetivo del proyecto?",
      "options": ["Cuidar la huerta", "Aumentar el desperdicio"],
      "correctIndex": 0
    },
    {
      "id": "technical",
      "prompt": "¿Qué permite medir humedad?",
      "options": ["Un cartel", "Un sensor"],
      "correctIndex": 1
    }
  ]
}
```

Los dos grupos son de selección única, con una X visible en la opción seleccionada. La respuesta correcta usa un índice desde cero. Los dos aciertos y el código son necesarios. Los errores no completan el reto ni conceden premios. La ayuda de prueba presenta respuestas y código desde el mismo JSON.

Otros tipos:

- `freeform`: formulario de nombre de proyecto, nivel y descripción mínima de diez caracteres.
- `code`: código de cuatro caracteres; apropiado para patrocinador o photobooth, sin subir fotos.
- `saint`: nombre del santo en `answer`, comparación sin tildes, sin diferencias entre mayúsculas y con espacios exteriores eliminados.

La demo tiene cinco retos base: Pasitos, Escuela, TICs, patrocinador y photobooth. Tercer Ciclo, otras cuatro especialidades y dos edificios con santos están en el catálogo extra. Los nombres de santos, horarios y ubicaciones de actividades son ficticios o propuestas, no información confirmada de CEDES.

La generación elige hasta `extraBatchSize` retos no asignados, aleatoriamente, sin repetir. Solo se habilita tras completar los cinco base y terminar la ronda anterior. El catálogo extra es finito: cuando se agota se indica en pantalla y se puede ampliar añadiendo JSON. Cada `extraEvery` retos extra completos entrega un tiquete adicional; un reto aislado de la última ronda queda contado aunque no alcance a formar un par.

## Agenda y radio

La agenda ofrece tarjetas y una tabla por día (con desplazamiento horizontal dentro de la tabla en móviles). Usa `day` para el día, como `Sábado`, `time` para el inicio y `endTime` opcional para el cierre, en formato de 24 horas, y categorías `general`, `pastoral` y `radio`. Son horarios de ejemplo, sin fecha real de evento. Cada actividad permite volver al mapa compacto con su zona resaltada.

`settings.radioUrl` empieza en `null` para no inventar una transmisión. Al poner una URL de audio compatible aparece un reproductor en la pestaña CEDES Radio. La transmisión requiere su conexión a internet; el resto de la demo no depende de ella.

## Uso offline y pruebas

El service worker `camino-shell-json-v11` prepara mapas, JSON, HTML, tipografía local y los scripts estáticos iniciales, y elimina cachés antiguas de la aplicación al activarse. Ya no registra sincronización de servidor. Una vez listo permite recargar y continuar sin conexión. El progreso se guarda inmediatamente de forma local.

El navegador necesita permitir almacenamiento local. Si el guardado falla, se muestra un error antes de actualizar el estado visible. Se escucha el evento de almacenamiento para refrescar avances entre pestañas; localStorage no proporciona transacciones para la concurrencia de múltiples dispositivos. No es un reemplazo del backend para producción.

`npm test` incluye las reglas locales y conserva las pruebas SQL de la etapa anterior. `npm run test:browser` usa los JSON reales, sin API de fixture, y verifica que el recorrido no realiza llamadas a `/api`.

## Diseño y referencias visuales

La interfaz se adaptó a las capturas oficiales compartidas en el chat: títulos negros gruesos en mayúsculas, fondos claros con geometría y líneas, acentos verdes y rojo en programación de radio. Se usa Archivo Variable alojada localmente como aproximación tipográfica; no se ha identificado ni descargado la fuente exacta del sitio oficial, cuyo acceso sigue bloqueado en este entorno. No se han inventado logos ni fotografías oficiales.

Ubicación usa un pin SVG y el color primario; los lugares son etiquetas dentro de las tarjetas. La agenda presenta tarjetas y tabla por día, con número de día destacado (`dayNumber`, opcional, entre 1 y 31), numeración de actividades y horarios amplios. El «14 / Sábado» de la demo reproduce la estructura visual de la captura; los horarios y el contenido siguen siendo ejemplos, no programación oficial confirmada.

## Administrador local de prueba

Token **ADM1**, nombre «Administrador ExpoTEC». Se define en `public/data/users.json` con `role: "admin"`. Los usuarios sin `role` se interpretan como `participant`. El token funciona en el login principal o en `/admin`; los tokens de participantes no entran al panel administrativo.

El panel abre directamente, sin iniciar el juego. Incluye:

- Resumen de participantes, sin activar/en proceso/completados, tiquetes, votos y admisión de prueba; los administradores no cuentan como participantes.
- Ficha de respuestas por persona desde «Respuestas» o «Ver respuestas» en Resumen/Usuarios. Muestra cada pregunta, textos libres, opciones elegidas en los quizzes (por su texto, no por índice), códigos, santo, fecha del envío y encuesta. Los retos base y extras asignados sin completar se identifican como pendientes. Se muestran respuestas de completaciones guardadas; los intentos incorrectos no se conservan en esta demo.
- Estado por persona y votos por proyecto, calculados solo con los progresos válidos guardados en este navegador. Las filas con errores se identifican y no se convierten silenciosamente en ceros.
- Crear, editar y eliminar usuarios de prueba y proyectos. Los tokens deben ser únicos; no se puede eliminar el acceso del administrador activo.
- Crear retos extra y editar retos existentes: formulario libre, código, santo o especialidad con dos preguntas y opciones. Los cinco retos base se mantienen; si ya empezó una prueba, se protege su configuración. No se eliminan usuarios con avance ni proyectos/retos referenciados por respuestas o votos.
- Exportar/importar el catálogo completo como JSON y descargar métricas CSV compatibles con Excel.

El catálogo editado se guarda bajo `camino-local-catalog-v1` en localStorage y se aplica al siguiente ingreso de los participantes. Los JSON del repositorio no se reescriben desde el navegador. Para distribuir los cambios, exporta el catálogo, importa el archivo desde otro administrador o copia cada lista a su archivo en `public/data`.

El respaldo del catálogo incluye datos iniciales y ediciones, **no** los avances de los participantes. Cada persona exporta su avance desde «Mi resumen». El administrador muestra datos del mismo navegador/origen; no hay un panel central de todos los dispositivos. `ADM1` es público deliberadamente y no constituye autenticación segura para producción.

## Interfaz interior sobre fondo blanco

El login oscuro se conserva. El recorrido interior usa fondo blanco, tipografía en estilo de oración y una jerarquía compartida de tarjetas: tipo/estado, título, descripción, lugar y acciones. Los estados completados y la selección de respuestas usan SVG; los controles mantienen sus etiquetas y semántica accesible.

En móviles el mapa ocupa aproximadamente el tercio superior del área de retos y la navegación principal queda abajo. En escritorio el mapa aparece como panel lateral junto a la lista. Resumen, votación, agenda, formularios y administración comparten colores, bordes, espaciado y botones. Se comprobó el ajuste desde 320 píxeles de ancho y el flujo funcional se mantiene local con JSON.

### Catálogos compactos

La votación muestra solo nombre, área y botón de voto; la confirmación se expande al seleccionar un proyecto. Los retos usan filas compactas con el mismo icono de cuaderno: stands amarillo, especialidades morado, escuela azul, tercer ciclo verde y Pasitos rosado. La etiqueta también identifica el área. En móvil, el mapa conserva el tercio superior y los controles de ubicación y respuesta tienen nombres accesibles. La descripción completa sigue disponible al abrir el reto.

### Tema gráfico del administrador

El tema `src/app/admin-theme.css` combina bosque, esmeralda y menta con degradados en el fondo, encabezado y métricas destacadas. Solo se aplica a `.admin-local`; conserva la navegación, secciones, datos y operaciones del panel.

### Composición de retos según referencia

En escritorio la pantalla de retos usa título grande, contadores reales del camino base, navegación numerada, mapa lateral y tarjetas con acciones verde lima y verde oscuro. A partir de 800 px el recorrido desplaza la página completa; en teléfono conserva el mapa en el tercio superior y la lista de retos debajo. El mapa es el recurso real e interactivo, no un marcador de posición.

### Resumen de votos y páginas del visitante

El historial agrupa los votos por proyecto y muestra especialidad, total de votos del participante y fecha del último voto en horario de Costa Rica. La votación permite repetir equipo mientras queden votos; incorpora filtro por área y orden alfabético. Resumen, Votar, Agenda y Mapa comparten la línea gráfica de la pantalla de retos. La agenda tiene una única vista en tabla con días, categorías y ubicación, también en móvil. Los días y actividades provienen del JSON; no se añaden horarios ficticios para completar la referencia.

### Explorador del campus

El mapa completo usa un panel lateral con búsqueda de todos los lugares, conteos de retos asignados y detalles de la selección: retos completados y actividades del JSON. Inicialmente lista las paradas del recorrido y permite mostrar los 19 lugares. Seleccionar desde el mapa o la lista actualiza el mismo estado; se mantienen las vistas 2D y 3D. En móvil el panel aparece debajo del mapa.

### Resumen administrativo y clasificación

El resumen destaca los participantes que completaron los cinco retos base, la distribución de estados y los totales de tiquetes/votos. La tabla incluye búsqueda, filtros por estado, orden por nombre/avance/tiquetes y páginas de 10, 25 o 50 personas. Los progresos inválidos se señalan y no suman premios ni votos.

La clasificación de proyectos destaca hasta tres proyectos con votos y muestra los demás en páginas de diez, con búsqueda por nombre o especialidad. Cuenta todos los votos válidos, incluidos los repetidos a un mismo equipo. Los empates comparten posición; los proyectos con cero votos no reciben posición. Las pruebas usan un catálogo aislado de 125 proyectos y 25 participantes, sin añadirlos a los JSON de la demo.
