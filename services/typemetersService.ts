import axiosClient from '@/services/axiosClient';


interface GetTypeMetersProps {
    nameQuery?: string;
    acronymQuery?: string;
    typeMeterId?: string;
}

export const getTypeMeters = async ({ typeMeterId, nameQuery, acronymQuery }: GetTypeMetersProps) => {
  try {
    const params: any = {};
    if (typeMeterId) params.id = typeMeterId;
    if (nameQuery) params.search = nameQuery;
    if (acronymQuery) params.acronym = acronymQuery;

    const response = await axiosClient.get(`user/type-meters`, { params });
    return response.data;
  } catch (error) {
    console.error('Error fetching type meters:', error);
    throw error;
  }
};

export const createTypeMeter = async (typeMeterData: any) => {
  try {
    const response = await axiosClient.post(`user/type-meters`, typeMeterData);
    return response.data;
  } catch (error) {
    console.error('Error creating type meter:', error);
    throw error;
  }
};

export const updateTypeMeter = async (typeMeterId: string, typeMeterData: any) => {
  try {
    const response = await axiosClient.put(`user/type-meters/${typeMeterId}`, typeMeterData);
    return response.data;
  } catch (error) {
    console.error('Error updating type meter:', error);
    throw error;
  }
};

export const deleteTypeMeter = async (typeMeterId: string) => {
  try {
    const response = await axiosClient.delete(`user/type-meters/${typeMeterId}`);
    return response.data;
  } catch (error) {
    console.error('Error deleting type meter:', error);
    throw error;
  }
};