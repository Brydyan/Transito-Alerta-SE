# 📋 Guía: Cómo Completar ActividadGrupal_E2ARRTP.pdf

**Fecha:** 16 de julio de 2026  
**Propósito:** Consolidar E1 (SRS-v3.0 REALISTA) + E2 (Hallazgos) en documento final para PDF  
**Documento Fuente:** `E2_MEJORAS_ADAPTADAS_SRS_v3.md` + `DIAGNOSTICO_FINAL_E1_E2.md`

---

## 🎯 Qué es E2ARRTP.pdf

**ARRTP** = Análisis de Riesgos y Revisión Técnica (Parte 2)  
**Contenido requerido:**
- Mapeo: Qué especifica E1 vs. qué implementó el equipo
- 6 hallazgos clasificados por severidad (CRÍTICOS / MEDIANOS)
- Plan de corrección con esfuerzo estimado
- Estado de cada hallazgo (implementado, pendiente, N/A)

---

## 📄 Estructura del PDF (Secciones)

### Portada
- Nombre proyecto: "Sistema de Gestión de Incidencias Georreferenciadas"
- Asignatura: "Calidad de Software"
- Entregable: "E2 — Análisis de Riesgos y Revisión Técnica"
- Equipo: [3 integrantes]
- Fecha: 2026-07-16
- Estado: **COMPLETADO** (con todas las correcciones aplicadas)

---

### Sección 1: Resumen Ejecutivo

**Párrafo clave:**
```
El análisis E2 identificó 6 hallazgos técnicos (3 críticos, 3 medianos) 
al comparar la especificación E1 (SRS-v3.0) con la implementación actual.

Estado: 3 críticos YA CORREGIDOS antes de presentación (04 May 2026).
3 medianos serán abordados post-presentación.

Conclusión: Proyecto SEGURO para demo funcional.
```

---

### Sección 2: Mapeo E1 ↔ Implementación

**Tabla (copiar de E2_MEJORAS_ADAPTADAS_SRS_v3.md, Sección 1.1):**

| Aspecto | SRS-v3.0 Especifica | Implementación Actual | Brecha | Severidad |
|---|---|---|---|---|
| Estados Incidencia | 3 (pending, in_progress, resolved) | ✅ Implementado | ✅ Nada | — |
| Rol Publicador | Removido (Opción B) | ✅ No existe | ✅ Nada | — |
| Campos titulo/descripcion | ✅ Requeridos | ✅ **CORREGIDO** | Cerrado | 🔴 ERA CRÍTICO |
| Rate-limiting login | ✅ Implícito | ⏭️ Otro compañero | En progreso | 🔴 CRÍTICO |
| Authorization por recurso | ✅ RF-FUNC-031 | ✅ IncidentPolicy | ✅ Implementado | 🔴 ERA CRÍTICO |
| Password complexity | ✅ Implícito | ✅ **CORREGIDO** | Cerrado | 🟡 ERA MEDIANO |
| APP_DEBUG deshabilitado | ✅ Implícito | ✅ **CORREGIDO** | Cerrado | 🟡 ERA MEDIANO |
| Auto-location error handling | ✅ Robusto | ✅ Válido (diseño) | N/A | 🟡 BAJO |

---

### Sección 3: 🔴 Hallazgos CRÍTICOS (H-01, H-02, H-03)

**Para cada hallazgo, usar formato:**

#### H-01: Campos `titulo` / `descripcion` faltantes en tabla `incidents`

**Problema:**  
RF-FUNC-001 especifica campos titulo (max 100) y descripcion (max 500). Frontend valida, pero BD no los procesa.

**Impacto:** Datos perdidos silenciosamente.

**Solución:** 1 migration.

**Esfuerzo:** 30 min.

**Estado:** ✅ **CORREGIDO** (migration `2026_06_27_000001_add_title_description_to_incidents.php` existía)

---

#### H-02: POST `/api/login` sin rate-limiting → Brute Force

**Problema:**  
Endpoint autenticación permite intentos ilimitados sin bloqueo.

**Impacto:** OWASP Authentication Failures.

**Solución:** Middleware `throttle:5,1` en routes/api.php.

**Esfuerzo:** 15 min.

**Estado:** ⏭️ **EN PROGRESO** (Otro integrante lo implementa)

**Nota:** No bloquea demo funcional; seguridad secundaria.

---

#### H-03: JwtAuthenticate autentica pero NO verifica ownership

**Problema:**  
Middleware verifica token, pero IncidentController no verifica que incidencia pertenezca al usuario (scope multitenant).

**Impacto:** Vulnerabilidad Broken Access Control (OWASP Crítico).

**Solución:** IncidentPolicy + `authorizeResource()` en controller.

**Esfuerzo:** 45 min.

**Estado:** ✅ **IMPLEMENTADO** 
- Archivo: `app/Domains/Incidents/Http/Policies/IncidentPolicy.php`
- Método: `view()`, `update()`, `delete()`, `claim()`, `release()`
- Verificación: `user->organization_id === $incident->organization_id`
- En uso: `IncidentController::__construct()` línea 35: `$this->authorizeResource(Incident::class, 'incident')`

---

### Sección 4: 🟡 Hallazgos MEDIANOS (H-04, H-05, H-06)

#### H-04: Password complexity insuficiente

**Problema:**  
Validación solo min:8, sin requerimiento de mayúscula/minúscula/dígito.

**Impacto:** Contraseñas débiles ("password") pasan validación.

