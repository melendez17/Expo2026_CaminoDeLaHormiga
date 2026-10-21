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

La agenda usa `time` en formato de 24 horas y categorías `general`, `pastoral` y `radio`. Son horarios de ejemplo, sin fecha real de evento. Cada actividad permite volver al mapa compacto con su zona resaltada.

`settings.radioUrl` empieza en `null` para no inventar una transmisión. Al poner una URL de audio compatible aparece un reproductor en la pestaña CEDES Radio. La transmisión requiere su conexión a internet; el resto de la demo no depende de ella.

## Uso offline y pruebas

El service worker `camino-shell-json-v2` prepara mapas, JSON, HTML y los scripts estáticos iniciales, y elimina cachés antiguas de la aplicación al activarse. Ya no registra sincronización de servidor. Una vez listo permite recargar y continuar sin conexión. El progreso se guarda inmediatamente de forma local.

El navegador necesita permitir almacenamiento local. Si el guardado falla, se muestra un error antes de actualizar el estado visible. Se escucha el evento de almacenamiento para refrescar avances entre pestañas; localStorage no proporciona transacciones para la concurrencia de múltiples dispositivos. No es un reemplazo del backend para producción.

`npm test` incluye las reglas locales y conserva las pruebas SQL de la etapa anterior. `npm run test:browser` usa los JSON reales, sin API de fixture, y verifica que el recorrido no realiza llamadas a `/api`.
