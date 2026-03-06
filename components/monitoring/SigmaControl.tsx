"use client"
import { InfoDialogButton } from "./InfoDialogButton"

interface SigmaControlProps { sigma: number; onChange: (n:number)=>void }

export default function SigmaControl({ sigma, onChange }: SigmaControlProps) {
  return (
    <div className='flex flex-col gap-1'>
      <div className='flex items-center justify-between gap-2'>
        <label className='text-xs font-medium'>Sigma: {sigma}</label>
        <InfoDialogButton
          title='O que é Sigma?'
          description='Controla o limiar para identificar leituras como outliers.'
        >
          <p>O sigma representa quantos desvios padrão acima ou abaixo da média uma variação precisa estar para ser sinalizada como anomalia.</p>
          <ul className='list-disc list-inside space-y-1'>
            <li>Valores menores tornam o detector mais sensível, marcando variações menores.</li>
            <li>Valores maiores reduzem falsos positivos, mas podem deixar passar desvios relevantes.</li>
            <li>Quando há poucas leituras positivas (menos de 3), a detecção estatística de outliers é desativada automaticamente.</li>
          </ul>
        </InfoDialogButton>
      </div>
      <input type='range' min={1} max={5} step={0.5} value={sigma} onChange={e=>onChange(Number(e.target.value))} />
      <div className='text-[10px] text-muted-foreground'>Ajuste a sensibilidade de outliers</div>
    </div>
  )
}
