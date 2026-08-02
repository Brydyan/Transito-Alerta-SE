# 📹 ENTREGABLE 6 — Video de Sustentación (Análisis Estático y Seguridad)

**Sistema de Gestión de Incidencias Georreferenciadas**  
**Sustentación Técnica: E6 (Avance Preliminar)**

---

## 📂 ESTRUCTURA DE ARCHIVOS

Este directorio contiene **4 documentos complementarios** para la grabación y sustentación del Entregable 6:

### 1️⃣ **E6_GUION_ANALISIS_SEGURIDAD.md** (Principal)
📌 **Uso:** Referencia principal durante la grabación  
📏 **Tamaño:** ~3500 palabras  
⏱️ **Duración:** ~2 minutos en video  

**Contenido:**
- Guión completo con diálogos exactos
- Timing para cada sección (0:00, 0:20, 0:50, etc.)
- Instrucciones de qué mostrar en pantalla
- Notas de edición y transiciones
- Checklist de grabación
- Tips técnicos y de presentación

**✅ EMPIEZA AQUÍ:** Si no sabes por dónde empezar, lee este archivo primero.

---

### 2️⃣ **CHEAT_SHEET_E6.md** (Referencia Rápida)
📌 **Uso:** Ten abierto en segunda pantalla durante grabación  
📏 **Tamaño:** ~1500 palabras  
⏱️ **Lectura:** ~3 minutos  

**Contenido:**
- Comandos curl listos para copiar/pegar
- URLs de acceso rápido (SonarQube, frontend, etc.)
- Puntos clave a mencionar (checklist)
- Timing checkpoints
- Setup técnico OBS (resolución, bitrate, etc.)
- Errores comunes + soluciones rápidas

**✅ IMPRIME O DEJA EN SEGUNDO MONITOR:** Para consultar en tiempo real.

---

### 3️⃣ **RESUMEN_HALLAZGOS_E6.md** (Visual y Gráfico)
📌 **Uso:** Para mostrar en video como slide de referencia  
📏 **Tamaño:** ~2500 palabras  
⏱️ **Lectura:** ~5 minutos (pero muestra código y tablas)  

**Contenido:**
- Tabla de los 6 hallazgos (estado actual)
- Código ANTES/DESPUÉS para cada corrección
- Diagrama visual de "Capas de Protección" XSS
- Métricas OWASP Top 10
- Timeline de correcciones
- Tabla rápida para mostrar en pantalla

**✅ COPIA TABLAS/DIAGRAMAS:** Puedes usarlos como slides en PowerPoint o mostrarlos en pantalla.

---

### 4️⃣ **PORTADA_VIDEO_E6.md** (Formal/Moodle)
📌 **Uso:** Para generar PDF portada que entregarás en Moodle  
📏 **Tamaño:** ~2000 palabras  
⏱️ **Lectura:** ~4 minutos  

**Contenido:**
- Datos académicos formales (universidad, carrera, docente)
- Tabla de integrantes + roles + email
- Desglose de contenido del video por persona
- Datos técnicos de grabación (resolución, codec, etc.)
- Rúbrica de calificación (30% + 40% + 20% + 10%)
- Checklist final pre-entrega
- Errores comunes a evitar

**✅ GENERA PDF:** File > Export as PDF desde navegador o editor.

---

## 🎯 WORKFLOW RECOMENDADO

### Antes de grabar (Semana del 22-26 julio)

