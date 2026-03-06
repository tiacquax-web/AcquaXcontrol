"use client"
import { ScrollArea } from '@/components/ui/scroll-area'

interface AnomaliesListProps {
  items: Array<{ meterId: string; register: string; anomalies: Array<{ readingId: string; readAt: Date; delta: number; anomalyTypes: string[] }> }>
}

export default function AnomaliesList({ items }: AnomaliesListProps) {
  const flat = items.flatMap(m => m.anomalies.map(a => ({...a, meterId: m.meterId, register: m.register})))
  if (!flat.length) return <div className='text-xs text-muted-foreground'>Nenhuma anomalia no recorte atual.</div>
  return (
    <ScrollArea className='h-60 border rounded p-2'>
      <table className='w-full text-[11px]'>
        <thead>
          <tr className='text-left border-b'>
            <th className='py-1 pr-2'>Data</th>
            <th className='py-1 pr-2'>Medidor</th>
            <th className='py-1 pr-2'>Δ</th>
            <th className='py-1 pr-2'>Tipos</th>
          </tr>
        </thead>
        <tbody>
          {flat.sort((a,b)=>a.readAt.getTime()-b.readAt.getTime()).map(a => (
            <tr key={a.readingId} className='border-b last:border-b-0'>
              <td className='py-1 pr-2 whitespace-nowrap'>{a.readAt.toLocaleString()}</td>
              <td className='py-1 pr-2'>{a.register}</td>
              <td className='py-1 pr-2 font-mono'>{a.delta.toFixed(3)}</td>
              <td className='py-1 pr-2'>{a.anomalyTypes.join(', ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollArea>
  )
}
