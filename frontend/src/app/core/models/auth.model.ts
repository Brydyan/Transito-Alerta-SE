export interface Avatar {
  url: string;
  key?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface TokenInfo {
  iat: number;
  exp: number;
  iatDate: string;
  expDate: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  sid: string;
  sub: number;
  email: string;
  nombre: string;
  rolId: number | null;
  nombreRol: string | null;
  avatar: Avatar;
  roles: number[];
  accessTokenInfo: TokenInfo;
  refreshTokenInfo: TokenInfo;
}

export interface RefreshTokenResponse {
  accessToken: string;
  createdAt?: string;
  expiresAt?: string;
}

export interface User {
  id: string;
  email: string;
  name?: string | null;
  roleId?: number | null;
  roleName?: string | null;
  avatar?: Avatar | null;
  
  // Agregado por T2 (soportar nueva API)
  role?: 'citizen' | 'operator' | 'admin';
  device_uuid?: string;
  created_at?: Date;
}

export interface AuthResponse {
  access_token: string;
  user?: User;
}

export interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  token: string | null;
  sid: string | null;
  tokenCreatedAt: string | null;
  tokenExpiresAt: string | null;
}
