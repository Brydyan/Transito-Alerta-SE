# Proposal: comment-image-upload + threaded replies

## Intent

Permitir que operadores documenten avances con comentarios y usuarios respondan con evidencia visual. El sistema actual solo soporta texto plano. Se necesita: (1) replies threaded con `parent_id`, (2) upload de imágenes con thumbnails + lightbox, (3) cascade deletion en cascada.

## Scope

### In Scope
- Tabla `comment_images` con FK a `comments`
- Reply comments: `comments.parent_id` (self-reference FK, nullable)
- Endpoint POST `/comments` acepta `parent_id`
- Endpoint POST `/comments/{id}/images` — upload múltiple en paralelo
- Endpoint DELETE `/comments/{comment}/images/{image}` — autor solo
- Endpoint DELETE `/comments/{id}` — cascade borra imágenes
- Conversión a webp al guardar (Spatie Medialibrary o intervención/image)
- Frontend: textarea con reply, preview local, thumbnails, lightbox, delete own images

### Out of Scope
- Notificaciones por nuevos replies (ya existe SSE de comentarios)
- Editar imágenes ya subidas
- Compartir imágenes entre comentarios

## Capabilities

### New Capabilities
- `comment-replies`: Comentarios pueden responder a otro comentario específico. Se muestran anidados bajo el padre. El autor del reply ve un badge de "Respondiendo a @nombre".
- `comment-images`: Upload múltiple de imágenes en paralelo, thumbnails en línea, lightbox al click, autor puede eliminar sus propias imágenes. Comentario puede ser solo imagen (sin texto).

### Modified Capabilities
- Ninguna (es aditivo puro).

## Approach

### Backend

**Database:**
- Migration: `comment_images` — `id, comment_id (FK cascade), url, caption (nullable), sort_order, created_at`. Index en `comment_id`.
- Migration: agregar `parent_id (FK nullable)` a `comments` — self-reference.

**Model `CommentImage`:**
- Fillable: `comment_id, url, caption, sort_order`
- Relationship: `belongsTo(Comment::class)`

**Model `Comment`:**
- Agregar `belongsTo(Comment::class, 'parent')` (reply a otro comentario)
- Agregar `hasMany(Comment::class, 'parent')` (respuestas a este)
- Agregar `hasMany(CommentImage::class)` (imágenes)
- Mutator: `setUrlAttribute` — recibe imagen raw, convierte a webp, guarda en storage público, devuelve path público.

**Controller `CommentController`:**
- `store(Request)` — recibe `incident_id, body, parent_id (nullable)`. Valida que `parent_id` pertenezca a la misma incidencia. Crea comment.
- `uploadImages(Comment $comment, Request)` — recibe array de archivos, procesa en paralelo, guarda cada uno como webp, crea `CommentImage`. Autor only (404 si no es dueño).
- `destroyImage(Comment $comment, CommentImage $image)` — elimina archivo físico y registro. Autor only.
- `destroy(Comment $comment)` — elimina comment (cascade images por DB o model events).

**Routes:**
```
POST   /incidents/{incident}/comments      -- crear comment o reply
POST   /comments/{comment}/images          -- upload imágenes
DELETE /comments/{comment}/images/{image} -- eliminar imagen
DELETE /comments/{comment}                -- eliminar comment
```

**Image processing:**
- Usar `intervention/image` o `spatie/laravel-medialibrary`. Config: max 1920px en el lado largo, calidad webp 85%.
- Storage: `public/images/comments/` (o S3 si ya está configurado).

### Frontend

**Detail page (`incidencias/pages/detail/`):**

*Reply flow:*
- Botón "Responder" en cada comentario (visible si el usuario puede comentar).
- Al hacer click: el textarea recibe prefix `> @nombre: ...` del texto del comentario padre (estilo quote inline) y guarda el `parent_id` en un campo hidden.
- Mostrar badge de "Respondiendo a @nombre" si hay `parent_id` activo.
- Botón cancelar reply limpia el estado.

