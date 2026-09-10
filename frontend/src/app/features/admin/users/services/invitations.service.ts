import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../../environments/environment';

/**
 * F6 (`2026-09-08-f6-new-user-form`, D-frontend-6) — `POST
 * /api/admin/users/invite` (T3.6, `InvitationsController.invite`).
 * Se invoca DESPUÉS de un `POST /api/users` exitoso cuando el toggle
 * "Envío de invitación" está ON.
 *
 * La elección de un servicio dedicado (vs. método en `UsersService`)
 * es por **paridad con el backend** (que tiene su propio `InvitationsModule`)
 * y por **resiliencia**: si la invitación falla, el usuario ya está
 * creado y la UI muestra un warning — el toast no se acopla al flujo
 * del alta.
 */
@Injectable({
  providedIn: 'root',
})
export class InvitationsService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/admin/users/invite`;

  /**
   * Envía la invitación. `role_id` es requerido (el backend rechaza
   * con 400 si falta); `organization_id` es opcional pero se manda si
   * el form lo tiene — el backend lo acepta como null.
   *
   * 409 significa "el email ya tiene cuenta" — la UI lo trata como
   * warning no bloqueante porque el usuario ya está creado.
   */
  invite(payload: {
    email: string;
    roleId: string | null;
    organizationId: string | null;
  }): Observable<InvitationResponse> {
    const body: Record<string, unknown> = {
      email: payload.email,
      role_id: payload.roleId,
    };
    if (payload.organizationId) {
      body['organization_id'] = payload.organizationId;
    }
    return this.http.post<InvitationResponse>(this.url, body, { withCredentials: true });
  }
}

/** Shape de respuesta de `POST /admin/users/invite` (T3.6). */
export interface InvitationResponse {
  id: string;
  email: string;
  role_id: string;
  organization_id: string | null;
  expires_at: string;
  created_at: string;
}
