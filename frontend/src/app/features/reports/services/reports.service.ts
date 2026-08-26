import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';
import {
  IClientsListFilters,
  IConnectionHistoryFilters,
  IReportResponse,
  ISendReportEmailBody,
  ISendClientsListEmailBody,
} from '../interfaces/ireport.interface';

@Injectable({
  providedIn: 'root',
})
export class ReportsService {
  private readonly http = inject(HttpClient);

  private readonly baseUrl = environment.apiUrl;
  private readonly endpoint = `${this.baseUrl}/reports`;

  /** Construye query params omitiendo valores vacíos. */
  private buildParams<T extends object>(filters: T): HttpParams {
    let httpParams = new HttpParams();
    for (const [key, value] of Object.entries(filters as Record<string, unknown>)) {
      if (value !== undefined && value !== null && value !== '') {
        httpParams = httpParams.set(key, String(value));
      }
    }
    return httpParams;
  }

  // ---------- Historial de Conexión ----------

  /** Obtiene el historial de conexión en formato JSON. */
  getConnectionHistory(filters: IConnectionHistoryFilters): Observable<IReportResponse> {
    const params = this.buildParams(filters);
    return this.http.get<IReportResponse>(`${this.endpoint}/connection-history`, { params });
  }

  /** Obtiene el historial de conexión en PDF. */
  getConnectionHistoryPdf(filters: IConnectionHistoryFilters): Observable<Blob> {
    const params = this.buildParams(filters);
    return this.http.get(`${this.endpoint}/connection-history`, {
      params,
      headers: { Accept: 'application/pdf' },
      responseType: 'blob',
    });
  }

  /** Envía por email el historial de conexión (contratoId obligatorio). */
  sendConnectionHistoryEmail(body: ISendReportEmailBody): Observable<unknown> {
    return this.http.post(`${this.endpoint}/connection-history/email`, body);
  }

  // ---------- Listado de Clientes ----------

  /** Obtiene el listado de clientes en formato JSON. */
  getClientsList(filters: IClientsListFilters = {}): Observable<IReportResponse> {
    const params = this.buildParams(filters);
    return this.http.get<IReportResponse>(`${this.endpoint}/clients-list`, { params });
  }

  /** Obtiene el listado de clientes en PDF. */
  getClientsListPdf(filters: IClientsListFilters = {}): Observable<Blob> {
    const params = this.buildParams(filters);
    return this.http.get(`${this.endpoint}/clients-list`, {
      params,
      headers: { Accept: 'application/pdf' },
      responseType: 'blob',
    });
  }

  /** Envía por email el listado de clientes (destinatario obligatorio). */
  sendClientsListEmail(body: ISendClientsListEmailBody): Observable<unknown> {
    return this.http.post(`${this.endpoint}/clients/email`, body);
  }
}
