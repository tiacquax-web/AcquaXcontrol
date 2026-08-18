"use client"

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'

// Tipos de usuário para preview
export type PreviewRole = 'real' | 'morador' | 'sindico' | 'administradora' | 'programador' | 'administrador'

export const ROLE_LABELS: Record<PreviewRole, string> = {
  real: 'Meu perfil real',
  morador: 'Morador',
  sindico: 'Síndico',
  administradora: 'Administradora',
  programador: 'Programador',
  administrador: 'Administrador',
}

// Permissões simuladas para cada tipo de usuário (para o sidebar)
export const ROLE_PERMISSIONS: Record<Exclude<PreviewRole, 'real'>, { entity: string; action: string }[]> = {
  morador: [
    { entity: 'reading', action: 'read' },
    { entity: 'apartmentConsumptionReport', action: 'read' },
    { entity: 'dealershipReading', action: 'read' },
  ],
  sindico: [
    { entity: 'reading', action: 'read' },
    { entity: 'reading', action: 'create' },
    { entity: 'apartmentConsumptionReport', action: 'read' },
    { entity: 'apartmentConsumptionReport', action: 'create' },
    { entity: 'dealershipReading', action: 'read' },
    { entity: 'dealershipReading', action: 'create' },
    { entity: 'complex', action: 'read' },
    { entity: 'meter', action: 'read' },
    { entity: 'reservoir', action: 'read' },
  ],
  administradora: [
    { entity: 'reading', action: 'read' },
    { entity: 'reading', action: 'create' },
    { entity: 'apartmentConsumptionReport', action: 'read' },
    { entity: 'apartmentConsumptionReport', action: 'create' },
    { entity: 'dealershipReading', action: 'read' },
    { entity: 'dealershipReading', action: 'create' },
    { entity: 'complex', action: 'read' },
    { entity: 'complex', action: 'create' },
    { entity: 'meter', action: 'read' },
    { entity: 'meter', action: 'create' },
    { entity: 'reservoir', action: 'read' },
    { entity: 'user', action: 'read' },
    { entity: 'role', action: 'read' },
  ],
  programador: [
    { entity: 'system', action: 'create' },
    { entity: 'company', action: 'create' },
    { entity: 'complex', action: 'create' },
    { entity: 'block', action: 'create' },
    { entity: 'apartment', action: 'create' },
    { entity: 'meter', action: 'create' },
    { entity: 'iotDevice', action: 'create' },
    { entity: 'reading', action: 'create' },
    { entity: 'dealershipReading', action: 'create' },
    { entity: 'apartmentConsumptionReport', action: 'create' },
    { entity: 'reservoir', action: 'create' },
    { entity: 'user', action: 'create' },
    { entity: 'role', action: 'create' },
  ],
  administrador: [
    { entity: 'system', action: 'create' },
    { entity: 'company', action: 'create' },
    { entity: 'complex', action: 'create' },
    { entity: 'block', action: 'create' },
    { entity: 'apartment', action: 'create' },
    { entity: 'meter', action: 'create' },
    { entity: 'iotDevice', action: 'create' },
    { entity: 'reading', action: 'create' },
    { entity: 'dealershipReading', action: 'create' },
    { entity: 'apartmentConsumptionReport', action: 'create' },
    { entity: 'reservoir', action: 'create' },
    { entity: 'user', action: 'create' },
    { entity: 'role', action: 'create' },
  ],
}

