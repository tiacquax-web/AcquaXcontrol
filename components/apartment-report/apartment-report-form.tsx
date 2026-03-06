"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import * as z from "zod"
import { Droplet, Flame, Loader2, TrendingUp, Wallet } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/hooks/use-toast"
import { useApartmentReportMutations } from "@/hooks/useApartmentReport"
import type { ApartmentWithConsumptionReport } from "@/types/apartment"
import { Badge } from "@/components/ui/badge"

// Schema de validação do formulário
const formSchema = z.object({
    // Referências
    monthRef: z.string().min(1, "Informe o mês de referência"),
    yearRef: z.string().min(1, "Informe o ano de referência"),

    // Valores de consumo
    consumption: z.coerce.number().min(0, "Valor não pode ser negativo"),
    totalConsumption: z.coerce.number().min(0, "Valor não pode ser negativo").optional(),

    // Valores de custo
    consumptionCost: z.coerce.number().min(0, "Valor não pode ser negativo"),
    sewageCost: z.coerce.number().min(0, "Valor não pode ser negativo"),
    partial: z.coerce.number().min(0, "Valor não pode ser negativo"),
    totalUnit: z.coerce.number().min(0, "Valor não pode ser negativo"),

    // Carro pipa
    kiteCarConsumption: z.coerce.number().min(0, "Valor não pode ser negativo").optional(),
    kiteCarCost: z.coerce.number().min(0, "Valor não pode ser negativo").optional(),

    // Gás
    consumptionGasValue: z.coerce.number().min(0, "Valor não pode ser negativo").optional(),
    totalGasValue: z.coerce.number().min(0, "Valor não pode ser negativo").optional(),
})

export type ApartmentReportFormValues = z.infer<typeof formSchema>

interface ApartmentReportFormProps {
    mode: "view" | "edit"
    report: ApartmentWithConsumptionReport
    onSuccess?: () => void
}

