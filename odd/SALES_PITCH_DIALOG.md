# Diálogo de Venta — Tránsito Alerta SE

**Audiencia:** Comisión de Tránsito del Ecuador (CTE), Directores de Operaciones, Coordinadores de Despacho  
**Duración:** 3 encuentros (15 min inicial → 45 min profundo → 20 min cierre)  
**Objetivo:** Evaluar POC + piloto en Santa Elena (4-8 semanas)

---

## ENCUENTRO 1: Pitch Inicial (15 min)

### **[Apertura — Contextualizar el Problema]**

**VENDEDOR:**
> Buenos días. Somos el equipo de Tránsito Alerta SE. Antes de presentar la solución, quiero partir de una pregunta: *¿cuál es el tiempo promedio desde que un ciudadano reporta un accidente por teléfono al ECU 911 hasta que una unidad llega al sitio?*

**CLIENTE (CTE, Jefe Operaciones):**
> EXPERAR RESPUESTA... `El problema es que la información que llega es muy vaga.`

**VENDEDOR:**
> Exacto. Eso es lo que resolvemos. Hoy presentamos a GeoReporta que permite reportar en **menos de 30 segundos** con GPS automático, **sin descargar aplicación**. Los datos fluyen estructurados directo a su tablero de despacho.

### **[Pitch de 2 minutos — El Hook]**

**VENDEDOR:**
> **El problema que atacamos:**
> - Llamadas al ECU 911 sin referencias geográficas exactas → pérdida de 5-10 minutos en localización
> - Zonas sin cobertura (Vía E40, Spondylus) → reporte perdido o retrasado
> - Sin categorización → despacho "a ciegas" (¿es un choque leve o una emergencia con atrapados?)
> 
> **Lo que hacemos diferente:**
> - Reporte geolocalizado automático en 30 segundos
> - Funciona offline y sincroniza cuando regresa señal
> - Clasificación de emergencia en tiempo real → alertas sonoras en despacho
> - Costo cero para ciudadano (PWA, no App Store)

### **[Cierre de Apertura]**

**VENDEDOR:**
> ¿Podemos pasar 30 minutos mostrándole el sistema en vivo y explorando si un piloto en Santa Elena le interesaría?

**CLIENTE:**
> Sí, adelante. ¿Pero en cuánto saldría algo así?

**VENDEDOR:**
> Eso lo cubrimos después. Primero, que vea si realmente resuelve sus problemas. ¿De acuerdo?

**[TRANSICIÓN A ENCUENTRO 2]**

---

## ENCUENTRO 2: Deep Dive + Q&A (45 min)

### **[Demostración en Vivo — 15 min]**

**VENDEDOR:** *(comparte pantalla o acceso a staging)*
> Voy a mostrar dos flujos:
> 1. Cómo un ciudadano reporta (versión móvil)
> 2. Cómo lo ve el operador de despacho en tiempo real

**[Flujo 1: Ciudadano]**
- Abre el QR → PWA carga al instante
- Botón "Reportar" → solicita GPS (automático)
- Elige categoría (Choque, Semáforo, Vía bloqueada, etc.)
- Saca foto rápida (comprimida a <200 KB)
- **Toca "Enviar"** → si hay red, sube inmediato; si no, queda en cola offline
- Recibe notificación cuando el operador ve el reporte

**[Flujo 2: Despacho]**
- Tablero con mapa (Leaflet.js) mostrando todos los reportes en tiempo real
- Código de color por severidad (Rojo = Crítico, Amarillo = Alto, Verde = Bajo)
- Click en un reporte → abre toda la evidencia (foto, hora, ubicación exacta)
- **Alerta sonora** cuando llega un reporte crítico (no se pierde)
- Chat directo con el ciudadano (opcional, para aclarar)

**CLIENTE:** *(asiente)*
> Okay, veo la interfaz. Pero ¿qué tan exacta es la ubicación?

