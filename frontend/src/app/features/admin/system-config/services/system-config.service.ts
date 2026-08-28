import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../../environments/environment';
import {
  ICreateSistemaConfigDto,
  ISistemaConfig,
  IUpdateSistemaConfigDto,
} from '../interfaces/system-config.interface';

@Injectable({
  providedIn: 'root',
})
export class SystemConfigService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiUrl;
  private readonly endpoint = `${this.baseUrl}/system-configs`;

  getConfigs(): Observable<ISistemaConfig[]> {
    return this.http.get<ISistemaConfig[]>(this.endpoint);
  }

  getConfigByClave(clave: string): Observable<ISistemaConfig> {
    return this.http.get<ISistemaConfig>(`${this.endpoint}/${encodeURIComponent(clave)}`);
  }

  createConfig(dto: ICreateSistemaConfigDto): Observable<ISistemaConfig> {
    return this.http.post<ISistemaConfig>(this.endpoint, dto);
  }

  updateConfig(clave: string, dto: IUpdateSistemaConfigDto): Observable<ISistemaConfig> {
    return this.http.patch<ISistemaConfig>(`${this.endpoint}/${encodeURIComponent(clave)}`, dto);
  }

  deleteConfig(clave: string): Observable<ISistemaConfig> {
    return this.http.delete<ISistemaConfig>(`${this.endpoint}/${encodeURIComponent(clave)}`);
  }
}
