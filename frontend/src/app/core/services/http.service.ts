import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class HttpService {
  private baseUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  get<T>(
    endpoint: string,
    params?: HttpParams | object,
  ): Observable<T> {
    let httpParams = new HttpParams();
    if (params) {
      if (params instanceof HttpParams) {
        httpParams = params;
      } else {
        const record = params as Record<string, unknown>;
        Object.keys(record).forEach(key => {
          const value = record[key];
          if (value !== null && value !== undefined) {
            httpParams = httpParams.set(key, String(value));
          }
        });
      }
    }
    return this.http.get<T>(`${this.baseUrl}${endpoint}`, { params: httpParams });
  }

  post<T>(endpoint: string, body: unknown): Observable<T> {
    return this.http.post<T>(`${this.baseUrl}${endpoint}`, body as object);
  }

  patch<T>(endpoint: string, body: unknown): Observable<T> {
    return this.http.patch<T>(`${this.baseUrl}${endpoint}`, body as object);
  }

  delete<T>(endpoint: string): Observable<T> {
    return this.http.delete<T>(`${this.baseUrl}${endpoint}`);
  }
}
