import { PermissionableEntity } from '@prisma/client';
import axios from 'axios';

const NEXT_PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL;

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

    const response = await axios.get(`${NEXT_PUBLIC_API_URL}/user/companies`, { params });
    return response.data;
  } catch (error) {
    console.error('Error fetching companies:', error);
    throw error;
  }
};

export const createCompany = async (companyData: any) => {
  try {
    const response = await axios.post(`${NEXT_PUBLIC_API_URL}/user/companies`, companyData);
    return response.data;
  } catch (error) {
    console.error('Error creating company:', error);
    throw error;
  }
}

export const updateCompany = async (companyId: string, companyData: any) => {
  try {
    const response = await axios.put(`${NEXT_PUBLIC_API_URL}/user/companies/${companyId}`, companyData);
    return response.data;
  } catch (error) {
    console.error('Error updating company:', error);
    throw error;
  }
}

export const deleteCompany = async (companyId: string) => {
  try {
    const response = await axios.delete(`${NEXT_PUBLIC_API_URL}/user/companies/${companyId}`);
    return response.data;
  } catch (error) {
    console.error('Error deleting company:', error);
    throw error;
  }
}