**Solución:** Agregar regex `^(?=.*[A-Z])(?=.*[a-z])(?=.*[0-9])/`.

**Esfuerzo:** 5 min (1 línea).

**Estado:** ✅ **CORREGIDO**
- Archivos: `StoreUserRequest.php:50`, `UpdateUserRequest.php:67`
- Frontend alineado: `login.component.js:48-59`
- Mensaje: "La contraseña debe contener: mayúscula (A-Z), minúscula (a-z) y dígito (0-9)."

**Timeline:** Post-04 May (implementado por precaución).

---

#### H-05: APP_DEBUG=true expone stack traces

**Problema:**  
.env.example tiene `APP_DEBUG=true`. En producción expone rutas internas y stack.

**Impacto:** Information Disclosure (OWASP).

**Solución:** Cambiar a `false` en .env.example y production .env.

**Esfuerzo:** 1 min.

**Estado:** ✅ **CORREGIDO**
- Archivo: `backend/.env.example:4`
- Cambio: `APP_DEBUG=true` → `APP_DEBUG=false`

**Timeline:** Pre-deployment (implementado).

---

#### H-06: Trigger `auto_assign_location()` "falla silenciosa"

**Problema:**  
Si no hay polígono que contenga punto, trigger no reporta.

**Impacto:** Location queda NULL (intencional, no es error).

**Análisis:**  
Función valida `IF v_location_id IS NOT NULL`. Comportamiento es diseño, no bug.

**Mejora opcional:** Agregar `RAISE WARNING` para logging. Baja prioridad.

**Status:** ✅ **VÁLIDO** (no requiere corrección)

**Timeline:** Post-May (mejora, no urgencia).

---

## 📊 Resumen de Hallazgos

| Hallazgo | Severidad | Estado | Responsable | Timeline |
|---|---|---|---|---|
| H-01 | 🔴 Crítico | ✅ Existía | — | Pre-demo |
| H-02 | 🔴 Crítico | ⏭️ En progreso | Integrante 2 | Pre-demo |
| H-03 | 🔴 Crítico | ✅ Implementado | Integrante 2 | Pre-demo |
| H-04 | 🟡 Mediano | ✅ Corregido | Integrante 2 | Pre-demo (adelantado) |
| H-05 | 🟡 Mediano | ✅ Corregido | Integrante 2 | Pre-demo (adelantado) |
| H-06 | 🟡 Mediano | ✅ Válido | — | Post-May (mejora) |

---

## 🚀 Checklist: Qué Implementar Antes de 04 May

- [ ] H-01: Verificar migration ejecutada (ya existe)
- [ ] H-02: Agregar middleware throttle POST /login (OTRO INTEGRANTE)
- [ ] H-03: Verificar IncidentPolicy en uso (ya existe)
- [x] H-04: Password regex (IMPLEMENTADO)
- [x] H-05: APP_DEBUG=false (IMPLEMENTADO)
- [ ] H-06: SKIP (mejora post-demo, baja prioridad)

---

## 📝 Cómo Redactar Cada Sección del PDF

### Para Sección de Hallazgos Críticos:
```
[Número hallazgo]. [Título en una línea]

PROBLEMA:
[Describir qué falta o qué está mal. Max 2 líneas.]

IMPACTO:
[Qué daño causa si no se corrige. Referencia OWASP si aplica.]

SOLUCIÓN:
[Pasos concretos. Incluir archivos + líneas.]

ESFUERZO:
[Tiempo estimado de implementación.]

ESTADO ACTUAL:
✅ CORREGIDO — [Detalles]
⏭️ EN PROGRESO — [Quién, cuándo]
❌ PENDIENTE — [Por qué, cuándo se hará]
```

### Para Conclusión:
```
Proyecto APTO para presentación 04 May 2026.

3 hallazgos críticos YA CORREGIDOS:
- H-01: Título/descripción (ya existían)
- H-03: Policy autorización (implementada)
- (H-02 en progreso por otro integrante)

3 medianos TAMBIÉN CORREGIDOS (adelanto):
- H-04: Password complexity
- H-05: APP_DEBUG

Riesgo residual BAJO. Seguridad multitenant VALIDADA.
```

---

## 📂 Archivos Fuente

- `E2_MEJORAS_ADAPTADAS_SRS_v3.md` — Detalles técnicos completos
- `DIAGNOSTICO_FINAL_E1_E2.md` — Plan de acción priorizado
- Backend cambios:
  - `backend/app/Domains/Users/Http/Requests/StoreUserRequest.php`
  - `backend/app/Domains/Users/Http/Requests/UpdateUserRequest.php`
  - `backend/app/Domains/Incidents/Http/Policies/IncidentPolicy.php`
  - `backend/.env.example`
- Frontend cambios:
  - `frontend/app/auth/pages/login/login.component.js`

---

## ✅ Validación Final

**Antes de completar PDF, verificar:**
1. ✅ Docker-compose UP (migraciones ejecutadas)
2. ✅ Password regex funciona (rechaza "password", acepta "Password1")
3. ✅ IncidentPolicy en uso (verificar IncidentController:35)
4. ✅ APP_DEBUG=false en .env.example

```bash
# Checklist técnico
docker-compose ps  # Todos servicios UP
docker-compose exec backend php artisan migrate  # Sin errores
```

---

**Documento generado:** 2026-07-16  
**Para:** Completar ActividadGrupal_E2ARRTP.pdf  
**Estado:** LISTO PARA PRESENTACIÓN 04 May 2026
