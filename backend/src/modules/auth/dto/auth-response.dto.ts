export interface AuthTokensDto {
  accessToken: string;
  refreshToken: string;
}

export interface UserDto {
  id: number;
  tenantId: number;
  email: string;
  name: string;
  picture: string | null;
  role: string;
}

export interface AuthResponseDto {
  user: UserDto;
  tokens: AuthTokensDto;
}
