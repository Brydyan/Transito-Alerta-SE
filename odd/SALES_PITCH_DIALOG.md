# Diálogo Comunitario — Tránsito Alerta SE

Notas del presentador por slide. El archivo está pensado para que el
equipo del programa **Jóvenes en Acción** (los constructores del
proyecto) sepa, **slide por slide**, qué decir y qué responder a las
preguntas más probables cuando se presente a la Comisión de Tránsito
del Guayas (CTE) en Santa Elena y a la comunidad.

> **Nota sobre el título:** conserva el nombre histórico
> `SALES_PITCH_DIALOG.md` para mantener trazabilidad con iteraciones
> previas del repo. El contenido es comunitario, no comercial.

---

## Contexto general antes de empezar

- **Qué es esto.** Proyecto comunitario del programa *Jóvenes en
  Acción* del gobierno, en alianza con la CTE, para que la comunidad
  de Santa Elena pueda reportar incidentes de tránsito desde su
  celular en 30 segundos, con coordenadas exactas y sin necesidad de
  descargar una aplicación.
- **Quiénes somos.** El equipo que está construyendo el software son
  participantes del programa *Jóvenes en Acción* (aporte técnico del
  programa, valorado en USD ~$4,200–$5,550 — esto es un dato del
  contexto, no se anuncia). La CTE es el operador público aliado que
  pone la infraestructura y los reportes fluyen a su despacho.
- **Para quién.** Tres audiencias que se entrelazan durante la
  presentación:
  1. La **CTE** (operador público aliado).
  2. La **comunidad** de Santa Elena (usuarios finales).
  3. Las **autoridades provinciales** que aprueban el convenio (no un
     presupuesto en dólares — un acuerdo interinstitucional).
- **Vocabulario.** Evitamos: "venta", "cliente", "ROI", "payback",
  "precio", "licencia", "SaaS", "perpetual", "compra". Preferimos:
  "alianza", "convenio", "impacto", "cobertura", "participación",
  "comunidad", "datos abiertos".
- **Duración total.** ~20 minutos para las slides 1–13 + Q&A abierto
  (slide 14 con respuestas expandidas al final de este archivo).

---

## Pre-presentación (antes de abrir la slide 1)

**Antes de empezar a hablar:**

- Confirmar que el proyector/pantalla está conectada a la laptop con la
  presentación ya abierta y probada (resolución 16:9).
- Tener a mano: este archivo, el documento
  `odd/tasks/SECURITY_AUDIT_2026-10-18.md` (por si preguntan por
  auditoría), y el correo `balejandrov12@gmail.com` para
  quien quiera escribir después.
- Si hay representantes de la CTE: confirmar de antemano quién va a
  tomar notas por su lado (para que no parezca que "les estamos
  vendiendo algo", sino compartiendo un acuerdo).
- Si hay comunitarios presentes: hablar en presente y plural — "la
  comunidad de Santa Elena va a poder…", no "ustedes van a poder…" (la
  diferencia importa para el tono).

---

## Slide 1 — Portada (30 s)

**Lo que se ve:** Cover con gradiente azul → teal. Eyebrow
"Comisión de Tránsito del Guayas · Santa Elena". H1 "Tránsito Alerta
SE". Subtítulo "Reporte geolocalizado en 30 segundos. Despacho
inteligente en tiempo real." Meta abajo: "Proyecto comunitario ·
Programa Jóvenes en Acción · Q4 2026".

**Qué decir (mensaje principal):**

> "Buenos días. Nos presentamos como equipo del programa *Jóvenes en Acción* del gobierno. Hoy les queremos compartir un proyecto comunitario que hemos estado construyendo en alianza con el Departamento de educacion Vial: Tránsito Alerta SE. La idea es simple — que cualquier persona de Santa Elena pueda reportar un incidente de tránsito desde su celular, en 30 segundos, con sus coordenadas exactas, sin instalar una aplicación. Y que esos reportes lleguen al despacho de la Comisión en tiempo real."

**Anclar para la siguiente slide:**

> "Antes de hablar de la solución, queremospartir de lo que hoy está pasando en las calles de Santa Elena. Porque es un problema concreto, no teórico."

---

## Slide 2 — El problema (1 min)