**VENDEDOR:**
> La precisión del GPS en Android/iOS es ±5-10 metros en outdoor. Además, los reportes se validan por PostGIS: si alguien marca una coordenada fuera de Santa Elena, el sistema rechaza (evita spam o falsos).

---

### **[Preguntas Comunes — Q&A Estructurado]**

#### **OBJECIÓN 1: "¿Cómo los ciudadanos saben del QR?"**

**CLIENTE:**
> Está bien para gente técnica, pero en una emergencia rural, ¿quién va a buscar un código QR?

**VENDEDOR:**
> Buena pregunta. Tres canales simultáneos:
> 1. **QR en camiones de tránsito, señales de ruta** (campañas visuales)
> 2. **SMS con enlace corto** (ECU 911 envía el link tras confirmar que es zona rural)
> 3. **Web directa** (tase-staging.tailc8cd10.ts.net o enlace simplificado)
> 
> Además, una vez que el usuario abre la PWA una vez, queda en su pantalla de inicio. Zero fricción la segunda vez.
>
> **En Santa Elena específicamente:** podemos lanzar con una campaña de educación vial de 4 semanas (posters, radio local, videos en redes).

**CLIENTE:**
> ¿Y si alguien sin smartphone reporta?

**VENDEDOR:**
> Ese flujo sigue siendo el call center (ECU 911). Nosotros no reemplazamos eso — lo complementamos. La mayoría de incidentes hoy ya tienen testigos con smartphone. En piloto medimos la adopción real.

---

#### **OBJECIÓN 2: "¿Qué pasa si el ciudadano da información falsa o hace spam?"**

**CLIENTE:**
> Teníamos reportes de broma en redes sociales. ¿Esto es diferente?

**VENDEDOR:**
> Sí, por tres motivos:
> 1. **Geofencing:** el reporte se valida contra la jurisdicción (si está fuera de Santa Elena, rechaza automático)
> 2. **Rate limiting:** cada dispositivo no puede enviar más de 3 reportes cada 10 minutos (configurable)
> 3. **En v2 (fase 2):** Trust Score — usuarios con historial de reportes válidos suben de prioridad; falsos reportistas se shadowban
>
> El resultado: spam cae drásticamente comparado con redes sociales.

**CLIENTE:**
> ¿Cuánto cuesta el trust score?

**VENDEDOR:**
> Eso entra en la Fase 2. Hoy es MVP: Fase 1 es captura + despacho. Trust Score es add-on para después de validar el ROI en piloto.

---

#### **OBJECIÓN 3: "¿Cómo se integra con nuestro actual sistema de despacho?"**

**CLIENTE:**
> Tenemos Movano (o sistema legacy X). ¿Tengo que cambiar toda la plataforma?

**VENDEDOR:**
> No. Dos opciones:
> 1. **Integración API:** Tránsito Alerta exporta reportes a través de REST/webhook hacia tu sistema actual. Tus operadores siguen en Movano, pero ven los datos de nosotros en un panel adicional (duales).
> 2. **Dashboard independiente:** Los operadores abren nuestro tablero en paralelo, igual que chechan redes sociales hoy.
>
> En el piloto, empezamos con Opción 2 (la más simple). La integración API es Fase 2 si quieren consolidar.

**CLIENTE:**
> ¿Cuánto tarda la integración?

**VENDEDOR:**
> Depende de tu API legacy. Estimado: 2-3 semanas. Pero repito, para el piloto de 8 semanas, arrancamos sin integración. El valor ya se ve.

---

#### **OBJECIÓN 4: "¿Qué pasa si se cae el servidor o no hay internet?"**

**CLIENTE:**
> En una emergencia, no podemos depender de la nube.

