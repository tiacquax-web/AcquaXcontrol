import { PermissionableEntity } from '@prisma/client';
import axiosClient from '@/services/axiosClient';


interface getCompaniesProps {
    nameQuery?: string;
    documentCompany?: string;
    companyId?: string;
    getAvailableForEntity?: PermissionableEntity;
    id?: string;
}

export const getCompanies = async ({ getAvailableForEntity, companyId, nameQuery, documentCompany, id }: getCompaniesProps) => {
  try {
    const params: any = {};
    if (id) params.id = id;
    if (getAvailableForEntity) params.getAvailableForEntity = getAvailableForEntity;
    if (companyId) params.id = companyId;
    if (nameQuery) params.search = nameQuery;
    if (documentCompany) params.document_company = documentCompany;

    const response = await axiosClient.get(`user/companies`, { params });
    return response.data;
  } catch (error) {
    console.error('Error fetching companies:', error);
    throw error;
  }
};

export const createCompany = async (companyData: any) => {
  try {
    const response = await axiosClient.post(`user/companies`, companyData);
    return response.data;
  } catch (error) {
    console.error('Error creating company:', error);
    throw error;
  }
}

export const updateCompany = async (companyId: string, companyData: any) => {
  try {
    const response = await axiosClient.put(`user/companies/${companyId}`, companyData);
    return response.data;
  } catch (error) {
    console.error('Error updating company:', error);
    throw error;
  }
}

export const deleteCompany = async (companyId: string) => {
  try {
    const response = await axiosClient.delete(`user/companies/${companyId}`);
    return response.data;
  } catch (error) {
    console.error('Error deleting company:', error);
    throw error;
  }
}