import { PermissionableEntity } from '@prisma/client';
import axiosClient from '@/services/axiosClient';
import type { Apartment } from '@prisma/client';


interface getApartmentsProps {
  companyId?: string;
  complexId?: string;
  blockId?: string;
  nameQuery?: string;
  apartmentId?: string;
  getAvailableForEntity?: PermissionableEntity;
  take?: number;
  skip?: number;
  orderBy?: string;
  orderDirection?: 'asc' | 'desc';
  withBlock?: boolean;
  withComplex?: boolean;
  withCompany?: boolean;
}

export interface ApartmentWithBlockAndComplex extends Apartment {
  block: {
    id: string;
    name: string;
    complex: {
      id: string;
      socialName: string;
    } | null;
  } | null;
}

export const getApartments = async ({ getAvailableForEntity, withBlock, withCompany, withComplex, apartmentId, companyId, complexId, blockId, nameQuery, take, skip, orderBy, orderDirection }: getApartmentsProps) => {
  try {
    const params: any = {}
    if (getAvailableForEntity) params.getAvailableForEntity = getAvailableForEntity
    if (apartmentId) params.id = apartmentId
    if (companyId) params.company_id = companyId
    if (complexId) params.complex_id = complexId
    if (blockId) params.block_id = blockId
    if (nameQuery) params.search = nameQuery
    if (typeof take === 'number') params.take = take
    if (typeof skip === 'number') params.skip = skip
    if (orderBy) params.orderBy = orderBy;
    if (orderDirection) params.orderDirection = orderDirection;
    if (withBlock) params.with_block = true;
    if (withCompany) params.with_company = true;
    if (withComplex) params.with_complex = true;

    console.log("🔗 Chamando API de apartamentos com parâmetros:", params);
    
    // Não envia mais o select, pois o backend sempre inclui block e complex
    const response = await axiosClient.get(`user/apartments`, { params });
    
    console.log("📨 Resposta da API de apartamentos:", response.data);
    
    return response.data;
    return response.data;
  } catch (error) {
    console.error('Error fetching apartments:', error);
    throw error;
  }
};

export const createApartment = async (apartmentData: any) => {
  try {
    const response = await axiosClient.post(`user/apartments`, apartmentData);
    return response.data;
  } catch (error) {
    console.error('Error creating apartment:', error);
    throw error;
  }
}

export const updateApartment = async (apartmentId: string, apartmentData: any) => {
  try {
    const response = await axiosClient.put(`user/apartments/${apartmentId}`, apartmentData);
    return response.data;
  } catch (error) {
    console.error('Error updating apartment:', error);
    throw error;
  }
}

export const deleteApartment = async (apartmentId: string) => {
  try {
    const response = await axiosClient.delete(`user/apartments/${apartmentId}`);
    return response.data;
  } catch (error) {
    console.error('Error deleting apartment:', error);
    throw error;
  }
}

export const createApartmentsFromSheet = async (apartments: Array<{ name: string; blockId: string; fraction?: number; status?: string }>) => {
  try {
    const response = await axiosClient.post(
      `user/apartments`,
      JSON.stringify(apartments),
      { headers: { 'Content-Type': 'application/json' } }
    );
    return response.data;
  } catch (error) {
    console.error('Error creating apartments from sheet:', error);
    throw error;
  }
}