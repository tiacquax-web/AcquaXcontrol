// Lib para ler a configuração de visibilidade de abas por tipo de usuário
// A config é armazenada no localStorage como JSON

export type RoleType = 'morador' | 'sindico' | 'administradora' | 'programador' | 'administrador'

// Configuração padrão (mesma da página de personalização)
const DEFAULT_CONFIG: Record<string, Record<RoleType, boolean>> = {
  '/dashboard':           { morador: true, sindico: true, administradora: true, programador: true, administrador: true },
  '/apartment-report':    { morador: true, sindico: true, administradora: true, programador: true, administrador: true },
  '/dealership-readings': { morador: true, sindico: true, administradora: true, programador: true, administrador: true },
  '/readings':            { morador: false, sindico: true, administradora: true, programador: true, administrador: true },
  '/meter-report':        { morador: true, sindico: true, administradora: true, programador: true, administrador: true },
  '/levantamento':       { morador: false, sindico: true, administradora: true, programador: true, administrador: true },
  '/monitoring':          { morador: true, sindico: true, administradora: true, programador: true, administrador: true },
  '/alerts':              { morador: true, sindico: true, administradora: true, programador: true, administrador: true },
  '/reservoir-monitoring':{ morador: true, sindico: true, administradora: true, programador: true, administrador: true },
  '/energy-monitoring':   { morador: true, sindico: true, administradora: true, programador: true, administrador: true },
  '/apuracao':            { morador: false, sindico: false, administradora: true, programador: true, administrador: true },
  '/guia':                { morador: true, sindico: true, administradora: true, programador: true, administrador: true },
  '/suporte':             { morador: true, sindico: true, administradora: true, programador: true, administrador: true },
  '/sugestoes':           { morador: true, sindico: true, administradora: true, programador: true, administrador: true },
  '/api-manager':         { morador: false, sindico: false, administradora: false, programador: true, administrador: true },
  '/companies':           { morador: false, sindico: false, administradora: true, programador: true, administrador: true },
  '/complexes':           { morador: false, sindico: false, administradora: true, programador: true, administrador: true },
  '/blocks':              { morador: false, sindico: false, administradora: true, programador: true, administrador: true },
  '/apartments':          { morador: false, sindico: false, administradora: true, programador: true, administrador: true },
  '/meters':              { morador: false, sindico: false, administradora: true, programador: true, administrador: true },
  '/devices':             { morador: false, sindico: false, administradora: false, programador: true, administrador: true },
  '/gl-integration':      { morador: false, sindico: false, administradora: false, programador: true, administrador: true },
  '/reservoirs':          { morador: false, sindico: false, administradora: true, programador: true, administrador: true },
  '/users':               { morador: false, sindico: true, administradora: true, programador: true, administrador: true },
  '/roles':               { morador: false, sindico: false, administradora: false, programador: true, administrador: true },
}

/**
 * Retorna true/false/null para a visibilidade de uma aba para um tipo de usuário.
 * - true: aba visível
 * - false: aba oculta
 * - null: sem config customizada (usa permissões normais do sistema)
 */
export function getRoleTabVisibility(url: string, role: string | null): boolean | null {
  if (!role || role === 'real') return null

  let config = DEFAULT_CONFIG
  try {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('role-tab-config')
      if (saved) {
        const parsed = JSON.parse(saved)
        // Merge com defaults
        config = { ...DEFAULT_CONFIG }
        Object.keys(config).forEach(key => {
          if (parsed[key]) config[key] = parsed[key]
        })
      }
    }
  } catch {}

  const tabConfig = config[url]
  if (!tabConfig) return null

  return tabConfig[role as RoleType] ?? null
}
