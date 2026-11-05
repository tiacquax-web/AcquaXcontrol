/**
 * Armazenamento das fotos de medidor no CDN (Cloudflare -> Backblaze B2).
 *
 * As fotos ficam em https://cdn.acquaxcontrol.com.br/<COMPLEXO>/<ANO>/<MM - Mes>/Fotos/<unidade>.jpg
 * e o link e gravado em Reading.urlCover. Este modulo sobe o arquivo para o mesmo
 * caminho (sobrescrevendo a foto existente, mantendo o link) e devolve a URL publica.
 *
 * Varaveis de ambiente (Backblaze B2, API compativel com S3):
 *   B2_KEY_ID, B2_APP_KEY, B2_BUCKET, B2_REGION, B2_ENDPOINT (opcional)
 */

import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';

export const CDN_HOST = 'cdn.acquaxcontrol.com.br';
export const CDN_ORIGIN = `https://${CDN_HOST}`;

const MONTHS_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

export function monthFolder(month: string): string {
  const n = Number(month);
  const name = MONTHS_PT[n - 1] ?? '';
  return `${String(n).padStart(2, '0')} - ${name}`;
}

export function isPhotoStorageConfigured(): boolean {
  return Boolean(process.env.B2_KEY_ID && process.env.B2_APP_KEY && process.env.B2_BUCKET);
}

let client: S3Client | null = null;

function getClient(): S3Client {
  if (!isPhotoStorageConfigured()) {
    throw new Error('Armazenamento de fotos nao configurado (B2_KEY_ID / B2_APP_KEY / B2_BUCKET).');
  }
  if (!client) {
    const endpoint = process.env.B2_ENDPOINT || 'https://s3.us-west-004.backblazeb2.com';
    const parts = endpoint.replace(/^https?:\/\//, '').split('.');
    const region = process.env.B2_REGION || parts[1] || 'us-west-004';
    client = new S3Client({
      region,
      endpoint,
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.B2_KEY_ID!,
        secretAccessKey: process.env.B2_APP_KEY!,
      },
    });
  }
  return client;
}

/** Extrai a chave (caminho no bucket) de uma URL do CDN. Retorna null se nao for do CDN. */
export function keyFromCdnUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.host !== CDN_HOST) return null;
    return decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
  } catch {
    return null;
  }
}

/** Monta a URL publica a partir da chave. */
export function urlFromKey(key: string): string {
  const encoded = encodeURI(key).replace(/#/g, '%23');
  return `${CDN_ORIGIN}/${encoded}`;
}

/** Chave para uma foto nova (unidade sem foto no mes). */
export function buildKeyForNew(params: {
  complexName: string;
  year: string;
  month: string;
  unit: string;
  ext?: string;
}): string {
  const { complexName, year, month, unit } = params;
  const folder = complexName.trim().toUpperCase();
  const ext = (params.ext || 'jpg').replace(/^\./, '').toLowerCase();
  return `${folder}/${year}/${monthFolder(month)}/Fotos/${unit}.${ext}`;
}

/** Sobe (ou sobrescreve) o arquivo no bucket e devolve a URL publica. */
export async function putPhoto(key: string, body: Buffer, contentType = 'image/jpeg'): Promise<string> {
  await getClient().send(
    new PutObjectCommand({
      Bucket: process.env.B2_BUCKET!,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: 'public, max-age=3600',
    }),
  );
  return urlFromKey(key);
}

/** Verifica se o objeto existe no bucket (diagnostico). */
export async function photoExists(key: string): Promise<boolean> {
  try {
    await getClient().send(new HeadObjectCommand({ Bucket: process.env.B2_BUCKET!, Key: key }));
    return true;
  } catch {
    return false;
  }
}
