import { ContextType } from '@prisma/client';
import axios from 'axios';

const NEXT_PUBLIC_API_URL = '/api';

interface getUsersProps {
    searchQuery?: string;
    documentUser?: string;
    userId?: string;
    roleName?: string;
    contextType?: ContextType;
    contextId?: string;
    take?: number;
    skip?: number;
}

export const getUsers = async ({ userId, searchQuery, documentUser, roleName, contextType, contextId, take = 10, skip = 0 }: getUsersProps) => {
  try {
    const params: any = {};
    if (searchQuery) params.search = searchQuery;
    if (documentUser) params.documentUser = documentUser;
    if (userId) params.user_id = userId;
    if (roleName) params.role_name = roleName;
    if (contextType) params.role_context_type = contextType;
    if (contextId) params.role_context_id = contextId;
    if (take) params.take = take;
    if (skip) params.skip = skip;

    const response = await axios.get(`${NEXT_PUBLIC_API_URL}/user/users`, { params });
    return response.data;
  } catch (error) {
    console.error('Error fetching users:', error);
    throw error;
  }
};

export const createUser = async (userData: any) => {
  try {
    const response = await axios.post(`${NEXT_PUBLIC_API_URL}/user/users`, userData);
    return response.data;
  } catch (error) {
    console.error('Error creating user:', error);
    throw error;
  }
};

export const updateUser = async (userId: string, userData: any) => {
  try {
    const response = await axios.put(`${NEXT_PUBLIC_API_URL}/user/users/${userId}`, userData);
    return response.data;
  } catch (error) {
    console.error('Error updating user:', error);
    throw error;
  }
};

export const deleteUser = async (userId: string) => {
  try {
    const response = await axios.delete(`${NEXT_PUBLIC_API_URL}/user/users/${userId}`);
    return response.data;
  } catch (error) {
    console.error('Error deleting user:', error);
    throw error;
  }
};

export const createBulkUsersForComplex = async ({
  complexId,
  userNamePrefix,
  userPasswordPrefix,
  userEmailPrefix,
  userEmailDomain
}: {
  complexId: string;
  userNamePrefix: string;
  userPasswordPrefix: string;
  userEmailPrefix: string;
  userEmailDomain: string;
}) => {
  try {
    const response = await axios.post(`${NEXT_PUBLIC_API_URL}/user/users`, {
      createBulkUsersForComplex: true,
      complexId,
      userNamePrefix,
      userPasswordPrefix,
      userEmailPrefix,
      userEmailDomain
    });
    return response.data;
  } catch (error) {
    console.error('Error creating bulk users for complex:', error);
    throw error;
  }
};

interface ExportUsersProps {
  search?: string;
  userIds?: string[];
}

export const exportUsers = async ({ search, userIds = [] }: ExportUsersProps) => {
  try {
    const response = await axios.post(`${NEXT_PUBLIC_API_URL}/user/users/export`, {
      search,
      userIds
    }, {
      responseType: 'blob' // Importante para receber arquivo binário
    });

    // Criar URL do blob para download
    const blob = new Blob([response.data], { 
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
    });
    const url = window.URL.createObjectURL(blob);
    
    // Definir nome do arquivo
    const fileName = `usuarios_${new Date().toISOString().split('T')[0]}.xlsx`;
    
    // Criar elemento temporário para download
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Limpar URL do blob
    window.URL.revokeObjectURL(url);

    return { success: true };
  } catch (error) {
    console.error('Error exporting users:', error);
    throw error;
  }
};
