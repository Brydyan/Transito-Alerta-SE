# 📋 DIAGNÓSTICO FINAL: Qué Falta y Qué Mejorar

**Fecha:** 15 julio 2026  
**Basado en:** E1 (SRS-v3.md REALISTA) + E2 (ActividadGrupal_E2ARRTP.pdf)  
**Propósito:** Guía clara de mejoras sin romper proyecto antes de presentación 04 May 2026  
**Enfoque:** Simple, priorizado, realista  

---

## 1. RESUMEN EJECUTIVO

**Estado actual:** 40-50% funcional, seguro para demo 04 May.

| Aspecto | Estado | Acción |
|---|---|---|
| **Backend core** | ✅ 70% endpoints implementados | ✅ OK para demo |
| **Frontend core** | ✅ 20% interfaces implementadas | ⚠️ Básicas pero funcionales |
| **Base de datos** | ✅ Modelo completo, triggers OK | ✅ OK para demo |
| **E2 Hallazgos** | 6 defectos identificados | 🔴 3 críticos (pre-demo), 🟡 3 medianos (post) |

---

## 2. ¿QUÉ EXISTE YA? (9 puntos README)

**✅ IMPLEMENTADO (según E1 SRS-v3.md REALISTA):**

1. ✅ **Gestión de Incidencias** — CRUD completo (crear, leer, editar, eliminar soft)
2. ✅ **Gestión de Estados** — 3 estados (pending → in_progress → resolved)
3. ✅ **Asignación de Responsables** — claim/release endpoints funcionales (sin UI botones)
4. ✅ **Sistema de Comentarios** — modelo + endpoints (sin UI form)
5. ✅ **Ubicación Normalizada** — País → Provincia → Ciudad con PostGIS
6. ✅ **Clasificación Jerárquica** — Tipo → Subtipo (validation trigger)
7. ✅ **Notificaciones** — modelo listo (UI pendiente, backend OK)
8. ✅ **Prioridad y Control** — alta/media/baja, resolution_date automático
9. ✅ **Consultas/Filtros** — básicos por estado, tipo, ubicación

---

## 3. ¿QUÉ FALTA? (En frontend principalmente)

### 🔴 CRÍTICO (Antes de 04 May — 90 minutos)

**H-01: Campos `titulo`/`descripcion` en BD**
- **Problema:** Frontend envía campos validados, pero BD no procesa (desalineación)
- **Impacto:** Datos perdidos silenciosamente
- **Solución:** 1 migration que agrega columnas NOT NULL
- **Esfuerzo:** 30 min
- **¿Rompe demo?** No (agregar es forward-compatible)

**H-02: Rate-limiting login sin throttle**
- **Problema:** POST /login sin middleware, vulnerable a brute force
- **Impacto:** Riesgo seguridad, pero no afecta demo funcional
- **Solución:** 1 línea en routes/api.php `middleware('throttle:5,1')`
- **Esfuerzo:** 15 min
- **¿Rompe demo?** No

**H-03: Authorization sin resource-level Policy**
- **Problema:** JwtAuthenticate autentica, pero no verifica ownership (OperadorOrg vería datos de otra org)
- **Impacto:** Multitenant vulnerabilidad
- **Solución:** Crear IncidentPolicy + agregar authorize() en controller
- **Esfuerzo:** 45 min
- **¿Rompe demo?** Posible si hay múltiples orgs; bajo riesgo en dev

---

### 🟡 MEDIANO (Post-presentación, antes producción)

**H-04: Password complexity insuficiente**
- Solo min:8, sin regex
- **Solución:** Agregar regex (mayúscula, número, símbolo)
- **Timeline:** Post-May

**H-05: APP_DEBUG=true expone stack**
- .env tiene APP_DEBUG=true
- **Solución:** Asegurar APP_DEBUG=false en producción
- **Timeline:** Pre-deployment

**H-06: auto_assign_location() falla silenciosa**
- Trigger no maneja error si no hay polígonos en BD
- **Solución:** Mejorar trigger con RAISE WARNING + logging
- **Timeline:** Post-May (baja prioridad)

---

## 4. ¿QUÉ NECESITA UI? (Frontend, bajos para MVP)

**Sin botones/formularios en UI, pero endpoints existen:**

| Funcionalidad | Backend | Frontend UI | Impacto Presentación |
|---|---|---|---|
| **Claim/Release incidencia** | ✅ POST endpoints | ❌ Botones en detalle | Bajo (se puede demostrar via API) |
| **Agregar comentario** | ✅ POST endpoint | ❌ Formulario | Bajo (se puede editar BD manualmente) |
| **Cambiar estado** | ✅ PUT endpoint | ❌ Dropdown/botones | Medio (importante para demo) |
| **Asignar responsables** | ✅ POST endpoint | ❌ Modal/form | Bajo (claim ya cubre) |
| **Ver notificaciones** | ✅ GET endpoint | ❌ Campana/centro | Bajo (modelo OK) |

**Recomendación:** Agregar buttons claim/release + estado dropdown antes de demo (2-3 horas simple).

---

## 5. PLAN DE ACCIÓN (Priorizado)

### 🎯 FASE 1: CRÍTICOS (Antes de 04 May)

**Semana 1 (16-20 julio):**

