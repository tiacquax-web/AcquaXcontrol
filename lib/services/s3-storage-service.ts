import { Readable } from 'stream';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { StorageProvider } from '@prisma/client';
import { getS3CredentialsFromOrganizationVault } from '@/lib/services/organization-vault-service';
import {
  getActiveStorageIntegrationByCompanyId,
  type ActiveStorageIntegration,
} from '@/lib/services/storage-integration-service';

function joinS3Key(pathPrefix: string | null | undefined, objectPath: string): string {
  const normalizedPrefix = (pathPrefix || '').replace(/^\/+|\/+$/g, '');
  const normalizedPath = objectPath.replace(/^\/+/, '');
  return normalizedPrefix ? `${normalizedPrefix}/${normalizedPath}` : normalizedPath;
}

function buildS3PublicUrl(bucket: string, region: string, key: string): string {
  const encodedKey = key
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
  const host = region === 'us-east-1' ? `${bucket}.s3.amazonaws.com` : `${bucket}.s3.${region}.amazonaws.com`;
  return `https://${host}/${encodedKey}`;
}

function createS3Client(region: string, credentials: { accessKeyId: string; secretAccessKey: string; sessionToken?: string }) {
  return new S3Client({
    region,
    credentials,
  });
}

async function bodyToBuffer(body: any): Promise<Buffer> {
  if (!body) return Buffer.from('');

  if (typeof body.transformToByteArray === 'function') {
    const bytes = await body.transformToByteArray();
    return Buffer.from(bytes);
  }

  if (body instanceof Readable) {
    const chunks: Buffer[] = [];
    for await (const chunk of body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  if (body instanceof Uint8Array) {
    return Buffer.from(body);
  }

  throw new Error('Unsupported S3 object body type.');
}

async function resolveS3ClientForCompany(companyId: string): Promise<{
  integration: ActiveStorageIntegration;
  client: S3Client;
}> {
  const integration = await getActiveStorageIntegrationByCompanyId(companyId, StorageProvider.aws_s3);
  if (!integration) {
    throw new Error(`Active S3 integration not found for company ${companyId}.`);
  }

  const credentials = await getS3CredentialsFromOrganizationVault({
    organizationId: companyId,
    vaultId: integration.vaultId,
  });

  const client = createS3Client(integration.region, credentials);
  return { integration, client };
}

export async function uploadFileToCompanyS3(params: {
  companyId: string;
  objectPath: string;
  body: Buffer | Uint8Array | string;
  contentType: string;
  contentDisposition?: string;
  cacheControl?: string;
  metadata?: Record<string, string>;
}): Promise<{
  bucket: string;
  region: string;
  key: string;
  url: string;
}> {
  const { companyId, objectPath, body, contentType, contentDisposition, cacheControl, metadata } = params;
  const { integration, client } = await resolveS3ClientForCompany(companyId);
  const key = joinS3Key(integration.path, objectPath);

  await client.send(
    new PutObjectCommand({
      Bucket: integration.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      ...(contentDisposition ? { ContentDisposition: contentDisposition } : {}),
      ...(cacheControl ? { CacheControl: cacheControl } : {}),
      ...(metadata ? { Metadata: metadata } : {}),
    }),
  );

  return {
    bucket: integration.bucket,
    region: integration.region,
    key,
    url: buildS3PublicUrl(integration.bucket, integration.region, key),
  };
}

export async function readFileFromCompanyS3(params: {
  companyId: string;
  objectPath: string;
}): Promise<{
  content: Buffer;
  contentType: string | undefined;
  contentLength: number | undefined;
  etag: string | undefined;
}> {
  const { companyId, objectPath } = params;
  const { integration, client } = await resolveS3ClientForCompany(companyId);
  const key = joinS3Key(integration.path, objectPath);
  const response = await client.send(
    new GetObjectCommand({
      Bucket: integration.bucket,
      Key: key,
    }),
  );

  return {
    content: await bodyToBuffer(response.Body),
    contentType: response.ContentType,
    contentLength: response.ContentLength,
    etag: response.ETag,
  };
}

export function extractObjectPathFromS3Url(params: {
  companyIntegrationPath: string | null | undefined;
  url: string;
}): string | null {
  const { companyIntegrationPath, url } = params;
  try {
    const parsedUrl = new URL(url);
    const keyFromUrl = decodeURIComponent(parsedUrl.pathname.replace(/^\/+/, ''));
    const prefix = (companyIntegrationPath || '').replace(/^\/+|\/+$/g, '');

    if (!prefix) return keyFromUrl;
    if (!keyFromUrl.startsWith(`${prefix}/`) && keyFromUrl !== prefix) return null;

    return keyFromUrl.slice(prefix.length).replace(/^\/+/, '');
  } catch {
    return null;
  }
}