**Lo que se ve:** 3 cards con border-top rojo/ámbar.
- ⏱️ "Tiempo perdido — 12+ minutos de localización por reporte".
- 📍 "Ubicación imprecisa — 'cerca de Ballenita' vs. coordenadas
  exactas".
- 📡 "Sin cobertura — reportes perdidos en zonas rurales: E40,
  Spondylus, cantones alejados".

**Qué decir:**

> "Hoy, cuando alguien llama al 911 o a la Comisión para reportar un
> accidente, pasan 5–10 minutos solo en precisar la dirección. Eso es
> tiempo que se pierde mientras una patrulla busca dónde ir. En zonas
> rurales, donde hay menos referencias, es peor — a veces el
> reporte simplemente no llega. Y cuando llega vago, el despacho
> sale 'a ciegas': no sabe si es un choque leve o una emergencia con
> atrapados."

**Si preguntan cifras concretas:**

- Tiempo medio de localización: ~12 minutos promedio (rango 5–25 min).
- % reportes con ubicación imprecisa: alto (la presentación no tiene
  el dato duro de Santa Elena — anotarlo como `dato de campo a
  recabar` en slide 3).
- Zonas críticas: E40, Spondylus, zonas rurales de los cantones
  alejados (de la geografía del proyecto).

**Anclar:**

> "¿Qué pasa cuando esos minutos se pierden? Eso lo vemos en la
> siguiente lámina."

---

## Slide 3 — Impacto humano (1 min)

**Lo que se ve:** Hero number "12 min" + 3 supporting rows:
- 25–40% más en zonas rurales vs. ciudad.
- 0% visibilidad de patrones (sin heatmaps, sin prevención).
- ? — minutos de respuesta × ~40 reportes/mes *(dato de campo a
  recabar)*.

**Qué decir:**

> "Cuando el tiempo perdido se acumula, las consecuencias no son
> abstractas: es una ambulancia que tarda más, un ciudadano que se
> queda varado más tiempo, una decisión operativa que no se puede
> tomar porque no hay datos. Y no hay forma de prevenir, porque hoy
> la Comisión no tiene un mapa de patrones — no sabe en qué esquina
> se acumulan los incidentes."

**Si piden datos de su provincia:**

> "Eso es justamente lo que queremos validar con la Comisión al
> arrancar el piloto. El número que pongo como '?' es un dato de
> campo que necesitamos de ustedes para ajustar la narrativa."

**Tono:** evitar victimizar al ciudadano. Hablar de impacto
operativo, no de "personas sufriendo".

**Anclar:**

> "¿Qué podemos hacer al respecto? Tres cambios simples."

---

## Slide 4 — Solución (1 min)

**Lo que se ve:** 3 pilares con hexágonos:
- ⚡ Reporte Instantáneo — 30 segundos, GPS automático, sin app.
- 📡 Offline-First — funciona sin cobertura, sincroniza al volver.
- 🎯 Despacho Inteligente — categorización + alertas sonoras para
  críticos.

**Qué decir:**

> "Tres cambios. El primero es que la persona abre un QR en la calle
> — en una parada, en un letrero, en una patrulla — y desde ahí, con
> un toque, ya está reportando. El GPS se llena solo. Si no tiene
> señal, el reporte se guarda y se sube cuando vuelva la red. Y
> cuando llega al despacho, el operador ve un mapa con todos los
> reportes en vivo, y si es crítico, suena una alerta para que no se
> le pase."

**Si preguntan "¿en qué se diferencia de una app normal?":**

> "Funciona desde el QR directo. No hay que instalar nada. Eso es
> crítico para que una persona en emergencia no tenga que descargar
> 50 MB para reportar."

**Anclar:**

> "¿Cómo se ve desde el lado del ciudadano?"

---

## Slide 5 — Flujo ciudadano (1.5 min)

**Lo que se ve:** Timeline horizontal de 6 pasos: Abre QR → GPS auto
→ Categoría → Foto → Envía → Confirma. Cita: "Tan fácil como un
Telegram". Subtítulo: "Desde cualquier sitio, con o sin red. Sin
instalar nada."

**Qué decir:**

