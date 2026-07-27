"use client"

import { useRolePreview, ROLE_LABELS, PreviewRole } from '@/contexts/RolePreviewContext'
import { Users, Eye, X, Check } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'

export function RolePreviewSelector() {
  const { previewRole, setPreviewRole, isPreviewing, canPreview } = useRolePreview()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Fechar dropdown ao clicar fora
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  if (!canPreview) return null

  const roles: PreviewRole[] = ['real', 'morador', 'sindico', 'administradora', 'programador', 'administrador']

  return (
    <div ref={ref} className="relative px-2 mb-2">
      <button
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors border ${
          isPreviewing
            ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300'
            : 'border-transparent text-muted-foreground hover:bg-muted hover:text-foreground'
        }`}
      >
        {isPreviewing ? <Eye className="w-3.5 h-3.5 shrink-0" /> : <Users className="w-3.5 h-3.5 shrink-0" />}
        <span className="flex-1 text-left truncate">
          {isPreviewing ? `Visualizando: ${ROLE_LABELS[previewRole]}` : 'Visualizar como...'}
        </span>
        {isPreviewing && (
          <span
            onClick={(e) => { e.stopPropagation(); setPreviewRole('real') }}
            className="shrink-0 p-0.5 rounded hover:bg-blue-100 dark:hover:bg-blue-900"
            title="Sair do modo visualização"
          >
            <X className="w-3 h-3" />
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-2 right-2 top-full mt-1 z-50 bg-popover border rounded-lg shadow-lg py-1 max-h-80 overflow-y-auto">
          <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
            Selecionar perfil para visualizar
          </div>
          {roles.map(role => {
            const isActive = previewRole === role
            return (
              <button
                key={role}
                onClick={() => {
                  setPreviewRole(role)
                  setOpen(false)
                }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors ${
                  isActive
                    ? 'bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 font-medium'
                    : 'text-foreground hover:bg-muted'
                }`}
              >
                <span className="flex-1 text-left">{ROLE_LABELS[role]}</span>
                {isActive && <Check className="w-3.5 h-3.5 shrink-0" />}
              </button>
            )
          })}
          <div className="border-t mt-1 pt-1 px-3 py-1.5 text-[10px] text-muted-foreground">
            O modo visualização não altera dados reais. Use para testar o que cada perfil vê.
          </div>
        </div>
      )}
    </div>
  )
}
