"use client"

import React, { useState } from "react"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import * as z from "zod"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Droplet, Flame, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DatePicker } from "@/components/ui/date-picker"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { useToast } from "@/hooks/use-toast"

import SelectCompany from "@/components/ComboboxCompany"
import SelectComplex from "@/components/ComboboxComplex"
import SelectDealership from "@/components/ComboboxDealership"
import { useDealershipReadingMutations, useDealershipReadings } from "@/hooks/useDealershipReadings"
import { ApartmentReportsSection } from "./apartment-reports-section"
import type { DealershipReading, DealershipType } from "@prisma/client"
import { useComplexes } from "@/hooks/useComplexes"
import { DealershipReadingFull } from "@/types/fullTypes"

// Schema de validação do formulário
const formSchema = z.object({
  // Campos de seleção
  companyId: z.string({ required_error: "Selecione uma empresa" }),
  complexId: z.string({ required_error: "Selecione um condomínio" }),
  dealershipId: z.string({ required_error: "Selecione uma concessionária" }),

  // Tipo de concessionária
  type: z.enum(["water", "gas"], { required_error: "Selecione o tipo de concessionária" }),

  // Datas
  readingDate: z.date({ required_error: "Informe a data da leitura" }),
  readingDateNext: z.date({ required_error: "Informe a data da próxima leitura" }),

  // Referências
  monthRef: z.string().min(1, "Informe o mês de referência"),
  yearRef: z.string().min(1, "Informe o ano de referência"),

  // Consumo
  totalDays: z.coerce.number().min(0, "Valor não pode ser negativo"),
  dealershipConsumption: z.coerce.number().min(0, "Valor não pode ser negativo"),
  monthlyConsumption: z.coerce.number().min(0, "Valor não pode ser negativo"),
  billedConsumption: z.coerce.number().min(0, "Valor não pode ser negativo"),
  average: z.coerce.number().min(0, "Valor não pode ser negativo").default(0),

  // Custos
  dealershipCost: z.coerce.number().min(0, "Valor não pode ser negativo"),
  consumptionValue: z.coerce.number().min(0, "Valor não pode ser negativo"),
  sewageValue: z.coerce.number().min(0, "Valor não pode ser negativo"),
  coeficiente: z.string().optional().default(""),
  metodoCalculo: z.string().optional().default(""),
  totalValue: z.coerce.number().min(0, "Valor não pode ser negativo"),
  diffCost: z.coerce.number(),

  // Carro pipa
  kiteCar: z.boolean().default(false),
  kiteCarQtd: z.coerce.number().min(0, "Valor não pode ser negativo").default(0),
  kiteCarConsumption: z.coerce.number().min(0, "Valor não pode ser negativo").default(0),
  kiteCarConsumedUnits: z.coerce.number().min(0, "Valor não pode ser negativo").default(0),
  kiteCarTax: z.coerce.number().min(0, "Valor não pode ser negativo").default(0),
  kiteCarTotal: z.coerce.number().min(0, "Valor não pode ser negativo").default(0),
  valuePerKiteCar: z.coerce.number().min(0, "Valor não pode ser negativo").default(0),
  kiteCarCostUnits: z.coerce.number().min(0, "Valor não pode ser negativo").default(0),
})

export type FormValues = z.infer<typeof formSchema>

/**
 * Parses a YYYY-MM-DD date string using local time components.
 *
 * WHY: new Date("YYYY-MM-DD") treats the string as UTC midnight.
 * In UTC-3 (America/Sao_Paulo) that resolves to 21:00 the previous local
 * day → getDate() / getMonth() / getFullYear() all return the wrong values.
 * Using new Date(year, month-1, day) constructs the Date in local time,
 * so the selected calendar day is preserved exactly.
 */