> "Desde el lado del ciudadano, son seis toques: abre el QR, el GPS
> se llena solo, elige una categoría, saca una foto — la app la
> comprime sola a menos de 200 KB —, toca Enviar, y le confirmamos
> que su reporte fue recibido. Si está online sube al instante; si
> está offline se queda en cola y sube cuando vuelva la señal. Esto
> es lo que llamaríamos 'tan fácil como un Telegram' — esa es la
> vara."

**Si preguntan por Telegram específicamente:**

> "Telegram no tiene geolocalización automática, ni categorización
> estructurada, ni offline-first. Por eso Tránsito Alerta SE existe:
> porque Telegram es un canal conocido, pero no resuelve el
> problema operacional."

**Anclar:**

> "¿Y cómo lo ve el operador de despacho?"

---

## Slide 6 — Flujo operador (1.5 min)

**Lo que se ve:** Mockup lado a lado: mapa con pins de colores
(crit/alto/bajo) + tarjeta de detalle del reporte crítico con foto y
alerta sonora animada. Eyebrow "Experiencia del operador".

**Qué decir:**

> "Del lado del operador, es un tablero en vivo. Cada reporte aparece
> como un pin en el mapa, con color por severidad. Cuando llega un
> reporte crítico, suena una alerta y se abre la tarjeta con la foto,
> la dirección exacta, y la hora. El operador sabe en 10 segundos a
> dónde ir y qué van a encontrar."

**Si preguntan por la integración con el sistema actual:**

> "En el piloto arrancamos con un tablero independiente. La Comisión
> sigue usando su sistema de despacho actual — Tránsito Alerta SE
> corre en paralelo. Después, en Fase 2, vemos si conviene
> conectarlos vía API."

**Si preguntan por el reporte "anónimo":**

> "Por diseño, no pedimos nombre ni documento al reportar. La
> información del ciudadano queda asociada al dispositivo, no a una
> identidad. Esto cuida la privacidad y reduce la barrera de
> reportar."

**Anclar:**

> "¿Cómo se compara con lo que ya existe?"

---

## Slide 7 — Diferenciadores (1 min)

**Lo que se ve:** Tabla 5 columnas: Aspecto / Sistema actual / Google
Maps / Telegram / Tránsito Alerta SE. Filas: Funciona offline,
Coordenadas exactas, Categorización, Analítica de patrones, Costo
para el usuario.

**Qué decir:**

> "No competimos con lo que existe — lo complementamos. El sistema
> actual no tiene coordenadas exactas. Google Maps sirve para
> navegar, no para reportar emergencias (no tiene categorización ni
> geofencing). Telegram es un canal general, no tiene offline-first
> ni analítica. Tránsito Alerta SE está hecho específicamente para
> esto: reporte + despacho + analítica. Nada más."

**Si preguntan "y por qué no solo usar Google Maps?":**

> "Porque Google Maps optimiza para navegación, no para emergencias.
> No tiene alertas operativas para el despacho, no tiene
> categorización por tipo de incidente, no guarda reportes si el
> usuario no tiene cuenta, y requiere internet constante."

**Si preguntan "y qué gano yo como Comisión":**

> "Una sola fuente de verdad para incidentes de tránsito en su
> jurisdicción. Con el tiempo, eso les permite tomar decisiones
> basadas en datos — dónde prevenir, cómo asignar recursos."

**Anclar:**

> "¿Qué impacto esperamos desde el primer mes?"

---

## Slide 8 — Impacto comunitario (2 min)

**Lo que se ve:** Hero "×3" — más reportes georreferenciados que el
sistema actual. Sub: "más incidentes georreferenciados que el
sistema actual". Pill: "Primer resultado comunitario: ~6 semanas
desde el arranque del piloto". 2 barras: Cobertura rural +
Participación ciudadana.

**Qué decir:**

> "No vamos a prometer cifras mágicas. Lo que esperamos, basándonos
> en experiencias similares de participación ciudadana en otras
> provincias, es triplicar la cantidad de reportes que llegan con
> coordenadas exactas a la Comisión en el primer mes. Y mejorar
> especialmente la cobertura en las zonas rurales, que hoy están
> desconectadas del sistema. Estos números se ajustan con datos
> reales cuando arranque el piloto."

**Lo que NO se dice (importante):**

