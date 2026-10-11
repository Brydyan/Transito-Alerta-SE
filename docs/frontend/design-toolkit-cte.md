# Sistema de Diseño y Design Toolkit: Plataforma de Incidencias CTE ("GeoReporta")

Este documento constituye la especificación de diseño oficial y la guía de estilo técnica para el desarrollo del portal interactivo de gestión de incidencias de la **Comisión de Tránsito del Ecuador (CTE)**. Consolida la estructura funcional de las interfaces wireframe del sistema ("GeoReporta") con una identidad corporativa propia basada en la seguridad vial, el alto contraste de carretera y el cumplimiento de accesibilidad universal.

---

## 1. Concepto Visual: "Hi-Vis & Navy"

Para distanciar la plataforma del estándar gubernamental genérico y dotarla de un carácter técnico especializado en el tránsito, el sistema visual se inspira en la indumentaria real, heráldica y presencia en carretera de los agentes de la CTE:

*   **Azul Marino de la Comisión (Navy)**: Representa la autoridad, el orden y la solidez institucional. Es el color base del chasis de la interfaz.
*   **Verde Limón Reflector (Hi-Vis)**: Inspirado directamente en las prendas reflectivas de alta visibilidad que usan los agentes de tránsito en servicio. Se reserva como el color de acento interactivo de máxima jerarquía (Llamada a la Acción o CTA).
*   **Contraste de Carretera (Estados)**: Los colores funcionales de estado y alerta emulan la señalética vertical y horizontal de las vías ecuatorianas, garantizando un escaneo visual ultra rápido para el operador.

---

## 2. Paleta de Colores (Tokens Cromáticos)

Los colores deben implementarse mediante variables CSS o clases Tailwind CSS para mantener una única fuente de verdad en el repositorio de código:

### A. Colores Primarios y de Marca
```css
:root {
  --color-brand-navy: #1E1E54;      /* Azul Marino de la Comisión - Sello, uniformes y fondos estructurados */
  --color-brand-navy-light: #2D2D93;/* Azul intermedio de la CTE para elementos activos de navegación */
  --color-brand-hivis: #CCFF00;     /* Verde Limón Reflector - Exclusivo para botones de interacción primaria */
  --color-brand-hivis-hover: #B2D800;
  --color-brand-hivis-text: #111827; /* Texto oscuro de alto contraste sobre fondo neón */
}
```

### B. Colores de Superficie (SaaS Modern / Clean)
*   **Fondo Principal (Background)**: `#F8F9FA` (Gris ultra claro para reducir la fatiga ocular del operador).
*   **Fondo Secundario (Cards y Paneles)**: `#FFFFFF` (Blanco puro con micro-sombras de profundidad en tonos azulados: `box-shadow: 0 4px 6px -1px rgba(30, 30, 84, 0.03)`).
*   **Bordes de Separación**: Líneas ultrafinas de `1px` en `#E2E8F0` o gris-azulado claro para delimitar registros sin saturar la pantalla.

### C. Semáforo Vial (Estados de Incidencia)
*   **Estado Crítico / Alerta Alta**: Red de Alerta (`#EF142B`). Utilizado para indicar incidentes críticos, vencidos, campos con errores de validación o penalizaciones.
*   **Estado Pendiente / Alerta Media**: Amarillo Vial (`#FFC600`). Utilizado para advertencias de prioridad media, procesos en espera de asignación o alertas próximas a expirar.
*   **Estado Informativo / Alerta Baja**: Azul Eléctrico (`#08C3EB`). Utilizado para información general, categorización territorial macro y estados neutrales.
*   **Estado Resuelto / Éxito**: Verde Vial (`#2B8A3E`). Utilizado para confirmaciones exitosas, incidencias resueltas o estados activos aprobados.

---

## 3. Tipografía y Jerarquía Visual

De acuerdo con el estándar técnico digital ecuatoriano, se implementa una única familia tipográfica para optimizar la carga y la legibilidad en pantallas de baja resolución:

