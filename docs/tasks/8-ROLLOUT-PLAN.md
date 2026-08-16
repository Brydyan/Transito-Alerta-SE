# 8: Rollout en Producción y Monitoreo

## Opciones de Estrategia de Rollout

### Opción A: Big Bang (Recomendada para 25k usuarios)
**Riesgo**: Alto, pero recuperación más rápida si se detectan problemas temprano  
**Cronograma**: Ventana de mantenimiento única de 30 min  
**Proceso**:
1. 22:00 Vie: Deshabilitar API Laravel (página de mantenimiento)
2. 22:05: Aplicar migraciones de BD pendientes (0009-0010 si no hechas)
3. 22:10: Boot cluster NestJS API (2-3 instancias)
4. 22:15: Ejecutar pruebas de smoke (health, login, creación de incident)
5. 22:30: Cambiar load balancer: Laravel → NestJS
6. 22:30+: Monitorear durante 4 horas (ventana crítica)

**Pros**: Simple, cutover único  
**Contras**: 30 min de downtime visible para usuarios

---

### Opción B: Blue-Green (Más segura, Zero Downtime)
**Riesgo**: Bajo, costo de infraestructura paralela  
**Cronograma**: 2-3 días  
**Proceso**:
1. Desplegar NestJS v2 a cluster separado (Green) durante 1 día
2. Ejecutar E2E completo + load test contra Green + datos de producción en vivo
3. Load balancer divide tráfico: 90% Blue (Laravel), 10% Green (NestJS)
4. Monitorear durante 4 horas (ambas pilas ejecutándose)
5. Si todo verde: cambiar a 100% Green
6. Mantener Blue ejecutándose 24h para rollback (si necesario)

**Pros**: Zero downtime visible para usuarios, rollback fácil  
**Contras**: Ejecuta dos pilas durante 1-2 días (costo de infraestructura más alto)

---

### Opción C: Canary (Medido, Progresivo)
**Riesgo**: Medio (adopción progresiva)  
**Cronograma**: 1 semana  
**Proceso**:
1. Día 1: Rutear 10% tráfico a NestJS v2, monitorear
2. Día 2: Si estable, 25% tráfico
3. Día 3-4: 50% tráfico
4. Día 5: 100% tráfico
5. Día 6-7: Mantener Laravel como fallback

**Pros**: Exposición de riesgo gradual, detección temprana de error  
**Contras**: Lógica de routing compleja, ventana de migración más larga

---

## Recomendación: **Opción B (Blue-Green)**

**Rationale**: 
- Zero downtime para 25k usuarios (mejor UX)
- Rollback fácil si se descubren bugs críticos post-switch
- Testing en paralelo contra datos de producción (confianza alta)
- Supabase base de datos única soporta escritura dual-stack (sin complejidad dual-write)

---

## Checklist Pre-Rollout (Semana Anterior)

### Preparación Backend
- [ ] Todos los 16 módulos NestJS desplegados a staging
- [ ] E2E tests pasando (todos los 4 workflows + 9 regresiones)
- [ ] Load test pasado (25k usuarios concurrentes, p95 < 200ms)
- [ ] Security tests pasados (SQL injection, CORS, rate limiting)
- [ ] Migraciones de BD 0001-0016 aplicadas a staging

### Preparación Frontend
- [ ] Llamadas HTTP reconfiguradas a endpoints NestJS
- [ ] Parsing de JWT actualizado (nombres de claims validados)
- [ ] Conexión WebSocket a namespace `/incidents` probada
- [ ] Todos los flujos CRUD probados (Postman + Playwright)
- [ ] Lógica de sincronización de cola offline actualizada (si aplica)

### Infraestructura
- [ ] Bases de datos Supabase staging + producción con esquema idéntico
- [ ] PostgreSQL 16 + PostGIS 3.4 verificados en producción
- [ ] Instancias Redis para caché + Streams configuradas
- [ ] Load balancer Nginx listo para switch (setup Blue/Green)
- [ ] Alertas de monitoreo configuradas (tasa de error, latencia, drops de WebSocket)
- [ ] Logging centralizado (Sentry, DataDog, o similar)

### Documentación
- [ ] Runbook escrito (pasos rollout, procedimiento rollback)
- [ ] Equipo entrenado en procedimiento de switching
- [ ] Ingeniero on-call asignado para 48h post-rollout
- [ ] Plan de comunicación listo (notificación al usuario en mantenimiento)

---

## Día de Rollout (Opción B Blue-Green)

