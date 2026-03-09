'use client'

import { useReadings } from '@/hooks/useReadings';
import ReadingsChart2, { ConsumptionChartConfig, ConsumptionData } from './readings-chart-2';
import { Reading } from '@prisma/client';
import { useState } from 'react';
import { format } from "date-fns/format"
import type { DateRange as DateRangeDefault } from "react-day-picker"
import { Skeleton } from './ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { X } from 'lucide-react';
import { ReadingFull } from '@/types/fullTypes';
import ReadingDetailsModal from './ReadingDetailsModal';

export type DateRange = DateRangeDefault;
export type View = {
    label: string,
    id: string,
}
export type Interval = {
    label: string,
    id: string,
    type: string,
}

export const viewOptions = {
    simple: { label: "Simples", id: "simple" },
    cumulative: { label: "Acumulativo", id: "cumulative" },
}

export const intervals: Record<string, Interval> = {
    hour: { label: "Por hora", id: "hour", type: "iot" },
    day: { label: "Por dia", id: "day", type: "iot" },
    month: { label: "Por mês", id: "month", type: "all" },
    reading: { label: "Por leitura", id: "reading", type: "all" },
    day2: { label: "Por dia - Primeira e última", id: "day2", type: "iot" },
    month2: { label: "Por mês - Primeira e última", id: "month2", type: "iot" },
}

export const chartConfig: ConsumptionChartConfig = {
    reading: {
        label: "Leitura em m³",
        color: "hsl(var(--chart-2))",
    },
}

const thirtyDaysAgo = new Date(new Date().setDate(new Date().getDate() - 30));
const today = new Date();

export const consumptionChartConfig: ConsumptionChartConfig = {
    reading: {
        label: "Consumo em m³",
        color: "hsl(var(--chart-2))",
    },
}

