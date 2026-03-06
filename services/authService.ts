import axios from "axios";

const NEXT_PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL;

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
  const response = await axios.post<LoginResponse>(`${NEXT_PUBLIC_API_URL}/auth/login`, payload, {
    withCredentials: true,
  });
  return response.data;
};
