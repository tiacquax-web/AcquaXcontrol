'use client'


import EnhancedCarousel from "@/components/services-carousel";
import { DatePickerComponent } from "@/components/date-picker";
import { AirVent, Briefcase, Building, Gavel, Hammer, Layers, Paintbrush, Shield, ShieldCheck, Wind, Wrench, Plus } from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { MeterWithType } from "@/types/meter";
import { ChartConfig } from "@/components/ui/chart";
import { DateRange } from "react-day-picker"
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { clearCachedPermissions } from '@/lib/permissions-cache';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import ReadingsGraph from '@/components/ReadingsGraph';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import SelectComplex from "@/components/ComboboxComplex";
import SelectBlock from "@/components/ComboboxBlock";
import SelectApartment from "@/components/ComboboxApartment";
import SelectMeter from "@/components/ComboboxMeter";
import { useUpdateUserPreferences } from '@/hooks/useUserPreferences';
import { Skeleton } from "@/components/ui/skeleton";

const itemsList = [
  {
    footer: "Garantidora",
    content: <Shield className="mt-5" />,
  },
  // {
  //   footer: "Sindico profissional",
  //   content: <Briefcase className="mt-5" />,
  // },
  // {
  //   footer: "Administradora",
  //   content: <Building className="mt-5" />,
  // },
  {
    footer: "Pintura",
    content: <Paintbrush className="mt-5" />,
  },
  {
    footer: "Advogado",
    content: <Gavel className="mt-5" />,
  },
  {
    footer: "Seguros",
    content: <ShieldCheck className="mt-5" />,
  },
  {
    footer: "Gesso e Drywall",
    content: <Layers className="mt-5" />,
  },
  {
    footer: "Construção Civil",
    content: <Hammer className="mt-5" />,
  },
  {
    footer: <p className="text-center text-sm">Manutenção de Ar&nbsp;Condicionado</p>,
    content: <><Wrench className="mt-5 " /></>,
  },
];

const bannersList = [
  {
    footer: <p className="text-center pt-2 w-full">Veja o que está acontecendo em Vila Velha neste momento</p>,
    content: (
      <Link href="/blog/post-1" className="relative block w-full h-full">
        <Image
          src="/news/vila-velha-4k-2.jpeg"
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          className="object-cover object-center transition-transform hover:scale-105"
          fill
          priority
          alt="Banner 1"
          quality={100}
          unoptimized
        />
      </Link>
    ),
  },
  // {
  //   footer: <p className="text-center pt-2 w-full">Imagine um lugar onde você pode viver com tranquilidade</p>,
  //   content: (
  //     <Link href="/blog/post-1" className="relative block w-full h-full">
  //       <Image
  //         src="/news/banner2.jpg"
  //         sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
  //         className="object-cover transition-transform hover:scale-105"
  //         fill
  //         quality={85}
  //         alt="Banner 2"
  //       />
  //     </Link>
  //   ),
  // },
  // {
  //   footer: <p className="text-center pt-2 w-full">O que é melhor do que morar em um lugar tranquilo?</p>,
  //   content: (
  //     <Link href="/blog/post-1" className="relative block w-full h-full">
  //       <Image
  //         src="/news/banner3.jpg"
  //         sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
  //         className="object-cover transition-transform hover:scale-105"
  //         fill
  //         quality={85}
  //         alt="Banner 3"
  //       />
  //     </Link>
  //   ),
  // },
  {
    footer: (
      <p className="text-center pt-2 w-full">Corpo de Bombeiros lança nota técnica sobre segurança em edificações</p>
    ),
    content: (
      <Link href="/blog/post-1" className="relative block w-full h-full">
        <Image
          src="/news/banner4.jpg"
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          className="object-cover object-center transition-transform hover:scale-105"
          fill
          quality={100}
          alt="Banner 4"
        />
      </Link>
    ),
  },
  {
    footer: <p className="text-center pt-2 w-full">Conheça as novas regras para a instalação de gás em condomínios</p>,
    content: (
      <Link href="/blog/post-1" className="relative block w-full h-full">
        <Image
          src="/news/banner5.jpg"
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          className="object-cover transition-transform hover:scale-105"
          fill
          quality={85}
          alt="Banner 5"
        />
      </Link>
    ),
  },
  {
    footer: <p className="text-center pt-2 w-full">Aprenda a economizar água e energia em seu condomínio</p>,
    content: (
      <Link href="/blog/post-1" className="relative block w-full h-full">
        <Image
          src="/news/banner6.jpg"
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          className="object-cover transition-transform hover:scale-105"
          fill
          quality={85}
          alt="Banner 6"
        />
      </Link>
    ),
  },
  {
    footer: <p className="text-center pt-2 w-full">Saiba como manter a segurança em seu condomínio</p>,
    content: (
      <Link href="/blog/post-1" className="relative block w-full h-full">
        <Image
          src="/news/banner7.jpg"
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          className="object-cover transition-transform hover:scale-105"
          fill
          quality={85}
          alt="Banner 7"
        />
      </Link>
    ),
  },
]