- NO se mencionan dólares, ROI, payback ni ahorros.
- NO se compara con "el costo de no hacerlo".
- Se habla de impacto operativo, no financiero.

**Si preguntan por números exactos:**

> "Los pondremos en el reporte de impacto comunitario al cierre de
> las 8 semanas del piloto. Hoy son expectativas informadas."

**Anclar:**

> "¿Y la confianza — los datos de la comunidad cómo se cuidan?"

---

## Slide 9 — Confianza y datos (1.5 min)

**Lo que se ve:** 6 icon cards:
- 🔒 Encriptado en reposo (PostgreSQL + MinIO con SSE).
- 🛡️ 0 vulns críticas — Audit 2026-10-18.
- ✅ LOPD-compliant — anonimización post-90 días.
- 👤 Sin vendor lock-in — código open-source, datos en su datacenter.
- 📊 Auditable — GitHub público, DPA disponible bajo acuerdo.
- 🔄 Rotación JWT sin downtime — kid header versionado.

**Qué decir:**

> "Sobre los datos y la confianza: este proyecto pasó una auditoría
> de seguridad en octubre de 2026. Las 25 vulnerabilidades
> detectadas (2 críticas y 23 altas) están remediadas — el sistema
> está en cero vulnerabilidades críticas hoy. Los datos viven
> PostgreSQL con encriptación en reposo; las fotos van a MinIO con
> SSE. Después de 90 días, las fotos y coordenadas exactas se
> anonimizan automáticamente — la Comisión conserva el reporte pero
> no la identidad del reportante."

**Si preguntan por LOPD específicamente:**

> "La Comisión es responsable de los datos (LOPD). Nosotros somos
> procesadores bajo instrucción de ustedes. Eso queda firmado en un
> Data Processing Agreement (DPA). El código es open-source en
> GitHub — la Comisión o cualquier tercero puede auditarlo cuando
> quiera."

**Si preguntan por el audit report:**

> "Está disponible bajo acuerdo interinstitucional. Les compartimos
> el PDF firmado con CVSS scores detallados cuando firmemos el
> convenio."

**Anclar:**

> "Para los que están del lado técnico de la Comisión — el stack."

---

## Slide 10 — Stack técnico (1 min)

**Lo que se ve:** 4 columnas: Frontend (Angular 18 + Workbox +
IndexedDB), Backend (NestJS 10 + TypeORM 0.3 + RBAC), Datos (PostgreSQL
16 + PostGIS, Redis 7, MinIO), Infraestructura (Docker Compose,
on-premise o AWS, single source of truth). Eyebrow "Para el equipo
técnico de la CTE".

**Qué decir:**

> "Stack moderno y on-premise. Frontend es una PWA (no app nativa) —
> corre en cualquier celular con navegador moderno, funciona offline
> gracias a IndexedDB. Backend en NestJS, Base de datos PostgreSQL
> con PostGIS para geofencing, Redis como caché y cola, MinIO para
> fotos. Todo empaquetado en Docker Compose — la Comisión corre el
> stack en su propio datacenter. Cero dependencia de nube externa."

**Si preguntan por cloud privado:**

> "On-premise es la opción por defecto del piloto. Si después la
> Comisión prefiere correrlo en AWS en su propia cuenta, también se
> puede — solo cambia un docker-compose.yml."

**Si preguntan por costos de infraestructura:**

> "PostgreSQL + Redis + MinIO corren en hardware modesto: 2 vCPU, 4
> GB RAM cubre el piloto. La Comisión ya tiene infraestructura en
> su datacenter de Santa Elena — no requieren compra adicional."

**Anclar:**

> "Esto es un programa dividido en tres fases, sin compromiso de
> seguir si la primera no funciona."

---

## Slide 11 — Hoja de ruta (1.5 min)

**Lo que se ve:** 3 fases con timeline en gradiente:
- **Fase 1 — Arranque (8 semanas, "Piloto comunitario")**: Setup
  técnico en la CTE + piloto en Santa Elena + recolección de
  métricas + salida "Reporte de impacto comunitario".
- **Fase 2 — Expansión (6 meses, "Consolidación")**: Integración con
  sistema legacy + Trust Score + Feedback Loop + tableros abiertos
  de patrones.