*   **Tipografía Oficial**: **Barlow Condensed** (Sans-Serif).
*   **Escala de Títulos y Cuerpo**:
    *   `h1` (Títulos de Módulo): `Barlow Condensed`, `Bold` (700), tamaño `2.25rem` (36px), interlineado `1.2`, color `#1A1A1A`.
    *   `h2` (Títulos de Tarjeta / Sección): `Barlow Condensed`, `SemiBold` (600), tamaño `1.5rem` (24px), color `#1E1E54`.
    *   `h3` (Subsecciones): `Barlow Condensed`, `Medium` (500), tamaño `1.125rem` (18px), color `#475569`.
    *   `body` (Texto Base): `Barlow Condensed`, `Regular` (400), tamaño `1rem` (16px), color `#334155`.
    *   `microcopy` (Metadatos / Subtextos): `Barlow Condensed`, `Light` (300) o `Regular`, tamaño `0.875rem` (14px) o `0.75rem` (12px), color `#64748B`.

---

## 4. Estructura Global y Layout (Retícula)

El layout de la WebApp "GeoReporta" se basa en una cuadrícula unificada que prioriza el acceso rápido a los módulos críticos desde cualquier dispositivo (diseño responsivo y ágil):

*   **Menú Lateral de Navegación (Sidebar)**:
    *   **Ancho fijo**: `260px` en pantallas grandes.
    *   **Color de Fondo**: `#1E1E54` (Azul Marino CTE profundo).
    *   **Comportamiento Interactivo**: Los enlaces inactivos se muestran en un gris azulado claro (`#94A3B8`). El enlace activo se destaca con un fondo `#2D2D93` y una sutil barra vertical de `4px` de grosor en **Verde Limón Reflector (`#CCFF00`)** en el borde izquierdo.
    *   **Secciones integradas**: Dashboard, Incidencias (Lista de Incidencias), Gestión (Usuarios, Roles), Catálogos (Ubicaciones, Categorías, Organizaciones), Configuración (Reportar, Perfil, Mapa).
*   **Banda Superior (Encabezado Global)**:
    *   **Altura fija**: `70px`, fondo `#FFFFFF` con borde inferior de `1px` en `#E2E8F0`.
    *   **Logotipo de la CTE**: Sello circular oficial alineado a la izquierda del contenido principal para anclar la identidad visual.
    *   **Buscador Unificado Lineal**: Entrada de texto centralizada con placeholder predictivo: *"Buscar por placa, cédula, RUC o pasaporte..."* para agilizar las consultas prioritarias de tránsito.
    *   **Controles Globales**: Lado derecho con iconos lineales (Notificaciones, Ajustes), Avatar de Perfil y etiqueta del rol del usuario (`Admin Global / SISTEMA`).

---

## 5. Anatomía Detallada de los Módulos Base (UI Specs)

A partir de los wireframes de alta fidelidad desarrollados en Visily, se formalizan las especificaciones técnicas de desarrollo para cada una de las tres pantallas base:

### Módulo A: Administración de Usuarios (GESTIÓN / USUARIOS)
Este módulo gestiona el personal de tránsito municipal y los operadores con permisos delegados en los GADs (Gobiernos Autónomos Descentralizados).

1.  **Botón de Acción Primaria**: Posicionado en la esquina superior derecha (`flex justify-end`).
    *   *Texto*: `+ Nuevo usuario`
    *   *Estilo*: Fondo `--color-brand-hivis` (`#CCFF00`), texto `--color-brand-hivis-text` (`#111827`), esquinas redondeadas de `8px` (`rounded-lg`), sin sombras duras.
2.  **Barra de Búsqueda y Filtros**:
    *   Un input de texto a la izquierda (`w-1/3`) para buscar por nombre o correo.
    *   Tres filtros desplegables interactivos con borde fino de 1px: `Todos los roles`, `Todas las organizaciones`.
    *   Botón `Filtrar` lineal secundario con icono de embudo, y botón de borrado de filtros con una `X` estilizada.
3.  **Tabla de Datos de Operadores**:
    *   *Fila alternada*: Color de fondo intercalado blanco (`#FFFFFF`) y gris ultra claro (`#F8F9FA`).
    *   *Columna Foto*: Miniatura circular del operador (`w-10 h-10 rounded-full`).
    *   *Columna Nombre Completo*: Nombre principal en negrita (`text-slate-800 font-semibold`) y número de ID técnico en la línea inferior (`text-slate-500 text-xs font-mono`).
    *   *Columna Email / Contacto*: Dirección de correo con icono de sobre y número de teléfono celular debajo.
    *   *Columna Rol Asignado (Chips de Rol)*:
        *   `ADMIN ORG`: Fondo morado/azul muy sutil con texto `#4C3DA8` en Barlow Condensed Semibold.
        *   `OPERADOR ORG`: Fondo gris-azul sutil con texto `#475569`.
    *   *Columna Organización (GAD)*: Nombre de la entidad con un icono de edificio público (`#475569`).
    *   *Columna Estado (Semáforo de Actividad)*:
        *   `Activo`: Texto verde con icono de check circular (`#2B8A3E`).
        *   `Pendiente`: Texto amarillo/miel con icono de círculo vacío (`#FFC600`) para usuarios registrados que no han completado el flujo de onboarding.
        *   `Inactivo`: Texto rojo con icono de círculo tachado (`#EF142B`).
    *   *Columna Acciones*: Icono de tres puntos verticales compactos para desplegar acciones de fila (Editar, Suspender, Eliminar).
