# 📹 PORTADA — Video de Sustentación E6

---

## 🏛️ UNIVERSIDAD PENÍNSULA DE SANTA ELENA
**Carrera:** Ingeniería en Software  
**Asignatura:** Proyecto Integrador - Calidad de Software  
**Docente:** [Nombre del Docente]  
**Período:** 2026-01

---

## 📋 DATOS DEL PROYECTO

**Título del Proyecto:**  
**Sistema de Gestión de Incidencias Georreferenciadas**

**Descripción:**  
Aplicación web completa para registro, seguimiento y resolución de incidencias ciudadanas en entorno municipal. Stack: Laravel 12 REST API + HTML/Bootstrap 5 frontend + PostgreSQL/PostGIS + Redis + Docker Compose.

---

## 👥 INTEGRANTES DEL EQUIPO

| Rol | Nombre | Carnet | Email | Sección en Video |
|-----|--------|--------|-------|-----------------|
| Integrante 1 | Andy Bryan Alejandro Vera | [Carnet] | fami02alejandro@gmail.com | Frontend (E3, E4) |
| Integrante 2 | Alisson Yamel Reyes Ricardo | [Carnet] | [Email] | **Backend & Seguridad (E6)** ⬅️ |
| Integrante 3 | Yandris Miguel Rivera Torres | [Carnet] | [Email] | BD/Infra (E5) |

---

## 📊 CONTENIDO DEL VIDEO

### Duración Total: 5-7 minutos

| Entregable | Tema | Responsable | Duración |
|-----------|------|-------------|----------|
| **E1 + E2** | Plan de Calidad + Hallazgos | Integrante 1 | 1:30 |
| **E3 + E4 + E5** | Casos de Prueba + Defectos + Métricas | Integrante 3 | 2:30 |
| **E6 (PRELIMINAR)** | Análisis Estático & Seguridad | Integrante 2 | **2:00** |
| **CIERRE** | Conclusiones + Enlace | Todos | 0:30 |

---

## 🎯 SECCIÓN ENTREGABLE 6 (ANÁLISIS ESTÁTICO Y SEGURIDAD)

### Responsable Principal: Integrante 2 (Alisson Yamel Reyes Ricardo)

#### Contenido Mostrado:

✅ **Hallazgos Identificados (E2 → E6 Análisis):**
- H-01: Campos faltantes → ✅ **CORREGIDO**
- H-02: Rate-limiting faltante → ⏳ **EN PROGRESO**
- H-03: Autorización débil → ✅ **CORREGIDO**
- H-04: Validación de contraseña → ✅ **CORREGIDO**
- H-05: APP_DEBUG en producción → ✅ **CORREGIDO**
- H-06: auto_assign_location inconsistente → ✅ **VALIDADO**