- **Fase 3 — Sostenibilidad (Año 2, "Innovación abierta")**: Visión
> computacional comunitaria + predicción ML + app nativa (si la pide
  la comunidad) + integración con otras instituciones públicas.

**Qué decir:**

> "El plan son tres fases independientes. Si la primera no funciona,
> paramos — sin riesgo para la Comisión ni para la comunidad. La
> Fase 1 son 8 semanas de piloto en Santa Elena. Al cierre,
> entregamos un reporte de impacto comunitario con las métricas
> reales. Si los números no convencen, no seguimos. Si convencen,
> Fase 2 integra con el sistema de despacho actual, agrega el Trust
> Score (reputación por historial de reportes), y abre tableros de
> patrones para que la Comisión y la comunidad vean dónde se
> acumulan los incidentes. Fase 3 ya es visión computacional,
> predicción y — si la comunidad lo pide — app nativa."

**Lo que NO se dice:**

- NO se mencionan cifras en dólares para ninguna fase.
- NO se habla de "costo de cada fase" — eso no aplica porque el
  aporte técnico lo hace *Jóvenes en Acción*.

**Si preguntan cuánto tiempo toma la decisión entre fases:**

> "Unos 5–10 días después del reporte de impacto. Si quieren
> extender, el programa se ajusta a su ritmo."

**Si preguntan qué pasa después de Fase 3:**

> "El software es open-source. Pase lo que pase con autoridades o
> programas, la herramienta queda en manos de la Comisión y la
> comunidad."

**Anclar:**

> "Esto nos deja en el siguiente paso."

---

## Slide 12 — Próximos pasos (1 min)

**Lo que se ve:** 5 step rows + CTA bar "¡Vamos! — Primer piloto:
27 de diciembre".
1. Sem 1 — Convenio interinstitucional (para alinear a *Jóvenes en
   Acción* y la Comisión).
2. Sem 2 — Setup técnico (acceso a infraestructura CTE-Santa Elena).
3. Sem 3 — Kick-off + capacitación (equipo CTE + voluntarios
   *Jóvenes en Acción*).
4. Sem 4 — Primeros QRs en la calle.
5. Continuo — Encuentros semanales (métricas + feedback de la
   comunidad).

**Qué decir:**

> "Si nos ponemos de acuerdo hoy, arrancamos la primera semana de
> noviembre. Lo primero es firmar un convenio interinstitucional
> entre el programa *Jóvenes en Acción* y la Comisión para alinear
> alcance, datos y cronograma. Después, el setup técnico en el
> datacenter de la Comisión en Santa Elena. Luego, capacitamos al
> equipo de la Comisión y a los voluntarios del programa. Semana 4,
> ya hay QRs en la calle y la comunidad empieza a reportar. A partir
> de ahí, encuentros semanales para revisar métricas y feedback."

**Si preguntan "convenio de qué tipo exactamente?":**

> "Es un acuerdo de colaboración interinstitucional entre el
> programa y la Comisión. Define: roles (quién opera, quién
> mantiene), alcance (qué provincias y qué tipo de incidentes),
> tratamiento de datos (responsable/procesador bajo LOPD), y
> cronograma. No es un contrato comercial."

**Anclar:**

> "Con esto cerramos."

---

## Slide 13 — Cierre (1 min)

**Lo que se ve:** 3 números en gradiente: 30 s (Reporte), 0
(Pérdida de señal), 6 sem (Primer resultado comunitario). CTA:
"¿Preguntas? ¿Quiénes se suman?" + email de contacto.

**Qué decir:**

> "Cerramos con tres ideas: en 30 segundos un ciudadano puede
> reportar. Con cero pérdida de señal, porque funciona offline. Y en
> 6 semanas tenemos un primer resultado comunitario medible.
> 
> Esto no es un producto que estamos vendiendo. Es un proyecto
> comunitario que estamos construyendo juntos — el programa *Jóvenes
> en Acción* aporta el desarrollo técnico, la Comisión pone la
> infraestructura, y la comunidad de Santa Elena es la que se
> beneficia y la que modera con sus reportes.
> 
> ¿Quiénes se suman?"

**Si preguntan qué sigue hoy mismo:**

