"use client"
import { Card, CardContent } from '@/components/ui/card'
import { InfoDialogButton } from './InfoDialogButton'

interface StatsSummaryProps {
  items: Array<{ meterId: string; register: string; stats: any }>
}

function format(n: number | null | undefined, digits=3) {
  if (n === null || n === undefined) return '—'
  return Number(n).toFixed(digits)
}

const metricsExplanation = (
  <>
    <p>As métricas são calculadas com base nas diferenças entre leituras consecutivas (Δ) já ajustadas pelo sentido do hidrômetro.</p>
    <ul className='list-disc list-inside space-y-1'>
      <li><strong>Total</strong>: volume acumulado no período selecionado.</li>
      <li><strong>Média Δ</strong>: média apenas dos deltas positivos (consumos efetivos).</li>
      <li><strong>Min/Max Δ</strong>: menores e maiores consumos positivos registrados entre leituras.</li>
      <li><strong>σ</strong>: desvio padrão dos deltas positivos, usado junto ao sigma para detectar outliers.</li>
      <li><strong>Negativos</strong>: quantidade de deltas menores que zero (leituras regressivas).</li>
      <li><strong>Alertas</strong>: leituras que vieram com alertas do dispositivo.</li>
      <li><strong>Anomalias</strong>: leituras marcadas por qualquer regra (negativo, outlier alto/baixo ou alerta).</li>
    </ul>
    <p className='text-xs text-muted-foreground'>Deltas igual a zero são tratados como consumo nulo, não contam como negativos e ficam fora dos cálculos estatísticos.</p>
  </>
)

export default function StatsSummary({ items }: StatsSummaryProps) {
  if (!items.length) return null
  return (
    <div className='grid gap-2 md:grid-cols-2 xl:grid-cols-3'>
      {items.map(it => (
        <Card key={it.meterId} className='border shadow-sm'>
          <CardContent className='p-3 space-y-2'>
            <div className='flex items-center justify-between gap-2'>
              <div className='font-medium text-sm truncate'>{it.register}</div>
              <InfoDialogButton
                title={`Como interpretar as métricas de ${it.register}`}
                description='Entenda como cada indicador é calculado para este medidor.'
              >
                {metricsExplanation}
              </InfoDialogButton>
            </div>
            <div className='grid grid-cols-2 gap-x-4 text-[11px] leading-4'>
              <span>Total:</span><span className='font-mono'>{format(it.stats?.totalConsumed)}</span>
              <span>Média Δ:</span><span className='font-mono'>{format(it.stats?.avgDelta)}</span>
              <span>Min Δ:</span><span className='font-mono'>{format(it.stats?.minDelta)}</span>
              <span>Max Δ:</span><span className='font-mono'>{format(it.stats?.maxDelta)}</span>
              <span>σ:</span><span className='font-mono'>{format(it.stats?.stdDev)}</span>
              <span>Negativos:</span><span className='font-mono'>{it.stats?.negativeCount ?? 0}</span>
              <span>Alertas:</span><span className='font-mono'>{it.stats?.alertCount ?? 0}</span>
              <span>Anomalias:</span><span className='font-mono'>{it.stats?.anomalies?.length ?? 0}</span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
