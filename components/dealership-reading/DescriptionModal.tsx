// components/dealership-reading/DescriptionModal.tsx
'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface DescriptionModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  dealershipReadingId: string;
}

export const DescriptionModal: React.FC<DescriptionModalProps> = ({ isOpen, onOpenChange, dealershipReadingId }) => {
  const router = useRouter();
  const [description, setDescription] = useState('');
  const [order, setOrder] = useState<'block_apartment' | 'apartment_block'>('block_apartment');

  const handleGenerate = () => {
    const encodedDescription = encodeURIComponent(description);
    const targetUrl = `/dealership-readings/${dealershipReadingId}/filipeta?description=${encodedDescription}&order=${order}`;
    
    // Open in a new tab
    window.open(targetUrl, '_blank');
    
    // Close the modal
    onOpenChange(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Gostaria de inserir observações na filipeta?</DialogTitle>
          <DialogDescription>
            O texto inserido abaixo aparecerá na seção "Descrição" de cada relatório na filipeta. Este passo é opcional.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Label htmlFor="description">Observações</Label>
          <Textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Digite suas observações aqui..."
            className="mt-2"
          />
          <div className="mt-4 space-y-2">
            <Label htmlFor="order">Ordem da filipeta</Label>
            <Select value={order} onValueChange={(value) => setOrder(value as typeof order)}>
              <SelectTrigger id="order">
                <SelectValue placeholder="Selecione a ordem" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="block_apartment">Bloco → Apartamento</SelectItem>
                <SelectItem value="apartment_block">Apartamento → Bloco</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleGenerate}>
            Gerar Filipeta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