✅ **Demostraciones Técnicas:**
1. Herramienta SonarQube ejecutándose (http://localhost:9002)
2. Código real en VS Code mostrando correcciones aplicadas
3. **Test XSS en vivo:** Inyección de payload + respuesta sanitizada
4. Curl command mostrando `&lt;script&gt;` escapado correctamente

✅ **Herramientas & Infraestructura:**
- SonarQube (análisis estático automatizado)
- Docker Compose (entorno reproducible)
- `mews/purifier` (biblioteca de sanitización)
- Laravel FormRequest con validación personalizada

#### Archivos Técnicos Referenciados:
- `/backend/app/Domains/Incidents/Http/Requests/StoreIncidentRequest.php` (sanitización XSS)
- `/frontend/app/utils/format.js` (escapeHtml() - doble protección)
- `/backend/.env.example` (APP_DEBUG=false)
- `/docs/Entregables/E2/ActividadGrupal_E2ARRTP_FINAL.md` (hallazgos E2)
- `/docker-compose.yml` (SonarQube configurado)

---

## 📹 DETALLES TÉCNICOS DE GRABACIÓN

**Formato:** MP4 1080p @ 60fps  
**Codec:** H.264 (MPEG-4 AVC)  
**Audio:** AAC 48kHz 128kbps (mono/estéreo)  
**Tamaño Máximo:** 500 MB  
**Duración:** 5:00 - 7:00 minutos (E6 = ~2:00 min)

**Herramientas de Grabación Recomendadas:**
- OBS Studio (open source, gratis)
- Streamlabs OBS (interfaz más amigable)
- ScreenFlow (Mac) o Camtasia (Windows)

**Requisitos de Pantalla:**
- Resolución de grabación: 1920x1080 mínimo
- Tamaño de fuente en código: ≥18pt (legible en video)
- Contraste: Alto (fondo oscuro + texto claro)
- Herramientas abiertas: VS Code, Terminal, Navegador (SonarQube)

---

## 🎬 ASPECTOS OBLIGATORIOS

✅ **Cámara Activa:**  
Todos los integrantes del grupo deben aparecer exponiendo su sección. En la sección E6, Integrante 2 debe estar visible durante:
- Presentación de hallazgos (0:50)
- Demo de sanitización XSS (2:00)

✅ **Práctica Demostrativa:**  
No solo slides. Mostrar:
- SonarQube dashboard funcionando
- Código real en editor
- Curl commands ejecutándose en vivo
- Terminal con resultados

✅ **Edición Básica:**  
- Transiciones suave entre segmentos
- Títulos en pantalla con marca de tiempo
- Sobreposición de métricas/badges (✅ CORREGIDO / ⏳ EN PROGRESO)
- Audio sincronizado y claro

✅ **Equidad en Participación:**  
- Integrante 1: ~25% del video
- Integrante 2: ~25% del video
- Integrante 3: ~40% del video (E5 tiene más contenido)
- Todos: cierre conjunta

---

## 📊 RÚBRICA DE CALIFICACIÓN

### 30% — Dominio y Terminología
- ✅ Uso correcto de términos: XSS, sanitización, rate-limiting, OWASP, etc.
- ✅ Explicación clara de vulnerabilidades sin simplificación excesiva
- ✅ Referencias a estándares (OWASP Top 10, CWE-79)

### 40% — Evidencias Prácticas
- ✅ SonarQube ejecutándose y visible
- ✅ Código sanitizado mostrado en VS Code
- ✅ Curl test con payload XSS en vivo
- ✅ Respuesta escapada (`&lt;script&gt;`) visible en terminal

### 20% — Estructura del Video
- ✅ Flujo lógico: Hallazgos → Demo → Herramientas → Plan
- ✅ Transiciones suave entre cámara y pantalla
- ✅ Tiempo respetado (E6 ≤ 2:30 min)
- ✅ Sin cortes abruptos ni silencios incómodos

### 10% — Material de Soporte
- ✅ Documento E2 visible (fuente de hallazgos)
- ✅ Archivos de configuración mostrados
- ✅ Diagrama de "defensa en profundidad" (si lo agregan)
- ✅ Referencias a documentos en `/docs/Entregables/`

---

## 🔗 ENLACE DE DISTRIBUCIÓN

**Plataforma:** YouTube (Oculto/Unlisted)  
**URL:** [INSERTAR AQUÍ DESPUÉS DE SUBIR]  
**Código de acceso:** [Si la universidad requiere]

**Instrucciones para Subir:**
1. Ir a: https://youtube.com/upload
2. Seleccionar archivo MP4
3. **Privacidad:** Cambiar a **"Oculto"** (no público, solo enlace)
4. Título: "Sistema Incidencias - Video Sustentación E6 - Grupo [X]"
5. Descripción:
   ```
   Sustentación técnica del Entregable 6: Análisis Estático y Seguridad
   Integrantes: [Nombre 1], [Nombre 2], [Nombre 3]
   Carrera: Ingeniería en Software, UPSE
   Asignatura: Proyecto Integrador - Calidad de Software
   Fecha: [Fecha de grabación]
   ```
6. Tags: `upse`, `ingenieria_software`, `calidad`, `seguridad`, `sonarqube`
7. **Copiar enlace** y reemplazar URL arriba

---

## 📝 CHECKLIST FINAL

Antes de subir a Moodle:

- [ ] Video grabado y editado (5-7 min, E6 ≤ 2:30)
- [ ] Cámara activa de todos integrantes ✅
- [ ] Audio claro, sin ruidos de fondo ✅
- [ ] Pantalla legible (texto ≥18pt) ✅
- [ ] Demostraciones ejecutadas en vivo (no pre-grabadas) ✅
- [ ] Transiciones suave y timing respetado ✅
- [ ] Subido a YouTube (oculto/unlisted) ✅
- [ ] Enlace copiado y verificado (abierto sin iniciar sesión) ✅
- [ ] PDF portada completado con nombres y enlace ✅
- [ ] Enviado a Moodle en carpeta correcta ✅

---

## ⚠️ ERRORES COMUNES A EVITAR

❌ **NO hacer:**
- Leer directamente de slides (parece sin dominio)
- Grabar solo pantalla sin cámara
- Hacer zoom excesivo en código (0:01 por línea es muy lento)
- Hablar muy rápido (no se entiende)
- Usar colores muy oscuros (no se ve en video)
- Olvidar mencionar qué se corrigió vs. qué sigue
- Video cortado por falta de tiempo (medir con cronómetro)

---

## 📞 CONTACTO & SOPORTE

**Preguntas sobre el guión:**  
Revisar `/docs/Entregables/Video/E6_GUION_ANALISIS_SEGURIDAD.md`

**Problemas técnicos con OBS/grabación:**  
- OBS Tutorial: https://obsproject.com/wiki/OBS-Studio-Quickstart
- Problema de audio: Seleccionar micrófono correcto en Configuración > Audio

**Código de referencia para el test XSS:**  
Ver archivo `DEMO_CURL_XSS_TEST.sh` (si existe en repo)

---

**Documento generado:** 16 de julio de 2026  
**Versión:** 1.0  
**Estado:** Listo para imprimir y enviar a Moodle
