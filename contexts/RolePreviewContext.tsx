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
    complexes: [{ id: 'preview-complex', socialName: 'Condomínio Preview', aliasName: 'Preview', company: { id: 'preview-co', name: 'AcquaX' } }],
    companyIds: [],
    accessibleComplexIds: ['preview-complex'],
    glComplexIds: ['preview-complex'],
  },
  administradora: {
    isSystem: false,
    systemRoles: [],
    apartments: [],
    blocks: [],
    complexes: [{ id: 'preview-complex', socialName: 'Condomínio Preview', aliasName: 'Preview', company: { id: 'preview-co', name: 'AcquaX' } }],
    companyIds: ['preview-co'],
    accessibleComplexIds: ['preview-complex'],
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
  // Retorna permissões (reais ou simuladas)
  effectivePermissions: { entity: string; action: string }[] | null
  // Retorna contexto (real ou simulado)
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
  const [realPermissions, setRealPermissions] = useState<any[] | null>(null)
  const [realContext, setRealContext] = useState<any | null>(null)
  const [canPreview, setCanPreview] = useState(false)

  // Carregar do sessionStorage no mount
  useEffect(() => {
    const saved = sessionStorage.getItem('role-preview')
    if (saved && saved !== 'real') {
      setPreviewRoleState(saved as PreviewRole)
    }
  }, [])

  // Buscar permissões e contexto reais uma vez
  useEffect(() => {
    fetch('/api/my-permissions', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.permissions) setRealPermissions(data.permissions)
      })
      .catch(() => {})

    fetch('/api/my-context', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          setRealContext(data)
          // Só permite preview se for admin ou programador
          const canPreview = data.isSystem && (data.systemRoles?.includes('Administrador') || !data.systemRoles?.includes('Administrador'))
          setCanPreview(!!data.isSystem)
        }
      })
      .catch(() => {})
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
    : realPermissions

  const effectiveContext = isPreviewing
    ? ROLE_CONTEXT[previewRole as Exclude<PreviewRole, 'real'>]
    : realContext

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