4.  **Cards de Soporte Inferiores (Bento Grid de 3 Columnas)**:
    *   Tres tarjetas con fondo blanco y bordes redondeados de `12px` que promueven acciones de administración técnica:
        *   *Card 1 (Políticas de Seguridad)*: Icono de escudo. Enlace interactivo en Azul Marino con flecha: `Configurar seguridad ->`.
        *   *Card 2 (Gestión de Organizaciones)*: Icono de edificio. Enlace: `Ver organizaciones ->`.
        *   *Card 3 (Auditoría de Acceso)*: Icono de hoja de registro. Enlace: `Descargar reporte CSV ->`.

---

### Módulo B: Gestión de Ubicaciones (CATÁLOGOS / UBICACIONES)
Permite la delimitación territorial del país para clasificar geográficamente la procedencia de cada infracción y categoría de incidente.

1.  **Botón de Acción Primaria**: `+ Nueva localización` (Fondo verde neón reflectivo, texto oscuro, `rounded-lg`).
2.  **Tabla Jerárquica de Árbol (Tree Accordion Table)**:
    *   Permite colapsar y expandir los niveles territoriales mediante iconos de flecha angular (`>`).
    *   La identación visual aumenta `16px` por cada subnivel (País -> Provincia -> Cantón -> Parroquia) para asegurar una jerarquía visual clara.
    *   *Columna Nombre*: Muestra la estructura de nombres (`Ecuador`, `Pichincha`, `Santa Elena`, `Salinas`, `Olón`, etc.).
    *   *Columna Código*: Códigos viales y territoriales de tránsito en color de contraste e identificación monoespaciada (ej. `EC` en morado, `EC-17` o `EC-24-01-01` en rojo/mora suave).
    *   *Columna Nivel (Pills de Categorización Territorial)*:
        *   `País`: Chip fondo morado oscuro con texto blanco (`rounded-md text-xs font-bold`).
        *   `Provincia`: Chip fondo azul eléctrico/celeste.
        *   `Cantón`: Chip fondo amarillo vial/naranja.
        *   `Parroquia`: Chip fondo verde vial/bosque.
3.  **Métricas del Pie de Página (Bento Grid de 4 Columnas KPI)**:
    *   Cuatro tarjetas de visualización rápida ubicadas debajo de la tabla principal para una síntesis inmediata de datos:
        *   *Tarjeta 1 (Total Ubicaciones)*: Cifra destacada "1,248" con subtexto "A lo largo del territorio nacional" (icono de pin de mapa).
        *   *Tarjeta 2 (Nuevas Mes)*: Cifra "12" con indicador de porcentaje "+5% vs. mes anterior" (icono de añadir).
        *   *Tarjeta 3 (Nivel Crítico)*: Texto destacado "Provincia" con etiqueta "Mayor densidad de reportes" (icono de tendencia ascendente).
        *   *Tarjeta 4 (Sincronización)*: Texto destacado "Activa" con metadato "Última actualización: Hace 5m" (icono de sincronización circular).

---

### Módulo C: Matriz de Permisos y Nuevo Rol (GESTIÓN / ROLES / NUEVO ROL)
Formulario técnico avanzado de dos columnas para definir permisos granulares por módulo.

1.  **Cabecera de Formulario**:
    *   Breadcrumbs claros: `GESTIÓN / ROLES / NUEVO ROL`.
    *   Botón secundario `Cancelar` (Borde fino gris, fondo transparente, texto `#475569`).
    *   Botón primario de guardado `Guardar Rol` (Fondo neón, alta visibilidad, texto oscuro).
