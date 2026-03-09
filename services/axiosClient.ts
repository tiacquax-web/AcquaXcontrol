/**
 * axiosClient.ts
 *
 * Instância centralizada do axios.
 * - No browser: usa URL relativa (/api) para que cookies httpOnly funcionem
 *   no mesmo domínio da página (resolve problema de cross-origin cookie).
 * - No servidor (SSR/Node): usa a URL absoluta do env.
 *
 * IMPORTANTE: Todos os services devem importar este client em vez de usar
 * axios diretamente + NEXT_PUBLIC_API_URL, para evitar erros de cross-origin
 * quando a URL do sandbox muda.
 */
import axios from "axios";

function getBaseUrl(): string {
  if (typeof window !== "undefined") {
    // Browser → relativo → mesmo origem → cookie session funciona
    return "/api";
  }
  // SSR/Node → usa variável de ambiente ou relativo como fallback
  return process.env.NEXT_PUBLIC_API_URL || "/api";
}

const axiosClient = axios.create({
  baseURL: getBaseUrl(),
  withCredentials: true,
});

export default axiosClient;
