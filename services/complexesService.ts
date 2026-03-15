import { PermissionableEntity } from '@prisma/client';
import axios from 'axios';

const NEXT_PUBLIC_API_URL = '/api';

interface getComplexesProps {
    nameQuery?: string;
    documentCompany?: string;
    withCompany?: boolean;
    complexId?: string;
    companyId?: string; // Adicionar companyId
    getAvailableForEntity?: PermissionableEntity;
    withBlocksCount?: boolean;
    withApartmentsCount?: boolean;
    withMetersCount?: boolean;
    onlyWithReservoirs?: boolean;
    id?: string;
    socialNames?: string[];
    take?: number;
    skip?: number;
}

export const getComplexes = async ({ id, getAvailableForEntity, complexId, companyId, nameQuery, documentCompany, withCompany = false, withBlocksCount = false, withApartmentsCount = false, withMetersCount = false, onlyWithReservoirs = false, socialNames, take = 12, skip = 0 }: getComplexesProps & { socialNames?: string[] }) => {
  try {
    const params: any = {};
    if (id) params.id = id;
    if (getAvailableForEntity) params.getAvailableForEntity = getAvailableForEntity;
    if (withBlocksCount) params.with_blocks_count = withBlocksCount;
    if (withApartmentsCount) params.with_apartments_count = withApartmentsCount;
    if (withMetersCount) params.with_meters_count = withMetersCount;
    if (complexId) params.id = complexId;
    if (companyId) params.company_id = companyId; // Adicionar companyId aos parâmetros
    if (nameQuery) params.search = nameQuery;
    if (documentCompany) params.documentCompany = documentCompany;
    if (withCompany) params.with_company = withCompany;
    if (socialNames && socialNames.length > 0) params.socialNames = JSON.stringify(socialNames);
    if (onlyWithReservoirs) params.onlyWithReservoirs = onlyWithReservoirs;
    if (take) params.take = take;
    if (skip) params.skip = skip;

    const response = await axios.get(`${NEXT_PUBLIC_API_URL}/user/complexes`, { params });
    return response.data;
  } catch (error) {
    console.error('Error fetching complexes:', error);
    const status = (error as any)?.response?.status;
    // Fallback resiliente: em caso de 5xx no endpoint de complexos, usa /api/apuracao
    // para manter comboboxes e filtros operacionais.
    if (status && status < 500) {
      throw error;
    }
    try {
      const fallback = await axios.get(`${NEXT_PUBLIC_API_URL}/apuracao`, {
        params: {
          search: nameQuery,
          complexId: complexId || id,
          take,
          skip,
        }
      });
      const list = (fallback.data?.list || []).map((item: any) => ({
        id: item.id,
        socialName: item.socialName,
        aliasName: item.aliasName ?? null,
        status: item.status ?? 'Ativo',
        city: item.city ?? null,
        state: item.state ?? null,
        companyId: companyId ?? null,
        _count: { blocks: item.totalBlocks ?? 0 },
        blocks: (withApartmentsCount || withMetersCount)
          ? [{
              id: `virtual-${item.id}`,
              name: 'Resumo',
              complexId: item.id,
              _count: { apartments: item.totalApartments ?? 0 },
              apartments: withMetersCount ? [{
                id: `virtual-apt-${item.id}`,
                name: 'Resumo',
                blockId: `virtual-${item.id}`,
                _count: { meters: item.totalMeters ?? 0 }
              }] : []
            }]
          : [],
      }));
      return {
        list,
        totalCount: fallback.data?.totalCount ?? list.length,
      };
    } catch (fallbackError) {
      console.error('Fallback /api/apuracao for complexes also failed:', fallbackError);
      throw error;
    }
  }
};

export const createComplex = async (complexData: any) => {
  try {
    const response = await axios.post(`${NEXT_PUBLIC_API_URL}/user/complexes`, complexData);
    return response.data;
  } catch (error) {
    console.error('Error creating complex:', error);
    throw error;
  }
}

export const updateComplex = async (complexId: string, complexData: any) => {
  try {
    const response = await axios.put(`${NEXT_PUBLIC_API_URL}/user/complexes/${complexId}`, complexData);
    return response.data;
  } catch (error) {
    console.error('Error updating complex:', error);
    throw error;
  }
}

export const deleteComplex = async (complexId: string) => {
  try {
    const response = await axios.delete(`${NEXT_PUBLIC_API_URL}/user/complexes/${complexId}`);
    return response.data;
  } catch (error) {
    console.error('Error deleting complex:', error);
    throw error;
  }
}