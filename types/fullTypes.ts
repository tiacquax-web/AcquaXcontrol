import { Complex, Block, Apartment, Meter, DealershipReading, Dealership, IotDevice, Reading } from "@prisma/client"

export interface ComplexFull extends Complex {
    _count?: {
        blocks?: number;
    };
    company?: {
        id: string;
        socialName: string;
    };
    blocks?: {
        apartments?: {
            _count?: {
                meters: number;
            };
            meters?: {
                _count: {
                    Readings: number;
                };
            }[];
        }[];
        _count?: {
            apartments: number;
        };
    }[];
}

export interface BlockFull extends Block {
    _count?: {
        apartments?: number;
    };
    complex?: {
        socialName: string;
    };
    apartments?: {
        _count?: {
            meters: number;
        };
    }[];
}

export interface ApartmentFull extends Apartment {
    _count?: {
        meters?: number
    }
    meters?: MeterFull[]
    block?: BlockFull
}

export interface DealershipReadingFull extends DealershipReading {
    complex?: ComplexFull
    dealership?: Dealership
}

export interface MeterFull extends Meter {
    apartment?: {
        id: string;
        name: string;
        block?: {
            id: string;
            name: string;
            complex?: {
                id: string;
                socialName: string;
            };
        };
    };
    typeMeter?: {
        id: string;
        name: string;
        acronym: string;
    };
    meterDeviceLinks?: Array<{
        id: string;
        deviceId: string;
        device?: {
            id: string;
            deviceId: string;
            name?: string | null;
            pilotMode?: boolean;
            lastSeenDate?: string | null;
            lastReading?: number | null;
        };
    }>;
    Readings?: Array<{
        id: string;
        reading: number;
        readAtDate?: string | null;
        source?: string | null;
        isManualReading?: boolean | null;
    }>;
}

export interface DeviceFull extends Omit<IotDevice, 'lastReading' | 'lastSeen' | 'lastSeenDate' | 'hasActiveLink' | 'readingsCount' | 'unlinkedReadingsCount'> {
    meter?: MeterFull;
    currentMeter?: {
        id: string;
        register: string;
        blockId?: string | null;
        complexId?: string | null;
        companyId?: string | null;
        apartment: {
            id: string;
            name: string;
            block: {
                id: string;
                name: string;
                complex: {
                    id: string;
                    socialName: string;
                };
            };
        };
    };
    lastReading?: number | null;
    lastSeen?: number | null;
    lastSeenDate?: string | null;
    hasActiveLink?: boolean | null;
    readingsCount?: number | null;
    unlinkedReadingsCount?: number | null;
    lastReadingSource?: string | null;
    lastReadingAt?: string | null;
}

export interface ReadingFull extends Reading{
    meter?: MeterFull;
}