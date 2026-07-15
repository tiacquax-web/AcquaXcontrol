import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { Camera, Info } from "lucide-react";
import React, { useState, useEffect } from "react";

interface ReadingDetailsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reading: any; // Pode ser ReadingFull ou similar
}

export default function ReadingDetailsModal({ open, onOpenChange, reading }: ReadingDetailsModalProps) {
  const [imageError, setImageError] = useState(false);

  // Reset image state when reading changes
  useEffect(() => {
    setImageError(false);
  }, [reading?.urlCover]);

  if (!reading) return null;

  const hasPhoto = !!reading.urlCover && !imageError;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Detalhes da Leitura</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col lg:flex-row gap-6">
          <div className="flex flex-col items-center lg:w-96">
            {/* Foto do medidor */}
            <div className="w-80 h-80 rounded-lg border shadow-lg overflow-hidden relative bg-muted/50">
              {reading.urlCover && (
                <img
                  src={reading.urlCover}
                  alt="Foto do medidor"
                  className={`w-full h-full object-cover transition-opacity duration-300 ${hasPhoto ? 'opacity-100' : 'opacity-0 absolute inset-0'}`}
                  onError={() => setImageError(true)}
                />
              )}
              {!hasPhoto && (
                <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground">
                  <Camera className="w-16 h-16 mb-3 text-muted-foreground/60" />
                  <div className="text-center px-4">
                    <p className="font-medium text-sm mb-1">Imagem não disponível</p>
                    <p className="text-xs text-muted-foreground/80">
                      Esta foto não pôde ser carregada. Solicite o backup via WhatsApp ou e-mail.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Aviso de processamento de imagem */}
            {hasPhoto && (
              <div className="mt-3 w-80 flex items-start gap-2 rounded-md bg-muted/60 border border-border px-3 py-2">
                <Info className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                <p className="text-[11px] leading-tight text-muted-foreground">
                  As imagens dos medidores passam por processamento automatizado de aprimoramento óptico
                  (ajuste de contraste, nitidez e reconhecimento de caracteres) para garantir a leitura
                  mais precisa possível. Pequenas diferenças visuais — como linhas, manchas ou variações
                  de tonalidade — são artefatos naturais deste processo e não representam alteração dos
                  valores registrados.
                </p>
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <Table>
              <TableBody>
                <TableRow>
                  <TableCell className="font-semibold">Medidor</TableCell>
                  <TableCell>{reading.meter?.register || '-'}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-semibold">Apartamento</TableCell>
                  <TableCell>{reading.meter?.apartment?.name || '-'}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-semibold">Leitura</TableCell>
                  <TableCell>{reading.reading ?? '-'}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-semibold">Mês</TableCell>
                  <TableCell>{reading.monthRef || '-'}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-semibold">Ano</TableCell>
                  <TableCell>{reading.yearRef || '-'}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-semibold">Data</TableCell>
                  <TableCell>{reading.readAt ? new Date(reading.readAt).toLocaleDateString() : '-'}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-semibold">Próx. Leitura</TableCell>
                  <TableCell>{reading.nextReadingDate || '-'}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-semibold">Pré-leitura</TableCell>
                  <TableCell>{reading.isPreReading ? 'Sim' : 'Não'}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
