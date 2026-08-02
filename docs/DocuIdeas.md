# Ficha Técnica de Proyecto: Tránsito Alerta SE

### 1. Generalidades del Proyecto

| Parámetro | Detalle |
| --- | --- |
| **Nombre del Proyecto** | Tránsito Alerta SE (Sistema Web de Gestión Participativa de Incidencias Viales) |
| **Eje de Acción** | Desarrollo Web / Innovación Tecnológica Comunitaria |
| **Ubicación** | Cantón Santa Elena, Provincia de Santa Elena |
| **Beneficiarios Directos** | Conductores, peatones y la Comisión de Tránsito / Agentes de control vial local |
| **Beneficiarios Indirectos** | Turistas y población general de la franja costera y zonas rurales |
| **Modalidad Técnica** | Aplicación Web Progresiva (PWA) de código abierto (*Open Source*) |

---

### 2. Justificación y Diagnóstico del Problema

En el cantón Santa Elena, la infraestructura vial soporta tanto el transporte local como un alto flujo turístico interprovincial. Actualmente, la gestión de incidencias en las vías (accidentes, fallas en semáforos, bloqueos por derrumbes o presencia de animales) sufre de un **cuello de botella de información**:

* **Imprecisión Geográfica:** Los ciudadanos reportan emergencias mediante redes sociales o llamadas telefónicas directas, sin coordenadas exactas, lo que genera demoras en el despliegue de ayuda.
* **Falta de Categorización:** No existe un triaje que priorice la urgencia de los incidentes en tiempo real.
* **Centralización de Costos:** Las soluciones comerciales de reportes viales requieren inversiones elevadas en licenciamiento e infraestructura móvil que los cantones descentralizados no suelen cubrir.

**Solución Propuesta:** Una plataforma web ligera, accesible desde cualquier teléfono inteligente mediante navegador (PWA), que captura la ubicación exacta por GPS y envía el reporte categorizado directamente a un mapa de control para las autoridades.

---

### 3. Objetivos del Proyecto

* **Objetivo General:**
Desarrollar e implementar una plataforma web de reporte ciudadano georreferenciado para reducir los tiempos de respuesta ante incidencias viales en el cantón Santa Elena durante un periodo de pilotaje de 3 meses.
* **Objetivos Específicos:**
1. Diseñar una interfaz web progresiva (PWA) intuitiva que permita registrar un reporte con ubicación GPS en menos de 30 segundos.
2. Implementar un panel de control geográfico (*Dashboard Admin*) para clasificar incidencias por nivel de prioridad (Alta, Media, Baja).
3. Ejecutar jornadas de socialización y capacitación en territorio con gremios de transporte y comunidades rurales del cantón.



---

### 4. Roadmap de Ejecución Técnica (MVP)

1. **Fase 1: Análisis y Arquitectura de Datos:** Semanas 1 - 2.
Levantamiento de requerimientos con actores clave. Definición del esquema espacial en PostgreSQL/PostGIS, configuración del backend en Supabase y diseño de mockups UI/UX adaptados a dispositivos móviles.


2. **Fase 2: Desarrollo del MVP (Frontend PWA y Admin):** Semanas 3 - 6.
Construcción del cliente web en React/Next.js con integración de Leaflet.js y OpenStreetMap. Implementación del Service Worker para soporte *offline-first* (IndexedDB) y captura automática de coordenadas GPS.


3. **Fase 3: Pruebas de Campo y Pilotaje:** Semanas 7 - 8.
Simulación de reportes en puntos críticos de la vía (Ruta del Spondylus y cabecera cantonal). Verificación de tiempos de transmisión en tiempo real (WebSockets) y optimización de consumo de datos móviles.


4. **Fase 4: Entrega, Despliegue y Capacitación:** Semanas 9 - 10.
Despliegue en servidor de producción, entrega de la documentación técnica y capacitación a los operadores del panel de control y líderes comunitarios.


---

### 5. Viabilidad y Sostenibilidad

* **Viabilidad Técnica:** Desarrollado 100% con tecnologías de código abierto (OpenStreetMap, Leaflet, PostGIS), eliminando el pago de regalías por APIs externas.
* **Viabilidad Social:** Requiere cero costo para el usuario final (no requiere descargar una app de las tiendas, solo acceder mediante enlace web o código QR).
* **Escalabilidad:** El motor espacial utilizado permite replicar la plataforma en otros cantones de la provincia (La Libertad o Salinas) sin necesidad de reescribir el código base.


---

### Matriz de Evaluación de Riesgos (RAM)

