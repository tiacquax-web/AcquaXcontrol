// Utilitário para cache de permissões do usuário no navegador

const PERMISSIONS_CACHE_KEY = 'user-permissions-cache';

export function getCachedPermissions() {
  if (typeof window === 'undefined') return null;
  try {
    const data = localStorage.getItem(PERMISSIONS_CACHE_KEY);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

export function setCachedPermissions(permissions: any) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(PERMISSIONS_CACHE_KEY, JSON.stringify(permissions));
  } catch {}
}

export function clearCachedPermissions() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(PERMISSIONS_CACHE_KEY);
  } catch {}
}
