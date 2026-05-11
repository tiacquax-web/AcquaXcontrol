import { StorageIntegration, StorageProvider, StorageIntegrationStatus } from '@prisma/client';
import prisma from '@/lib/prisma';

export type ActiveStorageIntegration = Pick<
  StorageIntegration,
  'id' | 'companyId' | 'provider' | 'vaultId' | 'bucket' | 'region' | 'path' | 'status'
>;

function normalizePathPrefix(path?: string | null): string {
  if (!path) return '';
  return path.replace(/^\/+|\/+$/g, '');
}

function toActiveIntegration(integration: StorageIntegration): ActiveStorageIntegration {
  return {
    id: integration.id,
    companyId: integration.companyId,
    provider: integration.provider,
    vaultId: integration.vaultId,
    bucket: integration.bucket,
    region: integration.region,
    path: normalizePathPrefix(integration.path),
    status: integration.status,
  };
}

export async function getActiveStorageIntegrationByCompanyId(
  companyId: string,
  provider: StorageProvider = StorageProvider.aws_s3,
): Promise<ActiveStorageIntegration | null> {
  const integration = await prisma.storageIntegration.findFirst({
    where: {
      companyId,
      provider,
      status: StorageIntegrationStatus.active,
      deletedAt: null,
    },
    orderBy: { updatedAt: 'desc' },
  });

  return integration ? toActiveIntegration(integration) : null;
}

export async function getCompanyIdByMeterId(meterId: string): Promise<string | null> {
  const meter = await prisma.meter.findUnique({
    where: { id: meterId },
    select: {
      companyId: true,
      apartment: {
        select: {
          companyId: true,
          block: {
            select: {
              companyId: true,
              complex: { select: { companyId: true } },
            },
          },
        },
      },
    },
  });

  return (
    meter?.companyId ||
    meter?.apartment?.companyId ||
    meter?.apartment?.block?.companyId ||
    meter?.apartment?.block?.complex?.companyId ||
    null
  );
}

export async function getActiveStorageIntegrationByMeterId(
  meterId: string,
  provider: StorageProvider = StorageProvider.aws_s3,
): Promise<ActiveStorageIntegration | null> {
  const companyId = await getCompanyIdByMeterId(meterId);
  if (!companyId) return null;
  return getActiveStorageIntegrationByCompanyId(companyId, provider);
}

export async function getActiveStorageIntegrationsByMeterIds(
  meterIds: string[],
  provider: StorageProvider = StorageProvider.aws_s3,
): Promise<
  Map<
    string,
    Pick<ActiveStorageIntegration, 'companyId' | 'provider' | 'status' | 'bucket' | 'region' | 'path'>
  >
> {
  if (meterIds.length === 0) return new Map();

  const meters = await prisma.meter.findMany({
    where: {
      id: { in: meterIds },
      deletedAt: null,
    },
    select: {
      id: true,
      companyId: true,
      apartment: {
        select: {
          companyId: true,
          block: {
            select: {
              companyId: true,
              complex: { select: { companyId: true } },
            },
          },
        },
      },
    },
  });

  const meterToCompany = new Map<string, string>();
  const companyIds = new Set<string>();

  for (const meter of meters) {
    const companyId =
      meter.companyId ||
      meter.apartment?.companyId ||
      meter.apartment?.block?.companyId ||
      meter.apartment?.block?.complex?.companyId ||
      null;

    if (!companyId) continue;
    meterToCompany.set(meter.id, companyId);
    companyIds.add(companyId);
  }

  if (companyIds.size === 0) return new Map();

  const integrations = await prisma.storageIntegration.findMany({
    where: {
      companyId: { in: Array.from(companyIds) },
      provider,
      status: StorageIntegrationStatus.active,
      deletedAt: null,
    },
    orderBy: { updatedAt: 'desc' },
  });

  const companyToIntegration = new Map<string, ActiveStorageIntegration>();
  for (const integration of integrations) {
    if (companyToIntegration.has(integration.companyId)) continue;
    companyToIntegration.set(integration.companyId, toActiveIntegration(integration));
  }

  const byMeterId = new Map<
    string,
    Pick<ActiveStorageIntegration, 'companyId' | 'provider' | 'status' | 'bucket' | 'region' | 'path'>
  >();

  for (const [meterId, companyId] of meterToCompany.entries()) {
    const integration = companyToIntegration.get(companyId);
    if (!integration) continue;
    byMeterId.set(meterId, {
      companyId: integration.companyId,
      provider: integration.provider,
      status: integration.status,
      bucket: integration.bucket,
      region: integration.region,
      path: integration.path,
    });
  }

  return byMeterId;
}
