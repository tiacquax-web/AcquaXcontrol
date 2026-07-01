"use client"
import { useState, useMemo } from 'react'
import { useMeters } from '@/hooks/useMeters'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

interface MeterSelectionPanelProps {
  companyId?: string
  complexId?: string
  blockId?: string
  apartmentId?: string
  selected: string[]
  onChange: (ids: string[]) => void
  maxSelectable?: number
}

export default function MeterSelectionPanel({ companyId, complexId, blockId, apartmentId, selected, onChange, maxSelectable }: MeterSelectionPanelProps) {
  const [search, setSearch] = useState('')
  const { meters, loading } = useMeters({ companyId, complexId, blockId, apartmentId, search, take: 200, enabled: !!(companyId||complexId||blockId||apartmentId), withApartment: true, withBlock: true, withComplex: true })

  const filtered = useMemo(()=> meters.filter(m => !search || m.register?.toLowerCase().includes(search.toLowerCase())), [meters, search])
  const filteredIds = useMemo(()=> filtered.map(m => m.id), [filtered])
  const allFilteredSelected = filteredIds.length > 0 && filteredIds.every(id => selected.includes(id))

  function toggle(id: string) {
    if (selected.includes(id)) {
      onChange(selected.filter(s=>s!==id))
    } else {
      if (maxSelectable && selected.length >= maxSelectable) return
      onChange([...selected, id])
    }
  }

  function toggleAll() {
    if (filteredIds.length === 0) return

    if (allFilteredSelected) {
      onChange(selected.filter(id => !filteredIds.includes(id)))
      return
    }

    const alreadySelected = new Set(selected)
    const idsToAdd = filteredIds.filter(id => !alreadySelected.has(id))

    if (idsToAdd.length === 0) return

    if (maxSelectable) {
      const remainingSlots = maxSelectable - selected.length
      if (remainingSlots <= 0) return
      onChange([...selected, ...idsToAdd.slice(0, remainingSlots)])
      return
    }

    onChange([...selected, ...idsToAdd])
  }

  return (
    <div className='flex flex-col h-full gap-1.5'>
      <div className='flex items-center gap-2'>
        <Input placeholder='Buscar medidor...' value={search} onChange={e=>setSearch(e.target.value)} className='h-7 text-[11px] px-2' />
        <Button
          type='button'
          variant='outline'
          size='sm'
          className='h-7 text-[11px] px-2'
          onClick={toggleAll}
          disabled={loading || filteredIds.length === 0}
        >
          {allFilteredSelected ? 'Desmarcar todos' : 'Selecionar todos'}
        </Button>
      </div>
      <ScrollArea className='flex-1 rounded border p-1'>
        <div className='space-y-0.5'>
          {loading && <div className='text-xs text-muted-foreground'>Carregando...</div>}
          {!loading && filtered.map(m => {
            const checked = selected.includes(m.id)
            return (
              <label key={m.id} className={cn('flex items-start gap-2 px-2 py-1 rounded cursor-pointer border', checked ? 'bg-primary/5 border-primary' : 'hover:bg-muted')}>                
                <Checkbox className='h-3.5 w-3.5' checked={checked} onCheckedChange={()=>toggle(m.id)} />
                <div className='flex flex-col leading-tight'>
                  <span className='font-medium text-[11px]'>{m.register}</span>
                  {(m as any).apartment?.name && (
                    <span className='text-[10px] text-muted-foreground'>{(m as any).apartment?.name} • {(m as any).apartment?.block?.name}</span>
                  )}
                </div>
              </label>
            )
          })}
          {!loading && filtered.length === 0 && <div className='text-xs text-muted-foreground'>Nenhum medidor.</div>}
        </div>
      </ScrollArea>
      {maxSelectable && <div className='text-[10px] text-muted-foreground text-right'>Máx: {maxSelectable}</div>}
      <div className='flex flex-wrap gap-1 pt-1'>
        {/* Só exibimos chips de medidores que existem no contexto/lista atual —
            nunca o UUID cru. Medidores de um contexto anterior que não aparecem
            mais aqui são ignorados na exibição (a seleção é limpa automaticamente
            pelo MonitoringPage ao trocar de contexto). */}
        {selected
          .map(id => meters.find(mm => mm.id === id))
          .filter((m): m is NonNullable<typeof m> => !!m)
          .slice(0, 6)
          .map(m => (
            <Badge key={m.id} variant='secondary' className='text-[10px] px-1 py-0.5'>{m.register}</Badge>
          ))}
        {selected.length > 6 && <Badge variant='outline' className='text-[10px] px-1 py-0.5'>+{selected.length - 6}</Badge>}
      </div>
    </div>
  )
}
