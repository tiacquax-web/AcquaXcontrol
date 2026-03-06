import type { Apartment, Block, ApartmentConsumptionReport, DealershipReading } from "@prisma/client"
import { MeterWithDevice } from "./meter"
import { ApartmentFull } from "./fullTypes"


export interface ApartmentWithMeters extends Apartment {
  meters: MeterWithDevice[]
  block: Block
}


export interface ApartmentWithMeters extends Apartment {
  meters: MeterWithDevice[]
}

export interface ApartmentWithConsumptionReport extends ApartmentConsumptionReport {
  apartment: ApartmentFull;
  DealershipReading: Partial<DealershipReading>
  lastReading?: {
    id: string;
    reading: number | null;
    readAtDate: string | null;
    nextReadingDate?: string | null;
    isPreReading?: boolean | null;
    urlCover?: string | null;
    registerName?: string | null;
  }
}

// Enriched report type that includes history
export type EnrichedApartmentReport = ApartmentWithConsumptionReport & {
  history: ApartmentWithConsumptionReport[];
};