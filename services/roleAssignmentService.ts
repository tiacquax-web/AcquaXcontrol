import axios from 'axios';

const NEXT_PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL;

interface getRoleAssignmentsProps {
    withUser?: boolean;
    withRole?: boolean;
    withContext?: boolean;
    searchQuery?: string;
    userId?: string;
    roleId?: string;
    userName?: string;
    roleName?: string;
}

export const getRoleAssignments = async ({ withUser, withRole, withContext, searchQuery, userId, roleId, userName, roleName }: getRoleAssignmentsProps) => {
  try {
    const params: any = {};
    if (withUser) params.with_user = withUser;
    if (withRole) params.with_role = withRole;
    if (withContext) params.with_context = withContext;
    if (searchQuery) params.search = searchQuery;
    if (userId) params.user_id = userId;
    if (roleId) params.role_id = userId;
    if (userName) params.user_name = roleId;
    if (roleName) params.role_name = roleId;

    const response = await axios.get(`${NEXT_PUBLIC_API_URL}/user/role-assignments`, { params });
    return response.data;
  } catch (error) {
    console.error('Error fetching role assignments:', error);
    throw error;
  }
};

export const createRoleAssignment = async (roleAssignmentData: any) => {
  try {
    const response = await axios.post(`${NEXT_PUBLIC_API_URL}/user/role-assignments`, roleAssignmentData);
    return response.data;
  } catch (error) {
    console.error('Error creating user:', error);
    throw error;
  }
};

export const updateRoleAssignment = async (userId: string, roleAssignmentData: any) => {
  try {
    const response = await axios.put(`${NEXT_PUBLIC_API_URL}/user/role-assignments/${userId}`, roleAssignmentData);
    return response.data;
  } catch (error) {
    console.error('Error updating user:', error);
    throw error;
  }
};

export const deleteRoleAssignment = async (roleAssignmentId: string) => {
  try {
    const response = await axios.delete(`${NEXT_PUBLIC_API_URL}/user/role-assignments/${roleAssignmentId}`);
    return response.data;
  } catch (error) {
    console.error('Error deleting role assignment:', error);
    throw error;
  }
};
