# Requerimientos para Implementación de Estilos CSS Responsivos y Estandarización de Modales y Tablas

Este documento define los requerimientos funcionales y visuales para la optimización responsiva en dispositivos móviles, la corrección de alturas y expansión en incidencias, la estandarización de botones en el dashboard y la armonización de modales y tablas en el frontend de la aplicación. Se utiliza la sintaxis EARS (Easy Approach to Requirements Syntax) de manera estricta.

## R1
El sistema DEBE adaptar la disposición de las vistas y contenedores principales del frontend en pantallas con ancho de viewport de dispositivo móvil (menor a 768px) sin generar desbordamiento horizontal (overflow-x) ni ocultar elementos funcionales.

## R2
El sistema DEBE definir reglas de media queries en las hojas de estilos centralizadas (como [layout.css](file:///frontend/styles/layout.css), [components.css](file:///frontend/styles/components.css) y [dashboard-cards.css](file:///frontend/styles/dashboard-cards.css)) para ajustar el escalado de fuentes, márgenes, paddings y alturas en resoluciones de teléfonos celulares.

## R3
DONDE las estructuras de las vistas del frontend lo ameriten para una adaptación fluida, el sistema DEBE utilizar las clases y el sistema de grilla responsivo nativo de Bootstrap (`col-*`, `d-none`, `d-md-block`, flexbox responsivo).

## R4
CUANDO el usuario acceda al módulo de estado individual de incidencias ([estado-individual-incidencia](file:///frontend/js/pages/incidencias/components/estado-individual-incidencia/estado-individual-incidencia-index.component.html)) en pantallas pequeñas (ancho menor a 992px), el sistema DEBE limitar y ajustar las alturas de los contenedores laterales y del chat para evitar una expansión vertical excesiva e innecesaria hacia abajo.

## R5
CUANDO los botones de acceso rápido del dashboard ([dashboard.component.js](file:///frontend/js/pages/dashboard/components/dashboard-index/dashboard.component.js)) se visualicen en pantallas pequeñas (ancho menor a 576px), el sistema DEBE ocultar el texto de cada opción del menú y mostrar únicamente el icono centrado.

## R6
CUANDO los botones de acceso rápido del dashboard se visualicen en pantallas grandes (ancho igual o superior a 576px), el sistema DEBE mostrar tanto el icono como el texto descriptivo en cada opción del menú.

## R7
El sistema DEBE aplicar la clase centralizada `.premium-modal-content` (o la estructura de clases de modal estandarizado de la aplicación) en todos los elementos modales de los módulos del frontend (incluyendo Categorías, Kanban, Incidencias, Instituciones, Permisos, Roles y Ubicaciones) que carezcan de ella, eliminando clases en línea contradictorias como `border-0`.

## R8
El sistema DEBE definir en las reglas de estilos centralizadas de modales en [components.css](file:///frontend/styles/components.css) un borde visible y sutil (por ejemplo, `1px solid var(--border-color)`) que armonice con la paleta de colores actual y genere contraste contra el fondo sombreado.

## R9
El sistema DEBE aplicar un radio de borde (`border-radius`) consistente y centralizado (por ejemplo, mediante la variable `var(--radius-xl)`) en los estilos de modales para evitar esquinas rectas o discrepancias visuales entre módulos.

## R10
DONDE existan listados de datos implementados con tablas HTML estáticas o manuales (específicamente en el módulo de Categorías en [categorias-index.component.html](file:///frontend/js/pages/categorias/components/index/categorias-index.component.html) y [categorias-index.component.js](file:///frontend/js/pages/categorias/components/index/categorias-index.component.js)), el sistema DEBE renderizar el listado utilizando el componente estándar reutilizable `<app-data-table>`, manteniendo la funcionalidad de gestión de categorías y asegurando la uniformidad visual, de paginación y de estados de carga en todo el frontend.
