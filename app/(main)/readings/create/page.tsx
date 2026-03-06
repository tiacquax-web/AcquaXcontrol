"use client";
import React, { useRef, useState } from "react";
import { useCreatePreReading } from "@/hooks/useReadings";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { Form, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Camera, Power, Save, SwitchCamera } from 'lucide-react';
import SelectMeter from '@/components/ComboboxMeter';
import { useApartments } from '@/hooks/useApartments';
import { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { getApartments } from '@/services/apartmentService';

export default function CreatePreReadingPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const [photo, setPhoto] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("environment");
  const [apartmentId, setApartmentId] = useState("");
  const [meterId, setMeterId] = useState("");
  const [registerName, setRegisterName] = useState("");
  const [apartmentInfo, setApartmentInfo] = useState<any>(null);
  const { createPreReading, loading } = useCreatePreReading();
  const { toast } = useToast();
  const form = useForm();

  // Preenche o apartamentoId se vier na URL
  React.useEffect(() => {
    if (searchParams) {
      const aptId = searchParams.get('apartmentId');
      if (aptId) setApartmentId(aptId);
    }
  }, []);

  React.useEffect(() => {
    if (apartmentId) {
      // Busca info do apartamento selecionado
      getApartments({ apartmentId, take: 1 }).then((data) => {
        if (data.list && data.list.length > 0) setApartmentInfo(data.list[0]);
      });
    }
  }, [apartmentId]);

  // In production, apartmentId and meterId viriam de seleção prévia

  async function startCamera() {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode },
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      toast({ title: "Erro ao acessar câmera", description: String(err), variant: "destructive" });
    }
  }

  function stopCamera() {
    stream?.getTracks().forEach((track) => track.stop());
    setStream(null);
  }

  function handleTakePhoto() {
    if (!videoRef.current || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(videoRef.current, 0, 0, 400, 300);
    const dataUrl = canvasRef.current.toDataURL("image/jpeg");
    setPhoto(dataUrl);
    stopCamera();
  }

  function handleRetake() {
    setPhoto(null);
    startCamera();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!apartmentId || !meterId || !photo) {
      toast({ title: "Preencha todos os campos e tire a foto", variant: "destructive" });
      return;
    }
    try {
      await createPreReading({ registerName, apartmentId, meterId, coverBase64: photo, isManualReading: true });
      toast({ title: "Pré-leitura criada com sucesso!" });
      setPhoto(null);
      setApartmentId("");
      setMeterId("");
      setRegisterName("");
    } catch (err: any) {
      toast({ title: "Erro ao criar pré-leitura", description: err.message, variant: "destructive" });
    }
  }

  function handleSwitchCamera() {
    setFacingMode((prev) => (prev === "user" ? "environment" : "user"));
    stopCamera();
    setTimeout(startCamera, 200);
  }

  return (
    <div className="flex justify-center items-center min-h-[80vh]">
      <Card className="w-full max-w-lg">
        <CardHeader>
          {apartmentInfo && (
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>{apartmentInfo.block?.complex?.socialName}</BreadcrumbItem>
                <BreadcrumbSeparator>/</BreadcrumbSeparator>
                <BreadcrumbItem>{apartmentInfo.block?.name}</BreadcrumbItem>
                <BreadcrumbSeparator>/</BreadcrumbSeparator>
                <BreadcrumbItem>{apartmentInfo.name}</BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          )}
          <CardTitle className="text-2xl font-semibold">Cadastro de Pré-Leitura</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <FormItem>
                  <FormLabel htmlFor="meterId">Medidor</FormLabel>
                  <FormControl>
                    <SelectMeter
                      meter={undefined}
                      setSelectedMeter={meter => {setMeterId(meter ? meter.id : ""); setRegisterName(meter ? meter.register : "");}}
                      apartmentId={apartmentId || undefined}
                      required
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
                <FormItem>
                  <FormLabel>Captura de Imagem</FormLabel>
                  <FormControl>
                    <div className="flex flex-col items-center w-full">
                      {!photo ? (
                        <div className="relative flex flex-col items-center mb-6 w-full">
                          <video ref={videoRef} width={400} height={300} autoPlay playsInline className="rounded-2xl border w-full" />
                          <Button type="button" variant="secondary" className="absolute left-4 bottom-4" onClick={handleSwitchCamera}>
                            <SwitchCamera className="w-5 h-5 mr-1" />
                          </Button>
                          <Button type="button" className="absolute right-4 bottom-4" onClick={startCamera}>
                            <Power className="w-5 h-5 mr-1" />
                          </Button>
                          {stream && (
                            <Button type="button" className="absolute left-1/2 -translate-x-1/2 bottom-4" onClick={handleTakePhoto}>
                              <Camera className="w-5 h-5 mr-1" />
                            </Button>
                          )}
                          <canvas ref={canvasRef} width={400} height={300} style={{ display: "none" }} />
                        </div>
                      ) : (
                        <div className="flex flex-col items-center w-full">
                          <img src={photo} alt="Prévia da foto" className="rounded-2xl border w-full mb-2" />
                          <Button type="button" variant="secondary" onClick={handleRetake}>
                            Refazer Foto
                          </Button>
                        </div>
                      )}
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
                <Button type="submit" className="w-full" disabled={loading}>
                  <Save className="w-5 h-5 mr-1" />Salvar Pré-Leitura
                </Button>
              </form>
            </CardContent>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