```
TAREA 1: H-01 Migration (30 min)
  - Agregar title VARCHAR(100) NOT NULL
  - Agregar description VARCHAR(500) NOT NULL
  - migrate, test

TAREA 2: H-02 Rate-limiting (15 min)
  - routes/api.php: add middleware('throttle:5,1') to POST /login
  - Test: 6to intento en 1 min → HTTP 429

TAREA 3: H-03 Authorization Policy (45 min)
  - Create app/Policies/IncidentPolicy.php
  - Register in AuthServiceProvider
  - Add authorize('view', $incident) in controller
  - Test: OperadorOrg A vea su org, no la B

SUBTOTAL: ~90 minutos
```

**Testing post-FASE 1:**
- Demo user: login, crear incidencia, listar, filtrar → debe funcionar
- Verificar: título/descripción se guardan
- Verificar: rate-limiting funciona (6to intento rechazado)
- Verificar: user A no puede ver incidencias de user B

---

### 🎯 FASE 2: UI SIMPLE (Semana 2-3, opcional para demo)

**Si tienes 2-3 horas:**

```
BONUS: Agregar botones Claim/Release + cambiar estado
  - En incidencias/detail: botón "Tomar Incidencia" (POST /claim)
  - En incidencias/detail: dropdown "Cambiar Estado" (PUT /estado)
  - Efecto: demo se ve más completa

TIEMPO: 2-3 horas

RIESGO: Bajo (endpoints ya existen, solo UI)
```

---

## 6. ¿QUÉ ESTÁ BIEN Y NO TOCAR?

✅ **DEJAR COMO ESTÁ:**

- Base de datos (modelo OK, triggers funcionales)
- Arquitectura DDD backend (bien organizado)
- Autenticación JWT + Google (robusto)
- PostGIS geospatial (funciona)
- Soft deletes (implementado)
- Responsive layout (básico OK)
- Docker compose (funcional)

**NO hacer:** Refactores, optimizaciones, cambios cosméticos. Riesgo de romper 2 días antes de presentación.

---

## 7. CHECKLIST PRE-DEMO (04 May)

**72 horas antes (01 May):**

- [ ] H-01 migration ejecutada + incidencias guardan título/descripción
- [ ] H-02 rate-limiting en POST /login activo
- [ ] H-03 Policy autorización activa
- [ ] Backend tests pasan (al menos happy path)
- [ ] Frontend: login → dashboard → listar → crear → ver detalle
- [ ] Mapa interactivo funciona
- [ ] Filtros por estado/prioridad/ubicación funcionales
- [ ] Soft deletes funcionan
- [ ] Docker compose up sin errores

**24 horas antes (03 May):**

- [ ] Demo script escrito (qué mostrar en 10 min)
- [ ] Credenciales de acceso listas
- [ ] Screenshots capturadas
- [ ] Equipo ensayó demostración

**DEMO DAY (04 May):**

- [ ] Login Google funciona
- [ ] Crear 1 incidencia, cambiar estado, ver detalle
- [ ] Mostrar mapa + georreferenciación
- [ ] Explicar arquitectura DDD + triggers
- [ ] Resultado: "Sistema funcional para MVP de gestión de incidencias"

---

## 8. RESUMEN: "3 COSAS" para mejorar

**Si tuvieras que elegir 3 cosas SIMPLES antes de demo:**

1. 🔴 **H-01 Migration** (30 min) — Alinea BD con formulario
2. 🔴 **H-02 Throttle** (15 min) — Seguridad básica
3. 🟢 **Botones Claim/Release en UI** (90 min) — Demo más completa (opcional)

**Total: 90-180 minutos. Riesgo: NULO.**

---

## 9. DESPUÉS DE PRESENTACIÓN (May+)

**Post-demo roadmap (NO tocar antes de 04 May):**

- [ ] H-04: Password regex complexity
- [ ] H-05: APP_DEBUG=false en producción
- [ ] H-06: Mejorar trigger auto_assign_location
- [ ] UI: Form comentarios, gestión notificaciones, admin panel
- [ ] Performance: Índices GIST en geom, cache Redis optimization
- [ ] Testing: Suite completa (ahora solo manual)

---

## 10. DOCUMENTO TÉCNICO FINAL (Para presentar)

**Estructura simplificada para doc técnico (8-12 páginas):**

1. **Portada** (nombre, asignaturas, equipo, docentes)
2. **Descripción breve** (1 página: "Sistema de gestión de incidencias georreferenciadas con 3 estados")
3. **Arquitectura** (1 página: diagrama simple backend/frontend/DB/Docker)
4. **Funcionalidades implementadas** (2 páginas: tablas checklist ✅/❌)
5. **Base de datos** (1 página: modelo ER + descripción)
6. **Instrucciones ejecución** (1 página: docker-compose up, URLs, credenciales)
7. **Evidencias de calidad** (2 páginas: screenshots del sistema, hallazgos E2)
8. **Conclusiones** (0.5 página: qué aprendieron, integración de asignaturas)

**NO incluir:** Teoría, código fuente (en anexos), explicaciones de Laravel.

---

**CONCLUSIÓN:**

Tu proyecto está **40-50% avanzado y SEGURO para demo** (04 May).

**Antes de demo:** Resuelve H-01 + H-02 + H-03 (90 min, sin romper nada).

**En demo:** Muestra lo que existe bien (login, crear, listar, filtrar, mapa, estados, triggers). No prometas más.

**Post-demo:** Completa UI + resuelve H-04, H-05, H-06 + responsive design.

---

*Documento de diagnóstico realista. Sin promesas falsas, sin sobre-ingeniería. Hecho para ganar la presentación sin stress.*

**¿Comenzamos con H-01 (30 min)?**
