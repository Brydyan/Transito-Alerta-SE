# Specification: F6 Perfil Redesign

## Layout

### Header
- Breadcrumb: CATÁLOGOS > PERFIL
- Title: "Mi Perfil"
- Description: "Gestione su información de contacto y preferencias de cuenta dentro del panel administrativo."

### Main Form Section
Title: "Información Personal"  
Subtitle: "Actualiza tus datos personales. Los campos marcados con * son obligatorios."

#### Form Fields:
1. **Foto de perfil** (left, 1/3 width):
   - Circular avatar (gray placeholder with "A")
   - "JPG, PNG, WEBP. Máximo 0.78 MB. La imagen se recortará a 512×512 px."
   - Button: "Subir nueva foto"

2. **Right 2/3 (form fields)**:
   - **Nombre** * (input, required)
   - **Apellido** * (input, required)
   - **Teléfono** (input, tel format, optional)
   - **Correo electrónico** (email field, readonly or display-only)
   - **Aviso de Privacidad** (info box):
     - Icon + "Sus datos de contacto solo serán utilizados para notificaciones críticas del sistema y no serán compartidos con terceros."
   - **Button**: "Guardar Cambios" (purple, bottom-right)
   - **Last update**: "Última actualización: 22/7/2026, 12:24:18 p.m."

### Bottom Cards (3-column)
1. **CONTRASEÑA** 
   - Icon (security lock)
   - Text: "Actualice su clave de acceso para mayor seguridad."
   - Link: "Configurar seguridad ..."

2. **PREFERENCIA DE ZONA**
   - Icon (location pin)
   - Text: "Configure su cantón de visualización predeterminado."
   - Link: "Ver zonas ..."

3. **SOPORTE TÉCNICO**
   - Icon (chat/help)
   - Text: "¿Dudas con su perfil? Contacte con el Administrador Global."

## Scenarios

### S1: Profile loads
**Given** user is logged in  
**When** navigating to /app/perfil  
**Then**:
- Title "Mi Perfil" displays
- Form fields pre-populated with user data
- Photo avatar shows current profile image (or placeholder)
- Action cards visible at bottom

### S2: Edit personal info
**Given** form is loaded  
**When** user edits "Nombre" field and clicks "Guardar Cambios"  
**Then**:
- Form submits
- Toast: "Perfil actualizado"
- Last update time updates

### S3: Validation
**Given** form is displayed  
**When** user clears "Nombre" and clicks "Guardar Cambios"  
**Then**:
- "Nombre es obligatorio" error shows
- Form does not submit

### S4: Phone format
**Given** phone input has focus  
**When** user types "593" (Ecuador country code)  
**Then**:
- Input auto-formats to "(+593) 99 999 9999"
- Valid format recognized

### S5: Upload photo
**Given** form is displayed  
**When** user clicks "Subir nueva foto" and selects JPG file  
**Then**:
- File picker opens, filters .jpg, .png, .webp
- File selected, preview updates
- On "Guardar Cambios", photo uploads via multipart

### S6: Error state
**Given** user submits form  
**When** backend returns 500  
**Then**:
- Toast: "Error al actualizar perfil"
- Form fields retain values
- No navigation away

### S7: Readonly fields
**Given** form displays  
**When** user focuses on "Correo electrónico"  
**Then**:
- Field is readonly (no edit)
- Info icon shows: "Este campo no puede ser modificado"

## Display Rules
- Form fields: ReactiveForm with validators
- Buttons: Primary (purple) and secondary (outline)
- Phone input: Use ngx-mask or custom formatter
- Photo preview: 128×128 px, circular crop
- Card backgrounds: Light gray (#F3F4F6)