> "Si la Comisión está de acuerdo, definimos esta semana los puntos
> del convenio y arrancamos con la firma la próxima."

**Modo presentador:** presionar `P` muestra las notas de cada slide
(para que el orador no tenga que memorizar este archivo entero).

---

## Slide 14 — Q&A backup (Preguntas duras)

Esta slide **no se muestra al inicio** — se accede con la tecla `!`
cuando alguien hace una pregunta difícil que no está cubierta en las
slides 1–13. Las respuestas están aquí abajo.

### "¿Cómo se entera la comunidad del QR?"

> Campaña comunitaria + digital. QRs en paradas de bus, redes
> sociales municipales, plazas y mercados. Presupuesto modesto para
> llegar a toda la provincia. El boca a boca entre operadores de
> tránsito y ciudadanos que vieron funcionar el sistema completa la
> adopción después del primer mes.

### "¿Y si alguien sin smartphone reporta?"

> Ese flujo sigue siendo la línea 911. Tránsito Alerta SE no
> reemplaza eso, lo complementa. La mayoría de incidentes hoy ya
> tienen testigos con smartphone — ese es el segmento al que
> llegamos.

### "¿Qué pasa con reportes falsos o spam?"

> Tres mecanismos:
> 1. **Geofencing:** PostGIS valida cada reporte contra la
>    jurisdicción de Santa Elena — un reporte fuera de zona se
>    rechaza automático.
> 2. **Rate-limiting:** un dispositivo no puede enviar más de 3
>    reportes cada 10 minutos.
> 3. **Trust Score (Fase 2):** reputación basada en historial.
>    Reportes de baja confianza se marcan, no se eliminan — la
>    comunidad modera.

### "¿Cómo se integra con el sistema de despacho actual?"

> **Opción 1 (Fase 1):** tablero independiente corre en paralelo al
> sistema actual. Cero cambios en la plataforma existente.
> **Opción 2 (Fase 2):** integración vía API REST (OpenAPI 3.0) o
> webhook al sistema legacy. Si no hay API en el legacy,
> middleware con SyncService.

### "¿Y si se cae el servidor o no hay internet?"

> - **Ciudadano:** IndexedDB guarda los reportes localmente si no
>   hay red. Sincroniza al volver la señal (offline-first).
> - **Despacho:** PostgreSQL + Redis corren on-premise en el
>   datacenter de la Comisión — no dependemos de nubes externas.
> - **Disponibilidad:** meta 99.5 % mensual en Fase 2, 99.9 % en
>   Fase 3. Health checks cada 30 s, backups diarios con retención
>   30 días (script en el repo).

### "¿Cómo se sostiene el proyecto después de la Fase 1?"

> El software es open-source y los datos siempre son de la Comisión
> y de la comunidad. *Jóvenes en Acción* aporta el desarrollo
> técnico; el sostenimiento operativo lo cubren las instituciones
> públicas participantes. No hay licencia, no hay costo para la
> ciudadanía, no hay contratos de mantenimiento vendor.

### "¿Y si el proyecto se politiza o cambian las autoridades?"

> Código open-source bajo licencia permisiva (MIT). Los datos son
> siempre de la CTE y de la comunidad, no nuestros. Si hay cambio
> de gobierno, de director o de autoridades provinciales:
> 1. El software sigue siendo de la provincia, no nuestro.
> 2. Pueden mantenerlo internamente (documentación + repo público).
> 3. Pueden cambiar de proveedor sin perder datos.
> 4. Cero bloqueo legal o técnico.
>
> Esta es una herramienta pública, no un producto privado. Eso da
> tranquilidad política independientemente de quién gobierne.

### "¿Por qué no usar Google Maps o Telegram directamente?"

> - **Google Maps** está hecho para navegar, no para emergencias.
>   No tiene geofencing por jurisdicción, no tiene categorización
>   de incidente, no tiene alertas operativas para el despacho.
> - **Telegram** no tiene offline-first, no tiene geolocalización
>   automática, no categoriza, y los reportes se pierden en el
>   historial del chat.
> - **Apps de emergencia genéricas** requieren instalación,
>   gastan batería, no funcionan offline.
>
> Tránsito Alerta SE está específicamente diseñado para *reporte +
> despacho + analítica* en el contexto de una jurisdicción.