```
Lunes:
├─ Lee: E6_GUION_ANALISIS_SEGURIDAD.md (30 min)
├─ Lee: CHEAT_SHEET_E6.md (10 min)
└─ Practica: Lee guión 3-4 veces en voz alta (memorizar)

Martes:
├─ Verifica: Backend corriendo, SonarQube accesible
├─ Test: Comandos curl funcionen (H-04 → Token válido)
└─ Setup: OBS instalado y probado (grabación test 10 seg)

Miércoles:
├─ Ensayo: Grabación de prueba completa (no importa si sale mal)
├─ Review: Ver grabación, ajustar timing/velocidad
└─ Preparar: Archivos VS Code abiertos, URLs guardadas

Jueves:
├─ Grabación FINAL (intento 1)
├─ Si sale bien: IR AL VIERNES
└─ Si tiene errores: Corregir, regrab sección específica

Viernes:
├─ Edición básica (trimmer, transiciones, audio)
├─ Export: MP4 1080p 30fps (~200-400MB)
└─ Upload: YouTube (oculto/unlisted)
```

### Durante grabación (Día D)

```
0. Pre-check (5 min):
   ├─ Documento: CHEAT_SHEET_E6.md abierto en Tab
   ├─ Terminal: Token generado y listo
   ├─ VS Code: Archivos abiertos (StoreIncidentRequest, etc.)
   ├─ SonarQube: http://localhost:9002 accesible
   └─ OBS: Escenas configuradas, prueba de audio OK

1. Grabación (7 min):
   ├─ REC: Intro en cámara (0:00 - 0:20)
   ├─ PAUSA: Cambiar escena a pantalla
   ├─ REC: Contexto técnico (0:20 - 0:50)
   ├─ REC: Hallazgos E2 (0:50 - 2:00)
   ├─ REC: Demo XSS (2:00 - 3:30)  ← DEMO PRINCIPAL
   ├─ REC: SonarQube (3:30 - 4:00)
   ├─ REC: Plan futuro (4:00 - 4:30)
   ├─ REC: Cierre (4:30 - 5:00)
   └─ STOP

2. Revisión inmediata (2 min):
   ├─ ¿Cámara activa durante todo?
   ├─ ¿Sonido claro?
   ├─ ¿Timing ~2 minutos?
   └─ ¿Demo XSS visible?
```

### Después de grabar (Viernes/Fin de Semana)

```
Viernes tarde:
├─ Export a MP4 (OBS Remux)
├─ Edición básica (si necesita)
└─ Upload a YouTube (oculto)

Sábado:
├─ Verifica enlace YouTube funciona (abierto sin login)
├─ Genera PDF portada desde PORTADA_VIDEO_E6.md
└─ Envía a Moodle (PDF + enlace)
```

---

## 📊 MATRIZ DE REFERENCIA RÁPIDA

| Documento | Cuándo leerlo | Cuándo usarlo | Duración |
|-----------|--------------|--------------|----------|
| **E6_GUION...** | Antes de grabar (memorizar) | Durante grabación (consultar) | 2:00 min |
| **CHEAT_SHEET...** | Antes de grabar (practicar comandos) | DURANTE grabación (2do monitor) | 5 min |
| **RESUMEN_HALLAZGOS...** | Antes de grabar (visualizar tablas) | Como slides en video | 1:30 min |
| **PORTADA_VIDEO...** | Después de grabar (generar PDF) | Para entregar en Moodle | 4 min |

---

## 🎬 CHECKLIST DE ENTREGA

**Antes de entrar a Moodle:**

- [ ] ✅ Video grabado (~2 min, E6)
- [ ] ✅ Audio claro, cámara activa
- [ ] ✅ Demo XSS visible y correcta
- [ ] ✅ Exportado a MP4 1080p
- [ ] ✅ Subido a YouTube (oculto/unlisted)
- [ ] ✅ Enlace probado (funciona sin login)
- [ ] ✅ PDF portada generado desde PORTADA_VIDEO_E6.md
- [ ] ✅ PDF contiene: títulos integrantes + enlace YouTube
- [ ] ✅ Archivos comprimidos si es necesario (<500MB)
- [ ] ✅ Enviado a Moodle en carpeta correcta

---

## 🔗 REFERENCIAS RÁPIDAS

