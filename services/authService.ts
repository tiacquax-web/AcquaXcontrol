import axios from "axios";

// Usa URL relativa /api diretamente — elimina redirect 307 sem→www que bloqueava cookies
// Fallback seguro: process.env.NEXT_PUBLIC_API_URL deve ser '/api' ou não definida
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