// TO-DO: remove line below in production
const defaultFromDate = new Date(new Date().setDate(new Date().getDate() - 30)) // 30 dias atrás
// TO-DO: uncomment line below in production  
// const defaultFromDate = new Date(new Date().setDate(new Date().getDate() - 30))
const currentDay = new Date()

export default function Dashboard() {
  const [dateRange, setDateRange] = useState<DateRange | undefined>({from: defaultFromDate, to: currentDay})
  const router = useRouter();
  const { preferences, loading: loadingPreferences, refetch: refetchPreferences } = useUserPreferences();
  const preferredMeters = preferences?.meters || [];
  // Não busca mais os objetos dos medidores, apenas renderiza pelo id
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [selectedComplex, setSelectedComplex] = useState<any>(undefined);
  const [selectedBlock, setSelectedBlock] = useState<any>(undefined);
  const [selectedApartment, setSelectedApartment] = useState<any>(undefined);
  const [selectedMeter, setSelectedMeter] = useState<any>(undefined);
  const { updatePreferences, loading: updatingPref } = useUpdateUserPreferences();
  const [error, setError] = useState<string | null>(null);
  console.warn(preferences)

  // Limpa cache de permissões ao entrar na dashboard para forçar atualização
  useEffect(() => {
    clearCachedPermissions();
  }, []);

  // Reset selects when dialog closes
  useEffect(() => {
    if (!addDialogOpen) {
      setSelectedComplex(undefined);
      setSelectedBlock(undefined);
      setSelectedApartment(undefined);
      setSelectedMeter(undefined);
      setError(null);
    }
  }, [addDialogOpen]);
  const handleSavePreference = async () => {
    if (!selectedMeter?.id) {
      setError('Selecione um medidor.');
      return;
    }
    try {
      const newMeters = Array.from(new Set([...(preferences?.meters || []), selectedMeter.id]));
      await updatePreferences(newMeters);
      await refetchPreferences(); // Garante que preferences seja atualizado
      setAddDialogOpen(false);
    } catch (e: any) {
      setError(e.message || 'Erro ao salvar preferência.');
    }
  };

  const handleRemovePreference = async (meterIdToRemove: string) => {
    try {
      const newMeters = (preferences?.meters || []).filter(id => id !== meterIdToRemove);
      await updatePreferences(newMeters);
      await refetchPreferences(); // Garante que preferences seja atualizado
    } catch (e: any) {
      console.error('Erro ao remover preferência:', e);
    }
  };

  return (
    <div className="space-y-6 w-full">
      <div className="space-y-6 container mx-auto md:px-6">
        <section className="w-full">
          <div className="flex justify-center gap-3 md:justify-start md:gap-2 md:w-full items-center">
            <DatePickerComponent
              isRangeable
              quickSelectDays={[7, 15, 30, 90]}
              dateRange={dateRange}
              setDateRange={setDateRange}
            />
            <Button variant="default" onClick={() => router.push('/readings')}>Ver mais</Button>
          </div >
        </section>        <section className="w-full grid grid-cols-1 md:grid-cols-2 gap-6">          {loadingPreferences ? (
            // Mostra skeletons enquanto carrega as preferências
            <>
              <Card className="h-[320px]">
                <CardContent className="p-6">
                  <div className="flex justify-between items-start mb-4">
                    <Skeleton className="h-6 w-1/2" />
                    <Skeleton className="h-4 w-4 rounded" />
                  </div>
                  <Skeleton className="h-[200px] w-full mb-4" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-4 w-2/3" />
                  </div>
                </CardContent>
              </Card>
              <Card className="h-[320px]">
                <CardContent className="p-6">
                  <div className="flex justify-between items-start mb-4">
                    <Skeleton className="h-6 w-1/2" />
                    <Skeleton className="h-4 w-4 rounded" />
                  </div>
                  <Skeleton className="h-[200px] w-full mb-4" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-4 w-2/3" />
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            // Renderiza os gráficos dos medidores preferidos
            preferredMeters.map(meterId => (
              <ReadingsGraph 
                key={meterId} 
                meterId={meterId} 
                dateRange={dateRange} 
                detailsModalAvailable 
                onRemove={handleRemovePreference}
              />
            ))
          )}          {/* Card vazio para adicionar novo medidor preferido */}
          {!loadingPreferences && (
            <Card className="flex items-center justify-center min-h-[180px] cursor-pointer border-dashed border-2 border-primary hover:bg-accent/40 transition-colors" onClick={() => setAddDialogOpen(true)}>
              <CardContent className="flex flex-col items-center justify-center w-full h-full p-8">
                <Plus className="w-10 h-10 text-primary" />
                <span className="mt-2 text-primary font-medium">Adicionar Medidor</span>
              </CardContent>
            </Card>
          )}
        </section>
        <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Adicionar Medidor à Dashboard</DialogTitle>
              <DialogDescription>Selecione o contexto e o medidor que deseja visualizar no dashboard.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Condomínio</Label>
                <SelectComplex getAvailableForEntity="reading" setSelectedComplex={setSelectedComplex} complex={selectedComplex} modal required />
              </div>
              <div>
                <Label>Bloco</Label>
                <SelectBlock getAvailableForEntity="reading" setSelectedBlock={setSelectedBlock} block={selectedBlock} complexId={selectedComplex?.id} modal required />
              </div>
              <div>
                <Label>Apartamento</Label>
                <SelectApartment getAvailableForEntity="reading" setSelectedApartment={setSelectedApartment} apartment={selectedApartment} blockId={selectedBlock?.id} complexId={selectedComplex?.id} modal required />
              </div>
              <div>
                <Label>Medidor</Label>
                <SelectMeter setSelectedMeter={setSelectedMeter} meter={selectedMeter} apartmentId={selectedApartment?.id} modal required />
              </div>
              {error && <div className="text-red-500 text-sm mt-2">{error}</div>}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddDialogOpen(false)} disabled={updatingPref}>Cancelar</Button>
              <Button onClick={handleSavePreference} disabled={updatingPref}>{updatingPref ? 'Salvando...' : 'Salvar preferência'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {/* <section className="data-views-group w-full">
          <div className="w-full">
            <Chart dateRange={dateRange} meters={meters} chartConfig={chartConfig} initialChartConfigKey="water" />
          </div>
        </section> */}
      </div>
      <div className="space-y-6 container mx-auto md:px-6">
        <section className="data-services-group w-full">
          <div className="w-full">
            <EnhancedCarousel footerPosition="over-translucid" slidesToShow={1} horizontalOffset={200} items={bannersList} alignItems="baseline" justifyContent="center" extraCardContentClasses="p-0" />
          </div>
        </section>
        <section className="data-services-group w-full">
          <div className="w-full">
            <EnhancedCarousel aspectRatio="aspect-[3/1]" items={itemsList} alignItems="center" />
          </div>
        </section>
      </div>
    </div>
  )
}