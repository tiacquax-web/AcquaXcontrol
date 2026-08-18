"use client"
import { useState, useMemo, useEffect, useRef } from 'react'
import { useMonitoringReadings } from '@/hooks/useMonitoringReadings'
import MonitoringChart from './MonitoringChart'
import { DateRange } from 'react-day-picker'
import { addDays, differenceInCalendarDays, differenceInHours, format } from 'date-fns'
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
import { Calendar as CalendarIcon, Printer } from 'lucide-react'
import { useUserContext } from '@/hooks/useUserContext'
import { useRolePreview } from '@/contexts/RolePreviewContext'
import { useMeters } from '@/hooks/useMeters'
import { AlertTriangle } from 'lucide-react'

// Fase 1: Placeholder de seleção de medidores manual até integração com UI real de contexto
const MOCK_METERS: { id: string, register: string }[] = [] // pode ser preenchido futuramente via API de meters
const MAX_RANGE_DAYS = 60

export default function MonitoringPage() {
  const { prefs, update, ready } = useMonitoringLocalPreferences()
  const { hasPermission, loading: permissionsLoading } = usePermissionChecker()
  const { context: realUserContext, loading: realCtxLoading } = useUserContext()
  const { isPreviewing, effectiveContext } = useRolePreview()
  
  const userContext = isPreviewing ? effectiveContext : realUserContext
  const ctxLoading = isPreviewing ? false : realCtxLoading

  const isSystem = userContext?.isSystem ?? false;

  // Auto-selecionar contexto baseado no perfil
  useEffect(() => {
    if (ctxLoading || !userContext) return

    // 1. Auto-selecionar AcquaX do Brasil se disponível (apenas se nada estiver selecionado)
    if (!companyObj) {
      const acquax = userContext.complexes?.find((c: any) => c.company?.name?.includes('Acqua X'))?.company;
      if (acquax) setCompanyObj(acquax);
    }

    // 2. Morador com 1 apto: seleciona automaticamente e TRAVA
    if (userContext.apartments?.length === 1 && (userContext.complexes?.length === 0 || isPreviewing)) {
      const apt = userContext.apartments[0]
      if (apartmentObj?.id !== apt.id) {
        setComplexObj(apt.block?.complex ?? undefined)
        setBlockObj(apt.block ?? undefined)
        setApartmentObj(apt)
      }
    }

    // 3. Síndico/Administradora com 1 condomínio: seleciona automaticamente
    if (userContext.complexes?.length > 0) {
      const glComplexes = userContext.complexes.filter((c: any) => userContext.glComplexIds?.includes(c.id))
      if (glComplexes.length === 1 && !complexObj) {
        setComplexObj(glComplexes[0])
      }
    }
  }, [ctxLoading, userContext, companyObj, complexObj, apartmentObj])

  const hasGLAccess = (() => {
    if (!userContext) return false
    if (userContext.isSystem) return true
    return userContext.glComplexIds && userContext.glComplexIds.length > 0
  })()
  // Monitoramento é acessível para qualquer usuário com permissão de leitura
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

  // ── Auto-seleção de medidores ──────────────────────────────────────────
  // Morador com uma única unidade não deve depender de seleção manual nem de
  // uma seleção antiga salva no navegador. Ao abrir o Monitoramento, usamos
  // sempre os medidores vinculados à unidade dele.
  const autoSelectAttemptedRef = useRef(false)

  const { meters: autoSelectMeters, loading: autoSelectLoading } = useMeters({
    complexId,
    blockId,
    apartmentId,
    enabled: !!(apartmentId || (complexId && !apartmentId)),
    take: 200,
  })

  const isSingleApartmentUser = Boolean(
    userContext && !userContext.isSystem && userContext.apartments.length === 1,
  )
  const isSingleGlComplexManager = Boolean(
    userContext && !userContext.isSystem && userContext.complexes.length > 0
      && userContext.complexes.filter(c => userContext.glComplexIds?.includes(c.id)).length === 1,
  )

  const shouldAutoSelect = Boolean(
    userContext
      && !autoSelectAttemptedRef.current
      && !autoSelectLoading
      && autoSelectMeters.length > 0
      && (isSingleApartmentUser || (isSingleGlComplexManager && autoSelectMeters.length <= 10)),
  )

  useEffect(() => {
    if (!shouldAutoSelect) return

    const meterIds = autoSelectMeters.map(meter => meter.id)
    const selectedSet = new Set(selectedMeters)
    const contextMetersAlreadySelected = meterIds.length === selectedMeters.length
      && meterIds.every(id => selectedSet.has(id))

    if (!contextMetersAlreadySelected) {
      // Para o morador, isso também corrige seleções antigas persistidas de
      // outro condomínio ou unidade e evita a tela vazia por filtro incorreto.
      update({ meterIds })
    }
    autoSelectAttemptedRef.current = true
  }, [shouldAutoSelect, autoSelectMeters, selectedMeters, update])

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

  const dataHealth = useMemo(() => {
    const dates = metersWithData.flatMap(m => m.readings || [])
      .map(reading => new Date(reading.readAt).getTime())
      .filter(timestamp => Number.isFinite(timestamp));
    if (dates.length === 0) return { status: 'empty' as const, latest: null, ageHours: null };
    const latestTimestamp = Math.max(...dates);
    const ageHours = Math.max(0, differenceInHours(new Date(), new Date(latestTimestamp)));
    return {
      status: ageHours > 24 ? 'stale' as const : 'healthy' as const,
      latest: new Date(latestTimestamp),
      ageHours,
    };
  }, [metersWithData])

  // Ao trocar o contexto (empresa/condomínio/bloco/apartamento), a seleção de
  // medidores de um contexto anterior deixa de fazer sentido — sem isso, uma
  // seleção antiga (ex: "Selecionar todos" com 450+ medidores) continuava sendo
  // enviada à API junto com o novo filtro, deixando a consulta extremamente
  // lenta e exibindo UUIDs crus nos chips (medidor não encontrado no novo contexto).
  const contextKey = `${companyId ?? ''}|${complexId ?? ''}|${blockId ?? ''}|${apartmentId ?? ''}`
  const [prevContextKey, setPrevContextKey] = useState<string | null>(null)

  useEffect(() => {
    if (!ready) return
    if (prevContextKey === null) {
      // Primeira vez que o contexto fica pronto: apenas memoriza, não limpa
      // (preserva seleção restaurada do localStorage ao abrir a página).
      setPrevContextKey(contextKey)
      return
    }
    if (prevContextKey !== contextKey) {
      setPrevContextKey(contextKey)
      if (selectedMeters.length > 0) {
        update({ meterIds: [] })
      }
      // Reset auto-select flag quando contexto muda manualmente
      autoSelectAttemptedRef.current = false
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
    <div className='monitoring-page p-4 space-y-4'>
      <div className='flex items-center justify-between gap-3 monitoring-print-header'>
        <h1 className='text-2xl font-semibold'>Dashboard de Monitoramento</h1>
        <Button
          type='button'
          variant='outline'
          size='sm'
          className='no-print gap-2'
          onClick={() => window.print()}
          disabled={loading || metersWithData.length === 0}
        >
          <Printer className='h-4 w-4' />
          Imprimir monitoramento
        </Button>
      </div>
      <p className='print-only text-sm text-muted-foreground'>Período analisado: {rangeLabel}</p>
      {selectedMeters.length > 0 && (
        <Card className={dataHealth.status === 'stale' ? 'border-amber-300 bg-amber-50/60' : dataHealth.status === 'empty' ? 'border-slate-200' : 'border-emerald-200 bg-emerald-50/50'}>
          <CardContent className='p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2'>
            <div className='flex items-start gap-2'>
              <AlertTriangle className={`h-4 w-4 mt-0.5 ${dataHealth.status === 'stale' ? 'text-amber-600' : dataHealth.status === 'empty' ? 'text-slate-400' : 'text-emerald-600'}`} />
              <div>
                <p className='text-sm font-semibold'>Saúde dos dados</p>
                <p className='text-xs text-muted-foreground'>
                  {loading ? 'Atualizando leituras…' : dataHealth.latest ? `Última leitura recebida em ${format(dataHealth.latest, "dd/MM/yyyy 'às' HH:mm")}` : 'Nenhuma leitura encontrada no período selecionado.'}
                </p>
              </div>
            </div>
            <span className={`text-xs font-semibold ${dataHealth.status === 'stale' ? 'text-amber-700' : dataHealth.status === 'empty' ? 'text-slate-500' : 'text-emerald-700'}`}>
              {dataHealth.status === 'stale' ? `Dados atrasados há ${dataHealth.ageHours}h` : dataHealth.status === 'empty' ? 'Sem dados no período' : 'Dados atualizados'}
            </span>
          </CardContent>
        </Card>
      )}
      <div className='monitoring-layout grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-4 items-start'>
        {/* Área Principal (agora primeiro para que painel fique à direita em telas grandes) */}
        <div className='monitoring-main flex flex-col gap-4'>
          <Card className='shadow-sm monitoring-range-card no-print'>
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
	        <div className='monitoring-sidebar no-print flex flex-col gap-4 xl:sticky xl:top-4'>
	          <Card className='shadow-sm'>
	            <CardHeader className='pb-2'><CardTitle className='text-sm'>Contexto</CardTitle></CardHeader>
		            <CardContent className='space-y-2'>
		              <ComboboxCompany 
	                  company={companyObj} 
	                  setSelectedCompany={(c:any)=>{ setCompanyObj(c); setComplexObj(undefined); setBlockObj(undefined); setApartmentObj(undefined) }} 
	                  disabled={!isSystem && userContext?.companyIds?.length === 1}
	                />
		              <ComboboxComplex 
	                  companyId={companyId} 
	                  complex={complexObj} 
	                  setSelectedComplex={(c:any)=>{ setComplexObj(c); setBlockObj(undefined); setApartmentObj(undefined) }} 
	                  disabled={!isSystem && (isMorador && userContext?.apartments?.length === 1 || userContext?.accessibleComplexIds?.length === 1)}
	                />
		              <ComboboxBlock 
	                  complexId={complexId} 
	                  block={blockObj} 
	                  setSelectedBlock={(b:any)=>{ setBlockObj(b); setApartmentObj(undefined) }} 
	                  disabled={!isSystem && isMorador && userContext?.apartments?.length === 1}
	                />
		              <ComboboxApartment 
	                  blockId={blockId} 
	                  apartment={apartmentObj} 
	                  setSelectedApartment={(a:any)=>{ setApartmentObj(a) }} 
	                  disabled={!isSystem && isMorador && userContext?.apartments?.length === 1}
	                />
		            </CardContent>
		          </Card>
	          <Card className='shadow-sm h-[580px] flex flex-col overflow-hidden'>
	            <CardHeader className='pb-2'><CardTitle className='text-sm'>Medidores</CardTitle></CardHeader>
	            <CardContent className='flex-1 flex flex-col gap-3 p-3 min-h-0 overflow-hidden'>
	              <div className='flex-1 min-h-0'>
	                {(!isMorador || userContext?.apartments?.length > 1) ? (
	                  <MeterSelectionPanel companyId={companyId} complexId={complexId} blockId={blockId} apartmentId={apartmentId} selected={selectedMeters} onChange={(ids)=>update({ meterIds: ids })} />
	                ) : (
	                  <div className="p-4 text-center text-sm text-muted-foreground bg-muted/30 rounded-md border border-dashed">
	                    Seus medidores estão sendo monitorados automaticamente.
	                  </div>
	                )}
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
