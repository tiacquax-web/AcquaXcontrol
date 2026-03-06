import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Reading, Meter, Apartment } from "@prisma/client";
import { X, ImageOff, Camera } from "lucide-react";
import React, { useState, useEffect } from "react";

interface ReadingDetailsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reading: any; // Pode ser ReadingFull ou similar
}

export default function ReadingDetailsModal({ open, onOpenChange, reading }: ReadingDetailsModalProps) {
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  // Reset image state when reading changes
  useEffect(() => {
    setImageError(false);
    setImageLoaded(false);
  }, [reading?.urlCover]);

  // Function to check if image is valid
  const checkImageValidity = async (url: string) => {
    try {
      const response = await fetch(url, { method: 'HEAD' });
      if (!response.ok || response.status === 404) {
        setImageError(true);
        return false;
      }
      return true;
    } catch {
      setImageError(true);
      return false;
    }
  };

  // Check image validity when URL exists
  useEffect(() => {
    if (reading?.urlCover && !imageLoaded && !imageError) {
      checkImageValidity(reading.urlCover);
    }
  }, [reading?.urlCover, imageLoaded, imageError]);

  if (!reading) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Detalhes da Leitura</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col lg:flex-row gap-6">
          <div className="flex flex-col items-center lg:w-96">
            {reading.urlCover && !imageError ? (
              <img 
                src={reading.urlCover} 
                alt="Foto da leitura" 
                className="w-80 h-80 rounded-lg object-cover border shadow-lg"
                onLoad={() => setImageLoaded(true)}
                onError={() => setImageError(true)}
              />
            ) : null}
            <div 
              className={`w-80 h-80 rounded-lg border shadow-lg flex flex-col items-center justify-center text-muted-foreground bg-muted/50 ${(!reading.urlCover || imageError) ? 'flex' : 'hidden'}`}
            >
              <Camera className="w-16 h-16 mb-3 text-muted-foreground/60" />
              <div className="text-center px-4">
                <p className="font-medium text-sm mb-1">Imagem não disponível</p>
                <p className="text-xs text-muted-foreground/80">
                  Infelizmente esta foto não pôde ser carregada, mas você pode solicitar o backup via whatsapp ou e-mail.
                </p>
              </div>
            </div>
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