*Image upload & Trigger Icon:*
- Icono compacto de cámara/imagen (`<i class="fas fa-camera"></i>` / `<i class="fas fa-paperclip"></i>`) integrado directamente junto a la caja de texto/controles del comentario, visible tanto al redactar un comentario nuevo como al hacer click en **Responder**.
- Al pulsar el icono, abre el selector nativo de archivos (`<input type="file" multiple accept="image/jpeg,image/png,image/webp" capture="environment">`) permitiendo tomar una foto directamente desde dispositivos móviles o seleccionar imágenes locales.
- Preview: crear `URL.createObjectURL()` por cada archivo, mostrar thumbnail grid (miniaturas cuadradas de 64x64px con borde redondeado). Botón `×` en cada miniatura para remover la imagen antes de publicar.
- Submit: si hay archivos adjuntos, realizar POST a `/comments/{comment}/images` (usando la API polimórfica compartida de imágenes) al publicar el comentario.
- Si falla algún upload: rollback visual (quitar preview), mostrar toast de error, evitar dejar estados inconsistentes.

*Display:*
- En cada `comment-card`: thumbnails 80x80px en grid, debajo del texto. Si hay `parent_id`: mostrar bloque de quote con el texto del comentario padre (max 2 líneas truncadas).
- Al click en thumbnail: lightbox fullscreen (overlay oscuro + imagen centrada, click fuera cierra).
- Botón eliminar imagen ( papelera ) visible solo si `comment.user_id === currentUser.id`.
- Respuestas anidadas: indentadas 24px a la derecha con línea vertical izquierda. Max profundidad 2 niveles (no anidar reply de reply).

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `backend/database/migrations/` | Modified | `comments.parent_id`, `comment_images` table |
| `backend/app/Models/Comment.php` | Modified | relationships, mutators |
| `backend/app/Models/CommentImage.php` | New | model + fillable |
| `backend/app/Domains/Incidents/Http/CommentController.php` | Modified | store, destroy + new actions |
| `backend/routes/api.php` | Modified | 4 rutas nuevas |
| `frontend/app/incidencias/pages/detail/` | Modified | reply UI, upload UI, thumbnails, lightbox |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Conversión a webp falla (imagen corrupta) | Low | Try/catch, rollback + error toast, no comment creado |
| Upload paralelo falla parcialmente | Med | Promise.allSettled, si alguno falla rollback total, no parcial |
| Usuario sube imagen muy grande → timeout | Med | Validar tamaño en frontend (max 10MB por archivo) + nginx/client_max_body_size |
| FK orphan si se Borra comentario sin cascade | Low | DB cascade on delete + model event como backup |
| Reply chain muy profunda → UI confusa | Low | Limitar a 2 niveles de anidación en frontend |

## Rollback Plan

1. `php artisan migrate:rollback` — revierte ambas migrations (drops `comment_images`, removes `parent_id`)
2. Borrar `backend/app/Models/CommentImage.php`
3. Revertir cambios en `Comment.php` (relationships y mutator)
4. Revertir cambios en `CommentController.php` (acciones added)
5. Revertir cambios en `routes/api.php`
6. Revertir cambios en frontend (reply UI, upload, thumbnails, lightbox — son adiciones puras, no modify existente)
7. `php artisan migrate` para volver al estado anterior si se quiere re-aplicar

## Dependencies

- `intervention/image` o `spatie/laravel-medialibrary` (verificar cuál está instalado)
- Si no hay ninguno: `composer require intervention/image`
- Storage link (`php artisan storage:link`)

## Success Criteria

- [ ] Operador crea comment de texto sobre una incidencia → aparece en feed
- [ ] Ciudadano hace reply a un comment existente → aparece anidado debajo
- [ ] Reply muestra quote inline del comentario padre
- [ ] Upload de imagen en comment → thumbnail visible, click abre lightbox
- [ ] Preview local de imagen antes de enviar (thumbnail grid en el form)
- [ ] Upload paralelo de 3 imágenes → todas aparecen correctamente
- [ ] Autor elimina su propio comment → imágenes borradas de storage + DB
- [ ] Autor elimina solo una imagen → comment permanece, imagen borrada
- [ ] No autor intenta eliminar imagen de otro → 403
- [ ] Comentario con solo imagen (sin texto) → se crea y muestra correctamente
- [ ] Límite 2 niveles de profundidad en replies
- [ ] Imágenes convertidas a webp en storage (verificar extensión de archivo)