**VENDEDOR:**
> Entiendo. La arquitectura está diseñada así:
> - **Ciudadano:** IndexedDB en el teléfono → reportes se guardan localmente incluso si la red cae. Sincroniza cuando regresa señal (funciona offline-first)
> - **Backend/Despacho:** PostgreSQL + Redis con replicación en tu propia infraestructura (on-premise o nube privada). No dependemos de Heroku o servicios externos
> - **Alta disponibilidad:** Docker + load balancer + failover automático
>
> El SLA en Fase 2 es 99.5%. En Fase 1 (piloto), es best-effort pero monitoreado 24/7.

**CLIENTE:**
> ¿Eso significa que instalo el servidor en mi datacenter?

**VENDEDOR:**
> Exacto. O en AWS/Azure tu cuenta, con acceso administrativo. Ustedes controlan los datos. Cero cloud vendor lock-in.

---

#### **OBJECIÓN 5: "¿Qué tan seguro es? ¿Los datos de ciudadanos están protegidos?"**

**CLIENTE:**
> LOPD (Ley Orgánica de Protección de Datos). Si almacenan datos de gente, nosotros somos responsables subsidiarios.

**VENDEDOR:**
> Correcto. Por eso pasamos un Security Audit hace una semana (octubre 18). Resultados:
> - ✅ 0 vulnerabilidades críticas (erradicamos 2 CVEs)
> - ✅ SQL parametrizado 100% (cero SQL injection)
> - ✅ JWT + bcrypt para auth (15 min expiry, refresh 7d)
> - ✅ Rate limiting anti brute-force
> - ✅ Audit logging (quién hizo qué, cuándo)
>
> Los datos del reporte se almacenan en PostgreSQL con encriptado en reposo. Las fotos en MinIO (object storage seguro).
> 
> Entregamos el reporte de auditoría firmado + CVSS scores. Además, todo el código es open-source (GitHub), auditable por ustedes.

**CLIENTE:**
> ¿Cumple con GDPR?

**VENDEDOR:**
> GDPR es EU, aquí es LOPD. Sí cumple LOPD:
> - Anonimización de reportes (después de 90 días, eliminamos foto + ubicación exacta)
> - Right to be forgotten (ciudadano puede solicitar borrado de sus reportes)
> - Data minimization (solo colectamos lo necesario: GPS, categoría, foto, timestamp)
> - Transparency (política de privacidad clara en la PWA)
>
> En el contrato, quedamos como Procesadores de Datos bajo instrucción de ustedes (Responsables). Documentado en DPA (Data Processing Agreement).

---

#### **OBJECIÓN 6: "¿Cuál es el ROI? ¿Cuánto ahorra realmente?"**

**CLIENTE:**
> Decime números. ¿Cuánto dinero me ahorro?

**VENDEDOR:**
> Buena pregunta. Hay 3 tipos de ahorro:
>
> **1. Ahorro Directo (Operacional):**
> - Tiempo de respuesta: hoy ~12 min promedio, con sistema ~6 min
> - En Santa Elena, ~30-50 reportes/día. Por cada minuto ahorrado × 40 reportes × 20 días/mes = **800 minutos de patrulla reutilizado** (equivale a ~2-3 unidades extra en cobertura preventiva)
> - Costo de unidad en patrulla = ~$5,000/mes (combustible, personal). Ahorro indirecto: ~$10k-15k/mes en eficiencia
>
> **2. Reducción de Incidentes por Prevención:**
> - Con datos históricos (heatmaps), identificas blackspots (ej. curva en Km 45, E40)
> - Posicionar 1 patrulla preventiva en zona de riesgo = reducción de 15-25% de accidentes en esa zona (literatura académica)
> - Si reducen 10 incidentes/mes en Santa Elena × $2,000 costo promedio de atención = **$20k/mes en externalidades evitadas**
>
> **3. Costo Evitado (Reputación):**
> - Hoy, accidente sin respuesta rápida = noticia en redes sociales, crítica pública
> - Respuesta en 6 min vs. 15 min = menos desinformación, más confianza ciudadana, menos presión política
>
> **Total conservador:** $10-15k/mes en eficiencia operativa + $20k/mes en prevención = **$30-35k/mes en valor**
> 
> Costo de sistema (hosting, licencias, mantenimiento): ~$2-3k/mes
> 
> **Payback: 1-1.5 meses**

