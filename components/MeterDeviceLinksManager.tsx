"use client";
import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Calendar, Link as LinkIcon, RotateCcw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import MetersCombobox from "@/components/ComboboxMeter";
import CompaniesCombobox from "@/components/ComboboxCompany";
import ComplexesCombobox from "@/components/ComboboxComplex";
import BlocksCombobox from "@/components/ComboboxBlock";
import ApartmentsCombobox from "@/components/ComboboxApartment";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Company, Complex, Block, Apartment } from "@prisma/client";

interface MeterDeviceLink {
  id: string;
  meterId: string;
  deviceId: string;
  startDate: string;
  endDate?: string;
  meter: {
    id: string;
    register: string;
    apartment: {
      id: string;
      name: string;
      block: {
        id: string;
        name: string;
        complex: {
          id: string;
          socialName: string;
        };
      };
    };
  };
  createdByUser?: {
    id: string;
    name: string;
  };
}

interface MeterDeviceLinksManagerProps {
  deviceId: string;
  deviceName?: string;
  onReadingsUpdated?: () => void;
}

export default function MeterDeviceLinksManager({ deviceId, deviceName, onReadingsUpdated }: MeterDeviceLinksManagerProps) {
  const { toast } = useToast();
  
  const [links, setLinks] = useState<MeterDeviceLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [reprocessing, setReprocessing] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [editingLink, setEditingLink] = useState<MeterDeviceLink | null>(null);
  const [visibleCount, setVisibleCount] = useState(3);
  const [totalCount, setTotalCount] = useState(0);
  
  const [formData, setFormData] = useState({
    meterId: "",
    startDate: "",
    endDate: ""
  });
  
  const [selectedMeter, setSelectedMeter] = useState<any>(undefined);
  
  // Estados para seleção em cascata
  const [contextFilter, setContextFilter] = useState<{
    company: Company | undefined;
    complex: Complex | undefined;
    block: Block | undefined;
    apartment: Apartment | undefined;
  }>({
    company: undefined,
    complex: undefined,
    block: undefined,
    apartment: undefined,
  });

  useEffect(() => {
    if (deviceId) {
      loadLinks();
    }
  }, [deviceId]);

  const loadLinks = async (take?: number) => {
    try {
      setLoading(true);
      const takeParam = take || Math.max(visibleCount, 3);
      const response = await fetch(`/api/user/devices/${deviceId}/meter-links?take=${takeParam}&skip=0`);
      
      if (!response.ok) {
        const errorData = await response.json();
        
        if (response.status === 403 && errorData.error === 'Acesso negado') {
          toast({
            variant: "destructive",
            title: "Acesso negado aos vínculos",
            description: errorData.message || "Você não tem permissão para visualizar os vínculos deste dispositivo."
          });
          setLinks([]);
          setTotalCount(0);
          return;
        }
        
        throw new Error(errorData.message || 'Erro ao carregar links');
      }
      
      const data = await response.json();
      setLinks(data.links);
      setTotalCount(data.totalCount);
    } catch (error) {
      console.error('Erro ao carregar links:', error);
      toast({
        variant: "destructive",
        title: "Erro ao carregar vínculos",
        description: error instanceof Error ? error.message : "Erro desconhecido"
      });
    } finally {
      setLoading(false);
    }
  };

  const loadMoreLinks = () => {
    const newCount = visibleCount + 10;
    setVisibleCount(newCount);
    loadLinks(newCount);
  };

  const handleOpenDialog = async (link?: MeterDeviceLink) => {
    if (link) {
      setEditingLink(link);
      setSelectedMeter(link.meter);
      setFormData({
        meterId: link.meterId,
        startDate: format(new Date(link.startDate), 'yyyy-MM-dd'),
        endDate: link.endDate ? format(new Date(link.endDate), 'yyyy-MM-dd') : ""
      });
      
      // Preenchendo o contexto quando editando um link existente
      try {
        // Buscar entidades completas baseadas nos IDs do link
        const apartmentId = link.meter.apartment.id;
        const blockId = link.meter.apartment.block.id;
        const complexId = link.meter.apartment.block.complex.id;
        
        // Buscar as entidades completas via API
        const [companiesResponse, complexesResponse, blocksResponse, apartmentsResponse] = await Promise.all([
          fetch(`/api/user/companies?complex_id=${complexId}`),
          fetch(`/api/user/complexes?complex_id=${complexId}`),
          fetch(`/api/user/blocks?block_id=${blockId}`),
          fetch(`/api/user/apartments?apartment_id=${apartmentId}`)
        ]);
        
        const [companiesData, complexesData, blocksData, apartmentsData] = await Promise.all([
          companiesResponse.json(),
          complexesResponse.json(),
          blocksResponse.json(),
          apartmentsResponse.json()
        ]);
        
        const company = companiesData.list?.[0];
        const complex = complexesData.list?.[0];
        const block = blocksData.list?.[0];
        const apartment = apartmentsData.list?.[0];
        
        if (company && complex && block && apartment) {
          setContextFilter({
            company,
            complex,
            block,
            apartment,
          });
        }
      } catch (error) {
        console.error('Erro ao carregar contexto:', error);
        // Em caso de erro, apenas resetar o contexto
        setContextFilter({
          company: undefined,
          complex: undefined,
          block: undefined,
          apartment: undefined,
        });
      }
    } else {
      setEditingLink(null);
      setSelectedMeter(undefined);
      setFormData({
        meterId: "",
        startDate: "",
        endDate: ""
      });
      // Reset context filter para novo link
      setContextFilter({
        company: undefined,
        complex: undefined,
        block: undefined,
        apartment: undefined,
      });
    }
    setShowDialog(true);
  };

  const handleCloseDialog = () => {
    setShowDialog(false);
    setEditingLink(null);
    setSelectedMeter(undefined);
    setFormData({ meterId: "", startDate: "", endDate: "" });
    // Reset context filter
    setContextFilter({
      company: undefined,
      complex: undefined,
      block: undefined,
      apartment: undefined,
    });
  };

  // Funções para manipular o contexto
  const handleSelectedContext = (
    company: Company | undefined, 
    complex: Complex | undefined, 
    block: Block | undefined, 
    apartment: Apartment | undefined
  ) => {
    setContextFilter({ company, complex, block, apartment });
    // Reset meter selection when context changes
    setSelectedMeter(undefined);
    setFormData(prev => ({ ...prev, meterId: "" }));
  };

  const handleSelectedMeter = (meter: any) => {
    setSelectedMeter(meter);
    setFormData(prev => ({ ...prev, meterId: meter?.id || "" }));
  };

  const validateForm = (): string | null => {
    if (!contextFilter.complex) {
      return "Condomínio é obrigatório";
    }
    if (!contextFilter.block) {
      return "Bloco é obrigatório";
    }
    if (!contextFilter.apartment) {
      return "Apartamento é obrigatório";
    }
    if (!formData.meterId) {
      return "Medidor é obrigatório";
    }
    if (!formData.startDate) {
      return "Data de início é obrigatória";
    }
    
    const startDate = new Date(formData.startDate);
    const endDate = formData.endDate ? new Date(formData.endDate) : null;
    
    if (endDate && endDate <= startDate) {
      return "Data final deve ser posterior à data inicial";
    }

    // Verificar conflitos com outros períodos
    const conflictingLink = links.find(link => {
      if (editingLink && link.id === editingLink.id) return false;
      
      const linkStart = new Date(link.startDate);
      const linkEnd = link.endDate ? new Date(link.endDate) : null;
      
      // Verificar sobreposição de períodos
      const startOverlap = linkEnd === null || startDate <= linkEnd;
      const endOverlap = endDate === null || endDate >= linkStart;
      
      return startOverlap && endOverlap;
    });

    if (conflictingLink) {
      return "O período especificado conflita com outro vínculo existente";
    }

    return null;
  };

  const handleSubmit = async () => {
    const validationError = validateForm();
    if (validationError) {
      toast({
        variant: "destructive",
        title: "Erro de validação",
        description: validationError
      });
      return;
    }

    try {
      const url = editingLink 
        ? `/api/user/devices/meter-links/${editingLink.id}`
        : `/api/user/devices/meter-links`;
      
      const method = editingLink ? 'PUT' : 'POST';
      
      const body = {
        meterId: formData.meterId,
        deviceId: deviceId,
        startDate: formData.startDate,
        endDate: formData.endDate || null
      };

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erro ao salvar vínculo');
      }

      toast({
        title: editingLink ? "Vínculo atualizado" : "Vínculo criado",
        description: editingLink ? "Vínculo atualizado com sucesso" : "Novo vínculo criado com sucesso"
      });

      handleCloseDialog();
      loadLinks();
    } catch (error) {
      console.error('Erro ao salvar vínculo:', error);
      toast({
        variant: "destructive",
        title: "Erro ao salvar",
        description: error instanceof Error ? error.message : "Erro desconhecido"
      });
    }
  };

  const handleDelete = async (linkId: string) => {
    try {
      const response = await fetch(`/api/user/devices/meter-links/${linkId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erro ao excluir vínculo');
      }

      toast({
        title: "Vínculo removido",
        description: "Vínculo removido com sucesso"
      });

      loadLinks();
    } catch (error) {
      console.error('Erro ao excluir vínculo:', error);
      toast({
        variant: "destructive",
        title: "Erro ao excluir",
        description: error instanceof Error ? error.message : "Erro desconhecido"
      });
    }
  };

  const handleReprocessReadings = async () => {
    if (!deviceId) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "ID do dispositivo não encontrado"
      });
      return;
    }

    setReprocessing(true);

    try {
      const linkIds = links.map((link) => link.id);
      const response = await fetch('/api/user/devices/reprocess-links', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ linkIds }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || data.details || 'Erro ao reprocessar vínculos');
      }

      toast({
        title: "Reprocessamento concluído",
        description: data.message || "Leituras reprocessadas com sucesso."
      });
      onReadingsUpdated?.();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erro no reprocessamento",
        description: error instanceof Error ? error.message : "Erro desconhecido"
      });
    } finally {
      setReprocessing(false);
    }
  };

  const isLinkActive = (link: MeterDeviceLink): boolean => {
    const now = new Date();
    const startDate = new Date(link.startDate);
    const endDate = link.endDate ? new Date(link.endDate) : null;
    
    return now >= startDate && (endDate === null || now <= endDate);
  };

  const formatDateRange = (startDate: string, endDate?: string): string => {
    const start = format(new Date(startDate), 'dd/MM/yyyy', { locale: ptBR });
    if (!endDate) {
      return `${start} → Vigente`;
    }
    const end = format(new Date(endDate), 'dd/MM/yyyy', { locale: ptBR });
    return `${start} → ${end}`;
  };

  // Separar links ativos e inativos, mostrar os 3 mais recentes + ativos
  const activeLinks = links.filter(isLinkActive);
  const inactiveLinks = links.filter(link => !isLinkActive(link));
  const recentLinks = [...inactiveLinks].slice(0, 3);
  const displayLinks = [...activeLinks, ...recentLinks];
  const uniqueDisplayLinks = displayLinks.filter((link, index, arr) => 
    arr.findIndex(l => l.id === link.id) === index
  );

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <div className="flex items-center gap-2">
          <LinkIcon className="h-5 w-5" />
          <CardTitle className="text-lg">Vínculos com Medidores</CardTitle>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleReprocessReadings}
            disabled={reprocessing || links.length === 0}
            className="flex items-center gap-2"
          >
            <RotateCcw className={`h-4 w-4 ${reprocessing ? 'animate-spin' : ''}`} />
            {reprocessing ? 'Reprocessando...' : 'Reprocessar Leituras'}
          </Button>
          <Button
            size="sm"
            onClick={() => handleOpenDialog()}
            className="flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Novo Vínculo
          </Button>
        </div>
      </CardHeader>
      
      <CardContent>
        {loading ? (
          <div className="text-center py-4">Carregando vínculos...</div>
        ) : uniqueDisplayLinks.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <LinkIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium">Nenhum vínculo encontrado</p>
            <p className="text-sm">Este dispositivo ainda não foi vinculado a nenhum medidor</p>
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Medidor</TableHead>
                  <TableHead>Localização</TableHead>
                  <TableHead>Período</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {uniqueDisplayLinks.map((link) => (
                  <TableRow key={link.id}>
                    <TableCell>
                      <Badge 
                        variant={isLinkActive(link) ? "default" : "secondary"}
                        className="flex items-center gap-1 w-fit"
                      >
                        <Calendar className="h-3 w-3" />
                        {isLinkActive(link) ? "Ativo" : "Inativo"}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">
                      {link.meter.register}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <div className="font-medium">{link.meter.apartment.name}</div>
                        <div className="text-muted-foreground">
                          {link.meter.apartment.block.name} • {link.meter.apartment.block.complex.socialName}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {formatDateRange(link.startDate, link.endDate)}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleOpenDialog(link)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm" variant="destructive">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
                              <AlertDialogDescription>
                                Tem certeza que deseja remover este vínculo? Esta ação não pode ser desfeita.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDelete(link.id)}>
                                Confirmar
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            
            {totalCount > uniqueDisplayLinks.length && (
              <div className="flex justify-center mt-4">
                <Button
                  variant="outline"
                  onClick={loadMoreLinks}
                  disabled={loading}
                >
                  Ver mais 10 vínculos
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>

      {/* Dialog para criar/editar vínculo */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {editingLink ? "Editar Vínculo" : "Novo Vínculo"}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="deviceInfo">Dispositivo</Label>
              <Input 
                id="deviceInfo"
                value={`${deviceName || deviceId} (${deviceId})`}
                readOnly
                className="bg-muted"
              />
            </div>
            
            {/* Seleção de Contexto */}
            <div className="space-y-4">
              <Label className="text-base font-medium">Localização do Medidor</Label>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="companyId">Empresa <span className="text-red-500">*</span></Label>
                  <CompaniesCombobox
                    company={contextFilter.company}
                    setSelectedCompany={(company) => 
                      handleSelectedContext(company, undefined, undefined, undefined)
                    }
                    modal
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="complexId">Condomínio <span className="text-red-500">*</span></Label>
                  <ComplexesCombobox
                    companyId={contextFilter.company?.id}
                    complex={contextFilter.complex}
                    setSelectedComplex={(complex) => 
                      handleSelectedContext(contextFilter.company, complex, undefined, undefined)
                    }
                    modal
                    required
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="blockId">Bloco <span className="text-red-500">*</span></Label>
                  <BlocksCombobox
                    complexId={contextFilter.complex?.id}
                    block={contextFilter.block}
                    setSelectedBlock={(block) => 
                      handleSelectedContext(contextFilter.company, contextFilter.complex, block, undefined)
                    }
                    modal
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="apartmentId">Apartamento <span className="text-red-500">*</span></Label>
                  <ApartmentsCombobox
                    blockId={contextFilter.block?.id}
                    apartment={contextFilter.apartment}
                    setSelectedApartment={(apartment) => 
                      handleSelectedContext(contextFilter.company, contextFilter.complex, contextFilter.block, apartment)
                    }
                    modal
                    required
                    disabled={!contextFilter.block}
                  />
                </div>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="meterId">
                Medidor <span className="text-red-500">*</span>
              </Label>
              {!contextFilter.apartment ? (
                <div className="min-h-[40px] w-full px-3 py-2 border border-input bg-muted rounded-md flex items-center text-sm text-muted-foreground">
                  Selecione um apartamento para escolher o medidor
                </div>
              ) : (
                <MetersCombobox
                  apartmentId={contextFilter.apartment.id}
                  meter={selectedMeter}
                  setSelectedMeter={handleSelectedMeter}
                  modal
                  required
                  disabled={false}
                />
              )}
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="startDate">
                  Data de Início <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="startDate"
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => 
                    setFormData(prev => ({ ...prev, startDate: e.target.value }))
                  }
                  required
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="endDate">Data Final</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={formData.endDate}
                  onChange={(e) => 
                    setFormData(prev => ({ ...prev, endDate: e.target.value }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Deixe em branco para vínculo permanente
                </p>
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDialog}>
              Cancelar
            </Button>
            <Button 
              onClick={handleSubmit}
              disabled={
                !contextFilter.complex || 
                !contextFilter.block || 
                !contextFilter.apartment || 
                !formData.meterId || 
                !formData.startDate
              }
            >
              {editingLink ? "Atualizar" : "Criar"} Vínculo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