export default function ReadingsGraph({
    meterId,
    view = viewOptions.cumulative,
    interval = intervals.hour,
    dateRange = { from: thirtyDaysAgo, to: today },
    register = undefined,
    readings: propReadings,
    loading: propLoading,
    error: propError,
    onSelectReading,
    detailsModalAvailable,
    onRemove,
    chartConfigOverride,
}: {
    meterId: string,
    view?: View,
    interval?: Interval,
    dateRange?: DateRange | undefined
    register?: string | undefined
    readings?: ReadingFull[]
    loading?: boolean
    error?: string | null
    onSelectReading?: (reading: ReadingFull) => void
    detailsModalAvailable?: boolean
    onRemove?: (meterId: string) => void
    chartConfigOverride?: ConsumptionChartConfig
}) {
    const [modalOpen, setModalOpen] = useState(false);
    const [selectedReading, setSelectedReading] = useState<ReadingFull | undefined>(undefined);

    const activeChartConfig = chartConfigOverride ?? chartConfig;

    const period_text = {
        from: dateRange?.from?.toISOString().split("T")[0] || "",
        to: dateRange?.to?.toISOString().split("T")[0] || "",
    }

    console.log('#### prop readings:', propReadings)

    // Se readings for passado via prop, use ele. Senão, busque localmente.
    const { readings: localReadings, loading: loadingLocalReadings, error: errorLocalReadings } = useReadings({
        enabled: !propReadings,
        meterId,
        fromDate: dateRange?.from,
        toDate: dateRange?.to,
        take: 500, 
        skip: 0,
        withMeter: true
    });
    const readings: ReadingFull[] = propReadings ?? localReadings;
    const loading = propLoading ?? loadingLocalReadings;
    const error = propError !== undefined ? propError : errorLocalReadings;

    console.log('#### local readings:', localReadings);
    console.log('####   readings:', readings);

    // Meter info: prefer nested meter.* fields returned when withMeter=true
    function truncate(s: string | undefined, n = 12) {
        if (!s) return undefined;
        return s.length > n ? s.slice(0, n) + '...' : s;
    }

    const first = readings?.[0];
    const nestedRegister = first?.meter?.register;
    const nestedRegisterName = (first as any)?.meter?.registerName;
    const topRegister = (first && 'register' in first && (first as any).register) || register;

    const registerToShow = nestedRegister || nestedRegisterName || topRegister;

    // Build full title: <Condomínio 12chars...>, <Bloco 12chars...>, <apto>, <register>
    const complexName = first?.meter?.apartment?.block?.complex?.socialName
        || first?.meter?.apartment?.block?.complex?.socialName;
    const blockName = first?.meter?.apartment?.block?.name;
    const apartmentName = first?.meter?.apartment?.name;

    const complexShort = truncate(complexName);
    const blockShort = truncate(blockName);

    const meterTitle = [complexShort, blockShort, apartmentName, registerToShow]
        .filter(Boolean)
        .join(', ');
    const allReadings = getOrderedReadings(readings || []);
    const readingsOnInterval = readingsDataOnIntervalType(allReadings, interval.id as keyof typeof intervals);
    // Usar dados reais quando disponíveis, senão usar dados mockados para teste
    const chartData: ConsumptionData[] = consumptionDataOnViewType(readingsOnInterval, view.id as keyof typeof viewOptions)
    console.log('####   all readings:', allReadings);
    console.log('#### readings on interval:', readingsOnInterval);
    console.log('#### chart data:', chartData);

    // Validar se chartData tem dados válidos
    if (!chartData || chartData.length === 0) {
        return (
            <Card className='mt-3 p-0 shadow'>
                <CardHeader className="pb-4">
                    <div className="flex items-start justify-between">
                        <div className="flex-1">
                            <CardTitle>{`Medidor ${meterTitle || '(desconhecido)'}`}</CardTitle>
                        </div>
                        {onRemove && (
                            <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                                onClick={() => onRemove(meterId)}
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        )}
                    </div>
                </CardHeader>
                <CardContent className='pt-0'>
                    <p className='text-muted-foreground'>Não foi possível gerar dados para o gráfico</p>
                </CardContent>
            </Card>
        )
    }

    const handleSelectedData = (selectedData: any) => {
        if (!selectedData || !selectedData.date) return;
        const found = allReadings.find(r => {
            const readingDate = getReadingDate(r);
            const readingValue = Number(r.reading ?? 0);
            // Compara tanto a data quanto o valor da leitura
            return (
                readingDate === selectedData.date &&
                (selectedData.reading === "-" || Number(selectedData.reading) === readingValue)
            );
        });
        
        if (found) {
            if (detailsModalAvailable) {
                setSelectedReading(found as ReadingFull);
                setModalOpen(true);
            }
            if (onSelectReading) {
                onSelectReading(found as ReadingFull);
            }
        } else {
            console.warn('Reading not found for selected data:', selectedData);
        }
    };

    if (loading) {
        return (
            <Card className='w-full my-5'>
                <CardContent className='space-y-4 pt-10'>
                    <Skeleton className='h-64 w-full' />
                    <Skeleton className='h-6 w-full' />
                    <Skeleton className='h-6 w-32' />
                </CardContent>
            </Card>
        )
    }

    if (!readings?.length) {
        return (
            <Card className='mt-3 p-0 shadow'>
                <CardContent className='p-6'>
                    <p className='text-muted-foreground'>O medidor "{String(meterTitle)}" não teve leituras nesse período</p>
                </CardContent>
            </Card>
        )
    }


    // Null safety para cálculos
    const total = allReadings.length >= 2
        ? (Number(allReadings[allReadings.length - 1]?.reading ?? 0) - Number(allReadings[0]?.reading ?? 0))
        : <span className='text-muted-foreground text-start p-0 m-0'>Sem referência (apenas 1 leitura)</span>;

    const avg = allReadings.length >= 2 && typeof total === 'number'
        ? total / (allReadings.length - 1)
        : <span className='text-muted-foreground text-start p-0 m-0'>Indisponível em apenas 1 leitura</span>;
    console.log('ReadingsGraph Debug:', {
        chartData,
        chartDataLength: chartData?.length,
        chartConfig,
        allReadings: allReadings.length,
        readingsOnInterval: readingsOnInterval.length,
        meterId,
        view: view.id,
        interval: interval.id,
        propReadings: propReadings?.length || 0,
        localReadings: localReadings?.length || 0,
        loading,
        error
    });
    
    return (
        <>
            <ReadingsChart2
                onSelectPoint={handleSelectedData}
                title={`Medidor ${meterTitle}`}
                description=''
                data={chartData}
                config={activeChartConfig}
                height={250}
                xAxisKey='date'
                xAxisLabel='Date'
                dateFormat='dd/MMM'
                onRemove={onRemove ? () => onRemove(meterId) : undefined}
                footer={
                    <div className='flex w-full items-start gap-2 text-sm'>
                        <div className='grid gap-2'>
                            <div className='flex items-center gap-2 font-medium leading-none'>
                                <p>Total consumido:{' '}
                                    {typeof total === 'number' ? total.toFixed(3) + 'm³' : total}
                                </p>
                            </div>
                            <div className='flex items-center gap-2 leading-none text-muted-foreground'>
                                <p>
                                    Média diária:{' '} {typeof avg === 'number' ? avg.toFixed(3) + 'm³' : avg}
                                </p>
                            </div>
                            <div className='flex items-center gap-2 leading-none text-muted-foreground'>
                                {period_text.from && period_text.to
                                    ? `${format(new Date(period_text.from), 'dd/MMM')} - ${format(new Date(period_text.to), 'dd/MMM')}`
                                    : 'Escolha um período'}
                            </div>
                        </div>
                    </div>
                }
            />
            {detailsModalAvailable && (
                <ReadingDetailsModal
                    open={modalOpen}
                    onOpenChange={setModalOpen}
                    reading={selectedReading}
                />
            )}
        </>
    )
}