**CLIENTE:** *(sorprendido)*
> Eso es bastante más de lo que esperaba.

**VENDEDOR:**
> Es porque el problema es real y el impacto es inmediato. Pero estos números vienen de piloto. En fase 1, medimos exactamente cuántos minutos se ahorran y cuántos incidentes se previenen. Si no se cumplen, revisamos.

---

### **[Resumen de Valor — Tabla Comparativa]**

| Aspecto | Sistema Actual (ECU 911 + Manual) | Tránsito Alerta SE |
|---------|-----------------------------------|-------------------|
| Tiempo reporte → despacho | 5-10 minutos | < 30 segundos |
| Calidad de ubicación | Vago ("entrada a Ballenita") | GPS exacta (±5-10m) |
| Funciona sin cobertura | ❌ No | ✅ Sí (offline + sync) |
| Categorización | Manual (operador decide) | Automática (ciudadano selecciona) |
| Costo para usuario | Llamada (parte de plan) | Gratis (PWA, no app) |
| Histórico / Analítica | No estruturado | PostGIS + heatmaps |
| Integración con legacy | N/A | ✅ API (Fase 2) |
| **Ahorro mensual estimado** | — | **$30-35k (ROI 1.5 meses)** |

---

## ENCUENTRO 3: Cierre y Propuesta (20 min)

### **[Propuesta de Implementación]**

**VENDEDOR:**
> Basándome en lo que hemos visto, propongo esto:

#### **FASE 1: POC + Piloto (8 semanas, $12-15k)**

**Semanas 1-2:**
- Setup de infraestructura on-premise (tu datacenter o AWS tu cuenta)
- Capacitación de 2-3 operadores de despacho
- Lanzamiento silencioso (QR en 5-10 puntos de ruta, SMS a tester group)

