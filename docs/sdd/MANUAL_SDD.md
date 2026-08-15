# Manual de Uso: Arnés IA (Spec Driven Development)

Este documento explica el flujo de trabajo exacto que debes seguir como desarrollador (Humano) cada vez que quieras que la IA desarrolle una nueva funcionalidad en este proyecto de forma segura y estructurada.

---

## 🏗️ Fase 1: Planificación (Tu turno)

La IA no adivina lo que quieres hacer. Debes definir el alcance primero.

1. **Abre el archivo `feature_list.json`** en la raíz del proyecto.
2. **Añade un nuevo objeto** al arreglo `"features"` con el detalle de lo que necesitas.
   
   **Ejemplo:**
   ```json
   {
     "id": 2,
     "name": "exportar_pdf",
     "title": "Exportar Incidencia a PDF",
     "description": "El sistema debe permitir a un supervisor descargar una incidencia específica en formato PDF incluyendo todas sus fotos y detalles.",
     "acceptance": [
       "Existe un botón 'Exportar' en la vista de detalle de la incidencia.",
       "El backend genera un PDF con la librería DomPDF.",
       "El archivo descargado se llama 'incidencia_{id}.pdf'."
     ],
     "sdd": true,
     "status": "pending"
   }
   ```
   > **Nota Importante:** Asegúrate de que el `"status"` sea `"pending"` y que `"sdd": true` esté presente.

3. Guarda el archivo.

---

## 🤖 Fase 2: Análisis y Diseño (Turno de la IA)

1. Abre tu terminal o chat con la IA (ej. Cursor, Windsurf, Antigravity, etc.).
2. Dile: **"Inicia el trabajo en la feature pendiente"** o **"Implementa la siguiente feature"**.
3. **¿Qué hará la IA?**
   - Ejecutará `./init.sh` para verificar que el proyecto compile y los tests pasen.
   - Creará la carpeta `specs/exportar_pdf/`.
   - Redactará 3 archivos ahí dentro:
     - `requirements.md` (Requisitos exactos).
     - `design.md` (Cómo planea hacerlo a nivel de código y base de datos).
     - `tasks.md` (Checklist paso a paso).<
   - Cambiará el status en el JSON a `"spec_ready"`.
   - **Se detendrá y te pedirá permiso para continuar.**

---

## 👁️ Fase 3: Aprobación Humana (Tu turno)

1. Abre y lee los archivos generados en `specs/tu_feature/`.
2. Especialmente, revisa el **`design.md`**. Si la IA planea instalar una librería que no te gusta o modificar una tabla que no debe, **este es el momento de detenerla**.
3. Si hay algo mal, dile a la IA: *"Corrige el diseño, prefiero que uses la librería X en lugar de Y"*.
4. Si todo se ve perfecto, dile a la IA: **"Diseño aprobado. Procede con la implementación."**

---

## 💻 Fase 4: Implementación y Testing (Turno de la IA)

1. **¿Qué hará la IA?**
   - Cambiará el status en el JSON a `"in_progress"`.
   - Escribirá el código fuente en Frontend y Backend.
   - Irá marcando con `[x]` las tareas en el archivo `tasks.md`.
   - **Escribirá pruebas unitarias** para respaldar el código.
   - Ejecutará `./init.sh` para verificar que **nada se haya roto** y que las pruebas nuevas pasen.
2. Una vez que termine, la IA misma validará su trabajo. Si todo es correcto, cambiará el status a `"done"` y te notificará que ha terminado.

---

## 🧹 Fase 5: Cierre de Sesión (Automático)

- El resumen de todo lo que hizo la IA quedará guardado en `progress/history.md`.
- El archivo `progress/current.md` quedará vacío para la siguiente tarea.
- Tú solo tienes que hacer `git add .` y `git commit -m "feat: exportar pdf"`.

¡Y listo! Con este flujo te aseguras de que el código generado tenga sentido arquitectónico, no rompa tu sistema y venga siempre respaldado por pruebas.
