export interface ISistemaConfig {
  id: number;
  clave: string;
  valor: string;
  descripcion?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ICreateSistemaConfigDto {
  clave: string;
  valor: string;
  descripcion?: string;
}

export interface IUpdateSistemaConfigDto {
  valor?: string;
  descripcion?: string;
}
