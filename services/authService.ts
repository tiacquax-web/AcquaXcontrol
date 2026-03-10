import axios from "axios";

// Usa URL relativa (/api) como fallback seguro quando NEXT_PUBLIC_API_URL não está definida.
// Isso garante que o frontend sempre chame a API correta, mesmo sem a variável de ambiente.
const API_URL = process.env.NEXT_PUBLIC_API_URL || "/api";

export interface LoginPayload {
  email: string;
  password: string;
}

export interface LoginResponse {
  message: string;
  token: string;
  user: {
    id: string;
    email: string;
    name: string;
    mustUpdateCredentials?: boolean;
  };
}

export const login = async (payload: LoginPayload) => {
  const response = await axios.post<LoginResponse>(`${API_URL}/auth/login`, payload, {
    withCredentials: true,
  });
  return response.data;
};
