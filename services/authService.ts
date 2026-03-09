import axios from "axios";

// Em ambiente de browser, sempre usa URL relativa para que os cookies
// (httpOnly session) sejam definidos no mesmo domínio da página.
// Em SSR/Node, usa a URL absoluta do env.
function getApiUrl(): string {
  if (typeof window !== "undefined") {
    // Browser: caminho relativo → mesmo origem da página → cookie funciona
    return "/api";
  }
  return process.env.NEXT_PUBLIC_API_URL || "/api";
}

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
  const response = await axios.post<LoginResponse>(`${getApiUrl()}/auth/login`, payload, {
    withCredentials: true,
  });
  return response.data;
};
