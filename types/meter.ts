import { IotDevice, Reading, Meter, type TypeMeter } from "@prisma/client"

export interface Medidor {
  id: string
  nome: string
  ultimaLeitura: string
  ativo: boolean
}

export interface Apartamento {
  numero: string
  medidores: Medidor[]
}

export interface MeterWithDevice extends Meter {
  device: IotDevice
  Readings: Reading[]
}
export type MeterWithType = Meter & {
  typeMeter: TypeMeter
}

export interface selectMeterProps {
  id?: boolean
  register?: boolean
  typeMeterId?: boolean
  typeMeter?: boolean | {
    id?: boolean
    name?: boolean
  }
  apartmentId?: boolean
  apartment?: boolean | {
    name?: boolean
    block?: boolean | {
      name?: boolean
      complex?: boolean | {
        socialName?: boolean
      }
    }
  }
}