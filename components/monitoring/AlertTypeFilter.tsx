"use client"
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'

interface AlertTypeFilterProps {
  distinctAlerts: string[]
  selected: string[]
  onChange: (values: string[]) => void
}

export default function AlertTypeFilter({ distinctAlerts, selected, onChange }: AlertTypeFilterProps) {
  function toggle(a: string) {
    if (selected.includes(a)) onChange(selected.filter(s=>s!==a))
    else onChange([...selected, a])
  }
  if (!distinctAlerts.length) return <div className='text-xs text-muted-foreground'>Sem alertas neste período</div>
  return (
    <div className='flex flex-col gap-1'>
      {distinctAlerts.map(a => (
        <label key={a} className='flex items-center gap-2 text-xs cursor-pointer'>
          <Checkbox checked={selected.includes(a)} onCheckedChange={()=>toggle(a)} />
          <Badge variant={selected.includes(a)?'default':'outline'} className='text-[10px]'>{a}</Badge>
        </label>
      ))}
    </div>
  )
}
