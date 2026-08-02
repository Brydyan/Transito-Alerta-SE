# 🎬 CHEAT SHEET — Grabación E6 (Seguridad)
**Uso durante la grabación — Tener a mano en segunda pantalla o impreso**

---

## 🔐 TEST XSS (DEMO PRINCIPAL)

### 1️⃣ Obtener Token
```bash
curl -X POST http://localhost:8000/api/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "xss@test.com",
    "password": "TestPass123"
  }' | jq '.access_token' | tr -d '"'
```
**Guardar en variable:**
```bash
TOKEN=$(curl -s -X POST http://localhost:8000/api/login \
  -H "Content-Type: application/json" \
  -d '{"email":"xss@test.com","password":"TestPass123"}' \
  | jq '.access_token' | tr -d '"')

echo $TOKEN  # Verificar que no esté vacío
```

---

### 2️⃣ POST Incidencia con XSS Payload
```bash
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

**Resultado esperado:**
```json
"&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;"
```

---

### 3️⃣ Verificación: Buscando el Escaped HTML
```bash
# Mismo curl de arriba, pero buscar & lt;
curl -s -X POST http://localhost:8000/api/incidents ... | grep -o "&lt;"
# Debe mostrar: &lt;
```

---

## 📂 ARCHIVOS A TENER ABIERTOS EN VS CODE

**Árbol de carpetas (en orden de uso):**

```
backend/
├── app/Domains/
│   ├── Incidents/Http/Requests/
│   │   ├── StoreIncidentRequest.php      ← MOSTRAR PRIMERO (sanitización)
│   │   └── UpdateIncidentRequest.php     ← Si tiempo permite
│   └── Comments/Http/Requests/
│       └── StoreCommentRequest.php       ← Si tiempo permite
├── .env.example                          ← MOSTRAR: APP_DEBUG=false (H-05)
└── sonar-project.properties              ← Si existe (config SonarQube)

frontend/
└── app/utils/format.js                   ← MOSTRAR: función escapeHtml()

