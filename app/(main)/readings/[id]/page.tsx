'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useReadingMutations, useReadings } from '@/hooks/useReadings';
import { Skeleton } from '@/components/ui/skeleton';
import { DatePickerComponent } from '@/components/date-picker';
import { sanitizeImageUrl } from '@/lib/utils';

export default function ReadingViewPage() {
  const { id } = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const { updateReading, loading: saving } = useReadingMutations();
  const { readings, loading, error } = useReadings({ readingId: id as string });
  const reading = readings && readings.length > 0 ? readings[0] : null;
  const [formState, setFormState] = useState({
    registerName: '',
    reading: '',
    monthRef: '',
    yearRef: '',
    readAt: '',
    readAtDate: '',
    nextReadingDate: '',
    urlCover: '',
  });
  const today = new Date();

  console.log(reading)

  // Função utilitária para calcular o mesmo dia do mês seguinte (ou último dia do mês seguinte)
  function getNextMonthSameDay(date: Date) {
    const year = date.getFullYear();
    const month = date.getMonth();
    const day = date.getDate();
    const nextMonth = month + 1;
    let next = new Date(year, nextMonth, day);
    if (next.getMonth() !== (nextMonth % 12)) {
      next = new Date(year, nextMonth + 1, 0);
    }
    return next;
  }

  useEffect(() => {
    if (reading) {
      const now = new Date();
      const currentMonth = now.toLocaleString('pt-BR', { month: 'long' });
      const capitalizedMonth = currentMonth.charAt(0).toUpperCase() + currentMonth.slice(1);
      const currentYear = now.getFullYear().toString();
      const registerName = reading.registerName || reading.meter?.register || '';
      // Definir datas conforme regras
      const readAtDate = reading.readAt ? new Date(reading.readAt) : now;
      const nextReadingDate = reading.nextReadingDate
        ? new Date(reading.nextReadingDate)
        : getNextMonthSameDay(readAtDate);
      setFormState({
        registerName,
        reading: reading.reading?.toString() || '',
        monthRef: reading.monthRef || capitalizedMonth,
        yearRef: reading.yearRef || currentYear,
        readAt: readAtDate.toISOString().slice(0, 16),
        readAtDate: reading.readAtDate || readAtDate.toISOString().slice(0, 10),
        nextReadingDate: nextReadingDate.toISOString().slice(0, 10),
        urlCover: reading.urlCover || '',
      });
    }
  }, [reading]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormState({ ...formState, [e.target.name]: e.target.value });
  };
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validação: se a leitura possui coverBase64, urlCover é obrigatório
    if (reading?.coverBase64 && !formState.urlCover.trim()) {
      toast({ 
        title: 'Erro de validação', 
        description: 'URL da Foto é obrigatória quando existe uma foto associada à leitura.',
        variant: 'destructive' 
      });
      return;
    }
    
    try {
      await updateReading(id as string, {
        registerName: formState.registerName,
        reading: parseFloat(formState.reading),
        monthRef: formState.monthRef,
        yearRef: formState.yearRef,
        readAt: formState.readAt ? new Date(formState.readAt) : undefined,
        readAtDate: formState.readAtDate,
        nextReadingDate: formState.nextReadingDate,
        urlCover: formState.urlCover,
        isPreReading: false,
        coverBase64: null,
      });
      toast({ title: 'Leitura atualizada com sucesso!' });
      router.back();
    } catch (err: any) {
      // Tenta extrair mensagem de erro do backend
      let description = err?.message || 'Erro ao salvar leitura';
      if (err?.response?.data?.error) {
        description = err.response.data.error;
      } else if (err?.response?.data?.sessionError) {
        description = err.response.data.sessionError;
      }
      toast({ title: 'Erro ao salvar leitura', description, variant: 'destructive' });
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <Skeleton className="w-full max-w-lg h-96" />
      </div>
    );
  }

  if (error) {
    return <div className="text-red-500 p-4">Erro ao carregar leitura: {error}</div>;
  }

  return (
    <div className="flex justify-center items-center min-h-[80vh]">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle className="text-2xl font-semibold">Visualizar/Editar Leitura</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-6">
            <div>
              <label className="block font-medium mb-1">CHASSI</label>
              <Input name="registerName" value={formState.registerName} readOnly />
            </div>
            <div>
              <label className="block font-medium mb-1">Leitura</label>
              <Input name="reading" type="number" value={formState.reading} onChange={handleChange} step="0.001" />
            </div>
            <div>
              <label className="block font-medium mb-1">Mês de Referência</label>
              <Input name="monthRef" value={formState.monthRef} onChange={handleChange} />
            </div>
            <div>
              <label className="block font-medium mb-1">Ano de Referência</label>
              <Input name="yearRef" value={formState.yearRef} onChange={handleChange} />
            </div>
            <div>
              <label className="block font-medium mb-1">Data da Leitura</label>
              <DatePickerComponent
                date={formState.readAt ? new Date(formState.readAt) : today}
                setDate={date => {
                  if (date instanceof Date) {
                    setFormState(f => {
                      // Quando alterar a data da leitura, se nextReadingDate não foi alterada manualmente, atualize para o mesmo dia do mês seguinte
                      let nextReadingDate = f.nextReadingDate;
                      if (!reading?.nextReadingDate) {
                        const next = getNextMonthSameDay(date);
                        nextReadingDate = next.toISOString().slice(0, 10);
                      }
                      return {
                        ...f,
                        readAt: date.toISOString().slice(0, 16),
                        nextReadingDate,
                      };
                    });
                  } else {
                    setFormState(f => ({ ...f, readAt: today.toISOString().slice(0, 16) }));
                  }
                }}
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Data da Próxima Leitura</label>
              <DatePickerComponent
                date={formState.nextReadingDate ? new Date(formState.nextReadingDate) : getNextMonthSameDay(formState.readAt ? new Date(formState.readAt) : today)}
                setDate={date => {
                  if (date instanceof Date) {
                    setFormState(f => ({ ...f, nextReadingDate: date.toISOString().slice(0, 10) }));
                  } else {
                    setFormState(f => ({ ...f, nextReadingDate: getNextMonthSameDay(formState.readAt ? new Date(formState.readAt) : today).toISOString().slice(0, 10) }));
                  }
                }}
              />
            </div>            <div>
              <label className="block font-medium mb-1">
                URL da Foto
                {reading?.coverBase64 && <span className="text-red-500 ml-1">*</span>}
              </label>
              <Input
                name="urlCover"
                value={formState.urlCover}
                onChange={handleChange}
                placeholder="https://i.postimg.cc/..."
                className={reading?.coverBase64 && !formState.urlCover.trim() ? "border-red-500" : ""}
              />
              {reading?.coverBase64 && !formState.urlCover.trim() && (
                <p className="text-red-500 text-sm mt-1">
                  Este campo é obrigatório quando existe uma foto associada à leitura.
                </p>
              )}
              {formState.urlCover && (
                <img
                  src={sanitizeImageUrl(formState.urlCover)}
                  alt="Foto da leitura"
                  className="rounded-xl border mt-2 w-full"
                  style={{ maxHeight: 300, objectFit: 'contain' }}
                />
              )}
              {/* Exibe a imagem em base64 se existir */}
              {reading?.coverBase64 && (() => {
                let base64 = '';
                if (Array.isArray(reading.coverBase64)) {
                  // Provavelmente nunca será array, mas por garantia
                  base64 = Buffer.from(reading.coverBase64).toString('base64');
                } else if (typeof reading.coverBase64 === 'object' && reading.coverBase64 !== null) {
                  // Caso venha como objeto tipo {0: 255, 1: 216, ...}
                  const values = Object.values(reading.coverBase64);
                  base64 = typeof Buffer !== 'undefined'
                    ? Buffer.from(values).toString('base64')
                    : btoa(String.fromCharCode(...values));
                } else if (typeof reading.coverBase64 === 'string') {
                  base64 = reading.coverBase64;
                }
                return base64 ? (
                  <img
                    src={`data:image/jpeg;base64,${base64}`}
                    alt="Foto da leitura (base64)"
                    className="rounded-xl border mt-2 w-full"
                    style={{ maxHeight: 300, objectFit: 'contain' }}
                  />
                ) : null;
              })()}
            </div>
            <Button type="submit" className="w-full" disabled={saving}>
              Salvar
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
