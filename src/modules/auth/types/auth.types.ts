export type UserRole = 'candidate' | 'admin';

export interface AuthenticatedUser {
  sub: string;
  email: string;
  role: UserRole;
}

export interface LoginUser {
  email: string;
  password: string;
  role: UserRole;
}