docs/Entregables/
└── E2/ActividadGrupal_E2ARRTP_FINAL.md   ← MOSTRAR: los 6 hallazgos
```

---

## 🔗 URLs A VISITAR

| Herramienta | URL | Uso en video |
|-----------|-----|------------|
| **SonarQube** | http://localhost:9002 | Mostrar dashboard análisis |
| **Backend API** | http://localhost:8000/api/incidents | POST curl test |
| **Frontend** | http://localhost:3000 | Portada/cierre visual |
| **E2 Hallazgos** | `docs/Entregables/E2/...` | Referencia mientras hablas |

---

## 🎯 PUNTOS CLAVE A MENCIONAR

**Mínimo una vez cada uno:**

- [ ] "XSS, Cross-Site Scripting"
- [ ] "Sanitización de input"
- [ ] "htmlspecialchars con ENT_QUOTES"
- [ ] "Doble protección: backend + frontend"
- [ ] "H-01 a H-06: seis hallazgos identificados"
- [ ] "OWASP CWE-79"
- [ ] "SonarQube para análisis automático"
- [ ] "≥72% de casos pasando (meta E4)"
- [ ] "Rate-limiting (H-02 en progreso)"

---

## ⏱️ TIMING CHECKPOINT

| Minuto | Qué debe estar mostrando |
|--------|------------------------|
| 0:00 | Aparecer en cámara, presentarse |
| 0:20 | Contexto técnico (stack) |
| 0:50 | Documento E2 abierto (hallazgos) |
| 1:50 | Código VS Code (StoreIncidentRequest) |
| 2:00 | Terminal con curl command |
| 3:00 | Resultado `&lt;script&gt;` escapado |
| 3:30 | SonarQube dashboard |
| 4:00 | Plan futuro (hablando a cámara) |
| 4:30 | Cierre y conclusión |
| 5:00 | FIN (fade to black) |

---

## 🖥️ PANTALLA — RESOLUCIÓN MÍNIMA

- **Para código:** 1920x1080 (Full HD mínimo)
- **Tamaño fuente VS Code:** 18-20pt
- **Tema:** Dark mode (mejor contraste en video)
- **Font:** Fira Code, JetBrains Mono, o Courier (monospace)

---

## 🎤 FRASES CLAVE (Memorizar)

**Intro:**
> "Soy [Nombre], especialista en Backend y Seguridad. Voy a mostrar el análisis estático de seguridad que hemos realizado."

**XSS Demo:**
> "El riesgo más crítico fue XSS Almacenado. Veamos qué pasa cuando alguien intenta inyectar JavaScript..."

**Resultado:**
> "Como ven, se convierte en `&lt;script&gt;`, que es HTML escapado. El navegador lo renderiza como texto, no como código ejecutable."

**Cierre:**
> "La seguridad no es un feature que agregamos al final. Es parte de nuestro proceso desde el diseño."

---

## 🎥 GRABACIÓN: SETUP TÉCNICO

### OBS Studio (recomendado)

**Escenas a crear:**
1. "Intro" — Cámara sola (tamaño 1080p)
2. "Demostración" — Pantalla compartida + Cámara en PiP (picture-in-picture)
3. "Cierre" — Cámara sola

**Configuración:**
- Resolution: 1920x1080
- FPS: 30 (suficiente, 60 si tu PC aguanta)
- Bitrate: 4000-5000 kbps (para MP4 final)
- Audio: Micrófono + Escritorio (si quieres capturar sonido del PC)

**Orden de captura:**
```
[REC] Cámara + voz
→ [PAUSA] Cambiar escena a "Pantalla"
→ [REC] Terminal + curl + código
→ [PAUSA] Cambiar a "Cierre"
→ [REC] Conclusión
[STOP]
```

---

## ✅ ANTES DE GRABAR

**Checklist 5 minutos antes:**

- [ ] Backend corriendo: `docker compose up -d backend db redis`
- [ ] Token generado y guardado en `$TOKEN`
- [ ] SonarQube accesible (http://localhost:9002)
- [ ] VS Code abierto con archivos
- [ ] Terminal sin scroll (limpiar si es necesario)
- [ ] Micrófono probado (grabar 5 seg, reproducir)
- [ ] OBS probado (grabación de prueba 10 seg)
- [ ] Iluminación buena (evitar contraluz)
- [ ] Fondo limpio y profesional
- [ ] Notificaciones desactivadas (mute phone, Discord, Slack, etc.)

---

## 🚨 ERRORES COMUNES — SOLUCIONES RÁPIDAS

| Error | Solución |
|-------|----------|
| `curl: command not found` | Usar `docker compose exec backend curl ...` dentro del contenedor |
| Token vacío/expirado | Regenerar con comando login nuevamente |
| Pantalla borrosa | Enfocar con `Ctrl+Scroll` en OBS o ajustar zoom VS Code |
| Audio muy bajo | Verificar volumen micrófono en Configuración > Audio > Input |
| Video pixelado | Aumentar bitrate en OBS o reducir resolución |
| Sigue corriendo, fuente de error no sé qué es | ¡NO PREOCUPARSE! Simplemente aborta grab, arregla (ej: reinicia docker), y regrab la sección |

---

## 📊 MÉTRICAS A MENCIONAR SI APLICA

```bash
# Si SonarQube muestra:
Vulnerabilities: 0 (objetivo: 0 críticas)
Code Smells: <10
Coverage: >60% (meta)
```

---

## 💾 EXPORTAR VIDEO

**Configuración recomendada post-grabación:**

```
Formato: MP4
Codec: H.264 (MPEG-4 AVC)
Bitrate: 4000 kbps (video) + 128 kbps (audio)
Resolución: 1920x1080
FPS: 30
Tamaño esperado: 200-400 MB (5-7 min)
```

**Si usas OBS:** File > Remux Recordings (convertir .flv a .mp4 automáticamente)

---

## 🎬 ÚLTIMA COSA: PRACTICA

**Rehearsal (ensayo):**
1. Grabar una toma completa sin parar (aunque salga mal)
2. Ver resultado y timing
3. Ajustar velocidad de habla / tiempo de demo
4. Grabar versión final

**Esperar ~20-30 min desde "ensayo" hasta "grabación real"**

---

**Imprime este sheet y tenlo a la vista durante grabación.**  
**¡Mucho éxito! 🎥✨**
