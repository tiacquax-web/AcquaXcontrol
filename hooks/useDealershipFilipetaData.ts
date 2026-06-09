// hooks/useDealershipFilipetaData.ts
"use client";

import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { ApartmentWithConsumptionReport } from "@/types/apartment";
import { DealershipReadingFull } from "@/types/fullTypes";

interface UseDealershipFilipetaDataProps {
  dealershipReadingId?: string;
  order?: 'block_apartment' | 'apartment_block';
  blockId?: string;
  apartmentId?: string;
  /** When false the main filipeta fetch is suppressed; set to true to trigger it. */
  enabled?: boolean;
  /**
   * Increment this to force a re-fetch even when all other props are unchanged
   * (e.g. user clicks "Buscar" a second time with the same filters).
   */
  fetchKey?: number;
}

// Define o tipo do relatório enriquecido para incluir o histórico
interface EnrichedApartmentReport extends ApartmentWithConsumptionReport {
  history: ApartmentWithConsumptionReport[];
}

// Atualiza a interface principal para refletir a resposta completa da API
interface FilipetaData {
  list: EnrichedApartmentReport[];
  totalCount: number;
  dealershipReading: DealershipReadingFull;
}

export const useDealershipFilipetaData = ({
  dealershipReadingId,
  order,
  blockId,
  apartmentId,
  enabled = true,
  fetchKey = 0,
}: UseDealershipFilipetaDataProps) => {
  const [data, setData] = useState<FilipetaData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchFilipetaData = useCallback(async () => {
    if (!dealershipReadingId || !enabled) return;

    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (order) qs.set('order', order);
      if (blockId) qs.set('block_id', blockId);
      if (apartmentId) qs.set('apartment_id', apartmentId);
      const queryString = qs.toString() ? `?${qs.toString()}` : '';
      const response = await axios.get<FilipetaData>(
        `/api/dealership-readings/${dealershipReadingId}/filipeta${queryString}`
      );
      setData(response.data);
    } catch (err: any) {
      console.error("Error fetching filipeta data:", err);
      const errorMessage =
        err.response?.data?.message || err.message || "Ocorreu um erro ao buscar os dados da filipeta.";
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  // fetchKey is intentionally included: incrementing it forces a re-fetch
  // even when all other params are unchanged (user clicks Buscar again).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealershipReadingId, order, blockId, apartmentId, enabled, fetchKey]);

  useEffect(() => {
    if (enabled) fetchFilipetaData();
  }, [fetchFilipetaData, enabled]);

  return { data, loading, error, refetch: fetchFilipetaData };
};

// ── Lightweight metadata hook ───────────────────────────────────────────────
// Fetches only the dealershipReading record (via the existing filipeta endpoint
// with a ?meta_only=1 hint OR via a separate small API) so the BlocksCombobox
// has a complexId before the heavy full-fetch fires.
// We reuse the filipeta endpoint: even if the block filtering applies, the
// dealershipReading object in the response always carries complexId.  We ask
// for apartment_id=__none__ so Prisma returns 0 rows fast but still returns
// the dealershipReading wrapper.  A simpler approach: just call the route
// with no filters and take=0 — but the route doesn't support take.
// Best approach: dedicated lightweight fetch from the dealership-reading route.

interface UseDealershipReadingMetaProps {
  dealershipReadingId?: string;
}

interface DealershipReadingMeta {
  complexId?: string | null;
  id: string;
}

export const useDealershipReadingMeta = ({ dealershipReadingId }: UseDealershipReadingMetaProps) => {
  const [meta, setMeta] = useState<DealershipReadingMeta | null>(null);
  const [metaLoading, setMetaLoading] = useState(false);
  const [metaError, setMetaError] = useState<string | null>(null);

  useEffect(() => {
    if (!dealershipReadingId) return;

    let cancelled = false;
    setMetaLoading(true);
    setMetaError(null);

    // Hit the filipeta endpoint but ask for a non-existent block so the heavy
    // apartment query returns 0 rows quickly; the response still includes
    // `dealershipReading` with its complexId.
    axios
      .get<FilipetaData>(
        `/api/dealership-readings/${dealershipReadingId}/filipeta?meta_only=1`
      )
      .then(res => {
        if (!cancelled) setMeta(res.data.dealershipReading ?? null);
      })
      .catch(() => {
        if (!cancelled) setMetaError('Falha ao carregar metadados da leitura.');
      })
      .finally(() => {
        if (!cancelled) setMetaLoading(false);
      });

    return () => { cancelled = true; };
  }, [dealershipReadingId]);

  return { meta, metaLoading, metaError };
};
