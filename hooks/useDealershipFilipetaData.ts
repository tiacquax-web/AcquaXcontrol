// hooks/useDealershipFilipetaData.ts
"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import { ApartmentWithConsumptionReport } from "@/types/apartment";
import { AxiosError } from "axios";
import { DealershipReadingFull } from "@/types/fullTypes";

interface UseDealershipFilipetaDataProps {
  dealershipReadingId?: string;
  order?: 'block_apartment' | 'apartment_block';
}

// Define o tipo do relatório enriquecido para incluir o histórico
interface EnrichedApartmentReport extends ApartmentWithConsumptionReport {
  history: ApartmentWithConsumptionReport[];
}

// Atualiza a interface principal para refletir a resposta completa da API
interface FilipetaData {
  list: EnrichedApartmentReport[];
  totalCount: number;
  dealershipReading: DealershipReadingFull; // Adiciona a propriedade que faltava
}

export const useDealershipFilipetaData = ({ dealershipReadingId, order }: UseDealershipFilipetaDataProps) => {
  const [data, setData] = useState<FilipetaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!dealershipReadingId) {
      setLoading(false);
      return;
    }

    const fetchFilipetaData = async () => {
      setLoading(true);
      setError(null);
      try {
        const params: Record<string, string> = {};
        if (order) params.order = order;
        const response = await axios.get<FilipetaData>(`/api/dealership-readings/${dealershipReadingId}/filipeta`, { params });
        setData(response.data);
      } catch (err: unknown) {
        console.error("Error fetching filipeta data:", err);
        const axiosError = err as AxiosError<{ message?: string; error?: string }>;
        const errorMessage =
          axiosError.response?.data?.message ||
          axiosError.response?.data?.error ||
          axiosError.message ||
          "Ocorreu um erro ao buscar os dados da filipeta.";
        setError(errorMessage);
      } finally {
        setLoading(false);
      }
    };

    fetchFilipetaData();
  }, [dealershipReadingId, order]);

  return { data, loading, error };
};