// Context simulado para cada tipo (para o dashboard)
export const ROLE_CONTEXT: Record<Exclude<PreviewRole, 'real'>, any> = {
  morador: {
    isSystem: false,
    systemRoles: [],
    apartments: [{
      id: 'preview-apt',
      name: '101',
      block: {
        id: 'preview-block',
        name: 'Bloco A',
        complexId: 'preview-complex',
        complex: {
          id: 'preview-complex',
          socialName: 'Condomínio Preview',
          aliasName: 'Preview',
          company: { id: 'preview-co', name: 'AcquaX' },
        },
      },
    }],
    blocks: [],
    complexes: [],
    companyIds: [],
    accessibleComplexIds: ['preview-complex'],
    glComplexIds: ['preview-complex'],
  },
  sindico: {
    isSystem: false,
    systemRoles: [],
    apartments: [],
    blocks: [{ id: 'preview-block', name: 'Bloco A', complexId: 'preview-complex', complex: { id: 'preview-complex', socialName: 'Condomínio Preview', aliasName: 'Preview' } }],
    complexes: [{ id: 'preview-complex', socialName: 'Condomínio Preview (Síndico)', aliasName: 'Preview', company: { id: 'preview-co', name: 'AcquaX' } }],
    companyIds: [],
    directComplexIds: ['preview-complex'],
    accessibleComplexIds: ['preview-complex'],
    glComplexIds: ['preview-complex'],
  },
  administradora: {
    isSystem: false,
    systemRoles: [],
    apartments: [],
    blocks: [],
    complexes: [
      { id: 'preview-complex', socialName: 'Condomínio Preview (Adm)', aliasName: 'Preview 1', company: { id: 'preview-co', name: 'AcquaX' } },
      { id: 'preview-complex-2', socialName: 'Residencial Teste (Adm)', aliasName: 'Preview 2', company: { id: 'preview-co', name: 'AcquaX' } }
    ],
    companyIds: ['preview-co'],
    directCompanyIds: ['preview-co'],
    accessibleComplexIds: ['preview-complex', 'preview-complex-2'],
    glComplexIds: ['preview-complex'],
  },
  programador: {
    isSystem: true,
    systemRoles: ['Programador'],
    apartments: [],
    blocks: [],
    complexes: [],
    companyIds: [],
    accessibleComplexIds: [],
    glComplexIds: [],
  },
  administrador: {
    isSystem: true,
    systemRoles: ['Administrador'],
    apartments: [],
    blocks: [],
    complexes: [],
    companyIds: [],
    accessibleComplexIds: [],
    glComplexIds: [],
  },
}

interface RolePreviewContextType {
  previewRole: PreviewRole
  setPreviewRole: (role: PreviewRole) => void
  isPreviewing: boolean
  // Retorna permissões (simuladas quando em preview)
  effectivePermissions: { entity: string; action: string }[] | null
  // Retorna contexto (simulado quando em preview)
  effectiveContext: any | null
  // Retorna true se o usuário atual pode usar preview mode (só admin/programador)
  canPreview: boolean
}

const RolePreviewContext = createContext<RolePreviewContextType>({
  previewRole: 'real',
  setPreviewRole: () => {},
  isPreviewing: false,
  effectivePermissions: null,
  effectiveContext: null,
  canPreview: false,
})

export function useRolePreview() {
  return useContext(RolePreviewContext)
}

export function RolePreviewProvider({ children }: { children: React.ReactNode }) {
  const [previewRole, setPreviewRoleState] = useState<PreviewRole>('real')
  const [canPreview, setCanPreview] = useState(false)

  // Carregar do sessionStorage no mount
  useEffect(() => {
    const saved = sessionStorage.getItem('role-preview')
    if (saved && saved !== 'real') {
      setPreviewRoleState(saved as PreviewRole)
    }

    // Verificar se o usuário é admin/programador
    async function checkAccess() {
      try {
        const [ctxRes, userRes] = await Promise.all([
          fetch('/api/auth/my-context', { credentials: 'include' }),
          fetch('/api/auth/me', { credentials: 'include' })
        ]);

        const data = ctxRes.ok ? await ctxRes.json() : null;
        const userData = userRes.ok ? await userRes.json() : null;
        
        const roles = (data?.systemRoles || []).map((r: string) => r.toLowerCase());
        const userEmail = userData?.email?.toLowerCase() || '';
        
        const isMasterEmail = userEmail.includes('acquaxcontrol') || userEmail.includes('@acquax.com') || userEmail === 'tiacquax@gmail.com';
        const isAdmin = roles.some((r: string) => r.includes('admin') || r.includes('master')) || isMasterEmail;

        if (data?.isSystem || isAdmin) {
          setCanPreview(true)
        }
      } catch (err) {
        console.error('[RolePreviewContext] Error checking access:', err);
      }
    }

    checkAccess();
  }, [])

  const setPreviewRole = useCallback((role: PreviewRole) => {
    setPreviewRoleState(role)
    if (role === 'real') {
      sessionStorage.removeItem('role-preview')
    } else {
      sessionStorage.setItem('role-preview', role)
    }
  }, [])

  const isPreviewing = previewRole !== 'real'

  const effectivePermissions = isPreviewing
    ? ROLE_PERMISSIONS[previewRole as Exclude<PreviewRole, 'real'>]
    : null

  const effectiveContext = isPreviewing
    ? ROLE_CONTEXT[previewRole as Exclude<PreviewRole, 'real'>]
    : null

  return (
    <RolePreviewContext.Provider value={{
      previewRole,
      setPreviewRole,
      isPreviewing,
      effectivePermissions,
      effectiveContext,
      canPreview,
    }}>
      {children}
    </RolePreviewContext.Provider>
  )
}
