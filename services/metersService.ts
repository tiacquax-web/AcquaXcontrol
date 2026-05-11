import { selectMeterProps } from '@/types/meter';
import axios from 'axios';

const NEXT_PUBLIC_API_URL = '/api';

interface getMetersProps {
  blockId?: string;
  search?: string;
  meterId?: string;
  take?: number;
  orderBy?: string;
  meterTypeName?: string;
  selectTypeMeter?: boolean;
  mustHaveReadings?: boolean;
  select?: selectMeterProps;
}

export const oldgetMeters = async ({ blockId, search, meterId, take = 10, orderBy, meterTypeName, mustHaveReadings, select }: getMetersProps) => {
  try {
    const params: any = {};
    if (meterId) params.meter_id = meterId;
    if (blockId) params.block_id = blockId;
    if (search) params.search = search;
    if (take) params.take = take;
    if (orderBy) params.orderBy = orderBy;
    if (meterTypeName) params.meter_type_name = meterTypeName;
    if (mustHaveReadings) params.must_have_readings = mustHaveReadings;
    if (select) params.select = JSON.stringify(select);

    const response = await axios.get(`${NEXT_PUBLIC_API_URL}/user/meters`, { params });
    return response.data;
  } catch (error) {
    console.error('Error fetching meters:', error);
    throw error;
  }
};

interface getMetersListProps {
  companyId?: string;
  complexId?: string;
  blockId?: string;
  apartmentId?: string;
  meterId?: string;
  take?: number;
  skip?: number;
  orderBy?: string;
  search?: string;
  meterTypeName?: string;
  withApartment?: boolean;
  withBlock?: boolean;
  withComplex?: boolean;
  withTypeMeter?: boolean;
  withIotLink?: boolean;
  withLastReading?: boolean;
}

export const getMeters = async ({ companyId, complexId, blockId, search, meterTypeName, apartmentId, take, skip, orderBy, meterId, withApartment, withBlock, withComplex, withTypeMeter, withIotLink, withLastReading }: getMetersListProps) => {
  try {
    const params: any = {};
    if (meterId) params.meter_id = meterId;
    if (companyId) params.company_id = companyId;
    if (blockId) params.block_id = blockId;
    if (search) params.search = search;
    if (meterTypeName) params.meter_type_name = meterTypeName;
    if (complexId) params.complex_id = complexId;
    if (apartmentId) params.apartment_id = apartmentId;
    if (take) params.take = take;
    if (skip) params.skip = skip;
    if (orderBy) params.order_by = orderBy;
    if (withApartment) params.with_apartment = withApartment;
    if (withBlock) params.with_block = withBlock;
    if (withComplex) params.with_complex = withComplex;
    if (withTypeMeter) params.with_type_meter = withTypeMeter;
    if (withIotLink) params.with_iot_link = withIotLink;
    if (withLastReading) params.with_last_reading = withLastReading;

    const response = await axios.get(`${NEXT_PUBLIC_API_URL}/user/meters`, { params });
    return response.data;
  } catch (error) {
    console.error('Error fetching meters list:', error);
    throw error;
  }
};

export const createMeter = async (meterData: any) => {
  try {
    meterData.initialReading = parseFloat(meterData.initialReading);
    meterData.yearManufacture = parseInt(meterData.yearManufacture);
    const response = await axios.post(`${NEXT_PUBLIC_API_URL}/user/meters`, meterData);
    return response.data;
  } catch (error) {
    console.error('Error creating meter:', error);
    throw error;
  }
};

export const updateMeter = async (meterId: string, meterData: any) => {
  try {
    meterData.initialReading = parseFloat(meterData.initialReading);
    meterData.yearManufacture = parseInt(meterData.yearManufacture);
    const response = await axios.put(`${NEXT_PUBLIC_API_URL}/user/meters/${meterId}`, meterData);
    return response.data;
  } catch (error) {
    console.error('Error updating meter:', error);
    throw error;
  }
};

export const deleteMeter = async (meterId: string) => {
  try {
    const response = await axios.delete(`${NEXT_PUBLIC_API_URL}/user/meters/${meterId}`);
    return response.data;
  } catch (error) {
    console.error('Error deleting meter:', error);
    throw error;
  }
};

export const createMetersFromSheet = async (rows: any[]) => {
  try {
    const response = await axios.post(
      `${NEXT_PUBLIC_API_URL}/user/meters`,
      JSON.stringify({ rows }),
      { headers: { "Content-Type": "application/json" } }
    );
    return response.data;
  } catch (error: any) {
    if (error.response && error.response.data) {
      return error.response.data;
    }
    throw error;
  }
};