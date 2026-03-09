import axiosClient from '@/services/axiosClient';
import { Reading } from '@prisma/client';


// export async function getUserMeterReadings(meterId: string, period: { from: string, to: string }, showLastN = 6) {
//   try {
//     const selectManual = JSON.stringify({
//       id: true,
//       reading: true,
//       monthRef: true,
//       readingDate: true,
//       readingDateNext: true,
//       cover: true,
//       coverBase64: true,
//       urlCover: true,
//       yearRef: true,
//       meterId: true,
//       createdByUserId: true,
//       updatedByUserId: true,
//       editor: true,
//       meter: {
//         select: {
//           register: true,
//           typeMeter: {
//             select: {
//               name: true,
//             },
//           },
//         },
//       },
//       createdByUser: {
//         select: {
//           name: true,
//         },
//       },
//     });

//     const response = await axiosClient.get(`user/readings/?meter_id=${meterId}&start_date=${period.from}&end_date=${period.to}&reading_type=all&select_manual=${selectManual}`);
//     const data = response.data;

//     const res = {
//       iotReadings: (data.iot ?? []) as IotReading[],
//       manualReadings: (data.manual ?? []) as ManualReading[],
//       originalPeriodEmpty: false,
//     };

//     if (res.iotReadings.length < 2 && res.manualReadings.length < 2 && showLastN) {
//       const newResponse = await axiosClient.get(`user/readings/?meter_id=${meterId}&reading_type=all&show_last_n=${showLastN}&select_manual=${selectManual}`);
//       const newData = newResponse.data;

//       return {
//         iotReadings: (newData.iot ?? []) as IotReading[],
//         manualReadings: (newData.manual ?? []) as ManualReading[],
//         originalPeriodEmpty: true,
//       };
//     } else {
//       return res;
//     }
//   } catch (error) {
//     console.error('Error fetching user meter readings:', error);
//     throw error;
//   }
// }

// export async function getMultipleMetersReadings(
//   meterIds: string[],
//   period: { from: string; to: string },
//   showLastN = 6
// ) {
//   try {
//     // Define os campos a serem selecionados na leitura manual (mesmo padrão usado em getUserMeterReadings)
//     const selectManual = JSON.stringify({
//       id: true,
//       reading: true,
//       monthRef: true,
//       readingDate: true,
//       readingDateNext: true,
//       cover: true,
//       coverBase64: true,
//       urlCover: true,
//       yearRef: true,
//       meterId: true,
//       createdByUserId: true,
//       updatedByUserId: true,
//       editor: true,
//       meter: {
//         select: {
//           register: true,
//           typeMeter: {
//             select: {
//               name: true,
//             },
//           },
//         },
//       },
//       createdByUser: {
//         select: {
//           name: true,
//         },
//       },
//     });

//     // Junta os IDs em uma string separada por vírgula
//     const meterIdsParam = meterIds.join(',');

//     // Primeira requisição: busca pelas leituras dentro do período informado
//     const response = await axiosClient.get(
//       `user/readings/multiple?meter_ids=${meterIdsParam}&start_date=${period.from}&end_date=${period.to}&reading_type=all&select_manual=${selectManual}`
//     );
//     const data = response.data;

//     let res = {
//       iotReadings: (data.iot ?? []) as IotReading[],
//       manualReadings: (data.manual ?? []) as ManualReading[],
//       originalPeriodEmpty: false,
//     };

//     return res;
//   } catch (error) {
//     console.error('Error fetching multiple meters readings:', error);
//     throw error;
//   }
// }

interface getReadingsListProps {
  readingId?: string;
  companyId?: string;
  complexId?: string;
  blockId?: string;
  apartmentId?: string;
  meterId?: string;
  isPreReading?: boolean;
  withDevice?: boolean;
  withMeter?: boolean;
  withBlock?: boolean;
  withApartment?: boolean;
  withComplex?: boolean;
  take?: number;
  skip?: number;
  fromDate?: Date;
  toDate?: Date;
}

export async function getReadings({ withApartment, withBlock, withComplex, readingId, fromDate, toDate, meterId, companyId, complexId, blockId, apartmentId, isPreReading, withDevice, withMeter, take, skip }: getReadingsListProps) {
  try {
    const params: any = {};
    if (readingId) params.id = readingId;
    if (meterId) params.meter_id = meterId;
    if (companyId) params.company_id = companyId;
    if (complexId) params.complex_id = complexId;
    if (blockId) params.block_id = blockId;
    if (apartmentId) params.apartment_id = apartmentId;
    if (isPreReading) params.is_pre_reading = isPreReading;
    if (withDevice) params.with_device = withDevice;
    if (withMeter) params.with_meter = withMeter;
    if (withBlock) params.with_block = withBlock;
    if (withApartment) params.with_apartment = withApartment;
    if (fromDate) params.from_date = fromDate.toISOString();
    if (toDate) params.to_date = toDate.toISOString();

    if (take) params.take = take;
    if (skip) params.skip = skip;

    const response = await axiosClient.get(`user/readings`, { params });
    return response.data;
  } catch (error) {
    console.error('Error fetching readings:', error);
    throw error;
  }
}

export interface CreatePreReadingInput {
  apartmentId: string;
  meterId: string;
  coverBase64: string;
  isManualReading: boolean;
  registerName?: string; // Optional, can be used for additional info
}

export async function createPreReading(input: CreatePreReadingInput) {
  try {
    const response = await axiosClient.post(`user/readings`, {
      apartmentId: input.apartmentId,
      meterId: input.meterId,
      coverBase64: input.coverBase64,
      registerName: input.registerName || '',
      isPreReading: true,
      isManualReading: input.isManualReading,
    });
    return response.data;
  } catch (error) {
    console.error('Error creating pre-reading:', error);
    throw error;
  }
}

export async function updateReading(id: string, data: Partial<Reading>) {
  try {
    const response = await axiosClient.put(`user/readings/${id}`, data);
    return response.data;
  } catch (error) {
    console.error('Error updating reading:', error);
    throw error;
  }
}

export const createReadingsFromSheet = async (rows: any[], allowUpdates: boolean = false) => {
  try {
    const response = await axiosClient.post(
      `user/readings`,
      JSON.stringify({ rows, allowUpdates }),
      { headers: { "Content-Type": "application/json" } }
    );
    return response.data;
  } catch (error: any) {
    if (error.response && error.response.data) {
      return error.response.data;
    }
    throw error;
  }
};