### Fase 1: Despliegue Green + Warm-Up (8:00–12:00)
1. **08:00**: Desplegar NestJS v2 a cluster Green (2 replicas)
2. **08:15**: Aplicar migraciones a BD staging (test solo, revertir después)
3. **08:30**: Ejecutar suite E2E contra Green (validación de flujo completo)
4. **09:00**: Habilitar dashboards de monitoreo (comparar métricas Blue vs Green)
5. **09:30**: Load test cluster Green (100 usuarios concurrentes, ramp a 1k)
6. **10:00**: Generar tráfico sintético (crear 100 incidents/min via k6)
7. **12:00**: Green estable, sin picos de error, latencia p95 aceptable

### Fase 2: Split de Tráfico (12:00–16:00)
1. **12:00**: Actualizar load balancer: 90% Blue, 10% Green
2. **12:05**: Monitorear tasa de error, latencia (ambas pilas)
3. **13:00**: Si estable: 25% Green, 75% Blue
4. **14:00**: Si estable: 50% Green, 50% Blue
5. **15:00**: Si estable: 75% Green, 25% Blue
6. **16:00**: Cambiar a 100% Green (si sin errores)

### Fase 3: Rollback-Ready (16:00–20:00)
1. **16:00**: Mantener Blue ejecutándose (no apagar)
2. **16:05–20:00**: Monitorear Green bajo carga de producción
   - Tasa de error (objetivo: < 0.5%)
   - Latencia p95 (objetivo: < 200ms)
   - Conexiones WebSocket (objetivo: 5k por instancia)
   - Lag de consulta de BD (objetivo: < 50ms)

### Fase 4: Limpieza (20:00+)
1. **20:00**: Si Green estable 4+ horas, declarar éxito
2. **20:00–24:00**: Mantener Blue caliente (proceso runtime, pero sin tráfico)
3. **Día siguiente**: Apagar cluster Blue (ahorrar costo)

---

## Trigger Crítico de Rollback

**Si alguno de estos ocurre dentro de 4 horas post-switch, rollback a Blue inmediatamente**:
- Tasa de error > 5% durante 10+ min
- Latencia p95 > 500ms (2.5x normal)
- Conexiones de BD agotadas (pgBouncer full)
- Stream de WebSocket roto (fallo del adaptador socket.io)
- Dominio Payment/Auth corrompido (problema de integridad de datos)

**Pasos de Rollback**:
1. Actualizar load balancer: Green → Blue (< 1 min)
2. Monitorear recuperación de Blue (debe inmediato, usuarios reconectan)
3. Investigar error logs (post-mortem)
4. Arreglaar bug + re-testear en staging (1+ hora)
5. Reintentar rollout día siguiente (si fix validado)

---

## Monitoreo Post-Rollout (48 Horas)

### Hora 1-4 (Crítica)
- [ ] Tasa de error estable (< 0.5%)
- [ ] Latencia p95 aceptable (< 200ms)
- [ ] Conexiones WebSocket sostenidas
- [ ] Sin violaciones de restricción de BD
- [ ] Sin deletes en cascada inesperado (auditoría intacta)

### Hora 4-24 (Extendida)
- [ ] Picos de tráfico sostenidos (tarde, noche)
- [ ] Tasa de hit de caché > 80%
- [ ] Sin memory leaks (memoria de proceso Node estable)
- [ ] Sin backlog de trabajos en background (cola mail vacía, notificaciones enviadas)

### Hora 24-48 (Estabilización)
- [ ] Patrones de tráfico nocturno normales
- [ ] Carga de pico matutino manejada
- [ ] Sin degradación de carga sostenida
- [ ] Confianza del equipo alta (sin hotfixes necesarios)

---

## Criterios de Éxito

- [ ] Zero downtime visible para usuarios (enfoque Blue-Green)
- [ ] Todos los 4 workflows principales verificados en producción
- [ ] Tasa de error < 0.5%, latencia p95 < 200ms sostenida
- [ ] Monitoreo post-rollout 48h completado
- [ ] Cero corrupción de datos o incidentes perdidos
- [ ] Preparación del equipo para launches futuras de Fase 4

---

## Refinamientos Post-Launch (Fase 4+)

### Semana 1 Post-Launch
- Analizar error logs para problemas de baja severidad
- Tuning de performance (TTLs de caché, optimización de consultas)
- Recopilación de feedback del usuario

### Semana 2-4
- Finalizar documentación (contrato API, runbook de despliegue)
- Hardening de seguridad (rate limits adicionales, validación de entrada)
- Validación de load testing (confirmar techo de 25k usuarios se mantiene bajo carga sostenida de semana larga)

### Mes 2+
- Validación de paridad de features (todas las features de GeoReporta funcionales)
- Optimización de costo (reducir infraestructura no usada)
- Planificar Fase 4 security + load testing (T4.2-T4.4)
