"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import CompaniesCombobox from "@/components/ComboboxCompany"
import type { Company, Complex } from "@prisma/client"
import { useUserMutations } from '@/hooks/useUsers';
import { useToast } from '@/hooks/use-toast';
import * as XLSX from 'xlsx';
import { useApartments } from '@/hooks/useApartments';
import { Progress } from '@/components/ui/progress';

interface ComplexModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (complex: Partial<Complex>) => void
  complex: Complex | null
}

export default function ComplexModal({ isOpen, onClose, onSave, complex }: ComplexModalProps) {
  const [formData, setFormData] = useState<Partial<Complex> & {
    userNamePrefix?: string;
    userPasswordPrefix?: string;
    userEmailPrefix?: string;
    userEmailDomain?: string;
  }>({
    socialName: "",
    aliasName: "",
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
    apportionment: "Simples",
    status: "Ativo",
    // Billing fields
    dealershipName: "",
    billingType: "",
    totalConsumptionM3: undefined,
    minimumConsumptionM3: undefined,
    commonAreaAllocation: "IGUAL",
    sewerageType: "NENHUM",
    sewerageRate: undefined,
    adminFeeType: "NENHUM",
    adminFeeValue: undefined,
    billingNotes: "",
    userNamePrefix: "",
    userPasswordPrefix: "",
    userEmailPrefix: "",
    userEmailDomain: "",
  })

  const [createdUsers, setCreatedUsers] = useState<Array<{
    id: string;
    name: string;
    email: string;
    password: string;
  }>>([])
  const [totalApartments, setTotalApartments] = useState<number>(0);
  const [progress, setProgress] = useState<number>(0);
  const [isBulkRunning, setIsBulkRunning] = useState<boolean>(false);

  console.warn(isBulkRunning, "isBulkRunning")

  const { createBulkUsersForComplex, loading: loadingBulk, error: errorBulk } = useUserMutations();
  const { toast } = useToast();
  useEffect(() => {
    if (complex) {
      setFormData({
        ...complex,
        userNamePrefix: "",
        userPasswordPrefix: "",
        userEmailPrefix: "",
        userEmailDomain: "",
      })
    } else {
      setFormData({
        companyId: "",
        socialName: "",
        aliasName: "",
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
        apportionment: "Simples",
        status: "Ativo",
        // Billing defaults
        dealershipName: "",
        billingType: "",
        commonAreaAllocation: "IGUAL",
        sewerageType: "NENHUM",
        adminFeeType: "NENHUM",
        billingNotes: "",
        userNamePrefix: "",
        userPasswordPrefix: "",
        userEmailPrefix: "",
        userEmailDomain: "",
      })
    }
    // Limpar usuários criados quando o modal abrir/fechar ou trocar de condomínio
    setCreatedUsers([]);
  }, [complex, isOpen])

  // Busca total de apartamentos ao abrir o modal usando o hook
  const { totalCount: apartmentsCount } = useApartments({ complexId: complex?.id, take: 1, skip: 0 });

  useEffect(() => {
    setTotalApartments(apartmentsCount || 0);
  }, [apartmentsCount]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value === "" ? undefined : parseFloat(value) }))
  }

  const handleSelectChange = (name: string, value: string) => {
    setFormData((prev) => ({ ...prev, [name]: value }))
  }
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    // Remove os campos específicos para criação em massa antes de enviar
    const { userNamePrefix, userPasswordPrefix, userEmailPrefix, userEmailDomain, ...complexData } = formData
    
    onSave(complexData)
  }

  const handleSelectCompany = (company: Company | undefined) => {
    if (!company) {
      setFormData((prev) => ({ ...prev, companyId: "" }))
    } else {
      setFormData((prev) => ({ ...prev, companyId: company.id }))
    }
  }

  // Função para criar usuários em lotes
  const handleBulkCreateUsers = async () => {
    if (!complex?.id) return;
    setIsBulkRunning(true);
    setCreatedUsers([]);
    setProgress(0);
    
    try {
      const result = await createBulkUsersForComplex({
        complexId: complex.id,
        userNamePrefix: formData.userNamePrefix || '',
        userPasswordPrefix: formData.userPasswordPrefix || '',
        userEmailPrefix: formData.userEmailPrefix || '',
        userEmailDomain: formData.userEmailDomain || ''
      });
      
      if (result?.success && Array.isArray(result.success)) {
        setCreatedUsers(result.success);
        setTotalApartments(result?.totalApartments || totalApartments);
        setProgress(100);
        
        toast({
          title: 'Usuários criados com sucesso!',
          description: `${result.success.length} usuários foram criados para este condomínio.`,
        });
        
        // Mostrar erros se houver
        if (result.errors && result.errors.length > 0) {
          console.warn('Alguns usuários não puderam ser criados:', result.errors);
          toast({
            title: 'Alguns usuários não foram criados',
            description: `${result.errors.length} usuários falharam na criação. Verifique os logs para mais detalhes.`,
            variant: 'destructive',
          });
        }
      } else {
        throw new Error('Resposta inválida do servidor');
      }
    } catch (e: any) {
      toast({
        title: 'Erro ao criar usuários',
        description: e?.message || 'Ocorreu um erro ao criar os usuários.',
        variant: 'destructive',
      });
    } finally {
      setIsBulkRunning(false);
    }
  };

  // Função para baixar os dados dos usuários em planilha Excel
  const handleDownloadUsersExcel = () => {
    if (createdUsers.length === 0) {
      toast({
        title: 'Nenhum usuário para download',
        description: 'Não há usuários criados para baixar.',
        variant: 'destructive',
      });
      return;
    }

    // Preparar os dados para a planilha
    const worksheetData = createdUsers.map((user, index) => ({
      'Nº': index + 1,
      'ID': user.id,
      'Nome': user.name,
      'E-mail': user.email,
      'Senha': user.password,
    }));

    // Criar a planilha
    const worksheet = XLSX.utils.json_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Usuários');

    // Ajustar largura das colunas
    const colWidths = [
      { wch: 5 },  // Nº
      { wch: 30 }, // ID
      { wch: 25 }, // Nome
      { wch: 35 }, // E-mail
      { wch: 15 }, // Senha
    ];
    worksheet['!cols'] = colWidths;

    // Gerar o nome do arquivo com a data atual
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0];
    const complexName = formData.socialName || 'Condominio';
    const fileName = `usuarios_${complexName.replace(/\s+/g, '_')}_${dateStr}.xlsx`;

    // Baixar o arquivo
    XLSX.writeFile(workbook, fileName);
    
    toast({
      title: 'Download concluído!',
      description: `Planilha ${fileName} foi baixada com sucesso.`,
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{complex ? "Editar Condomínio" : "Novo Condomínio"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <Tabs defaultValue="basic">
            <TabsList className="grid w-full grid-cols-6">
              <TabsTrigger value="basic">Informações Básicas</TabsTrigger>
              <TabsTrigger value="address">Endereço</TabsTrigger>
              <TabsTrigger value="additional">Adicional</TabsTrigger>
              <TabsTrigger value="billing">Faturamento</TabsTrigger>
              <TabsTrigger value="management">Gestão</TabsTrigger>
              <TabsTrigger value="users-bulk">Usuários</TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="space-y-4 mt-4">
              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="socialName">
                    Nome Social <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="socialName"
                    name="socialName"
                    value={formData.socialName || ""}
                    onChange={handleChange}
                    required
                  />
                </div>

                {/* <div className="space-y-2">
                  <Label htmlFor="aliasName">Alias Name</Label>
                  <Input id="aliasName" name="aliasName" value={formData.aliasName || ""} onChange={handleChange} />
                </div> */}

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

            <TabsContent value="additional" className="space-y-4 mt-4">
              <div className="grid grid-cols-1 gap-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="status">Status</Label>
                    <Select
                      value={formData.status || "Ativo"}
                      onValueChange={(value) => handleSelectChange("status", value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Ativo">Ativo</SelectItem>
                        <SelectItem value="Inativo">Inativo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="apportionment">Apportionment</Label>
                    <Select
                      value={formData.apportionment || "Simples"}
                      onValueChange={(value) => handleSelectChange("apportionment", value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select apportionment" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Simples">Simples</SelectItem>
                        <SelectItem value="Composto">Composto</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="photo">Photo URL</Label>
                  <Input id="photo" name="photo" value={formData.photo || ""} onChange={handleChange} />
                </div>

                <div className="space-y-2">
                  <Label>Social Media</Label>
                  <div className="grid grid-cols-1 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="facebook">Facebook</Label>
                      <Input id="facebook" name="facebook" value={formData.facebook || ""} onChange={handleChange} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="instagram">Instagram</Label>
                      <Input id="instagram" name="instagram" value={formData.instagram || ""} onChange={handleChange} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="twitter">Twitter</Label>
                      <Input id="twitter" name="twitter" value={formData.twitter || ""} onChange={handleChange} />
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="billing" className="space-y-4 mt-4">
              <div className="bg-blue-50 dark:bg-blue-950 rounded-md p-3 text-sm text-blue-700 dark:text-blue-300 mb-2">
                Configure o modelo de faturamento para geração da planilha mensal (campos amarelos).
              </div>
              <div className="grid grid-cols-1 gap-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="dealershipName">Concessionária</Label>
                    <Input
                      id="dealershipName"
                      name="dealershipName"
                      placeholder="Ex: Águas do Rio, SABESP, IGUÁ"
                      value={(formData as any).dealershipName || ""}
                      onChange={handleChange}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="billingType">Tipo de Faturamento</Label>
                    <Select
                      value={(formData as any).billingType || ""}
                      onValueChange={v => handleSelectChange("billingType", v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o tipo" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MINIMO">Mínimo</SelectItem>
                        <SelectItem value="REAL_CONSUMO">Real Consumo</SelectItem>
                        <SelectItem value="M3_MEDIO">M³ Médio</SelectItem>
                        <SelectItem value="PROGRESSIVIDADE">Progressividade</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="totalConsumptionM3">Consumo Total da Conta (m³)</Label>
                    <Input
                      id="totalConsumptionM3"
                      name="totalConsumptionM3"
                      type="number"
                      step="0.001"
                      placeholder="Ex: 1800"
                      value={(formData as any).totalConsumptionM3 ?? ""}
                      onChange={handleNumberChange}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="minimumConsumptionM3">Mínimo por Unidade (m³)</Label>
                    <Input
                      id="minimumConsumptionM3"
                      name="minimumConsumptionM3"
                      type="number"
                      step="0.001"
                      placeholder="Ex: 10"
                      value={(formData as any).minimumConsumptionM3 ?? ""}
                      onChange={handleNumberChange}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="commonAreaAllocation">Rateio Áreas Comuns</Label>
                    <Select
                      value={(formData as any).commonAreaAllocation || "IGUAL"}
                      onValueChange={v => handleSelectChange("commonAreaAllocation", v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Tipo de rateio" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="IGUAL">Igual para todos</SelectItem>
                        <SelectItem value="FRACAO_IDEAL">Fração Ideal</SelectItem>
                        <SelectItem value="NENHUM">Sem rateio</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="commonAreaConsumptionM3">Consumo Áreas Comuns (m³)</Label>
                    <Input
                      id="commonAreaConsumptionM3"
                      name="commonAreaConsumptionM3"
                      type="number"
                      step="0.001"
                      placeholder="Ex: 200"
                      value={(formData as any).commonAreaConsumptionM3 ?? ""}
                      onChange={handleNumberChange}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="sewerageType">Esgoto</Label>
                    <Select
                      value={(formData as any).sewerageType || "NENHUM"}
                      onValueChange={v => handleSelectChange("sewerageType", v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Tipo de esgoto" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="NENHUM">Sem esgoto</SelectItem>
                        <SelectItem value="PERCENTUAL">Percentual do consumo</SelectItem>
                        <SelectItem value="FIXO">Valor fixo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sewerageRate">
                      {(formData as any).sewerageType === "PERCENTUAL" ? "% do esgoto" : "Valor esgoto (R$)"}
                    </Label>
                    <Input
                      id="sewerageRate"
                      name="sewerageRate"
                      type="number"
                      step="0.01"
                      placeholder={(formData as any).sewerageType === "PERCENTUAL" ? "Ex: 100 (= 100%)" : "Ex: 50.00"}
                      value={(formData as any).sewerageRate ?? ""}
                      onChange={handleNumberChange}
                      disabled={(formData as any).sewerageType === "NENHUM"}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="adminFeeType">Taxa de Administração</Label>
                    <Select
                      value={(formData as any).adminFeeType || "NENHUM"}
                      onValueChange={v => handleSelectChange("adminFeeType", v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Tipo de taxa" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="NENHUM">Sem taxa</SelectItem>
                        <SelectItem value="PERCENTUAL">Percentual</SelectItem>
                        <SelectItem value="FIXO">Valor fixo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="adminFeeValue">
                      {(formData as any).adminFeeType === "PERCENTUAL" ? "% da taxa" : "Valor da taxa (R$)"}
                    </Label>
                    <Input
                      id="adminFeeValue"
                      name="adminFeeValue"
                      type="number"
                      step="0.01"
                      placeholder={(formData as any).adminFeeType === "PERCENTUAL" ? "Ex: 5 (= 5%)" : "Ex: 100.00"}
                      value={(formData as any).adminFeeValue ?? ""}
                      onChange={handleNumberChange}
                      disabled={(formData as any).adminFeeType === "NENHUM"}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="billingNotes">Observações do Faturamento</Label>
                  <Input
                    id="billingNotes"
                    name="billingNotes"
                    placeholder="Notas sobre o modelo de faturamento deste condomínio"
                    value={(formData as any).billingNotes || ""}
                    onChange={handleChange}
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="management" className="space-y-4 mt-4">
              <div className="grid grid-cols-1 gap-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="companyId">Administradora</Label>
                    <CompaniesCombobox setSelectedCompany={handleSelectCompany} name="companyId" modal required />
                  </div>
                </div>
              </div>
            </TabsContent>            <TabsContent value="users-bulk" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>Prefixo Nome</Label>
                <Input name="userNamePrefix" value={formData.userNamePrefix || ''} onChange={handleChange} />
                <Label>Prefixo Senha</Label>
                <Input name="userPasswordPrefix" value={formData.userPasswordPrefix || ''} onChange={handleChange} />
                <Label>Prefixo Email</Label>
                <Input name="userEmailPrefix" value={formData.userEmailPrefix || ''} onChange={handleChange} />
                <Label>Domínio Email</Label>
                <Input name="userEmailDomain" value={formData.userEmailDomain || ''} onChange={handleChange} />
              </div>
              <div className="space-y-2">
                <Button type="button" onClick={handleBulkCreateUsers} disabled={isBulkRunning || !complex?.id || totalApartments === 0}>
                  {isBulkRunning ? 'Criando usuários...' : 'Criar usuários para todos os apartamentos'}
                </Button>
                <Progress value={progress} max={100} className="w-full" />
                <div className="text-sm text-muted-foreground">{createdUsers.length} de {totalApartments} usuários criados</div>
                <Button type="button" onClick={handleDownloadUsersExcel} disabled={createdUsers.length !== totalApartments || totalApartments === 0}>
                  Baixar planilha de usuários
                </Button>
              </div>
              {errorBulk && <div className="text-red-500 text-sm mt-2">{errorBulk}</div>}
            </TabsContent>

          </Tabs>

          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit">{complex ? "Atualizar" : "Criar"} Condomínio</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

