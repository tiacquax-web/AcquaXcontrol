"use client"

import type React from "react"

import { useState, useEffect, use } from "react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PermissionableEntity, type Apartment, type Block, type Company, type Complex, type Meter, type TypeMeter } from "@prisma/client"
import ApartmentsCombobox from "@/components/ComboboxApartment"
import TypeMetersCombobox from "@/components/ComboboxTypeMeter"
import CompaniesCombobox from "@/components/ComboboxCompany"
import ComplexesCombobox from "@/components/ComboboxComplex"
import BlocksCombobox from "@/components/ComboboxBlock"
import { complex } from "framer-motion"
import { Card, CardContent, CardHeader, CardFooter, CardTitle } from "@/components/ui/card"
import { ArrowLeft } from "lucide-react"
import { getApartments } from "@/services/apartmentService"
import { getBlocks } from "@/services/blocksService"
import { getComplexes } from "@/services/complexesService"
import { getCompanies } from "@/services/companiesService"
import { getTypeMeters } from "@/services/typemetersService"

interface MeterModalProps {
    isOpen: boolean
    onClose: () => void
    onSave: (meter: Partial<Meter>) => void
    meter: Meter | null
}

export default function MeterModal({ isOpen, onClose, onSave, meter }: MeterModalProps) {
    const [formData, setFormData] = useState<Partial<Meter>>({
        register: "",
        groupLinkDeviceId: "",
        iotBrand: "GL",
        status: "Ativo",
        location: "",
        initialReading: 0,
        yearManufacture: undefined,
        main: true,
        rotation: "Crescente",
        apartmentId: "",
        typeMeterId: "",
    })

    // Estado para rastrear valores originais e detectar mudanças
    const [originalData, setOriginalData] = useState<Partial<Meter>>({})

    // Estados de loading para impedir submissão durante carregamento
    const [loadingStates, setLoadingStates] = useState({
        apartment: false,
        typeMeter: false,
        context: false
    })

    // Log para debug dos estados de loading
    console.log("Loading States:", loadingStates)

    const [contextFilter, setContextFilter] = useState<{
        company: Company | undefined
        complex: Complex | undefined
        block: Block | undefined
    }>({
        company: undefined,
        complex: undefined,
        block: undefined,
    })

    console.log("contextFilter", contextFilter)
    console.log("formData", formData)

    const [selectedApartment, setSelectedApartment] = useState<Apartment | undefined>(undefined)
    const [selectedTypeMeter, setSelectedTypeMeter] = useState<TypeMeter | undefined>(undefined)

    async function fillContextFilter(meter: Meter) {
        const availableApartments = await getApartments({ apartmentId: meter.apartmentId, getAvailableForEntity: PermissionableEntity.meter })
        const apartment = availableApartments.list[0]
        if (!apartment) return

        const availableBlocks = await getBlocks({ blockId: apartment.blockId, getAvailableForEntity: PermissionableEntity.meter })
        const block = availableBlocks[0]
        if (!block) return
        const availableComplexes = await getComplexes({ complexId: block.complexId, getAvailableForEntity: PermissionableEntity.meter })
        const complex = availableComplexes[0]
        if (!complex || !complex.companyId) return
        const availableCompanies = await getCompanies({ companyId: complex.companyId, getAvailableForEntity: PermissionableEntity.meter })
        const company = availableCompanies[0]
        if (!company) return

        const typeMeters = await getTypeMeters({ typeMeterId: meter.typeMeterId })
        const typeMeter = typeMeters[0]

        setContextFilter({
            company,
            complex,
            block,
        })

        setSelectedApartment(apartment)
        if (!typeMeter) return
        setSelectedTypeMeter(typeMeter)
    }

    useEffect(() => {
        if (meter) {
            setFormData({
                ...meter,
            })
            setOriginalData({ ...meter }) // Armazenar dados originais completos
            
            // Resetar estados de loading
            setLoadingStates({
                apartment: false,
                typeMeter: false,
                context: false
            })
            
            // obtendo o contexto
            if (meter.apartmentId) {
                setLoadingStates(prev => ({ ...prev, context: true, apartment: true }))
                // Busca o apartamento já com bloco, complexo e empresa
                console.log("🔍 Buscando contexto para apartmentId:", meter.apartmentId);
                getApartments({ apartmentId: meter.apartmentId, getAvailableForEntity: PermissionableEntity.meter, withBlock: true, withComplex: true, withCompany: true }).then((availableApartments) => {
                    console.log("📊 Resultado da busca de apartamentos:", availableApartments);
                    const apartment = availableApartments.list[0]
                    if (!apartment) {
                        console.warn("⚠️ Apartamento não encontrado");
                        setContextFilter({ company: undefined, complex: undefined, block: undefined })
                        setSelectedApartment(undefined)
                        setLoadingStates(prev => ({ ...prev, context: false, apartment: false }))
                        return
                    }
                    console.log("🏠 Apartamento encontrado:", apartment);
                    setSelectedApartment(apartment)
                    const block = apartment.block
                    const complex = block?.complex
                    const company = complex?.company
                    console.log("🏗️ Bloco:", block);
                    console.log("🏢 Complexo:", complex);
                    console.log("🏭 Empresa:", company);
                    setContextFilter({
                        company: company || undefined,
                        complex: complex || undefined,
                        block: block || undefined,
                    })
                    setLoadingStates(prev => ({ ...prev, context: false, apartment: false }))
                })
            } else {
                setContextFilter({ company: undefined, complex: undefined, block: undefined })
                setSelectedApartment(undefined)
            }
            if (meter.typeMeterId) {
                setLoadingStates(prev => ({ ...prev, typeMeter: true }))
                getTypeMeters({ typeMeterId: meter.typeMeterId }).then(typeMeters => {
                    const typeMeter = typeMeters[0]
                    if (typeMeter) setSelectedTypeMeter(typeMeter)
                    setLoadingStates(prev => ({ ...prev, typeMeter: false }))
                })
            } else {
                setSelectedTypeMeter(undefined)
            }
        } else {
            const defaultData = {
                register: "",
                groupLinkDeviceId: "",
                iotBrand: "GL",
                status: "Ativo",
                location: "",
                initialReading: 0,
                yearManufacture: undefined,
                main: true,
                rotation: "Crescente",
                apartmentId: "",
                typeMeterId: "",
            }
            setFormData(defaultData)
            setOriginalData(defaultData) // Para novo medidor, dados originais são os padrão
            setContextFilter({ company: undefined, complex: undefined, block: undefined })
            setSelectedApartment(undefined)
            setSelectedTypeMeter(undefined)
            // Resetar estados de loading para novo medidor
            setLoadingStates({
                apartment: false,
                typeMeter: false,
                context: false
            })
        }
    }, [meter, isOpen])

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target
        setFormData((prev) => ({ ...prev, [name]: value }))
    }

    const handleSelectChange = (name: string, value: string | boolean) => {
        setFormData((prev) => ({ ...prev, [name]: value }))
    }

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        
        // Verificar se ainda há dados sendo carregados
        const isLoading = Object.values(loadingStates).some(loading => loading)
        if (isLoading) {
            console.warn('⚠️ Tentativa de submissão bloqueada - dados ainda carregando:', loadingStates)
            return
        }
        
        console.log('Dados do formulário para envio:', formData)
        
        onSave(formData)
    }

    const handleSelectedContext = (company: Company | undefined, complex: Complex | undefined, block: Block | undefined) => {
        setContextFilter({ company, complex, block })

        handleSelectedApartment(undefined) // Reset selected apartment when context changes
    }

    const handleSelectedApartment = (apartment: Apartment | undefined) => {
        if (apartment) {
            setFormData((prev) => ({ ...prev, apartmentId: apartment.id }))
            setSelectedApartment(apartment)
        } else {
            setFormData((prev) => ({ ...prev, apartmentId: "" }))
            setSelectedApartment(undefined)
        }
    }

    const handleSelectedTypeMeter = (typeMeter: TypeMeter | undefined) => {
        if (typeMeter) {
            setFormData((prev) => ({ ...prev, typeMeterId: typeMeter.id }))
            setSelectedTypeMeter(typeMeter)
        } else {
            setFormData((prev) => ({ ...prev, typeMeterId: "" }))
            setSelectedTypeMeter(undefined)
        }
    }

    return (
        <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
            <DialogContent className="max-w-2xl w-full p-0">
                <Card className="shadow-none border-none">
                    <CardHeader className="flex flex-row justify-start">
                        <Button variant="ghost" onClick={onClose} className="w-fit rounded-full mr-2">
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                        <CardTitle className="mt-0 text-lg font-semibold w-fit">
                            {meter && meter.id ? "Editar Medidor" : "Novo Medidor"}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleSubmit}>
                            <Tabs defaultValue="context">
                                <TabsList className={`grid w-full grid-cols-3`}>
                                    <TabsTrigger value="context">Contexto</TabsTrigger>
                                    <TabsTrigger value="basic">Informações Básicas</TabsTrigger>
                                    <TabsTrigger value="additional">Adicional</TabsTrigger>
                                </TabsList>

                                <TabsContent value="context" className="space-y-4 mt-4">
                                    {loadingStates.context && (
                                        <div className="bg-blue-50 border border-blue-200 rounded-md p-3 mb-4">
                                            <p className="text-sm text-blue-600">🔄 Carregando contexto do medidor...</p>
                                        </div>
                                    )}
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="companyId">Empresa <span className="text-red-500">*</span></Label>
                                            <CompaniesCombobox
                                                company={contextFilter.company}
                                                setSelectedCompany={(company) => handleSelectedContext(company, undefined, undefined)}
                                                modal
                                                required
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="complexId">Condomínio <span className="text-red-500">*</span></Label>
                                            <ComplexesCombobox
                                                companyId={contextFilter.company?.id}
                                                complex={contextFilter.complex}
                                                setSelectedComplex={(complex) => handleSelectedContext(contextFilter.company, complex, undefined)}
                                                modal
                                                required
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="blockId">Bloco <span className="text-red-500">*</span></Label>
                                            <BlocksCombobox
                                                complexId={contextFilter.complex?.id}
                                                block={contextFilter.block}
                                                setSelectedBlock={(block) => handleSelectedContext(contextFilter.company, contextFilter.complex, block)}
                                                modal
                                                required
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="apartmentId">Apartamento <span className="text-red-500">*</span></Label>
                                            <ApartmentsCombobox
                                                blockId={contextFilter.block?.id}
                                                apartment={selectedApartment}
                                                setSelectedApartment={handleSelectedApartment}
                                                modal
                                                required
                                                disabled={!contextFilter.block || loadingStates.apartment}
                                            />
                                            {loadingStates.apartment && (
                                                <p className="text-sm text-gray-500">Carregando apartamento...</p>
                                            )}
                                            <Input className="hidden" id="apartmentId" name="apartmentId" value={formData.apartmentId} readOnly />
                                        </div>
                                    </div>
                                </TabsContent>
                                <TabsContent value="basic" className="space-y-4 mt-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        {/* Campos básicos do medidor */}
                                        <div className="space-y-2">
                                            <Label htmlFor="register">
                                                Registro <span className="text-red-500">*</span>
                                            </Label>
                                            <Input
                                                id="register"
                                                name="register"
                                                value={formData.register || ""}
                                                onChange={handleChange}
                                                required
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="groupLinkDeviceId">ID Group Link (opcional)</Label>
                                            <Input
                                                id="groupLinkDeviceId"
                                                name="groupLinkDeviceId"
                                                value={(formData as any).groupLinkDeviceId || ""}
                                                onChange={handleChange}
                                                placeholder="Ex: 3617329729"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="typeMeterId">
                                                Tipo de Medidor <span className="text-red-500">*</span>
                                            </Label>
                                            <TypeMetersCombobox
                                                typeMeter={selectedTypeMeter}
                                                setSelectedTypeMeter={handleSelectedTypeMeter}
                                                disabled={loadingStates.typeMeter}
                                            />
                                            {loadingStates.typeMeter && (
                                                <p className="text-sm text-gray-500">Carregando tipo de medidor...</p>
                                            )}
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 gap-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="iotBrand">Marca IoT</Label>
                                            <Select
                                                value={(formData as any).iotBrand || "GL"}
                                                onValueChange={(value) => handleSelectChange("iotBrand", value)}
                                            >
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Selecione a marca IoT" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="GL">GL</SelectItem>
                                                    <SelectItem value="TIM">TIM</SelectItem>
                                                    <SelectItem value="ARQDATA">ARQDATA</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="initialReading">
                                                Leitura Inicial <span className="text-red-500">*</span>
                                            </Label>
                                            <Input
                                                id="initialReading"
                                                name="initialReading"
                                                type="number"
                                                step="0.00000001"
                                                value={formData.initialReading || 0}
                                                onChange={handleChange}
                                                required
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="location">
                                                Localização
                                            </Label>
                                            <Input
                                                id="location"
                                                name="location"
                                                value={formData.location || ""}
                                                onChange={handleChange}
                                            />
                                        </div>
                                    </div>
                                </TabsContent>

                                <TabsContent value="additional" className="space-y-4 mt-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="status">Status</Label>
                                            <Select
                                                value={formData.status || "Ativo"}
                                                onValueChange={(value) => handleSelectChange("status", value)}
                                            >
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Selecione o status" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="Ativo">Ativo</SelectItem>
                                                    <SelectItem value="Inativo">Inativo</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="rotation">Rotação</Label>
                                            <Select
                                                value={formData.rotation || "Crescente"}
                                                onValueChange={(value) => handleSelectChange("rotation", value)}
                                            >
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Selecione a rotação" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="Crescente">Crescente</SelectItem>
                                                    <SelectItem value="Decrescente">Decrescente</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 gap-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="main">Principal</Label>
                                            <Select
                                                value={formData.main ? "true" : "false"}
                                                onValueChange={(value) => handleSelectChange("main", value === "true")}
                                            >
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Selecione" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="true">Sim</SelectItem>
                                                    <SelectItem value="false">Não</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="yearManufacture">Ano de Fabricação</Label>
                                            <Input
                                                id="yearManufacture"
                                                name="yearManufacture"
                                                type="number"
                                                value={formData.yearManufacture || ""}
                                                onChange={handleChange}
                                            />
                                        </div>
                                    </div>
                                </TabsContent>
                            </Tabs>

                            <DialogFooter className="mt-6">
                                <Button type="button" variant="outline" onClick={onClose}>
                                    Cancelar
                                </Button>
                                <Button 
                                    type="submit" 
                                    disabled={Object.values(loadingStates).some(loading => loading)}
                                >
                                    {Object.values(loadingStates).some(loading => loading) 
                                        ? "Carregando..." 
                                        : (meter && meter.id ? "Atualizar" : "Criar") + " Medidor"
                                    }
                                </Button>
                            </DialogFooter>
                        </form>
                    </CardContent>
                </Card>
            </DialogContent>
        </Dialog>
    )
}
