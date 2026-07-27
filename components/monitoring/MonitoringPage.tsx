"use client"
import { useState, useMemo, useEffect, useRef } from 'react'
import { useMonitoringReadings } from '@/hooks/useMonitoringReadings'
import MonitoringChart from './MonitoringChart'
import GLOverviewCards from './GLOverviewCards'
import { useGLOverview } from '@/hooks/useGLOverview'
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
import { Calendar as CalendarIcon, Wifi, Activity, TrendingUp, ChevronRight } from 'lucide-react'
import { useUserContext } from '@/hooks/useUserContext'
import { useMeters } from '@/hooks/useMeters'
import { AlertTriangle } from 'lucide-react'

const MAX_RANGE_DAYS = 60

export default function MonitoringPage() {
  const { prefs, update, ready } = useMonitoringLocalPreferences()
  const { hasPermission, loading: permissionsLoading } = usePermissionChecker()
  const { context: userContext, loading: ctxLoading } = useUserContext()

  // Auto-selecionar contexto baseado no perfil
  useEffect(() => {
    if (ctxLoading || !userContext || complexObj) return
    if (!userContext.isSystem && userContext.apartments.length === 1 && userContext.complexes.length === 0) {
      const apt = userContext.apartments[0]
      setComplexObj(apt.block?.complex ?? undefined)
      setBlockObj(apt.block ?? undefined)
      setApartmentObj(apt)
    }
    if (!userContext.isSystem && userContext.complexes.length > 0) {
      const glComplexes = userContext.complexes.filter(c => userContext.glComplexIds?.includes(c.id))
      if (glComplexes.length === 1) {
        setComplexObj(glComplexes[0])
      }
    }
  }, [ctxLoading, userContext])

  const hasGLAccess = (() => {
    if (!userContext) return false
    if (userContext.isSystem) return true
    return userContext.glComplexIds && userContext.glComplexIds.length > 0
  })()

  const canAccessMonitoring = hasPermission('monitoringDashboard', 'read')
    || hasPermission('reading', 'read')
    || hasPermission('complex', 'read')
    || hasPermission('apartmentConsumptionReport', 'read')
    || hasPermission('dealershipReading', 'read')

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
  const [showOverview, setShowOverview] = useState(true)

  // ── GL Overview ──────────────────────────────────────────────────────
  const { overview: glOverview, loading: glLoading, glmMeters } = useGLOverview(complexId)
  const hasGLMeters = glmMeters.length > 0

  // ── Auto-seleção de medidores ──────────────────────────────────────
  const autoSelectAttemptedRef = useRef(false)

  const { meters: autoSelectMeters, loading: autoSelectLoading } = useMeters({
    complexId,
    blockId,
    apartmentId,
    enabled: !!(apartmentId || (complexId && !apartmentId)),
    take: 200,
  })

  const shouldAutoSelect = (() => {
    if (!userContext || autoSelectAttemptedRef.current) return false
    if (autoSelectLoading || autoSelectMeters.length === 0) return false
    if (selectedMeters.length > 0) return false
    if (!userContext.isSystem && userContext.apartments.length === 1) return true
    if (!userContext.isSystem && userContext.complexes.length > 0) {
      const glComplexes = userContext.complexes.filter(c => userContext.glComplexIds?.includes(c.id))
      if (glComplexes.length === 1 && autoSelectMeters.length <= 10) return true
    }
    return false
  })()

  useEffect(() => {
    if (shouldAutoSelect) {
      const meterIds = autoSelectMeters.map(m => m.id)
      if (meterIds.length > 0) {
        update({ meterIds })
        autoSelectAttemptedRef.current = true
      }
    }
  }, [shouldAutoSelect, autoSelectMeters])

  // Auto-selecionar medidores GL quando o overview carregar e nada estiver selecionado
  useEffect(() => {
    if (!ready || autoSelectAttemptedRef.current) return
    if (glOverview.length > 0 && selectedMeters.length === 0 && hasGLAccess) {
      // Auto-selecionar medidores GL (até 10) para mostrar o gráfico
      const glMeterIds = glOverview.slice(0, 10).map(o => o.meterId)
      if (glMeterIds.length > 0) {
        update({ meterIds: glMeterIds })
        autoSelectAttemptedRef.current = true
      }
    }
  }, [glOverview, ready, hasGLAccess])

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
    if (!range) { setRangeError(null); setDateRange(undefined); return }
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

  const contextKey = `${companyId ?? ''}|${complexId ?? ''}|${blockId ?? ''}|${apartmentId ?? ''}`
  const [prevContextKey, setPrevContextKey] = useState<string | null>(null)

  useEffect(() => {
    if (!ready) return
    if (prevContextKey === null) {
      setPrevContextKey(contextKey)
      return
    }
    if (prevContextKey !== contextKey) {
      setPrevContextKey(contextKey)
      if (selectedMeters.length > 0) {
        update({ meterIds: [] })
      }
      autoSelectAttemptedRef.current = false
      setShowOverview(true)
    }
  }, [contextKey, ready])

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
      {/* Header */}
      <div className='flex items-center justify-between flex-wrap gap-2'>
        <div>
          <h1 className='text-2xl font-semibold flex items-center gap-2'>
            <Activity className='h-6 w-6 text-primary' />
            Dashboard de Monitoramento
          </h1>
          {hasGLMeters && (
            <p className='text-xs text-muted-foreground mt-1'>
              {glmMeters.length} medidor(es) com monitoramento GroupLink ativo
            </p>
          )}
        </div>
        {hasGLMeters && (
          <Button
            variant={showOverview ? 'default' : 'outline'}
            size='sm'
            className='text-xs'
            onClick={() => setShowOverview(!showOverview)}
          >
            <Wifi className='h-3.5 w-3.5 mr-1.5' />
            {showOverview ? 'Ocultar' : 'Mostrar'} Overview GL
          </Button>
        )}
      </div>

      {/* ── GL Overview Cards ───────────────────────────────────────────── */}
      {showOverview && hasGLAccess && (
        <Card className='shadow-sm'>
          <CardHeader className='pb-2'>
            <CardTitle className='text-sm flex items-center gap-2'>
              <Wifi className='h-4 w-4 text-primary' />
              Visão Geral — Monitoramento IoT
            </CardTitle>
          </CardHeader>
          <CardContent className='p-3'>
            {glLoading ? (
              <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'>
                {[1,2,3,4].map(i => (
                  <Skeleton key={i} className='h-[120px] rounded-lg' />
                ))}
              </div>
            ) : glOverview.length > 0 ? (
              <GLOverviewCards
                meters={glOverview}
                onSelectMeter={(meterId) => {
                  if (!selectedMeters.includes(meterId)) {
                    update({ meterIds: [...selectedMeters, meterId] })
                  }
                  setShowOverview(false)
                  // Scroll to chart
                  setTimeout(() => {
                    document.getElementById('monitoring-chart-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                  }, 100)
                }}
              />
            ) : (
              <div className='flex flex-col items-center justify-center py-8 text-center'>
                <Wifi className='h-8 w-8 text-muted-foreground/40 mb-2' />
                <p className='text-sm text-muted-foreground'>
                  {complexId
                    ? 'Nenhum medidor com GL conectado neste condomínio.'
                    : 'Selecione um condomínio para ver os medidores monitorados.'
                  }
                </p>
                {hasGLAccess && !complexId && userContext?.glComplexIds?.length === 1 && (
                  <Button
                    variant='outline'
                    size='sm'
                    className='mt-3 text-xs'
                    onClick={() => {
                      const glComplex = userContext.complexes.find(c => userContext.glComplexIds?.includes(c.id))
                      if (glComplex) setComplexObj(glComplex)
                    }}
                  >
                    Ver condomínio GL <ChevronRight className='h-3 w-3 ml-1' />
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Main Grid ────────────────────────────────────────────────── */}
      <div className='grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-4 items-start'>
        {/* Área Principal */}
        <div className='flex flex-col gap-4'>
          <Card className='shadow-sm'>
            <CardHeader className='pb-2'>
              <CardTitle className='text-sm'>Período analisado</CardTitle>
            </CardHeader>
            <CardContent className='p-3 space-y-2'>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant='outline' className='w-full justify-start text-left font-normal'>
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
              <div className='text-[11px] text-muted-foreground'>Selecione até {MAX_RANGE_DAYS} dias para análise.</div>
              {rangeError && <div className='text-[11px] text-destructive'>{rangeError}</div>}
            </CardContent>
          </Card>

          {/* Chart Section */}
          <div id='monitoring-chart-section'>
            {loading && <Skeleton className='h-72 w-full' />}
            {error && <div className='text-red-500 text-sm'>{error}</div>}
            {!loading && !error && metersWithData.length > 0 && (
              <MonitoringChart meters={metersWithData} view={view} mode={mode} />
            )}
            {!loading && !error && metersWithData.length === 0 && (
              <Card className='border-dashed'>
                <CardContent className='flex flex-col items-center justify-center py-12 text-center'>
                  <TrendingUp className='h-8 w-8 text-muted-foreground/40 mb-3' />
                  <p className='text-sm text-muted-foreground font-medium'>
                    {hasGLMeters
                      ? 'Clique em um medidor no overview acima para ver o gráfico detalhado'
                      : 'Selecione medidores no painel lateral para visualizar os dados'
                    }
                  </p>
                  {hasGLMeters && (
                    <Button
                      variant='outline'
                      size='sm'
                      className='mt-3 text-xs'
                      onClick={() => {
                        const allGLIds = glOverview.slice(0, 10).map(o => o.meterId)
                        if (allGLIds.length > 0) update({ meterIds: allGLIds })
                      }}
                    >
                      Ver todos os medidores GL
                    </Button>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Stats & Anomalies */}
          {metersWithData.length > 0 && (
            <>
              <div className='space-y-3'>
                <div className='flex items-center gap-2'>
                  <h2 className='text-sm font-semibold tracking-wide uppercase text-muted-foreground'>Resumo</h2>
                  <InfoDialogButton
                    title='Como ler o resumo de métricas?'
                    description='Resumo agregado das métricas estatísticas calculadas para cada medidor selecionado.'
                  >
                    <p>Veja rapidamente os indicadores principais para cada medidor.</p>
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
                      <li><strong>NEGATIVE_CONSUMPTION</strong>: leitura regressiva.</li>
                      <li><strong>OUTLIER_HIGH</strong>: consumo muito acima da média.</li>
                      <li><strong>OUTLIER_LOW</strong>: consumo positivo muito abaixo da média.</li>
                      <li><strong>HAS_ALERT</strong>: leitura com alertas do dispositivo IoT.</li>
                    </ul>
                  </InfoDialogButton>
                </div>
                <AnomaliesList items={metersWithData.map(m => ({ meterId: m.meterId, register: m.register, anomalies: m.stats?.anomalies || [] }))} />
              </div>
            </>
          )}
        </div>

        {/* Painel Lateral */}
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
          {distinctAlerts.length > 0 && (
            <Card className='shadow-sm'>
              <CardHeader className='pb-2'><CardTitle className='text-sm'>Tipos de Alertas</CardTitle></CardHeader>
              <CardContent className='max-h-60 overflow-auto p-3'>
                <AlertTypeFilter distinctAlerts={distinctAlerts} selected={alertTypes} onChange={(vals)=>update({ alertTypes: vals })} />
              </CardContent>
            </Card>
          )}
          {metersWithData.length > 0 && (
            <Card className='shadow-sm'>
              <CardHeader className='pb-2'><CardTitle className='text-sm'>Exportar</CardTitle></CardHeader>
              <CardContent className='p-3'>
                <ExportButton meters={metersWithData} />
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