function parseDateStringLocal(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

interface DealershipReadingFormProps {
  mode: "create" | "edit" | "view"
  initialData?: DealershipReadingFull
  id?: string
}

export function DealershipReadingForm({ mode, initialData, id }: DealershipReadingFormProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState("general")
  const [dealershipReadingId, setDealershipReadingId] = useState<string>(id || "")
  const [showApartmentReports, setShowApartmentReports] = useState(!!id)
  const { dealershipReadings, loading, error } = useDealershipReadings({ id: dealershipReadingId })
  const dealershipReading = dealershipReadings[0] as DealershipReadingFull


  const { createDealershipReading, updateDealershipReading, error: mutationError, loading: isSubmitting } = useDealershipReadingMutations()

  // Prepara os valores iniciais do formulário
  const getDefaultValues = () => {
    if (initialData) {
      return {
        companyId: initialData.complex?.company?.id || "",
        complexId: initialData.complexId || "",
        dealershipId: initialData.dealershipId || "",
        type: (initialData.type as DealershipType) || "water",
        // ✅ TIMEZONE FIX: parse YYYY-MM-DD string using local components, NOT new Date(string).
        // new Date("YYYY-MM-DD") interprets the string as UTC midnight → in UTC-3 (São Paulo)
        // that becomes 21:00 the previous local day → getDate() returns the wrong day.
        // Splitting and building via new Date(year, month-1, day) uses local time → correct.
        readingDate: initialData.readingDate ? parseDateStringLocal(initialData.readingDate) : new Date(),
        readingDateNext: initialData.readingDateNext ? parseDateStringLocal(initialData.readingDateNext) : new Date(),
        monthRef: initialData.monthRef || "",
        yearRef: initialData.yearRef || "",
        totalDays: initialData.totalDays || 0,
        dealershipConsumption: initialData.dealershipConsumption || 0,
        monthlyConsumption: initialData.monthlyConsumption || 0,
        billedConsumption: initialData.billedConsumption || 0,
        average: initialData.average || 0,
        dealershipCost: initialData.dealershipCost || 0,
        consumptionValue: initialData.consumptionValue || 0,
        sewageValue: initialData.sewageValue || 0,
        coeficiente: initialData.coeficiente || "",
        metodoCalculo: initialData.metodoCalculo || "",
        totalValue: initialData.totalValue || 0,
        diffCost: initialData.diffCost || 0,
        kiteCar: initialData.kiteCar || false,
        kiteCarQtd: initialData.kiteCarQtd || 0,
        kiteCarConsumption: initialData.kiteCarConsumption || 0,
        kiteCarConsumedUnits: initialData.kiteCarConsumedUnits || 0,
        kiteCarTax: initialData.kiteCarTax || 0,
        kiteCarTotal: initialData.kiteCarTotal || 0,
        valuePerKiteCar: initialData.valuePerKiteCar || 0,
        kiteCarCostUnits: initialData.kiteCarCostUnits || 0,
      }
    } return {
      type: "water" as DealershipType,
      monthRef: "",
      yearRef: "",
      totalDays: 0,
      dealershipConsumption: 0,
      monthlyConsumption: 0,
      billedConsumption: 0,
      average: 0,
      dealershipCost: 0,
      consumptionValue: 0,
      sewageValue: 0,
      coeficiente: "",
      metodoCalculo: "",
      totalValue: 0,
      diffCost: 0,
      kiteCar: false,
      kiteCarQtd: 0,
      kiteCarConsumption: 0,
      kiteCarConsumedUnits: 0,
      kiteCarTax: 0,
      kiteCarTotal: 0,
      valuePerKiteCar: 0,
      kiteCarCostUnits: 0,
    }
  }

  // Inicializa o formulário
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: getDefaultValues(),
  })

  // Função para lidar com o envio do formulário
  async function onSubmit(data: FormValues) {
    try {
      // ✅ CORREÇÃO TIMEZONE: Formata datas localmente para evitar problema de UTC (-1 dia)
      // O objeto Date do JS é UTC, mas o usuário selecionou uma data local (America/Sao_Paulo).
      // Usar format() diretamente causaria retorno de 1 dia a menos em horários noturnos.
      // A solução é extrair ano/mês/dia diretamente dos valores locais do objeto Date.
      const formatLocalDate = (date: Date): string => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      };

      const formattedData = {
        ...data,
        readingDate: formatLocalDate(data.readingDate),
        readingDateNext: formatLocalDate(data.readingDateNext),
      }

      let result

      if (mode === "edit" && id) {
        // Atualiza a leitura existente
        result = await updateDealershipReading(id, formattedData)
        if (!result) return
        toast({
          title: "Leitura atualizada com sucesso",
          description: "A leitura da concessionária foi atualizada no sistema.",
        })
      } else {
        // Cria uma nova leitura
        result = await createDealershipReading(formattedData)
        if (!result) return
        toast({
          title: "Leitura criada com sucesso",
          description: "A leitura da concessionária foi registrada no sistema.",
        })
      }

      // Set the dealership reading ID and show apartment reports section
      if (result && result.id) {
        setTimeout(() => {
          router.push("/dealership-readings/" + result.id)
        }, 1000)
        // setDealershipReadingId(result.id)
        // setShowApartmentReports(true)
      } else if (mode === "create") {
        // Redireciona para a lista de leituras se não temos um ID e estamos criando
        router.push("/dealership-readings")
      }
    } catch (error) {
      console.error("Erro ao processar leitura:", error)
      toast({
        title: `Erro ao ${mode === "edit" ? "atualizar" : "criar"} leitura`,
        description: "Ocorreu um erro ao processar a leitura. Tente novamente.",
        variant: "destructive",
      })
    }
  }
  // Calcula o valor total automaticamente quando os valores relevantes mudam
  const watchConsumptionValue = form.watch("consumptionValue")
  const watchSewageValue = form.watch("sewageValue")
  const watchDiffCost = form.watch("diffCost")
  const watchKiteCar = form.watch("kiteCar")
  const watchComplexId = form.watch("complexId")
  const watchMonthRef = form.watch("monthRef")
  const watchYearRef = form.watch("yearRef")

  // Atualiza o valor total quando os valores de consumo, esgoto ou área comum mudam
  const updateTotalValue = () => {
    const consumptionValue = Number.parseFloat(watchConsumptionValue?.toString() || "0")
    const sewageValue = Number.parseFloat(watchSewageValue?.toString() || "0")
    const diffCost = Number.parseFloat(watchDiffCost?.toString() || "0")
    form.setValue("totalValue", consumptionValue + sewageValue + diffCost)
  }

  // Helper function to determine dealership type from service
  const getDealershipTypeFromService = (service: string): "water" | "gas" => {
    const normalizedService = service.toLowerCase().trim()

    // Check for water-related terms
    if (normalizedService.includes('agua') ||
      normalizedService.includes('água') ||
      normalizedService.includes('water') /*||
      normalizedService.includes('saneamento')*/) {
      return "water"
    }

    // Check for gas-related terms
    if (normalizedService.includes('gas') ||
      normalizedService.includes('gás')/* ||
      normalizedService.includes('natural')*/) {
      return "gas"
    }

    // Default to water if unclear
    return "water"
  }

  // Efeito para atualizar o valor total
  React.useEffect(() => {
    updateTotalValue()
  }, [watchConsumptionValue, watchSewageValue, watchDiffCost])

  React.useEffect(() => {
    if (mutationError) {
      toast({
        title: "Erro ao processar leitura",
        description: mutationError,
        variant: "destructive",
      })
    }
  }, [mutationError])

  // Determina se os campos devem ser somente leitura
  const isReadOnly = mode === "view"

  return (
    <div className="container mx-auto space-y-6 md:p-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">
          {mode === "create"
            ? "Novo Relatório de Concessionária"
            : mode === "edit"
              ? "Editar Relatório de Concessionária"
              : "Visualizar Relatório de Concessionária"}
        </h1>
        <p className="text-muted-foreground">
          {mode === "create"
            ? "Registre um novo relatório de consumo de água/gás para um condomínio."
            : mode === "edit"
              ? "Edite os dados da relatório de consumo selecionada."
              : "Visualize os detalhes da relatório de consumo selecionada."}
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid grid-cols-3 w-full max-w-md">
              <TabsTrigger value="general">Geral</TabsTrigger>
              <TabsTrigger value="consumption">Consumo</TabsTrigger>
              <TabsTrigger value="kiteCar">Carro Pipa</TabsTrigger>
            </TabsList>

            {/* Aba Geral */}
            <TabsContent value="general" className="space-y-4 mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Informações Gerais</CardTitle>
                  <CardDescription>Selecione a empresa, condomínio e concessionária para esta leitura.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Empresa */}
                    <FormField
                      control={form.control}
                      name="companyId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Empresa</FormLabel>
                          <FormControl>
                            {isReadOnly ? (
                              <Input value={initialData?.complex?.company?.socialName || '-'} readOnly className="bg-muted" />
                            ) : (
                              <SelectCompany
                                setSelectedCompany={(company) => {
                                  if (company) {
                                    field.onChange(company.id)
                                  } else {
                                    field.onChange(undefined)
                                  }
                                }}
                                required
                                company={{ id: field.value }}
                              />
                            )}
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Condomínio */}
                    <FormField
                      control={form.control}
                      name="complexId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Condomínio</FormLabel>
                          <FormControl>
                            {isReadOnly ? (
                              // <Input value={field.value} readOnly className="bg-muted" />
                              <Input value={initialData?.complex?.socialName || '?'} readOnly className="bg-muted" />
                            ) : (
                              <SelectComplex
                                setSelectedComplex={(complex) => {
                                  if (complex) {
                                    field.onChange(complex.id)
                                  } else {
                                    field.onChange(undefined)
                                  }
                                }}
                                required
                                complex={{ id: field.value }}
                              />
                            )}
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Concessionária */}
                    <FormField
                      control={form.control}
                      name="dealershipId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Concessionária</FormLabel>
                          <FormControl>
                            {isReadOnly ? (
                              // <Input value={field.value} readOnly className="bg-muted" />
                              <Input value={initialData?.dealership?.name || '?'} readOnly className="bg-muted" />
                            ) : (
                              <SelectDealership
                                setSelectedDealership={(dealership) => {
                                  if (dealership) {
                                    form.setValue("dealershipId", dealership.id)

                                    // Auto-populate type based on dealership service
                                    if (dealership.service) {
                                      const type = getDealershipTypeFromService(dealership.service)
                                      form.setValue("type", type)
                                    }
                                  } else {
                                    form.setValue("dealershipId", "")
                                    form.setValue("type", "water") // default value
                                  }
                                }}
                                required
                                dealership={{ id: field.value }}
                              />
                            )}
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Tipo de Concessionária - Sempre não editável */}
                    <FormField
                      control={form.control}
                      name="type"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Tipo de Concessionária</FormLabel>
                          <FormControl>
                            <div className="flex items-center h-10 px-3 border rounded-md bg-muted">
                              {field.value === "water" ? (
                                <div className="flex items-center gap-2">
                                  <Droplet className="h-4 w-4 text-blue-500" />
                                  <span>Água</span>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <Flame className="h-4 w-4 text-orange-500" />
                                  <span>Gás</span>
                                </div>
                              )}
                            </div>
                          </FormControl>
                          <FormDescription>Determinado automaticamente pela concessionária selecionada</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <Separator />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Data da Leitura */}
                    <FormField
                      control={form.control}
                      name="readingDate"
                      render={({ field }) => (
                        <FormItem className="flex flex-col">
                          <FormLabel>Data da Leitura</FormLabel>
                          {isReadOnly ? (
                            <FormControl>
                              <Input
                                value={field.value ? format(field.value, "dd/MM/yyyy") : ""}
                                readOnly
                                className="bg-muted"
                              />
                            </FormControl>
                          ) : (
                            <DatePicker
                              selected={field.value}
                              onSelect={field.onChange}
                              locale={ptBR}
                              disabled={(date) => date > new Date()}
                            />
                          )}
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Data da Próxima Leitura */}
                    <FormField
                      control={form.control}
                      name="readingDateNext"
                      render={({ field }) => (
                        <FormItem className="flex flex-col">
                          <FormLabel>Data da Próxima Leitura</FormLabel>
                          {isReadOnly ? (
                            <FormControl>
                              <Input
                                value={field.value ? format(field.value, "dd/MM/yyyy") : ""}
                                readOnly
                                className="bg-muted"
                              />
                            </FormControl>
                          ) : (
                            <DatePicker
                              selected={field.value}
                              onSelect={field.onChange}
                              locale={ptBR}
                              disabled={(date) => date < form.getValues("readingDate")}
                            />
                          )}
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Mês de Referência */}
                    <FormField
                      control={form.control}
                      name="monthRef"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Mês de Referência</FormLabel>
                          <FormControl>
                            {isReadOnly ? (
                              <Input
                                value={(() => {
                                  const meses = [
                                    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
                                    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
                                  ];
                                  const idx = parseInt(field.value, 10) - 1;
                                  return field.value && idx >= 0 && idx < 12 ? `${field.value} - ${meses[idx]}` : field.value;
                                })()}
                                readOnly
                                className="bg-muted"
                              />
                            ) : (
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <SelectTrigger>
                                  <SelectValue placeholder="Selecione o mês" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="01">01 - Janeiro</SelectItem>
                                  <SelectItem value="02">02 - Fevereiro</SelectItem>
                                  <SelectItem value="03">03 - Março</SelectItem>
                                  <SelectItem value="04">04 - Abril</SelectItem>
                                  <SelectItem value="05">05 - Maio</SelectItem>
                                  <SelectItem value="06">06 - Junho</SelectItem>
                                  <SelectItem value="07">07 - Julho</SelectItem>
                                  <SelectItem value="08">08 - Agosto</SelectItem>
                                  <SelectItem value="09">09 - Setembro</SelectItem>
                                  <SelectItem value="10">10 - Outubro</SelectItem>
                                  <SelectItem value="11">11 - Novembro</SelectItem>
                                  <SelectItem value="12">12 - Dezembro</SelectItem>
                                </SelectContent>
                              </Select>
                            )}
                          </FormControl>
                          <FormDescription>Informe o mês em formato numérico (01-12)</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Ano de Referência */}
                    <FormField
                      control={form.control}
                      name="yearRef"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Ano de Referência</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              value={field.value ?? ""}
                              placeholder="Ex: 2023"
                              readOnly={isReadOnly}
                              className={isReadOnly ? "bg-muted" : ""}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Total de Dias */}
                    <FormField
                      control={form.control}
                      name="totalDays"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Total de Dias</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              {...field}
                              min="0"
                              readOnly={isReadOnly}
                              className={isReadOnly ? "bg-muted" : ""}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Aba Consumo */}
            <TabsContent value="consumption" className="space-y-4 mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Dados de Consumo</CardTitle>
                  <CardDescription>Informe os valores de consumo e custos da concessionária.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Consumo da Concessionária */}
                    <FormField
                      control={form.control}
                      name="dealershipConsumption"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Consumo da Concessionária (m³)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              {...field}
                              min="0"
                              step="0.001"
                              readOnly={isReadOnly}
                              className={isReadOnly ? "bg-muted" : ""}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Consumo Unidades */}
                    <FormField
                      control={form.control}
                      name="monthlyConsumption"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Consumo Unidades (m³)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              {...field}
                              min="0"
                              step="0.001"
                              readOnly={isReadOnly}
                              className={isReadOnly ? "bg-muted" : ""}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Consumo Faturado */}
                    <FormField
                      control={form.control}
                      name="billedConsumption"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Consumo Faturado (m³)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              {...field}
                              min="0"
                              step="0.001"
                              readOnly={isReadOnly}
                              className={isReadOnly ? "bg-muted" : ""}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Média */}
                    {/* <FormField
                      control={form.control}
                      name="average"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Média</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              {...field}
                              min="0"
                              step="0.001"
                              readOnly={isReadOnly}
                              className={isReadOnly ? "bg-muted" : ""}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    /> */}
                  </div>

                  <Separator />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Custo da Concessionária */}
                    <FormField
                      control={form.control}
                      name="dealershipCost"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Custo da Concessionária (R$)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              {...field}
                              min="0"
                              step="0.01"
                              readOnly={isReadOnly}
                              className={isReadOnly ? "bg-muted" : ""}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Valor do Consumo */}
                    <FormField
                      control={form.control}
                      name="consumptionValue"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Valor do Consumo (R$)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              {...field}
                              min="0"
                              step="0.01"
                              onChange={(e) => {
                                if (!isReadOnly) {
                                  field.onChange(e)
                                  updateTotalValue()
                                }
                              }}
                              readOnly={isReadOnly}
                              className={isReadOnly ? "bg-muted" : ""}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Valor do Esgoto */}
                    <FormField
                      control={form.control}
                      name="sewageValue"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Valor do Esgoto (R$)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              {...field}
                              min="0"
                              step="0.01"
                              onChange={(e) => {
                                if (!isReadOnly) {
                                  field.onChange(e)
                                  updateTotalValue()
                                }
                              }}
                              readOnly={isReadOnly}
                              className={isReadOnly ? "bg-muted" : ""}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Área Comum */}
                    <FormField
                      control={form.control}
                      name="diffCost"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Área Comum (R$)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              {...field}
                              step="0.01"
                              onChange={(e) => {
                                if (!isReadOnly) {
                                  field.onChange(e)
                                  updateTotalValue()
                                }
                              }}
                              readOnly={isReadOnly}
                              className={isReadOnly ? "bg-muted" : ""}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />                    {/* Coeficiente */}
                    <FormField
                      control={form.control}
                      name="coeficiente"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Coeficiente</FormLabel>
                          <FormControl>
                            <Input
                              type="text"
                              {...field}
                              readOnly={isReadOnly}
                              className={isReadOnly ? "bg-muted" : ""}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Método de Cálculo */}
                    <FormField
                      control={form.control}
                      name="metodoCalculo"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Método de Cálculo</FormLabel>
                          <FormControl>
                            <Input
                              type="text"
                              {...field}
                              readOnly={isReadOnly}
                              className={isReadOnly ? "bg-muted" : ""}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Conta Total */}
                    <FormField
                      control={form.control}
                      name="totalValue"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Conta Total (R$)</FormLabel>
                          <FormControl>
                            <Input type="number" {...field} min="0" step="0.01" readOnly className="bg-muted" />
                          </FormControl>
                          <FormDescription>Calculado automaticamente (Consumo + Esgoto + Área Comum)</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Aba Carro Pipa */}
            <TabsContent value="kiteCar" className="space-y-4 mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Carro Pipa</CardTitle>
                  <CardDescription>Informações sobre o uso de carro pipa.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="kiteCar"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={isReadOnly ? undefined : field.onChange}
                            disabled={isReadOnly}
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel>Utiliza Carro Pipa</FormLabel>
                          <FormDescription>Marque esta opção se o condomínio utiliza carro pipa.</FormDescription>
                        </div>
                      </FormItem>
                    )}
                  />

                  {watchKiteCar && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                      {/* Quantidade de Caminhões */}
                      <FormField
                        control={form.control}
                        name="kiteCarQtd"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Quantidade de Caminhões</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                {...field}
                                min="0"
                                readOnly={isReadOnly}
                                className={isReadOnly ? "bg-muted" : ""}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* m³ Recebidos */}
                      <FormField
                        control={form.control}
                        name="kiteCarConsumption"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>m³ Recebidos</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                {...field}
                                min="0"
                                step="0.001"
                                readOnly={isReadOnly}
                                className={isReadOnly ? "bg-muted" : ""}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Consumo Carro Pipa das Unidades */}
                      <FormField
                        control={form.control}
                        name="kiteCarConsumedUnits"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Consumo Carro Pipa das Unidades (m³)</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                {...field}
                                min="0"
                                step="0.001"
                                readOnly={isReadOnly}
                                className={isReadOnly ? "bg-muted" : ""}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Valor do m³ */}
                      <FormField
                        control={form.control}
                        name="kiteCarTax"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Valor do m³ (R$)</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                {...field}
                                min="0"
                                step="0.01"
                                readOnly={isReadOnly}
                                className={isReadOnly ? "bg-muted" : ""}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Valor Total do Carro Pipa */}
                      <FormField
                        control={form.control}
                        name="kiteCarTotal"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Valor Total do Carro Pipa (R$)</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                {...field}
                                min="0"
                                step="0.01"
                                readOnly={isReadOnly}
                                className={isReadOnly ? "bg-muted" : ""}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Valor por Caminhão */}
                      <FormField
                        control={form.control}
                        name="valuePerKiteCar"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Valor por Caminhão (R$)</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                {...field}
                                min="0"
                                step="0.01"
                                readOnly={isReadOnly}
                                className={isReadOnly ? "bg-muted" : ""}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Valor Carro Pipa das Unidades */}
                      <FormField
                        control={form.control}
                        name="kiteCarCostUnits"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Valor Carro Pipa das Unidades (R$)</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                {...field}
                                min="0"
                                step="0.01"
                                readOnly={isReadOnly}
                                className={isReadOnly ? "bg-muted" : ""}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {!isReadOnly && (
            <div className="flex justify-end gap-4">
              <Button type="button" variant="outline" onClick={() => router.push("/dealership-readings")}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {mode === "edit" ? "Atualizar" : "Salvar"} Relatório
              </Button>
            </div>
          )}

          {isReadOnly && (
            <div className="flex justify-end gap-4">
              <Button type="button" variant="outline" onClick={() => router.push("/dealership-readings")}>
                Voltar
              </Button>
              <Button type="button" onClick={() => router.push(`/dealership-readings/${id}/edit`)}>
                Editar Relatório
              </Button>
            </div>
          )}
        </form>
      </Form>

      {/* Apartment Reports Section - Only shown after dealership reading is created or when viewing/editing */}
      {showApartmentReports && dealershipReading && watchComplexId && (
        <ApartmentReportsSection
          dealershipReading={dealershipReading}
          complexId={watchComplexId}
          monthRef={watchMonthRef}
          yearRef={watchYearRef}
        />
      )}
    </div>
  )
}
