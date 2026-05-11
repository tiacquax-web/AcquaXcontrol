"use client";
import React, { useState, useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft } from "lucide-react";
import MeterDeviceLinksManager from "@/components/MeterDeviceLinksManager";
import DeviceUnlinkedReadings from "@/components/DeviceUnlinkedReadings";

type DeviceUnlinkedReadingsRef = {
    refresh: () => void;
};

type DeviceIotModalProps = {
    isOpen: boolean;
    onClose: () => void;
    onSave: (formData: any) => void;
    device?: any;
    defaultTab?: string;
};

export default function DeviceIotModal({ isOpen, onClose, onSave, device, defaultTab = "basic" }: DeviceIotModalProps) {
    const [formData, setFormData] = useState({
        deviceId: "",
        name: "",
        remoteId: "",
        devicePulseFactor: undefined as number | undefined,
        pilotMode: false,
        ...device,
    });

    // Referência para o componente de leituras desvinculadas
    const unlinkedReadingsRef = React.useRef<DeviceUnlinkedReadingsRef>(null);

    // Função para atualizar leituras desvinculadas após reprocessamento
    const handleReadingsUpdated = () => {
        if (unlinkedReadingsRef.current && unlinkedReadingsRef.current.refresh) {
            unlinkedReadingsRef.current.refresh();
        }
    };

    useEffect(() => {
        if (device) {
            setFormData({ ...device });
        } else {
            setFormData({ 
                deviceId: "", 
                name: "", 
                remoteId: "", 
                devicePulseFactor: undefined 
                ,pilotMode: false
            });
        }
    }, [device, isOpen]);
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData((prev: typeof formData) => ({ ...prev, [name]: value }));
    };
    const handleSelectChange = (name: string, value: any) => {
        setFormData((prev: typeof formData) => ({ ...prev, [name]: value }));
    };
    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        onSave(formData);
    };
    return (
        <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
            <DialogContent className="max-w-2xl w-full p-0">
                <Card className="shadow-none border-none">
                    <CardHeader className="flex flex-row justify-start">
                        <Button variant="ghost" onClick={onClose} className="w-fit rounded-full mr-2">
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                        <CardTitle className="mt-0 text-lg font-semibold w-fit">
                            {device && device.id ? "Editar Dispositivo" : "Novo Dispositivo"}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Tabs defaultValue={device?.id ? defaultTab : "basic"} className="w-full">
                            <TabsList className="grid w-full grid-cols-3">
                                <TabsTrigger value="basic">Informações Básicas</TabsTrigger>
                                <TabsTrigger value="links" disabled={!device?.id}>
                                    Vínculos com Medidores
                                </TabsTrigger>
                                <TabsTrigger value="unlinked-readings" disabled={!device?.id}>
                                    Leituras Desvinculadas
                                </TabsTrigger>
                            </TabsList>
                            
                            <TabsContent value="basic" className="mt-4">
                                <form onSubmit={handleSubmit} className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="deviceId">
                                                ID do Device <span className="text-red-500">*</span>
                                            </Label>
                                            <Input 
                                                id="deviceId" 
                                                name="deviceId" 
                                                value={formData.deviceId || ""} 
                                                onChange={handleChange} 
                                                required 
                                                placeholder="Ex: DEV001"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="name">Nome do Dispositivo</Label>
                                            <Input 
                                                id="name" 
                                                name="name" 
                                                value={formData.name || ""} 
                                                onChange={handleChange}
                                                placeholder="Nome amigável para o dispositivo"
                                            />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="remoteId">ID Remoto</Label>
                                            <Input 
                                                id="remoteId" 
                                                name="remoteId" 
                                                value={formData.remoteId || ""} 
                                                onChange={handleChange}
                                                placeholder="ID usado pelo sistema externo"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="devicePulseFactor">Fator de Pulso</Label>
                                            <Input 
                                                id="devicePulseFactor" 
                                                name="devicePulseFactor" 
                                                type="number"
                                                step="0.001"
                                                value={formData.devicePulseFactor || ""} 
                                                onChange={handleChange}
                                                placeholder="Ex: 1.0"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="pilotMode">Modo Piloto</Label>
                                            <Select
                                                value={formData.pilotMode ? "true" : "false"}
                                                onValueChange={(value) => handleSelectChange("pilotMode", value === "true")}
                                            >
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Selecione" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="false">Não</SelectItem>
                                                    <SelectItem value="true">Sim</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                    <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                                        <p className="text-sm text-blue-800 dark:text-blue-200">
                                            <strong>💡 Dica:</strong> Para vincular este dispositivo a medidores específicos, 
                                            use a aba "Vínculos com Medidores" após salvar o dispositivo.
                                        </p>
                                    </div>
                                    <DialogFooter className="mt-6">
                                        <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
                                        <Button type="submit">{device && device.id ? "Atualizar" : "Criar"} Dispositivo</Button>
                                    </DialogFooter>
                                </form>
                            </TabsContent>
                            
                            <TabsContent value="links" className="mt-4">
                                {device?.id && (
                                    <MeterDeviceLinksManager 
                                        deviceId={device.deviceId} 
                                        deviceName={device.name}
                                        onReadingsUpdated={handleReadingsUpdated}
                                    />
                                )}
                            </TabsContent>
                            
                            <TabsContent value="unlinked-readings" className="mt-4">
                                {device?.id && (
                                    <DeviceUnlinkedReadings 
                                        ref={unlinkedReadingsRef}
                                        deviceId={device.deviceId} 
                                        deviceName={device.name}
                                    />
                                )}
                            </TabsContent>
                        </Tabs>
                    </CardContent>
                </Card>
            </DialogContent>
        </Dialog>
    );
}
