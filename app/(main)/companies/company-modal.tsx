"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { Company } from "@prisma/client"

interface CompanyModalProps {
    isOpen: boolean
    onClose: () => void
    onSave: (company: Partial<Company>) => void
    company: Company | null
}

export default function CompanyModal({ isOpen, onClose, onSave, company }: CompanyModalProps) {
    const [formData, setFormData] = useState<Partial<Company>>({
        name: "",
        socialName: "",
        documentCompany: "",
        documentCompanySecondary: "",
        email: "",
        telephone: "",
        cell: "",
        zipcode: "",
        street: "",
        number: "",
        complement: "",
        neighborhood: "",
        state: "",
        city: "",
        photo: "",
        facebook: "",
        instagram: "",
        twitter: "",
    })

    useEffect(() => {
        if (company) {
            setFormData({
                ...company,
            })
        } else {
            setFormData({
                name: "",
                socialName: "",
                documentCompany: "",
                documentCompanySecondary: "",
                email: "",
                telephone: "",
                cell: "",
                zipcode: "",
                street: "",
                number: "",
                complement: "",
                neighborhood: "",
                state: "",
                city: "",
                photo: "",
                facebook: "",
                instagram: "",
                twitter: "",
            })
        }
    }, [company, isOpen])

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target
        setFormData((prev) => ({ ...prev, [name]: value }))
    }

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        onSave(formData)
    }

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{company ? "Editar Empresa" : "Nova Empresa"}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit}>
                    <Tabs defaultValue="basic">
                        <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="basic">Informações Básicas</TabsTrigger>
                            <TabsTrigger value="address">Endereço</TabsTrigger>
                        </TabsList>

                        <TabsContent value="basic" className="space-y-4 mt-4">
                            <div className="grid grid-cols-1 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="socialName">Nome Social  <span className="text-red-500">*</span></Label>
                                    <Input
                                        id="socialName"
                                        name="socialName"
                                        value={formData.socialName || ""}
                                        onChange={handleChange}
                                        required
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="name">
                                        Nome
                                    </Label>
                                    <Input
                                        id="name"
                                        name="name"
                                        value={formData.name || ""}
                                        onChange={handleChange}
                                    />
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="documentCompany">CNPJ</Label>
                                        <Input
                                            id="documentCompany"
                                            name="documentCompany"
                                            value={formData.documentCompany || ""}
                                            onChange={handleChange}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="documentCompanySecondary">Documento Secundário</Label>
                                        <Input
                                            id="documentCompanySecondary"
                                            name="documentCompanySecondary"
                                            value={formData.documentCompanySecondary || ""}
                                            onChange={handleChange}
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="email">E-mail</Label>
                                    <Input id="email" name="email" type="email" value={formData.email || ""} onChange={handleChange} />
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="telephone">Telefone</Label>
                                        <Input id="telephone" name="telephone" value={formData.telephone || ""} onChange={handleChange} />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="cell">Celular</Label>
                                        <Input id="cell" name="cell" value={formData.cell || ""} onChange={handleChange} />
                                    </div>
                                </div>
                            </div>
                        </TabsContent>

                        <TabsContent value="address" className="space-y-4 mt-4">
                            <div className="grid grid-cols-1 gap-4">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="zipcode">CEP</Label>
                                        <Input id="zipcode" name="zipcode" value={formData.zipcode || ""} onChange={handleChange} />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="street">Rua</Label>
                                    <Input id="street" name="street" value={formData.street || ""} onChange={handleChange} />
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="number">Número</Label>
                                        <Input id="number" name="number" value={formData.number || ""} onChange={handleChange} />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="complement">Complemento</Label>
                                        <Input
                                            id="complement"
                                            name="complement"
                                            value={formData.complement || ""}
                                            onChange={handleChange}
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="neighborhood">Bairro</Label>
                                    <Input
                                        id="neighborhood"
                                        name="neighborhood"
                                        value={formData.neighborhood || ""}
                                        onChange={handleChange}
                                    />
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="city">Cidade</Label>
                                        <Input id="city" name="city" value={formData.city || ""} onChange={handleChange} />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="state">Estado</Label>
                                        <Input id="state" name="state" value={formData.state || ""} onChange={handleChange} />
                                    </div>
                                </div>
                            </div>
                        </TabsContent>
                    </Tabs>

                    <DialogFooter className="mt-6">
                        <Button type="button" variant="outline" onClick={onClose}>
                            Cancelar
                        </Button>
                        <Button type="submit">{company ? "Atualizar" : "Criar"} Empresa</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