2.  **Columna Izquierda (Identificación y Resumen)**:
    *   *Card de Identificación*: Campo de entrada "Nombre del Rol" con marcador de posición claro (`Ej: operador_campo`) y área de texto para "Descripción" del alcance funcional del rol.
    *   *Card de Estado del Sistema*: Caja informativa compacta que muestra la cantidad de permisos asignados en tiempo real (ej. "Permisos asignados: 0"), usuarios vinculados al nuevo rol (ej. "Ninguno (Nuevo)") y un tag activo de disponibilidad técnica: `✓ DISPONIBLE PARA ASIGNACIÓN` en fondo verde claro y texto verde oscuro.
3.  **Columna Derecha (Matriz de Permisos)**:
    *   *Card Principal "Matriz de Permisos"*: Buscador superior de permisos rápidos y enlace de interacción en la esquina derecha para `Expandir todo` o colapsar secciones.
    *   *Secciones de Módulo Acordeón*: Cada módulo del sistema se agrupa en un bloque colapsable. El bloque activo/expandido (ej. `Gestión de Incidencias`) muestra un icono de cuadrícula y despliega sus sub-módulos asociados en filas limpias:
        *   Cada sub-módulo (ej. `Lista de Incidencias`, `Crear Incidencias`, `Asignación`, `Resolución`) tiene dos casillas de verificación (Checkboxes) etiquetadas a la derecha de la fila: `LECTURA` y `ESCRITURA`.
        *   Los checkboxes seleccionados se rellenan con el color institucional Azul Marino de la CTE (`#1E1E54`) y un check blanco, garantizando un alto contraste interactivo.
    *   *Cajas de Leyenda de Permisos (Soporte Visual)*: Dos bloques en el pie que detallan el significado técnico de otorgar `Permisos de Lectura` (icono de candado) o `Permisos de Escritura` (icono de lápiz).
    *   *Footer de Validación Técnica "Verificación de Seguridad"*: Banner horizontal destacado con fondo amarillo de advertencia vial muy sutil. Alerta al administrador: *"Asegúrese de no otorgar privilegios críticos a roles operativos"*. A la derecha del banner, incorpora el botón de acción rápida `LIMPIAR SELECCIÓN` (Texto rojo, icono de papelera).

---

## 6. Recursos Gráficos y Microinteracciones

*   **El Personaje Pedagógico "Vialito"**:
    *   El carismático muñeco educador vial de la CTE (`vialito.jpg`) se integra en la WebApp como el avatar de **asistencia interactiva en línea**.
    *   Aparecerá en la esquina inferior derecha mediante una burbuja flotante discreta. Su rol es actuar como soporte de UX Writing, explicando con términos amigables qué datos se deben ingresar en campos complejos o qué normativa de tránsito rige sobre una categoría de incidencia seleccionada.
*   **Iconografía Lineal Técnica**:
    *   Uso exclusivo de iconos lineales sin relleno con un **grosor de trazo consistente de 2.0px a 2.5px** (haciendo juego con el estilo "Moderno / Clean" y emulando la señalización vial de metal cepillado).
*   **Estados de Hover y Focus**:
    *   Cualquier botón o campo en foco del ratón (*hover* o *focus*) debe suavizar su transición con transiciones CSS rápidas (`transition: all 0.2s ease-in-out`).
    *   Los campos de entrada de formulario enfocados mostrarán un borde de `2px` con el color Azul Marino de la CTE (`#1E1E54`) para guiar el ojo del usuario.

---

## 7. Directrices de Redacción y Tono (UX Writing)

El portal es operado bajo circunstancias de alto estrés vial. El lenguaje del sistema debe estructurarse bajo los siguientes principios:

*   **Claro y Sin Burocracia**: Evitar el uso excesivo de artículos de ley o siglas complejas. Redactar en voz activa y con verbos directos (ej. *"Sube el acta firmada"* en lugar de *"Proceda con la anexión de la prueba documental pertinente"*).
*   **Situado y Humano**: En los flujos de creación o búsqueda, incorporar marcadores de posición basados en ejemplos de la vida real (ej. en el buscador: *"Ingrese número de placa ej. GXA-1234"*).
*   **Mensajes de Error Instructivos, no Punitivos**: Si el operador comete un error, el sistema no debe limitarse a marcar la casilla en rojo. Debe dar una solución amigable: *"El número de cédula ingresado debe contener 10 dígitos. Por favor, verifique el documento e intente nuevamente."*
