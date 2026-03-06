"use client"
import { useState, useMemo, useEffect } from 'react'
import { useMonitoringReadings } from '@/hooks/useMonitoringReadings'
import MonitoringChart from './MonitoringChart'
import { DateRange } from 'react-day-picker'
import { addDays, differenceInCalendarDays, format } from 'date-fns'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import MeterSelectionPanel from './MeterSelectionPanel'
import StatsSummary from './StatsSummary'
import AnomaliesList from './AnomaliesList'
import SigmaControl from './SigmaControl'
import AlertTypeFilter from './AlertTypeFilter'
import ExportButton from './ExportButton'
import { InfoDialogButton } from './InfoDialogButton'
import { useMonitoringLocalPreferences } from './useMonitoringLocalPreferences'
import { recomputeStats } from './monitoringStats'
import ComboboxCompany from '@/components/ComboboxCompany'
import ComboboxComplex from '@/components/ComboboxComplex'
import ComboboxBlock from '@/components/ComboboxBlock'
import ComboboxApartment from '@/components/ComboboxApartment'
import { Separator } from '@/components/ui/separator'
import { usePermissionChecker } from '@/hooks/use-permission-checker'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { Calendar as CalendarIcon } from 'lucide-react'

// Fase 1: Placeholder de seleção de medidores manual até integração com UI real de contexto
const MOCK_METERS: { id: string, register: string }[] = [] // pode ser preenchido futuramente via API de meters
const MAX_RANGE_DAYS = 60

