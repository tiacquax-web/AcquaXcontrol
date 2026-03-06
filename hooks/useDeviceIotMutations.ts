import { useState } from "react";
import { createDeviceIot, updateDeviceIot, deleteDeviceIot } from "@/services/devicesIotService";
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

  return { createDevice, updateDevice, deleteDevice, isLoading, error };
}