| ID | Categoría | Riesgo Identificado | Probabilidad | Impacto | Nivel de Riesgo |
| --- | --- | --- | --- | --- | --- |
| **R-01** | Técnico | Pobre o nula cobertura de red móvil en tramos rurales y vías interprovinciales. | **Alta** | **Alto** | **CRÍTICO** |
| **R-02** | Seguridad / Datos | Recepción de reportes falsos, spam o imágenes no relacionadas con incidencias viales. | **Media** | **Alto** | **ALTO** |
| **R-03** | Operativo | Baja o nula atención en tiempo real por parte de los agentes/despachadores de tránsito. | **Media** | **Alto** | **ALTO** |
| **R-04** | Rendimiento | Saturación de memoria y ancho de banda por carga de fotos en alta resolución desde celulares. | **Alta** | **Medio** | **MEDIO** |
| **R-05** | Técnico / UX | Imprecisión de coordenadas GPS derivada de dispositivos de gama baja o permisos denegados. | **Media** | **Medio** | **MEDIO** |
| **R-06** | Privacidad | Exposición no autorizada de datos sensibles o ubicación en tiempo real de los ciudadanos. | **Baja** | **Alto** | **MEDIO** |

---

### Planes Detallados de Mitigación y Contingencia

#### 1. Gestión de Conectividad Deficiente (R-01)

* **Medida Preventiva (Arquitectura Offline-First):** Implementar la estrategia de almacenamiento local mediante **IndexedDB** administrado por **Workbox (Service Worker)**. Cuando el usuario genera un reporte sin señal, la petición HTTP, junto con la foto y la ubicación GPS capturada en el instante exacto, se encola localmente.
* **Plan de Contingencia:** La API nativa `Background Sync` detecta la recuperación de señal (3G/4G/WiFi) y realiza el reintento de envío en segundo plano de manera transparente, notificando al usuario mediante una alerta del navegador.

#### 2. Control de Calidad de Datos y Spam (R-02)

* **Medidas Preventivas:**
* **Geofencing (Cerca Geográfica):** Aplicar validación con PostGIS para descartar peticiones cuyas coordenadas GPS caigan fuera de los límites poligonales del cantón Santa Elena.
* **Rate Limiting:** Restringir el número de reportes permitidos por dispositivo/IP (máximo 3 reportes cada 10 minutos).
* **Validación de Metadata:** Verificar que la imagen adjunta contenga metadatos EXIF coherentes o requerir captura directa en tiempo real desde la cámara (impidiendo subir fotos antiguas de la galería).


* **Plan de Contingencia:** Habilitar un botón de "Marcar como Falso/Resuelto" en el Dashboard del Agente. Al acumular 2 marcaciones de falsedad, la IP o token del dispositivo entra en lista negra temporal.

#### 3. Integración y Adopción Institucional (R-03)

* **Medida Preventiva:** Diseñar un canal de alertas sonoras de alta prioridad en el Dashboard de control que solo se desactiva cuando un operador asigna una patrulla o cambia el estado a *"En Proceso"*.
* **Plan de Contingencia:** Si un incidente de prioridad "ALTA" no registra interacción del operador en más de 15 minutos, el sistema envía una notificación automatizada vía Webhook (Telegram o WhatsApp API) al jefe de turno o supervisor de la zona.

#### 4. Optimización de Recursos e Imágenes (R-04)

* **Medida Preventiva (Compresión Client-Side):** Procesar la fotografía en el navegador del usuario usando la **Canvas API** o librerías como `browser-image-compression` antes del envío. La imagen se redimensiona a un máximo de $1280 \times 720$ px y se convierte a formato **WebP** con calidad del 70%, reduciendo el peso de ~5MB a menos de 200KB.

#### 5. Precisión Geoespacial y UX (R-05)

* **Medidas Preventivas:**
* Configurar `enableHighAccuracy: true` y establecer un `timeout` adecuado en la `Geolocation API`.
* Mostrar el radio de margen de error (en metros) sobre el mapa del formulario y permitir que el usuario arrastre manualmente el pin para corregir la posición si el GPS oscila.


#### 6. Seguridad y Protección de Datos Personales (R-06)

* **Medida Preventiva:** Aplicar el principio de **Anonimización por Diseño**. El reporte ciudadano no exige crear una cuenta ni ingresar nombres completos o números de cédula para ser enviado. La comunicación se valida mediante tokens temporales (`Device Fingerprint` / UUID cifrado en `localStorage`).


---

## 1. Matriz de Indicadores de Éxito y KPIs

Para medir el impacto real del proyecto durante la fase de pilotaje (3 meses), los indicadores se dividen en cuatro dimensiones: **Rendimiento Técnico**, **Impacto Operativo**, **Adopción Ciudadana** y **Calidad de Datos**.