export default function MonitoringPage() {
  const { prefs, update, ready } = useMonitoringLocalPreferences()
  const { hasPermission, loading: permissionsLoading } = usePermissionChecker()
  const canAccessMonitoring = hasPermission('monitoringDashboard', 'read')
  const [companyObj, setCompanyObj] = useState<any | undefined>()
  const [complexObj, setComplexObj] = useState<any | undefined>()
  const [blockObj, setBlockObj] = useState<any | undefined>()
  const [apartmentObj, setApartmentObj] = useState<any | undefined>()
  const companyId = companyObj?.id
  const complexId = complexObj?.id
  const blockId = blockObj?.id
  const apartmentId = apartmentObj?.id
  const selectedMeters = prefs.meterIds
  const view = prefs.view
  const mode = prefs.mode
  const alertsOnly = prefs.alertsOnly
  const sigma = prefs.sigma
  const alertTypes = prefs.alertTypes
  const [dateRange, setDateRange] = useState<DateRange | undefined>({ from: addDays(new Date(), -30), to: new Date() })
  const [rangeError, setRangeError] = useState<string | null>(null)

  const requestParams = useMemo(() => ({
    meterIds: selectedMeters,
    fromDate: (dateRange?.from ?? new Date()).toISOString(),
    toDate: (dateRange?.to ?? new Date()).toISOString(),
    mode,
    view,
    alertsOnly,
    includeStats: true,
    outlierSigma: sigma
  }), [selectedMeters, dateRange, mode, view, alertsOnly, sigma])

  const { data, loading, error } = useMonitoringReadings(requestParams, selectedMeters.length > 0 && ready)

  const rangeLabel = useMemo(() => {
    if (dateRange?.from && dateRange?.to) {
      return `${format(dateRange.from, 'dd/MM/yyyy')} - ${format(dateRange.to, 'dd/MM/yyyy')}`
    }
    if (dateRange?.from) {
      return `Início: ${format(dateRange.from, 'dd/MM/yyyy')}`
    }
    return 'Selecione um período'
  }, [dateRange])

  const handleRangeSelect = (range: DateRange | undefined) => {
    if (!range) {
      setRangeError(null)
      setDateRange(undefined)
      return
    }

    if (range.from && range.to && range.to < range.from) {
      range = { from: range.to, to: range.from }
    }

    if (range.from && range.to) {
      const diff = Math.abs(differenceInCalendarDays(range.to, range.from))
      if (diff >= MAX_RANGE_DAYS) {
        const limitedTo = addDays(range.from, MAX_RANGE_DAYS - 1)
        setDateRange({ from: range.from, to: limitedTo })
        setRangeError(`Selecione no máximo ${MAX_RANGE_DAYS} dias por vez.`)
        return
      }
      setRangeError(null)
    } else {
      setRangeError(null)
    }

    setDateRange(range)
  }

  // Recomputar estatísticas localmente se sigma ou alertTypes forem alterados (client-side sensitivity)
  const recomputed = useMemo(() => {
    if (!data) return null
    return {
      ...data,
      meters: data.meters.map(m => {
        const stats = recomputeStats({ ...m, readings: m.readings }, view, sigma, alertTypes)
        return { ...m, stats }
      })
    }
  }, [data, view, sigma, alertTypes])

  const metersWithData = recomputed?.meters || []
  const distinctAlerts = data?.distinctAlerts || []

  useEffect(()=>{
    if (!selectedMeters.length) return
  }, [selectedMeters])

  if (permissionsLoading) {
    return (
      <div className='p-4 space-y-4'>
        <Skeleton className='h-8 w-48' />
        <Skeleton className='h-72 w-full' />
      </div>
    )
  }

  if (!canAccessMonitoring) {
    return (
      <div className='p-4'>
        <Card className='max-w-xl border-dashed'>
          <CardHeader>
            <CardTitle className='text-lg'>Acesso não permitido</CardTitle>
          </CardHeader>
          <CardContent className='text-sm text-muted-foreground'>
            Você não possui permissão para visualizar o dashboard de monitoramento. Solicite acesso ao administrador do sistema.
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className='p-4 space-y-4'>
      <h1 className='text-2xl font-semibold'>Dashboard de Monitoramento</h1>
      <div className='grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-4 items-start'>
        {/* Área Principal (agora primeiro para que painel fique à direita em telas grandes) */}
        <div className='flex flex-col gap-4'>
          <Card className='shadow-sm'>
            <CardHeader className='pb-2'>
              <CardTitle className='text-sm'>Período analisado</CardTitle>
            </CardHeader>
            <CardContent className='p-3 space-y-2'>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant='outline'
                    className='w-full justify-start text-left font-normal'
                  >
                    <CalendarIcon className='mr-2 h-4 w-4' />
                    <span>{rangeLabel}</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className='w-auto p-0' align='start'>
                  <Calendar
                    mode='range'
                    numberOfMonths={2}
                    selected={dateRange}
                    onSelect={handleRangeSelect}
                    defaultMonth={dateRange?.from}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              <div className='text-[11px] text-muted-foreground'>Selecione até {MAX_RANGE_DAYS} dias para análise. Intervalos maiores são ajustados automaticamente.</div>
              {rangeError && <div className='text-[11px] text-destructive'>{rangeError}</div>}
            </CardContent>
          </Card>
          {loading && <Skeleton className='h-72 w-full' />}
          {error && <div className='text-red-500 text-sm'>{error}</div>}
          {!loading && !error && metersWithData.length > 0 && (
            <MonitoringChart meters={metersWithData} view={view} mode={mode} />
          )}
          {!loading && !error && metersWithData.length === 0 && (
            <div className='text-muted-foreground text-sm'>Selecione medidores e ajuste filtros.</div>
          )}
          <div className='space-y-3'>
            <div className='flex items-center gap-2'>
              <h2 className='text-sm font-semibold tracking-wide uppercase text-muted-foreground'>Resumo</h2>
              <InfoDialogButton
                title='Como ler o resumo de métricas?'
                description='Resumo agregado das métricas estatísticas calculadas para cada medidor selecionado.'
              >
                <p>Veja rapidamente os indicadores principais para cada medidor. Use o botão de informações em cada cartão para uma explicação detalhada.</p>
                <p className='text-xs text-muted-foreground'>Os cálculos consideram apenas o período, filtros e sigma atualmente aplicados.</p>
              </InfoDialogButton>
            </div>
            <StatsSummary items={metersWithData.map(m => ({ meterId: m.meterId, register: m.register, stats: m.stats }))} />
          </div>
          <div className='space-y-3'>
            <div className='flex items-center gap-2'>
              <h2 className='text-sm font-semibold tracking-wide uppercase text-muted-foreground'>Anomalias</h2>
              <InfoDialogButton
                title='O que é considerado anomalia?'
                description='Definições usadas pelo painel para sinalizar leituras atípicas.'
              >
                <ul className='list-disc list-inside space-y-1'>
                  <li><strong>NEGATIVE_CONSUMPTION</strong>: leitura regressiva (delta menor que zero).</li>
                  <li><strong>OUTLIER_HIGH</strong>: consumo muito acima da média positiva, com base no desvio padrão e no sigma selecionado.</li>
                  <li><strong>OUTLIER_LOW</strong>: consumo positivo muito abaixo da média positiva, respeitando o sigma.</li>
                  <li><strong>HAS_ALERT</strong>: leitura que já veio acompanhada por alertas do dispositivo IoT.</li>
                </ul>
                <p className='text-xs text-muted-foreground'>Deltas iguais a zero são tratados como consumo nulo e não entram na categoria de negativo.</p>
              </InfoDialogButton>
            </div>
            <AnomaliesList items={metersWithData.map(m => ({ meterId: m.meterId, register: m.register, anomalies: m.stats?.anomalies || [] }))} />
          </div>
        </div>
        {/* Painel Lateral (agora à direita) */}
        <div className='flex flex-col gap-4 xl:sticky xl:top-4'>
          <Card className='shadow-sm'>
            <CardHeader className='pb-2'><CardTitle className='text-sm'>Contexto</CardTitle></CardHeader>
            <CardContent className='space-y-2'>
              <ComboboxCompany company={companyObj} setSelectedCompany={(c:any)=>{ setCompanyObj(c); setComplexObj(undefined); setBlockObj(undefined); setApartmentObj(undefined) }} />
              <ComboboxComplex companyId={companyId} complex={complexObj} setSelectedComplex={(c:any)=>{ setComplexObj(c); setBlockObj(undefined); setApartmentObj(undefined) }} />
              <ComboboxBlock complexId={complexId} block={blockObj} setSelectedBlock={(b:any)=>{ setBlockObj(b); setApartmentObj(undefined) }} />
              <ComboboxApartment blockId={blockId} apartment={apartmentObj} setSelectedApartment={(a:any)=>{ setApartmentObj(a) }} />
            </CardContent>
          </Card>
          <Card className='shadow-sm h-[580px] flex flex-col overflow-hidden'>
            <CardHeader className='pb-2'><CardTitle className='text-sm'>Medidores</CardTitle></CardHeader>
            <CardContent className='flex-1 flex flex-col gap-3 p-3 min-h-0 overflow-hidden'>
              <div className='flex-1 min-h-0'>
                <MeterSelectionPanel companyId={companyId} complexId={complexId} blockId={blockId} apartmentId={apartmentId} selected={selectedMeters} onChange={(ids)=>update({ meterIds: ids })} />
              </div>
              <div className='grid grid-cols-2 gap-1.5'>
                <Button size='sm' className='h-7 text-[11px] px-2' variant={view==='cumulative'?'default':'outline'} onClick={()=>update({ view: 'cumulative' })}>Cumulativo</Button>
                <Button size='sm' className='h-7 text-[11px] px-2' variant={view==='simple'?'default':'outline'} onClick={()=>update({ view: 'simple' })}>Consumo</Button>
                <Button size='sm' className='h-7 text-[11px] px-2' variant={mode==='dailyLast'?'default':'outline'} onClick={()=>update({ mode: 'dailyLast' })}>Últ/dia</Button>
                <Button size='sm' className='h-7 text-[11px] px-2' variant={mode==='raw'?'default':'outline'} onClick={()=>update({ mode: 'raw' })}>Raw</Button>
                <Button size='sm' className='h-7 text-[11px] px-2' variant={alertsOnly?'default':'outline'} onClick={()=>update({ alertsOnly: !alertsOnly })}>{alertsOnly?'Só alertas':'Todas'}</Button>
                <Button size='sm' className='h-7 text-[11px] px-2' variant='outline' onClick={()=>update({ meterIds: [] })} disabled={!selectedMeters.length}>Limpar</Button>
              </div>
              <Separator />
              <SigmaControl sigma={sigma} onChange={(n)=>update({ sigma: n })} />
            </CardContent>
          </Card>
          <Card className='shadow-sm'>
            <CardHeader className='pb-2'><CardTitle className='text-sm'>Tipos de Alertas</CardTitle></CardHeader>
            <CardContent className='max-h-60 overflow-auto p-3'>
              <AlertTypeFilter distinctAlerts={distinctAlerts} selected={alertTypes} onChange={(vals)=>update({ alertTypes: vals })} />
            </CardContent>
          </Card>
          <Card className='shadow-sm'>
            <CardHeader className='pb-2'><CardTitle className='text-sm'>Exportar</CardTitle></CardHeader>
            <CardContent className='p-3'>
              <ExportButton meters={metersWithData} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
