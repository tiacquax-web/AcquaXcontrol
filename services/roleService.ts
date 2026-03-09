import axiosClient from '@/services/axiosClient';


interface getRolesProps {
    searchQuery?: string;
    take?: number;
    skip?: number;
    orderBy?: string;
}

export const getRoles = async ({ searchQuery, take, skip, orderBy }: getRolesProps) => {
  try {
    const params: any = {};
    if (searchQuery) params.search = searchQuery;
    if (take) params.take = take;
    if (skip) params.skip = skip;
    if (orderBy) params.orderBy = orderBy;

    const response = await axiosClient.get(`user/roles`, { params });
    return response.data;
  } catch (error) {
    console.error('Error fetching role assignments:', error);
    throw error;
  }
};

export const createRole = async (roleAssignmentData: any) => {
  try {
    const response = await axiosClient.post(`user/roles`, roleAssignmentData);
    return response.data;
  } catch (error) {
    console.error('Error creating user:', error);
    throw error;
  }
};

export const updateRole = async (userId: string, roleAssignmentData: any) => {
  try {
    const response = await axiosClient.put(`user/roles/${userId}`, roleAssignmentData);
    return response.data;
  } catch (error) {
    console.error('Error updating user:', error);
    throw error;
  }
};

export const deleteRole = async (roleAssignmentId: string) => {
  try {
    const response = await axiosClient.delete(`user/roles/${roleAssignmentId}`);
    return response.data;
  } catch (error) {
    console.error('Error deleting role assignment:', error);
    throw error;
  }
};
