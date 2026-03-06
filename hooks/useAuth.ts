import { useState } from "react";
import { login as loginService, type LoginPayload, type LoginResponse } from "@/services/authService";

export const useLogin = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = async (payload: LoginPayload): Promise<LoginResponse> => {
    setLoading(true);
    setError(null);
    try {
      const data = await loginService(payload);
      return data;
    } catch (err: any) {
      const message = err.response?.data?.error || err.response?.data?.message || err.message || "Erro ao fazer login";
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { login, loading, error };
};