### Comandos clave (copiar/pegar desde CHEAT_SHEET_E6.md)
```bash
# Generar token
TOKEN=$(curl -s -X POST http://localhost:8000/api/login \
  -H "Content-Type: application/json" \
  -d '{"email":"xss@test.com","password":"TestPass123"}' \
  | jq '.access_token' | tr -d '"')

# Demo XSS
curl -X POST http://localhost:8000/api/incidents \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"<script>alert(\"XSS\")</script>","description":"Test","incident_category_id":2,"location_id":1,"priority":"high"}' \
  | jq '.data.title'

# Resultado esperado:
# "&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;"
```

### URLs a visitar durante video
- **SonarQube:** http://localhost:9002 (mostrar dashboard)
- **Frontend:** http://localhost:3000 (portada/cierre visual)
- **E2 Hallazgos:** `docs/Entregables/E2/ActividadGrupal_E2ARRTP_FINAL.md`

### Archivos a abrir en VS Code
- `backend/app/Domains/Incidents/Http/Requests/StoreIncidentRequest.php` (sanitización)
- `frontend/app/utils/format.js` (escapeHtml)
- `backend/.env.example` (APP_DEBUG=false)

---

## 🎓 CRITERIOS DE CALIFICACIÓN (REPASO)

| Criterio | Peso | Qué Mostrar |
|----------|------|-----------|
| **Dominio terminología** | 30% | Menciona: XSS, sanitización, htmlspecialchars, OWASP, CWE-79 |
| **Evidencias prácticas** | 40% | SonarQube + Código + Curl test en vivo + Resultado &lt;script&gt; |
| **Estructura video** | 20% | Flujo claro: Intro → Hallazgos → Demo → Herramientas → Plan → Cierre |
| **Material soporte** | 10% | E2 visible + VS Code con código + Diagramas/tablas en pantalla |

**Meta:** ≥85/100 puntos

---

## 📞 SOPORTE TÉCNICO

### Problema: Comandos curl no funcionan
**Solución:** Verifica que backend esté corriendo
```bash
docker compose ps backend
# Debe mostrar: "Up" en STATUS
```

### Problema: Token vacío/inválido
**Solución:** Regenerar token
```bash
docker compose exec db psql -U user -d incidencias_db \
  -c "SELECT email, id FROM users LIMIT 1;"
# Verifica que xss@test.com exista con password TestPass123
```

### Problema: Video pixelado o borroso
**Solución:** Aumentar bitrate en OBS a 5000 kbps

### Problema: No sé qué decir
**Solución:** Lee E6_GUION_ANALISIS_SEGURIDAD.md línea por línea, memóralo

---

## ✨ TIPS FINALES

1. **Practica en voz alta:** No leas, memoriza y habla natural
2. **Pausa antes de demos:** Dale 2 segundos para que se vea el output
3. **Mantén contacto visual:** Mira a cámara durante intro/cierre
4. **Sonido limpio:** Mute notificaciones, teléfono en silencio
5. **Fondo profesional:** Pared lisa, iluminación frontal
6. **Velocidad de habla:** Lento y claro (como si estuvieras en clase)
7. **Evita "ehhhh":** Usa pausas naturales en lugar de "este... eso..."

---

## 📅 DATES IMPORTANTES

- **Hoy (16 julio):** Documentos listos
- **22-26 julio:** Semana de preparación y grabación
- **27-31 julio:** Edición y upload
- **01 agosto:** Entrega en Moodle
- **04 mayo 2026:** Demo final presencial (si aplica)

---

**¿Preguntas?** Revisa el documento específico:
- ❓ "¿Qué digo?" → E6_GUION_ANALISIS_SEGURIDAD.md
- ❓ "¿Qué comando uso?" → CHEAT_SHEET_E6.md
- ❓ "¿Cómo veo las tablas?" → RESUMEN_HALLAZGOS_E6.md
- ❓ "¿Qué documento entrego a Moodle?" → PORTADA_VIDEO_E6.md

---

**¡Éxito en la grabación! 🎥✨**

*Documento índice generado: 16 de julio de 2026*