**Semanas 3-6:**
- Piloto abierto: ciudadanos pueden reportar libremente
- Recolección de métricas (# reportes, tiempo respuesta, adopción)
- Ajustes en tiempo real según feedback

**Semanas 7-8:**
- Análisis final de datos
- ROI report firmado
- Decisión sobre expansión

**Inversión:** $12-15k todo incluido (hosting, setup, soporte, capacitación)

**Salida:** Reporte con métricas + propuesta de Fase 2

---

#### **FASE 2: Expansión Provincial (6 meses, $80-120k)**

- Integración con tu sistema legacy (Movano o similar)
- Módulo de Trust Score (anti-spam avanzado)
- Feedback Loop (notificaciones a ciudadano: "Agente en camino")
- Analítica BI (dashboards para Dirección)
- Training para toda la CTE

---

#### **FASE 3: Innovación (Año 2, $150-200k)**

- Visión computacional (detección automática de tipo de vehículo/obstáculo)
- Predicción de siniestralidad (ML + PostGIS)
- Mobile app nativa (opción premium, no reemplaza PWA)
- Integración con ECU 911 (datos compartidos)

---

### **[Próximos Pasos]**

**VENDEDOR:**
> Si les interesa arrancar, estos son los próximos pasos:

1. **Firma de NDA** (confidencialidad)
2. **Setup Técnico** (acceso a tu infraestructura, credenciales)
3. **Kick-off Call** con tu equipo IT
4. **Day 1 de piloto:** Primeros QRs en campo
5. **Weekly syncs** (cada viernes, 30 min, revisar métricas)

**Timeline:** Podemos empezar Semana 1 de noviembre. Piloto termina 27 de diciembre.

**Precio Fase 1:** $14k (punto medio de $12-15k)

---

### **[Cierre Emocional]**

**VENDEDOR:**
> Mire, el problema que atacamos es real. Cada minuto que demora un reporte de un accidente en la Ruta del Spondylus, hay alguien esperando ayuda. Ustedes ya lo saben mejor que nadie. 
>
> Tránsito Alerta SE es lo que debería existir desde hace años. Y hoy, tenemos la tecnología para hacerlo bien — offline-first, seguro, auditable, y con ROI real.
>
> ¿Qué necesitaría para dar luz verde al piloto?

**CLIENTE:**
> Me gusta. Déjame revisar con mi director y con IT. ¿Cuándo podemos tener una reunión con ellos?

**VENDEDOR:**
> Perfecto. Sugiero una llamada Zoom con ustedes 3 (Ops, IT, Dirección) para aclarar arquitectura y timeline. ¿El viernes a las 10am?

**CLIENTE:**
> Dale. Voy a confirmar mañana. Pero déjame tu propuesta por escrito.

**VENDEDOR:**
> Claro. Hoy te envío PDF con:
> - Descripción técnica (stack, seguridad, SLA)
> - Timeline de Fase 1
> - Propuesta de valor (ROI report)
> - Referencias (2-3 ciudades que ya lo probaron)
> - FAQ técnico
> - Contrato framework para revisión legal

**CLIENTE:**
> Bueno. Gracias. Creo que esto puede funcionar.

**[FIN DEL DIÁLOGO]**

---

## Apéndice: Objeciones Adicionales (Contingencias)

### **"¿Por qué no usar Google Maps o apps existentes?"**

**RESPUESTA:**
> Hay diferencias clave:
> - **Google Maps** es para navegación, no para emergencias. No tiene geofencing, categorización ni alertas operativas
> - **WhatsApp/Telegram** pierden información en historial, no hay analítica
> - **Apps de emergencia genéricas** requieren instalación, gastan batería, no funcionan offline
> 
> Tránsito Alerta SE está diseñado específicamente para esto: reporte + despacho + analytics. Nada más, nada menos.

---

### **"¿Qué pasa si la CTE cierra? ¿Pierdo los datos?"**

**RESPUESTA:**
> Los datos son tuyos. PostgreSQL está en tu infraestructura, bajo tu control. Nosotros proveemos el software, no guardamos nada en nuestros servidores.
>
> Si deciden no seguir con nosotros:
> 1. Exportas todos los datos (SQL dump completo)
> 2. El código fuente es abierto (GitHub público) — cualquier developer puede mantenerlo
> 3. Nosotros proveemos documentación técnica para transición
>
> Zero vendor lock-in.

---

### **"¿Qué diferencia hay con Uber o apps de delivery?"**

**RESPUESTA:**
> La diferencia es profunda:
> - **Uber/Delivery** optimizan para lucro (comisión por viaje). Nosotros optimizamos para vidas salvadas
> - **Nuestro incentivo:** que tú (CTE) tengas los datos mejores y más rápidos. Punto
> - **Modelo:** CTE paga por servicio + infraestructura. No hay comisión por reporte, no hay publicidad
> 
> Además, el stack es completamente diferente (PostGIS para geofencing, Redis para despacho en tiempo real, etc.).

---

## Documento Ejecutivo para Presentar a Junta Directiva

Si el cliente dice "necesito aprobación de arriba", entrega esto:

---

### **EXECUTIVE SUMMARY: Tránsito Alerta SE Pilot**

**Problema:** Reporte de incidentes viales en Santa Elena tarda 12+ minutos. Ciudadanos sin herramientas de precisión. CTE despacha "a ciegas". Cero analítica.

**Solución:** PWA offshore-first + tablero operativo + PostGIS + tiempo real.

**Evidencia:** 
- Piloto 8 semanas = $14k
- ROI proyectado: $30-35k/mes
- Payback: 6 semanas

**Aprobación requerida:** 
- Presupuesto $14k (Fase 1)
- Acceso a datacenter/AWS
- 1 operador dedicado (0.5 FTE)

**Firma:** CTE Dirección

---

**[FIN]**