### "¿Qué diferencia hay con apps como Uber o delivery?"

> Esas apps optimizan para lucro — comisión por viaje, publicidad,
> engagement. Nosotros optimizamos para que la Comisión tenga los
> datos mejores y más rápidos, sin comisión por reporte, sin
> publicidad, sin engagement artificial. El modelo es servicio
> público, no negocio.

### "¿Qué pasa si la Comisión decide no seguir con nosotros?"

> Cero vendor lock-in. Los datos son 100 % de la Comisión:
> PostgreSQL en su datacenter o en su cuenta de AWS bajo su control
> administrativo. Si deciden seguir con otro equipo o mantenerlo
> internamente:
> 1. Exportan todo (SQL dump completo, acceso administrativo total).
> 2. El código es público en GitHub (MIT) — cualquier developer
>    puede mantenerlo y extenderlo.
> 3. La documentación incluye APIs (OpenAPI 3.0), diagrama de
>    deployment y runbooks de operación.
> 4. Ofrecemos transición asistida si lo piden (Fase 2 opcional).
>
> La Comisión nunca queda rehén. Es un principio del proyecto.

### "¿Cumple con LOPD?"

> Sí. La Comisión es **Responsable de Datos**; nosotros somos
> **Procesadores** bajo instrucción. Queda firmado en un Data
> Processing Agreement (DPA). Cumplimos:
> - Anonimización post-90 días (foto + ubicación exacta borradas).
> - Right to be forgotten (ciudadano puede pedir borrado de sus
>   reportes).
> - Data minimization (solo GPS, categoría, foto, timestamp).
> - Política de privacidad clara en la PWA.
>
> **Nota:** GDPR es para la UE. Aquí aplica LOPD ecuatoriana.
> Si la Comisión quiere alinearse también a GDPR como buena
> práctica, lo cubrimos sin cambios adicionales.

---

## Notas finales para el presentador

### Tono general

- **Plural y presente.** "La comunidad de Santa Elena puede…", "la
  Comisión recibe…", no "ustedes van a poder…". El proyecto es con,
  no para.
- **Sin jerga innecesaria.** Si una persona no técnica está en la
  sala (probable si hay comunitarios), prefiere "cobertura rural" a
  "offline-first", prefiere "datos encriptados" a "AES-256 at rest".
- **Honestidad sobre lo que no sabemos.** Si preguntan por un dato
  de campo que no tenemos, decimos "eso lo validamos en el piloto",
  no inventamos.
- **Si la pregunta es difícil y no está cubierta:** mejor decir
> "no tengo esa respuesta ahora, la traigo en 24 horas" que
> improvisar.

### Si el ambiente se pone tenso

- Recordar que es un proyecto **comunitario**, no comercial. No
  estamos compitiendo con proveedores — estamos invitando a la
  Comisión a sumar a un programa del gobierno.
- Si alguien pregunta "¿y ustedes qué ganan?": el programa *Jóvenes
  en Acción* existe para que sus participantes aprendan haciendo.
  El proyecto cumple el objetivo formativo del programa, y deja
  una herramienta útil para la comunidad.

### Después de la presentación

- Enviar la presentación + este archivo + el
  `odd/tasks/SECURITY_AUDIT_2026-10-18.md` (bajo acuerdo) por
  correo a quien lo pida.
- Documentar las preguntas que surgieron y ajustar las respuestas
  en la próxima iteración de este archivo.

---

## Anexo histórico (referencia, no se usa durante la presentación)

Las versiones anteriores de este archivo se enfocaban en un guion
de 3 encuentros (pitch inicial → deep dive → cierre) con framing
comercial: lenguaje de "vendedor" / "cliente", ROI y payback en
dólares, licencias SaaS y un "documento ejecutivo para junta
directiva" con presupuesto de aprobación. Esa estructura se
mantuvo por trazabilidad del repo, pero el contenido reescrito en
esta versión sigue el framing comunitario del programa *Jóvenes en
Acción* y se estructura slide por slide para que sirva como guía
del presentador.

— Equipo Tránsito Alerta SE · Programa *Jóvenes en Acción*.
