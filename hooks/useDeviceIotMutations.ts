import { useState } from "react";
import { createDeviceIot, updateDeviceIot, deleteDeviceIot, runDevicesBulkAction, importDevicesByChassi } from "@/services/devicesIotService";
import type { IotDevice } from "@prisma/client";


export function useDeviceIotMutations(onChange?: () => void) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  async function createDevice(device: Partial<IotDevice>) {
    setIsLoading(true);
    setError(null);
    try {
      await createDeviceIot(device);
      onChange?.();
    } catch (err: any) {
      setError(err);
    } finally {
      setIsLoading(false);
    }
  }

  async function updateDevice(device: Partial<IotDevice>) {
    setIsLoading(true);
    setError(null);
    try {
      await updateDeviceIot(device);
      onChange?.();
    } catch (err: any) {
      setError(err);
    } finally {
      setIsLoading(false);
    }
  }

  async function deleteDevice(id: string) {
    setIsLoading(true);
    setError(null);
    try {
      await deleteDeviceIot(id);
      onChange?.();
    } catch (err: any) {
      setError(err);
    } finally {
      setIsLoading(false);
    }
  }

  async function bulkAction(payload: {
    action: 'delete_selected' | 'set_pilot_mode' | 'unlink_selected' | 'reprocess_selected' | 'cleanup_unlinked';
    ids?: string[];
    deviceIds?: string[];
    pilotMode?: boolean;
    onlyPilot?: boolean;
    onlyWithoutReadings?: boolean;
    olderThanDays?: number;
    confirmationText?: string;
  }) {
    setIsLoading(true);
    setError(null);
    try {
      const result = await runDevicesBulkAction(payload);
      onChange?.();
      return result;
    } catch (err: any) {
      setError(err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }

  async function importByChassi(payload: {
    rows: Array<{ device_id: string; chassi: string; pilotMode?: boolean }>;
    pilotMode?: boolean;
    pilotComplexId?: string;
    updateExisting?: boolean;
  }) {
    setIsLoading(true);
    setError(null);
    try {
      const result = await importDevicesByChassi(payload);
      onChange?.();
      return result;
    } catch (err: any) {
      setError(err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }

  return { createDevice, updateDevice, deleteDevice, bulkAction, importByChassi, isLoading, error };
}
