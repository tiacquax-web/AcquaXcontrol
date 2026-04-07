import axios from "axios";

// URL relativa /api — independente de variável de ambiente
// Isso evita que NEXT_PUBLIC_API_URL do Vercel (URL absoluta) sobrescreva o valor correto
const API_URL = "/api";

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
    timeout: 15000,
  });
  return response.data;
};
