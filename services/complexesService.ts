import { PermissionableEntity } from '@prisma/client';
import axiosClient from '@/services/axiosClient';


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

    const response = await axiosClient.get(`user/complexes`, { params });
    return response.data;
  } catch (error) {
    console.error('Error fetching complexes:', error);
    throw error;
  }
};

export const createComplex = async (complexData: any) => {
  try {
    const response = await axiosClient.post(`user/complexes`, complexData);
    return response.data;
  } catch (error) {
    console.error('Error creating complex:', error);
    throw error;
  }
}

export const updateComplex = async (complexId: string, complexData: any) => {
  try {
    const response = await axiosClient.put(`user/complexes/${complexId}`, complexData);
    return response.data;
  } catch (error) {
    console.error('Error updating complex:', error);
    throw error;
  }
}

export const deleteComplex = async (complexId: string) => {
  try {
    const response = await axiosClient.delete(`user/complexes/${complexId}`);
    return response.data;
  } catch (error) {
    console.error('Error deleting complex:', error);
    throw error;
  }
}