import { useState, useEffect } from "react";
import { login as loginService, type LoginPayload, type LoginResponse } from "@/services/authService";

export const useLogin = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Limpa o erro ao montar o componente (evita mostrar erro de sessão anterior)
  useEffect(() => {
    setError(null);
  }, []);

  const login = async (payload: LoginPayload): Promise<LoginResponse> => {
    setLoading(true);
    setError(null);
    try {
      const data = await loginService(payload);
      return data;
    } catch (err: any) {
      // Distingue entre erro de rede e erro retornado pela API
      let message: string;

      if (err.message === "Network Error" || err.code === "ERR_NETWORK" || !err.response) {
        message = "Não foi possível conectar ao servidor. Verifique sua conexão com a internet e tente novamente.";
      } else {
        message =
          err.response?.data?.error ||
          err.response?.data?.message ||
          err.message ||
          "Erro ao fazer login";
      }

      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { login, loading, error };
};
