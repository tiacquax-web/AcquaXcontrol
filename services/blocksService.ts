import { PermissionableEntity } from '@prisma/client';
import axios from 'axios';

const NEXT_PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL;

interface getBlocksProps {
  complexId?: string;
  nameQuery?: string;
  complexSocialName?: string;
  withComplexName?: boolean;
  blockId?: string;
  getAvailableForEntity?: PermissionableEntity;
  withMetersCount?: boolean;
  withApartmentsCount?: boolean;
  take?: number;
  skip?: number;
}

export const getBlocks = async ({ getAvailableForEntity, blockId, complexId, nameQuery, complexSocialName, withComplexName, withMetersCount, withApartmentsCount, take, skip }: getBlocksProps) => {
  try {
    const params: any = {};
    if (getAvailableForEntity) params.getAvailableForEntity = getAvailableForEntity;
    if (blockId) params.id = blockId;
    if (complexId) params.complex_id = complexId;
    if (nameQuery) params.search = nameQuery;
    if (withComplexName) params.with_complex_name = true;
    if (complexSocialName) params.complex_social_name = complexSocialName;
    if (withMetersCount) params.with_meters_count = withMetersCount;
    if (withApartmentsCount) params.with_apartments_count = withApartmentsCount;
    if (typeof take === 'number') params.take = take;
    if (typeof skip === 'number') params.skip = skip;

    const response = await axios.get(`${NEXT_PUBLIC_API_URL}/user/blocks`, { params });
    return response.data;
  } catch (error) {
    console.error('Error fetching blocks:', error);
    throw error;
  }
};

export const createBlock = async (blockData: any) => {
  try {
    const response = await axios.post(`${NEXT_PUBLIC_API_URL}/user/blocks`, blockData);
    return response.data;
  } catch (error) {
    console.error('Error creating complex:', error);
    throw error;
  }
}

export const updateBlock = async (blockId: string, blockData: any) => {
  try {
    const response = await axios.put(`${NEXT_PUBLIC_API_URL}/user/blocks/${blockId}`, blockData);
    return response.data;
  } catch (error) {
    console.error('Error updating complex:', error);
    throw error;
  }
}

export const deleteBlock = async (blockId: string) => {
  try {
    const response = await axios.delete(`${NEXT_PUBLIC_API_URL}/user/blocks/${blockId}`);
    return response.data;
  } catch (error) {
    console.error('Error deleting complex:', error);
    throw error;
  }
}

export const createBlocksFromSheet = async (blocks: Array<{ name: string; complexId: string }>) => {
  try {
    const response = await axios.post(
      `${NEXT_PUBLIC_API_URL}/user/blocks`,
      JSON.stringify(blocks),
      { headers: { 'Content-Type': 'application/json' } }
    );
    return response.data;
  } catch (error) {
    console.error('Error creating blocks from sheet:', error);
    throw error;
  }
};