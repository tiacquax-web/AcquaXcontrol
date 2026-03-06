// import { useState, useEffect, useMemo } from 'react';
// import { getMultipleMetersReadings } from '@/services/readingsService';

// export function useMultipleMetersReadings(
//   meterIds: string[] | undefined,
//   period: { from: string | undefined; to: string | undefined } | undefined,
//   searchTrigger: any
// ) {
//   const [readings, setReadings] = useState<Record<string, { iotReadings: IotReading[]; manualReadings: ManualReading[] }>>({});
//   const [loading, setLoading] = useState(true);

//   const memoizedMeterIds = useMemo(() => meterIds, [JSON.stringify(meterIds)]);
//   const memoizedPeriod = useMemo(() => period, [JSON.stringify(period)]);

//   useEffect(() => {
//     if (!memoizedMeterIds || !memoizedMeterIds.length) {
//       return;
//     }
//     if (!memoizedPeriod || !memoizedPeriod.from || !memoizedPeriod.to) {
//       return;
//     }

//     const fetchReadings = async () => {
//       try {
//         const { iotReadings, manualReadings } = await getMultipleMetersReadings(memoizedMeterIds, { from: memoizedPeriod.from!, to: memoizedPeriod.to! }, 10);
//         const readingsByMeterId: Record<string, { iotReadings: IotReading[]; manualReadings: ManualReading[] }> = {};

//         memoizedMeterIds.forEach((meterId) => {
//           readingsByMeterId[meterId] = {
//             iotReadings: iotReadings.filter((reading) => reading.meterId === meterId),
//             manualReadings: manualReadings.filter((reading) => reading.meterId === meterId),
//           };
//         });

//         setReadings(readingsByMeterId);
//         setLoading(false);
//       } catch {
//         setLoading(false);
//       }
//     };

//     fetchReadings();
//   }, [memoizedMeterIds, memoizedPeriod, searchTrigger]);

//   return { readings, loading };
// }