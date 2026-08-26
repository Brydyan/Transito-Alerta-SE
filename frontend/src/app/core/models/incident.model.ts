export interface Incident {
  id: string;
  title: string;
  description: string;
  lat: number;
  lng: number;
  status: 'pending' | 'in_progress' | 'resolved';
  priority: 'low' | 'medium' | 'high';
  citizen_id: string;
  assigned_to: string | null;
  zone_id: string | null;
  geofence_matched: boolean;
  created_at: Date;
  updated_at: Date;
  resolved_at?: Date;
}

export interface CreateIncidentDto {
  title: string;
  description: string;
  lat: number;
  lng: number;
  priority?: 'low' | 'medium' | 'high';
  category_ids?: string[];
}
