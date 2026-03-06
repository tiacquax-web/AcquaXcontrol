"use client"
import { Button } from '@/components/ui/button'

interface ExportButtonProps {
  meters: Array<{ meterId: string; register: string; rotation: string; readings: any[]; stats?: any }>
}

export default function ExportButton({ meters }: ExportButtonProps) {
  function exportCsv() {
    const rows: string[] = []
    rows.push(['meterId','register','date','readAt','value','alerts','anomalies'].join(','))
    meters.forEach(m => {
      const anomalyIds = new Set(m.stats?.anomalies?.map((a:any)=>a.readingId)||[])
      m.readings.forEach(r => {
        rows.push([
          m.meterId,
          escapeCsv(m.register),
          r.date,
          r.readAt,
          typeof r.value === 'number' ? r.value.toFixed(3) : r.value,
          (r.alerts||[]).join('|'),
          anomalyIds.has(r.readingId) ? 'Y' : ''
        ].join(','))
      })
    })
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'monitoring_readings.csv'
    a.click()
    URL.revokeObjectURL(url)
  }
  return <Button size='sm' variant='outline' onClick={exportCsv} disabled={!meters.length}>Exportar CSV</Button>
}

function escapeCsv(v: string) { return '"'+(v?.replace(/"/g,'""')||'')+'"' }
