export interface TokenResponse {
  access_token: string;
  expires_in: number;
}

export interface User {
  id: string;
  email: string;
  username?: string;
  name: string;
  role: "user" | "admin";
  created_at?: string;
  avatar_url?: string;
}

export interface AuthResponse {
  user: User;
  token: TokenResponse;
}

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface RegisterCredentials {
  email: string;
  username: string;
  password: string;
  name: string;
}

export interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (credentials: LoginCredentials) => Promise<void>;
  register: (credentials: RegisterCredentials) => Promise<void>;
  logout: () => void;
}