export function ApartmentReportForm({ mode, report, onSuccess }: ApartmentReportFormProps) {
    const router = useRouter()
    const { toast } = useToast()
    const [activeTab, setActiveTab] = useState("consumption")

    const { updateApartmentReport, error, loading: isSubmitting } = useApartmentReportMutations()

    // Prepara os valores iniciais do formulário
    const defaultValues: Partial<ApartmentReportFormValues> = {
        monthRef: report.monthRef || "",
        yearRef: report.yearRef || "",
        consumption: report.consumption || 0,
        totalConsumption: report.totalConsumption || 0,
        consumptionCost: report.consumptionCost || 0,
        sewageCost: report.sewageCost || 0,
        partial: report.partial || 0,
        totalUnit: report.totalUnit || 0,
        kiteCarConsumption: report.kiteCarConsumption || 0,
        kiteCarCost: report.kiteCarCost || 0,
        consumptionGasValue: report.consumptionGasValue || 0,
        totalGasValue: report.totalGasValue || 0,
    }

    // Inicializa o formulário
    const form = useForm<ApartmentReportFormValues>({
        resolver: zodResolver(formSchema),
        defaultValues,
    })

    // Função para lidar com o envio do formulário
    async function onSubmit(data: ApartmentReportFormValues) {
        try {
            const updatedApartmentReport = await updateApartmentReport(report.id, data)
            if (!updatedApartmentReport) return

            toast({
                title: "Relatório atualizado com sucesso",
                description: "O relatório de consumo foi atualizado no sistema.",
            })

            if (onSuccess) {
                onSuccess()
            }
        } catch (error) {
            console.error("Erro ao atualizar relatório:", error)
            toast({
                title: "Erro ao atualizar relatório",
                description: "Ocorreu um erro ao atualizar o relatório. Tente novamente.",
                variant: "destructive",
            })
        }
    }

    // Determina se os campos devem ser somente leitura
    const isReadOnly = mode === "view"

    // Calcula o valor total automaticamente quando os valores relevantes mudam
    const watchConsumptionCost = form.watch("consumptionCost")
    const watchSewageCost = form.watch("sewageCost")
    const watchPartial = form.watch("partial")
    const watchKiteCarCost = form.watch("kiteCarCost")

    // Atualiza o valor total quando os valores de custo mudam
    const updateTotalValue = () => {
        const consumptionCost = Number.parseFloat(watchConsumptionCost?.toString() || "0")
        const sewageCost = Number.parseFloat(watchSewageCost?.toString() || "0")
        const partial = Number.parseFloat(watchPartial?.toString() || "0")
        const kiteCarCost = Number.parseFloat(watchKiteCarCost?.toString() || "0")

        form.setValue("totalUnit", consumptionCost + sewageCost + partial + kiteCarCost)
    }

    // Efeito para atualizar o valor total
    useState(() => {
        updateTotalValue()
    })

    useEffect(() => {
        if (error) {
            toast({
                title: "Erro ao atualizar relatório",
                description: error,
                variant: "destructive",
            })
        }
    }, [error, toast])

    return (
        <Card className="w-full">
            <CardHeader>
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                    <div>
                        <CardTitle className="text-lg font-semibold">Relatório de Consumo</CardTitle>
                        <CardDescription>
                            Detalhes do consumo do apartamento {report.apartment?.block?.name || ""}
                            {report.apartment?.name}
                        </CardDescription>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                            {report.monthRef}/{report.yearRef}
                        </Badge>
                        {report.DealershipReading?.type === "water" ? (
                            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                                <Droplet className="h-3 w-3 mr-1" />
                                Água
                            </Badge>
                        ) : report.DealershipReading?.type === "gas" ? (
                            <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
                                <Flame className="h-3 w-3 mr-1" />
                                Gás
                            </Badge>
                        ) : (
                            <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-200">
                                Tipo Não Identificado
                            </Badge>
                        )}
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                            <TabsList className="grid grid-cols-2 w-full max-w-md">
                                <TabsTrigger value="consumption">
                                    <TrendingUp className="h-4 w-4 mr-2" />
                                    Consumo
                                </TabsTrigger>
                                <TabsTrigger value="costs">
                                    <Wallet className="h-4 w-4 mr-2" />
                                    Custos
                                </TabsTrigger>
                            </TabsList>

                            {/* Aba de Consumo */}
                            <TabsContent value="consumption" className="space-y-4 mt-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {/* Mês de Referência */}
                                    <FormField
                                        control={form.control}
                                        name="monthRef"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Mês de Referência</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        {...field}
                                                        placeholder="Ex: 01 para Janeiro"
                                                        readOnly={isReadOnly}
                                                        className={isReadOnly ? "bg-muted" : ""}
                                                    />
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
                                                        placeholder="Ex: 2023"
                                                        readOnly={isReadOnly}
                                                        className={isReadOnly ? "bg-muted" : ""}
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    {/* Consumo */}
                                    <FormField
                                        control={form.control}
                                        name="consumption"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Consumo (m³)</FormLabel>
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
                                                <FormDescription>Valor da leitura atual</FormDescription>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    {/* Consumo Total */}
                                    <FormField
                                        control={form.control}
                                        name="totalConsumption"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Consumo Total (m³)</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        type="number"
                                                        value={field.value || 0}
                                                        onChange={field.onChange}
                                                        min="0"
                                                        step="0.001"
                                                        readOnly={isReadOnly}
                                                        className={isReadOnly ? "bg-muted" : ""}
                                                    />
                                                </FormControl>
                                                <FormDescription>Consumo total da unidade (leitura atual - leitura anterior)</FormDescription>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    {/* Consumo Carro Pipa */}
                                    {report.DealershipReading?.kiteCar && (
                                        <FormField
                                            control={form.control}
                                            name="kiteCarConsumption"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Consumo Carro Pipa (m³)</FormLabel>
                                                    <FormControl>
                                                        <Input
                                                            type="number"
                                                            value={field.value || 0}
                                                            onChange={field.onChange}
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
                                    )}

                                    {/* Consumo de Gás */}
                                    {report.DealershipReading?.type === "gas" && (
                                        <FormField
                                            control={form.control}
                                            name="consumptionGasValue"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Consumo de Gás (m³)</FormLabel>
                                                    <FormControl>
                                                        <Input
                                                            type="number"
                                                            value={field.value || 0}
                                                            onChange={field.onChange}
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
                                    )}
                                </div>
                            </TabsContent>

                            {/* Aba de Custos */}
                            <TabsContent value="costs" className="space-y-4 mt-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {/* Custo de Consumo */}
                                    <FormField
                                        control={form.control}
                                        name="consumptionCost"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Custo de Consumo (R$)</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        type="number"
                                                        {...field}
                                                        min="0"
                                                        step="0.01"
                                                        onChange={(e) => {
                                                            field.onChange(e)
                                                            if (!isReadOnly) updateTotalValue()
                                                        }}
                                                        readOnly={isReadOnly}
                                                        className={isReadOnly ? "bg-muted" : ""}
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    {/* Custo de Esgoto */}
                                    {report.DealershipReading?.type === "water" && (
                                        <FormField
                                            control={form.control}
                                            name="sewageCost"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Custo de Esgoto (R$)</FormLabel>
                                                    <FormControl>
                                                        <Input
                                                            type="number"
                                                            {...field}
                                                            min="0"
                                                            step="0.01"
                                                            onChange={(e) => {
                                                                field.onChange(e)
                                                                if (!isReadOnly) updateTotalValue()
                                                            }}
                                                            readOnly={isReadOnly}
                                                            className={isReadOnly ? "bg-muted" : ""}
                                                        />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    )}

                                    {/* Rateio Proporcional */}
                                    <FormField
                                        control={form.control}
                                        name="partial"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Rateio Proporcional (R$)</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        type="number"
                                                        {...field}
                                                        min="0"
                                                        step="0.01"
                                                        onChange={(e) => {
                                                            field.onChange(e)
                                                            if (!isReadOnly) updateTotalValue()
                                                        }}
                                                        readOnly={isReadOnly}
                                                        className={isReadOnly ? "bg-muted" : ""}
                                                    />
                                                </FormControl>
                                                <FormDescription>Valor proporcional para rateio de consumo</FormDescription>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    {/* Custo Carro Pipa */}
                                    {report.DealershipReading?.kiteCar && (
                                        <FormField
                                            control={form.control}
                                            name="kiteCarCost"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Custo Carro Pipa (R$)</FormLabel>
                                                    <FormControl>
                                                        <Input
                                                            type="number"
                                                            value={field.value || 0}
                                                            onChange={(e) => {
                                                                field.onChange(e)
                                                                if (!isReadOnly) updateTotalValue()
                                                            }}
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
                                    )}

                                    {/* Valor Total do Gás */}
                                    {report.DealershipReading?.type === "gas" && (
                                        <FormField
                                            control={form.control}
                                            name="totalGasValue"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Valor Total do Gás (R$)</FormLabel>
                                                    <FormControl>
                                                        <Input
                                                            type="number"
                                                            value={field.value || 0}
                                                            onChange={field.onChange}
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
                                    )}

                                    {/* Total da Unidade */}
                                    <FormField
                                        control={form.control}
                                        name="totalUnit"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Total da Unidade (R$)</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        type="number"
                                                        {...field}
                                                        min="0"
                                                        step="0.01"
                                                        readOnly
                                                        className="bg-muted font-medium"
                                                    />
                                                </FormControl>
                                                <FormDescription>Valor total a ser pago pela unidade</FormDescription>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>
                            </TabsContent>
                        </Tabs>

                        {!isReadOnly && (
                            <div className="flex justify-end gap-4">
                                <Button type="button" variant="outline" onClick={() => router.back()}>
                                    Cancelar
                                </Button>
                                <Button type="submit" disabled={isSubmitting}>
                                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Salvar Alterações
                                </Button>
                            </div>
                        )}

                        {isReadOnly && (
                            <div className="flex justify-end gap-4">
                                <Button type="button" variant="outline" onClick={() => router.back()}>
                                    Voltar
                                </Button>
                                <Button type="button" onClick={() => router.push(`/apartment-report/${report.id}/edit`)}>
                                    Editar Relatório
                                </Button>
                            </div>
                        )}
                    </form>
                </Form>
            </CardContent>
        </Card>
    )
}
