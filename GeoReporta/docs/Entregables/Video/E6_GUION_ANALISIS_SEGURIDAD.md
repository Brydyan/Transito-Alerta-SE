# 🎬 GUIÓN DE VIDEO — Entregable 6: Análisis Estático y Seguridad
**Duración:** ~2 minutos (parte de los 7 min totales del video)  
**Responsable:** Integrante 2 (Backend/Seguridad)  
**Herramientas:** SonarQube, mews/purifier, Laravel

---

## 📍 ESTRUCTURA DEL GUIÓN

### ⏱️ INTRO (0:00 - 0:20 | 20 seg)

**Aparecer en cámara. Mira directo al lente. Tono profesional, claro.**

> "Hola, soy [Nombre]. Especialista en Backend y Seguridad de este proyecto.
> 
> En este segmento voy a mostrar el **análisis estático de seguridad** que hemos realizado en nuestro sistema de incidencias georreferenciadas.
> 
> Aunque el análisis completo está en progreso, ya hemos identificado y corregido vulnerabilidades críticas en la fase de planificación."

**[MOSTRAR EN PANTALLA]** Portada del proyecto en navegador (http://localhost:3000 o UI del admin)

---

### ⏱️ CONTEXTO TÉCNICO (0:20 - 0:50 | 30 seg)

**Sigue en cámara, pero ahora enfatiza con gestos hacia la pantalla.**

> "Nuestro stack es:
> - **Backend:** Laravel 12 con Octane (PHP)
> - **BD:** PostgreSQL 17 + PostGIS para georreferenciación
> - **Cache:** Redis para sesiones y queues
> 
> Estos componentes juntos crean superficies de ataque que identificamos en dos fases:
> 1. **Planificación (E2):** Hallazgos de arquitectura y política
> 2. **Implementación (E6):** Análisis estático con SonarQube"

**[MOSTRAR EN PANTALLA]** 
- `docker-compose.ps` mostrando servicios UP (backend, db, redis, sonarqube)
- `backend/config/app.php` señalando `APP_DEBUG=false`

---

### ⏱️ HALLAZGOS IDENTIFICADOS (0:50 - 2:00 | 70 seg)

**Vuelve a cámara. Enumera claramente con dedos.**

> "En nuestro análisis E2 encontramos **6 hallazgos críticos:**"

**[MOSTRAR EN PANTALLA: Abrir documento E2]** `/docs/Entregables/E2/ActividadGrupal_E2ARRTP_FINAL.md`

**Narrar mientras señalas en pantalla cada uno:**

> "**H-01: Campos Faltantes en Incidencias** — Las columnas 'título' y 'descripción' no estaban en la BD.
> ✅ **CORREGIDO:** Ya están presentes en la tabla `incidents`."

> "**H-02: POST /login sin Rate-Limiting** — Brute force vulnerable.
> ⏳ **EN PROGRESO:** Mi colega Integrante 3 lo está implementando con Redis."

> "**H-03: Autorización sin Política** — Falta validación de permisos.
> ✅ **CORREGIDO:** Ya existe `IncidentPolicy.php` con checks por organización."

> "**H-04: Contraseña Débil** — Sin validación de complejidad.
> ✅ **CORREGIDO:** Regex con mayúsculas, minúsculas y dígitos implementado."

> "**H-05: APP_DEBUG=true en Producción** — Information disclosure.
> ✅ **CORREGIDO:** Ahora es `false` en `.env.example`."

> "**H-06: auto_assign_location Inconsistente** — Lógica de trigger sin validación.
> ✅ **VALIDADO:** Diseño correcto, sin cambios necesarios."

**[MOSTRAR EN PANTALLA]** Código de correcciones mientras hablas (una por una):
- H-01: `backend/database/migrations/2026_06_15_000006_create_comments_table.php` (título, descripción)
- H-04: `backend/app/Domains/Users/Http/Requests/StoreUserRequest.php:50` (regex validación)
- H-05: `backend/.env.example:4` (APP_DEBUG=false)

---

### ⏱️ DEMO: SANITIZACIÓN XSS (2:00 - 3:30 | 90 seg)

**Vuelve a cámara. Tono: "ahora voy a mostrar la corrección más importante".**

> "La vulnerabilidad **más crítica** fue **XSS Almacenado** en títulos y descripciones.
> 
> Ustedes pueden ingresar contenido malicioso que se ejecuta en el navegador de otros usuarios.
> 
> Aquí está la solución que implementamos:"

**[MOSTRAR EN PANTALLA: Abre terminal y hace curl test]**

```bash
# Comando que ejecutas en vivo:
curl -X POST http://localhost:8000/api/incidents \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "<script>alert(\"XSS\")</script>",
    "description": "<img onerror=alert(1)>",
    "incident_category_id": 2,
    "location_id": 1,
    "priority": "high"
  }' | jq '.data.title'
```

**Resultado esperado en pantalla:**
```
"&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;"
```

**Narrar mientras muestras el resultado:**

> "Ven cómo se convierte:
> - `<script>` → `&lt;script&gt;` (HTML entity encoded)
> - Las comillas también se escapan: `\"` → `&quot;`
> 
> Esto significa que **aunque alguien intente inyectar JavaScript, se renderiza como texto plano**, no como código ejecutable."

**[MOSTRAR EN PANTALLA: Código responsable]**
- Abre `backend/app/Domains/Incidents/Http/Requests/StoreIncidentRequest.php`
- Señala el método `validated()` que hace `htmlspecialchars($title, ENT_QUOTES, 'UTF-8')`

> "En el backend, interceptamos los datos en la request antes de guardarlos.
> El método `validated()` sanitiza automáticamente cada título y descripción usando `htmlspecialchars`.
> 
> Y en el frontend, tenemos doble protección..."

**[MOSTRAR EN PANTALLA]**
- Abre `frontend/app/utils/format.js` línea 21
- Muestra función `escapeHtml()`

> "...una función `escapeHtml()` que también escapa el contenido antes de mostrarlo en la UI.
> 
> Esto es **defensa en profundidad:** sanitización en el API + escape en la presentación."

---

### ⏱️ HERRAMIENTAS UTILIZADAS (3:30 - 4:00 | 30 seg)

**Vuelve a cámara.**

> "Para automatizar este análisis de seguridad, configuramos **SonarQube** en Docker."

**[MOSTRAR EN PANTALLA: Dashboard de SonarQube]**
- URL: `http://localhost:9002`
- Proyecto: "Sistema de Incidencias Georreferenciadas"
- Métricas de seguridad (si están disponibles)

> "SonarQube escanea nuestro código en busca de:
> - **Security Hotspots:** Puntos vulnerables potenciales
> - **Code Smells:** Malas prácticas que facilitan bugs
> - **Coverage:** Qué porcentaje del código está probado
> 
> Esto nos permite detectar problemas antes de que lleguen a producción."

**[MOSTRAR EN PANTALLA]** Archivo de configuración:
- `backend/sonar-project.properties` (si existe)
- O la sección en `docker-compose.yml` mostrando SonarQube configurado

---

### ⏱️ PLAN FUTURO (4:00 - 4:30 | 30 seg)

**Vuelve a cámara. Tono confiado y profesional.**

> "Para la entrega final, el plan es:
> 
> **Corto plazo (esta semana):**
> - ✅ H-01, H-03, H-04, H-05, H-06: **COMPLETADOS**
> - ⏳ H-02 (Rate-limiting): En implementación
> 
> **Mediano plazo (antes del 04 de mayo):**
> - Ejecutar los 90 casos de prueba completos (E4)
> - Alcanzar ≥72% de casos pasando (≥65/90)
> - SonarQube con 0 vulnerabilidades críticas
> 
> **Largo plazo (producción):**
> - Implementar WAF (Web Application Firewall)
> - OWASP Top 10 compliance check completo
> - Auditoría de seguridad con equipo externo"

---

### ⏱️ CIERRE (4:30 - 5:00 | 30 seg)

**Mira a cámara. Gesto de conclusión.**

> "En resumen: hemos identificado vulnerabilidades reales en la arquitectura, las hemos corregido con código real, y configuramos herramientas para prevenir nuevas vulnerabilidades.
> 
> La seguridad no es un feature que agregamos al final — es parte de nuestro proceso desde el diseño.
> 
> Gracias."

**[MOSTRAR EN PANTALLA]** Portada del proyecto nuevamente (cierre visual)

---

## 📹 CHECKLIST DE GRABACIÓN

- [ ] Cámara activa durante todo el segmento (no solo slides)
- [ ] Micrófono claro (sin ecos, fondo silencioso)
- [ ] Pantalla legible (text size ≥18pt, sin colores muy oscuros)
- [ ] Transiciones suave entre cámara y código (no cortes abruptos)
- [ ] Timing: **2 min exactos** (max 2:30)
- [ ] Código sintaxis-resaltado en VS Code o similar (visible)
- [ ] Comandos curl ejecutados en VIVO (no pre-grabados)
- [ ] Sonido ambiente bajo (evitar ruidos de teclado excesivos)

---

## 🎬 NOTAS TÉCNICAS DE EDICIÓN

### Transiciones recomendadas:
1. **Cámara → Pantalla:** Fade a negro (0.5s)
2. **Código → Curl test:** Zoom leve o scroll suave
3. **Una corrección → Siguiente:** Wipe horizontal o dissolve (1s)
4. **Final:** Fade a negro, esperar 2s

### Texto en pantalla (sobrepuesto):
- **Timestamp:** [0:50] "H-01: Campos faltantes" (ayuda a seguir guión)
- **Métricas:** Mostrar badges: ✅ CORREGIDO / ⏳ EN PROGRESO
- **Código destacado:** Usar `line highlight` en VS Code para señalar línea específica

### Audio/Voz en off (opcional):
Si se siente difícil grabar en vivo, pueden:
- Grabar cámara + pantalla simultáneamente con OBS
- Grabar audio por separado (mejor calidad de micrófono)
- Mezclar en post-producción

---

## 🎯 CRITERIOS A CUMPLIR (de la rúbrica)

| Criterio | Cómo lo cumples en este guión |
|----------|------------------------------|
| **Dominio (30%)** | Usas terminología formal: XSS, sanitización, htmlspecialchars, rate-limiting, etc. |
| **Evidencias (40%)** | Muestras código real, curl test en vivo, correcciones aplicadas, SonarQube |
| **Estructura (20%)** | Flujo claro: Intro → Hallazgos → Demo → Herramientas → Plan → Cierre |
| **Material (10%)** | Código resaltado, screenshots de SonarQube, diagrama de defensa (si lo añades) |

---

## 📝 TIPS FINALES

1. **Practica el timing:** Graba primero en borrador, cronometra, ajusta.
2. **Evita leer:** Memoriza puntos clave, habla naturalmente (no suene script).
3. **Pausa antes de demo:** Cuando hagas el curl test, pausa 1-2s para que la gente vea el output.
4. **Señala con cursor:** Usa el cursor para apuntar a líneas de código (no distrais la vista).
5. **Términos técnicos:** Explica siglas primera vez (ej. "XSS, o Cross-Site Scripting").

---

## 🔗 RECURSOS A TENER A MANO DURANTE GRABACIÓN

- [ ] Terminal con backend corriendo (`docker compose ps`)
- [ ] VS Code con archivos abiertos:
  - `backend/app/Domains/Incidents/Http/Requests/StoreIncidentRequest.php`
  - `frontend/app/utils/format.js`
  - `backend/.env.example`
- [ ] SonarQube dashboard abierto (`http://localhost:9002`)
- [ ] Documento E2 abierto en PDF o navegador
- [ ] Token JWT válido para curl (o generar en vivo)

---

**Duración esperada:** 2 minutos  
**Formato final:** MP4 (1080p, 60fps recomendado)  
**Tamaño máximo:** <500 MB (para subir fácil a YouTube)

¡Éxito en la grabación! 🎥