function readingsDataOnIntervalType(data: Reading[], interval: keyof typeof intervals) {
    console.log('#interval:', interval, 'data length:', data.length);
    if (interval === "hour") {
        return data.filter((d, i) => {
            if (i + 1 >= data.length) return true
            const date = new Date(getReadingDate(d))
            const nextDate = new Date(getReadingDate(data[i + 1]))

            // Compara ano, mês, dia e hora
            return date.getFullYear() !== nextDate.getFullYear() ||
                   date.getMonth() !== nextDate.getMonth() ||
                   date.getDate() !== nextDate.getDate() ||
                   date.getHours() !== nextDate.getHours()
        })
    } else if (interval === "day") {
        return data.filter((d, i) => {
            if (i + 1 >= data.length) return true
            const date = new Date(getReadingDate(d))
            const nextDate = new Date(getReadingDate(data[i + 1]))

            // Compara ano, mês e dia
            return date.getFullYear() !== nextDate.getFullYear() ||
                   date.getMonth() !== nextDate.getMonth() ||
                   date.getDate() !== nextDate.getDate()
        })
    } else if (interval === "day2") {
        return data.filter((d, i) => {
            if (i + 1 >= data.length || i - 1 < 0) return true
            const date = new Date(getReadingDate(d))
            const nextDate = new Date(getReadingDate(data[i + 1]))
            const prevDate = new Date(getReadingDate(data[i - 1]))

            // Compara com próximo: ano, mês e dia
            const diffFromNext = date.getFullYear() !== nextDate.getFullYear() ||
                                date.getMonth() !== nextDate.getMonth() ||
                                date.getDate() !== nextDate.getDate()
            
            // Compara com anterior: ano, mês e dia
            const diffFromPrev = date.getFullYear() !== prevDate.getFullYear() ||
                                date.getMonth() !== prevDate.getMonth() ||
                                date.getDate() !== prevDate.getDate()

            return diffFromNext || diffFromPrev
        })
    } else if (interval === "month") {
        return data.filter((d, i) => {
            if (i + 1 >= data.length) return true
            const date = new Date(getReadingDate(d))
            const nextDate = new Date(getReadingDate(data[i + 1]))

            // Compara ano e mês
            return date.getFullYear() !== nextDate.getFullYear() ||
                   date.getMonth() !== nextDate.getMonth()
        })
    } else if (interval === "month2") {
        return data.filter((d, i) => {
            if (i + 1 >= data.length || i - 1 < 0) return true
            const date = new Date(getReadingDate(d))
            const nextDate = new Date(getReadingDate(data[i + 1]))
            const prevDate = new Date(getReadingDate(data[i - 1]))

            // Compara com próximo: ano e mês
            const diffFromNext = date.getFullYear() !== nextDate.getFullYear() ||
                                date.getMonth() !== nextDate.getMonth()
            
            // Compara com anterior: ano e mês
            const diffFromPrev = date.getFullYear() !== prevDate.getFullYear() ||
                                date.getMonth() !== prevDate.getMonth()

            return diffFromNext || diffFromPrev
        }) as Reading[]
    } else {
        return data
    }
}
function consumptionDataOnViewType(data: Reading[], view: keyof typeof viewOptions): ConsumptionData[] {
    console.log('consumptionDataOnViewType called with:', { data: data.length, view });

    if (view === "cumulative") {
        const result = data.map((r: Reading) => {
            return {
                reading: Number(r.reading ?? 0),
                date: getReadingDate(r),
            }
        }) as ConsumptionData[]
        console.log('cumulative result:', result.slice(0, 3));
        return result;
    } else {
        const result = data
            .map((d: Reading, i: number) => {
                if (i === 0) {
                    return {
                        reading: "-",
                        date: getReadingDate(d),
                    }
                }
                const prev = data[i - 1];
                return {
                    reading: Number(d.reading ?? 0) - Number(prev?.reading ?? 0),
                    date: getReadingDate(d),
                }
            })
            .slice(1) as ConsumptionData[]
        console.log('simple result:', result.slice(0, 3));
        return result;
    }
}

function getOrderedReadings(readings: Reading[]) {
    return [...readings].sort((a, b) => {
        const aDate = a.readAt
        const bDate = b.readAt

        return new Date(aDate).getTime() - new Date(bDate).getTime()
    })
}

function getReadingDate(reading: Reading): string {
    const date = new Date(reading.readAt)
    const year = date.getFullYear()
    const month = (date.getMonth() + 1).toString().padStart(2, '0')
    const day = date.getDate().toString().padStart(2, '0')
    return `${year}-${month}-${day}` // Formato simples YYYY-MM-DD
}