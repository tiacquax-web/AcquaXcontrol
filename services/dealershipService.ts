import axiosClient from '@/services/axiosClient';


interface GetDealershipsProps {
    search?: string;
    dealershipId?: string;
    take?: number;
}

export const getDealerships = async ({ take, dealershipId, search }: GetDealershipsProps) => {
  try {
    const params: any = {};
    if (dealershipId) params.id = dealershipId;
    if (search) params.search = search;
    if (take) params.take = take;

    const response = await axiosClient.get(`user/dealerships`, { params });
    return response.data;
  } catch (error) {
    console.error('Error fetching dealerships:', error);
    throw error;
  }
};

export const createDealership = async (dealershipData: any) => {
  try {
    const response = await axiosClient.post(`user/dealerships`, dealershipData);
    return response.data;
  } catch (error) {
    console.error('Error creating dealership:', error);
    throw error;
  }
};

export const updateDealership = async (dealershipId: string, dealershipData: any) => {
  try {
    const response = await axiosClient.put(`user/dealerships/${dealershipId}`, dealershipData);
    return response.data;
  } catch (error) {
    console.error('Error updating dealership:', error);
    throw error;
  }
};

export const deleteDealership = async (dealershipId: string) => {
  try {
    const response = await axiosClient.delete(`user/dealerships/${dealershipId}`);
    return response.data;
  } catch (error) {
    console.error('Error deleting dealership:', error);
    throw error;
  }
};
