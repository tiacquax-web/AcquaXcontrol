interface OrganizationVaultS3Credentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}

interface CachedVaultCredentials {
  credentials: OrganizationVaultS3Credentials;
  expiresAt: number;
}

const vaultCredentialsCache = new Map<string, CachedVaultCredentials>();

function buildVaultCredentialsUrl(baseUrl: string, organizationId: string, vaultId: string): string {
  const template =
    process.env.ORGANIZATION_VAULT_CREDENTIALS_PATH_TEMPLATE ||
    '/api/v1/organizations/{organizationId}/vaults/{vaultId}/credentials/aws-s3';

  const path = template
    .replace('{organizationId}', encodeURIComponent(organizationId))
    .replace('{vaultId}', encodeURIComponent(vaultId));

  return `${baseUrl.replace(/\/+$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
}

function pickFirstString(values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim() !== '') {
      return value.trim();
    }
  }
  return undefined;
}

function parseVaultCredentials(payload: any): OrganizationVaultS3Credentials {
  const candidates = [payload, payload?.data, payload?.credentials, payload?.secret];

  const accessKeyId = pickFirstString(
    candidates.map((item) => item?.accessKeyId).concat(candidates.map((item) => item?.awsAccessKeyId)),
  );
  const secretAccessKey = pickFirstString(
    candidates
      .map((item) => item?.secretAccessKey)
      .concat(candidates.map((item) => item?.awsSecretAccessKey)),
  );
  const sessionToken = pickFirstString(
    candidates.map((item) => item?.sessionToken).concat(candidates.map((item) => item?.awsSessionToken)),
  );

  if (!accessKeyId || !secretAccessKey) {
    throw new Error('Organization Vault returned invalid S3 credentials payload.');
  }

  return {
    accessKeyId,
    secretAccessKey,
    ...(sessionToken ? { sessionToken } : {}),
  };
}

function getVaultCacheTtlMs(responsePayload: any): number {
  const defaultTtlMs = Number(process.env.ORGANIZATION_VAULT_CACHE_TTL_MS || '300000');
  const expiresInSecRaw = responsePayload?.expiresIn || responsePayload?.data?.expiresIn;
  const expiresInSec = Number(expiresInSecRaw);

  if (Number.isFinite(expiresInSec) && expiresInSec > 0) {
    // Cache a bit less than token lifetime.
    return Math.max(15000, expiresInSec * 1000 - 10000);
  }

  return defaultTtlMs;
}

export async function getS3CredentialsFromOrganizationVault(params: {
  organizationId: string;
  vaultId: string;
}): Promise<OrganizationVaultS3Credentials> {
  const { organizationId, vaultId } = params;
  const cacheKey = `${organizationId}:${vaultId}`;
  const cached = vaultCredentialsCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.credentials;
  }

  const baseUrl = process.env.ORGANIZATION_VAULT_URL;
  if (!baseUrl) {
    throw new Error('ORGANIZATION_VAULT_URL is not configured.');
  }

  const timeoutMs = Number(process.env.ORGANIZATION_VAULT_TIMEOUT_MS || '10000');
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const url = buildVaultCredentialsUrl(baseUrl, organizationId, vaultId);
    const token = process.env.ORGANIZATION_VAULT_TOKEN;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      signal: controller.signal,
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error(`Organization Vault request failed with status ${response.status}.`);
    }

    const payload = await response.json();
    const credentials = parseVaultCredentials(payload);
    const ttlMs = getVaultCacheTtlMs(payload);

    vaultCredentialsCache.set(cacheKey, {
      credentials,
      expiresAt: Date.now() + ttlMs,
    });

    return credentials;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Organization Vault request timed out.');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
