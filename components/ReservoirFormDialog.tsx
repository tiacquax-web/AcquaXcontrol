'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { Loader2 } from 'lucide-react'

interface ReservoirFormData {
  name: string
  telegramChannel: string
  type: string
  capacity?: number
  minLevel?: number
  maxLevel?: number
  description?: string
  location?: string
}

interface ReservoirFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  reservoir?: any // Para edição
  onSuccess?: () => void
}

const RESERVOIR_TYPES = [
  { value: 'WATER_TANK', label: 'Caixa d\'água' },
  { value: 'CISTERN', label: 'Cisterna' },
  { value: 'POOL', label: 'Piscina' },
  { value: 'FOUNTAIN', label: 'Chafariz' },
  { value: 'EMERGENCY_TANK', label: 'Reserva de Emergência' },
  { value: 'TREATMENT_TANK', label: 'Tanque de Tratamento' },
]

export function ReservoirFormDialog({ 
  open, 
  onOpenChange, 
  reservoir, 
  onSuccess 
}: ReservoirFormDialogProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState<ReservoirFormData>({
    name: reservoir?.name || '',
    telegramChannel: reservoir?.telegramChannel || '',
    type: reservoir?.type || 'WATER_TANK',
    capacity: reservoir?.capacity || undefined,
    minLevel: reservoir?.minLevel || undefined,
    maxLevel: reservoir?.maxLevel || undefined,
    description: reservoir?.description || '',
    location: reservoir?.location || '',
  })

  const isEditing = !!reservoir

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      // Validação básica
      if (!formData.name.trim()) {
        toast({
          title: 'Erro',
          description: 'Nome é obrigatório',
          variant: 'destructive',
        })
        return
      }

      if (!formData.telegramChannel.trim()) {
        toast({
          title: 'Erro',
          description: 'Canal do Telegram é obrigatório',
          variant: 'destructive',
        })
        return
      }

      // Preparar dados para envio
      const payload = {
        ...formData,
        // Converter strings vazias para undefined
        capacity: formData.capacity || undefined,
        minLevel: formData.minLevel || undefined,
        maxLevel: formData.maxLevel || undefined,
        description: formData.description?.trim() || undefined,
        location: formData.location?.trim() || undefined,
      }

      const url = isEditing 
        ? `/api/reservoirs/${reservoir.id}` 
        : '/api/reservoirs'
      
      const method = isEditing ? 'PUT' : 'POST'

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao salvar reservatório')
      }

      toast({
        title: 'Sucesso',
        description: data.message || `Reservatório ${isEditing ? 'atualizado' : 'criado'} com sucesso`,
      })

      onSuccess?.()
      onOpenChange(false)

      // Reset form if creating new
      if (!isEditing) {
        setFormData({
          name: '',
          telegramChannel: '',
          type: 'WATER_TANK',
          capacity: undefined,
          minLevel: undefined,
          maxLevel: undefined,
          description: '',
          location: '',
        })
      }

    } catch (error: any) {
      console.error('Error saving reservoir:', error)
      toast({
        title: 'Erro',
        description: error.message || 'Erro interno do servidor',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (field: keyof ReservoirFormData, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Editar Reservatório' : 'Novo Reservatório'}
          </DialogTitle>
          <DialogDescription>
            {isEditing 
              ? 'Edite as informações do reservatório abaixo.'
              : 'Preencha as informações para criar um novo reservatório.'
            }
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Nome */}
            <div className="space-y-2">
              <Label htmlFor="name">Nome *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => handleChange('name', e.target.value)}
                placeholder="ex: Reservatório Superior"
                required
              />
            </div>

            {/* Canal do Telegram */}
            <div className="space-y-2">
              <Label htmlFor="telegramChannel">Canal do Telegram *</Label>
              <Input
                id="telegramChannel"
                value={formData.telegramChannel}
                onChange={(e) => handleChange('telegramChannel', e.target.value)}
                placeholder="ex: LOG Acqua X Brasil"
                required
              />
            </div>

            {/* Tipo */}
            <div className="space-y-2">
              <Label htmlFor="type">Tipo *</Label>
              <Select value={formData.type} onValueChange={(value) => handleChange('type', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o tipo" />
                </SelectTrigger>
                <SelectContent>
                  {RESERVOIR_TYPES.map(type => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Capacidade */}
            <div className="space-y-2">
              <Label htmlFor="capacity">Capacidade (m³)</Label>
              <Input
                id="capacity"
                type="number"
                step="0.01"
                value={formData.capacity || ''}
                onChange={(e) => handleChange('capacity', e.target.value ? parseFloat(e.target.value) : undefined)}
                placeholder="ex: 1000.00"
              />
            </div>

            {/* Nível Mínimo */}
            <div className="space-y-2">
              <Label htmlFor="minLevel">Nível Mínimo (m)</Label>
              <Input
                id="minLevel"
                type="number"
                step="0.01"
                value={formData.minLevel || ''}
                onChange={(e) => handleChange('minLevel', e.target.value ? parseFloat(e.target.value) : undefined)}
                placeholder="ex: 0.50"
              />
            </div>

            {/* Nível Máximo */}
            <div className="space-y-2">
              <Label htmlFor="maxLevel">Nível Máximo (m)</Label>
              <Input
                id="maxLevel"
                type="number"
                step="0.01"
                value={formData.maxLevel || ''}
                onChange={(e) => handleChange('maxLevel', e.target.value ? parseFloat(e.target.value) : undefined)}
                placeholder="ex: 3.00"
              />
            </div>
          </div>

          {/* Localização */}
          <div className="space-y-2">
            <Label htmlFor="location">Localização</Label>
            <Input
              id="location"
              value={formData.location}
              onChange={(e) => handleChange('location', e.target.value)}
              placeholder="ex: Terraço do Edifício A"
            />
          </div>

          {/* Descrição */}
          <div className="space-y-2">
            <Label htmlFor="description">Descrição</Label>
            <Input
              id="description"
              value={formData.description}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleChange('description', e.target.value)}
              placeholder="Informações adicionais sobre o reservatório..."
            />
          </div>

          <DialogFooter>
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEditing ? 'Atualizar' : 'Criar'} Reservatório
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
