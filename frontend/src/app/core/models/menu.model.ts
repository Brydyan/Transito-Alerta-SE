/**
 * MenuItem interface que coincide con la estructura del backend
 */
export interface MenuItem {
  id: number; // ID del menú en la base de datos
  name: string; // Nombre del menú (antes era 'label')
  route?: string; // Ruta de navegación (nullable)
  icon?: string; // Icono del menú (nullable)
  parent_menu_id?: number; // ID del menú padre (nullable, para jerarquía)
  menu_order: number; // Orden de visualización
  is_active: boolean; // Estado activo/inactivo
  created_at?: string; // Fecha de creación (timestamp)
  children?: MenuItem[]; // Submenús (calculado en backend o frontend)
  expanded?: boolean; // Estado de expansión en el sidebar (solo UI)
}

export interface MenuConfig {
  items: MenuItem[];
}