| Categoría | Indicador (KPI) | Métrica / Fórmula | Meta del Piloto (3 Meses) | Fuente de Verificación |
| --- | --- | --- | --- | --- |
| **Rendimiento Técnico** | **Efectividad de Sincronización Offline** | (Reportes sincronizados / Total reportes generados offline) × 100 | Mayor o igual al 95% | Logs de IndexedDB y Service Worker en cliente |
| **Rendimiento Técnico** | **Precisión de Geolocalización** | Margen de error promedio del GPS (en metros) | Menor o igual a 15 metros | Metadatos geoespaciales de PostGIS |
| **Impacto Operativo** | **Tiempo de Despacho Institucional** | Tiempo transcurrido desde la recepción del reporte hasta el cambio a estado "En Proceso" | Menor a 8 minutos (Prioridad Alta) | Logs del Dashboard de Control |
| **Impacto Operativo** | **Reducción del Tiempo de Atención** | Comparativa del tiempo medio de atención presencial vs. método tradicional | Reducción del 30% en tiempo de respuesta | Informes de la autoridad vial local |
| **Adopción Ciudadana** | **Volumen de Participación** | Cantidad total de reportes ciudadanos válidos registrados | Mayor o igual a 500 reportes | Base de datos PostgreSQL |
| **Adopción Ciudadana** | **Cobertura Parroquial** | Porcentaje de parroquias del cantón Santa Elena con al menos 10 reportes registrados | 100% de parroquias alcanzadas | Consultas espaciales de polígonos |
| **Calidad de Datos** | **Tasa de Filtro de Spam / Falsos** | (Reportes marcados como falsos / Total de reportes) × 100 | Menor al 8% | Módulo de moderación del Dashboard |

---

## 2. Estructura de Presupuesto y Costos Operativos

El presupuesto está optimizado bajo la filosofía de **Bajo Costo y Máximo Impacto** (*Open Source*), aprovechando capas gratuitas de servicios *cloud* profesionales para mantener los costos fijos al mínimo.

### A. Costos de Infraestructura Tecnológica (Anual)

| Rubro | Proveedor / Servicio | Detalle Técnico | Costo Estimado (USD) |
| --- | --- | --- | --- |
| **Hosting Frontend PWA** | Vercel / Netlify (Free Tier) | Despliegue continuo con SSL (HTTPS) y CDN global | $0.00 |
| **Backend & Base de Datos** | Supabase (Free Tier) | PostgreSQL + PostGIS (500MB DB, 1GB Storage, Realtime) | $0.00 |
| **Servicio de Mapas** | OpenStreetMap + Leaflet.js | Tiles de mapas de código abierto (Sin costo de API) | $0.00 |
| **Dominio Web Oficial** | NIC.ec / Registrador | Dominio territorial (ej. `transitoalertase.ec` o `.org.ec`) | $35.00 / año |
| **Certificado de Seguridad** | Let's Encrypt | Certificado TLS/SSL automatizado | $0.00 |
| **Subtotal Infraestructura** |  |  | **$35.00** |

---

### B. Costos de Operación, Socialización y Capacitación (Fase Piloto)

| Rubro | Detalle de Actividades | Cantidad / Unidad | Costo Estimado (USD) |
| --- | --- | --- | --- |
| **Material Promocional y QR** | Impresión de adhesivos y placas QR resistentes al clima para cooperativas de transporte y puntos clave | 500 unidades | $60.00 |
| **Socialización en Territorio** | Talleres comunitarios en gabinetes parroquiales (Manglaralto, Colonche, Chanduy, etc.) y movilidad | 6 jornadas presenciales | $120.00 |
| **Capacitación a Operadores** | Guias rápidas impresas y manuales digitales para agentes de tránsito | 30 kits impresos | $35.00 |
| **Subtotal Operación y Campo** |  |  | **$215.00** |

---

### C. Valorización del Trabajo Técnico (Aporte en Especie / Voluntariado)

> **Nota para el proyecto:** Mostrar el valor de mercado del desarrollo demuestra que el programa *Jóvenes en Acción* está ahorrando miles de dólares a la comunidad gracias al talento de sus participantes.

| Rol | Horas Estimadas | Valor Hora Mercado | Total Valorizado (USD) |
| --- | --- | --- | --- |
| **Fullstack Web & PWA Developer** | 120 horas | $25.00 / hr | $3,000.00 |
| **QA Engineer & Tester Espacial** | 40 horas | $20.00 / hr | $800.00 |
| **Diseñador UX/UI & Materiales** | 20 horas | $20.00 / hr | $400.00 |
| **Subtotal Valorizado** |  |  | **$4,200.00** |

---

### Resumen Presupuestario General

* **Inversión Financiera Directa Necesaria (Capital Semilla):** **$250.00 USD**
*(Cubre dominio `.ec`, material QR y gastos de movilización/socialización en parroquias).*
* **Valorización del Desarrollo Tecnológico Entregado:** **$4,200.00 USD**
* **Costo de Mantenimiento Mensual Post-Piloto:** **$0.00 USD** *(Manteniéndose en la capa gratuita de infraestructura).*