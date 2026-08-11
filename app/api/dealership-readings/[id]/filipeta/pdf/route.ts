import { NextRequest, NextResponse } from 'next/server';
import { PutObjectCommand, S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { validateUserSession } from '@/lib/users';
import { generateFilipetaPdf } from '@/lib/services/filipeta-pdf-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

let pdfS3Client: S3Client | null = null;

function getPdfStorageConfig() {
  const region = process.env.FILIPETA_PDF_S3_REGION || process.env.GL_S3_REGION;
  const bucket = process.env.FILIPETA_PDF_S3_BUCKET || process.env.GL_S3_BUCKET;
  const accessKeyId = process.env.FILIPETA_PDF_S3_ACCESS_KEY_ID
    || process.env.GL_S3_ACCESS_KEY_ID
    || process.env.GL_ACESS_KEY_ID;
  const secretAccessKey = process.env.FILIPETA_PDF_S3_SECRET_ACCESS_KEY
    || process.env.GL_S3_SECRET_ACCESS_KEY
    || process.env.GL_S3_SECRET_ACESS_KEY;

  if (!region || !bucket || !accessKeyId || !secretAccessKey) {
    throw new Error('Configuração S3 para PDF ausente. Configure FILIPETA_PDF_S3_* ou reutilize as credenciais GL_S3_* com permissão de escrita.');
  }

  if (!pdfS3Client) {
    pdfS3Client = new S3Client({ region, credentials: { accessKeyId, secretAccessKey } });
  }

  return { region, bucket, client: pdfS3Client };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { userId, error: sessionError } = await validateUserSession(req);
  if (sessionError || !userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: 'Dealership reading id is required' }, { status: 400 });
  }

  let stage = 'validar dados da Filipeta';

  try {
    // Reutiliza a mesma rota de dados da Filipeta para manter filtros,
    // permissões e histórico idênticos à visualização atual.
    const dataUrl = new URL(`/api/dealership-readings/${encodeURIComponent(id)}/filipeta`, req.url);
    const incoming = req.nextUrl.searchParams;
    for (const key of ['order', 'block_id', 'apartment_id']) {
      const value = incoming.get(key);
      if (value) dataUrl.searchParams.set(key, value);
    }

    stage = 'carregar dados da Filipeta';
    const dataResponse = await fetch(dataUrl, {
      method: 'GET',
      headers: {
        ...(req.headers.get('cookie') ? { cookie: req.headers.get('cookie')! } : {}),
        ...(req.headers.get('authorization') ? { authorization: req.headers.get('authorization')! } : {}),
      },
      cache: 'no-store',
    });

    const data = await dataResponse.json();
    if (!dataResponse.ok) {
      return NextResponse.json(
        { error: data?.error || 'Não foi possível carregar os dados da filipeta.' },
        { status: dataResponse.status },
      );
    }

    if (!Array.isArray(data.list) || data.list.length === 0) {
      return NextResponse.json({ error: 'Nenhum relatório de apartamento encontrado para esta leitura.' }, { status: 404 });
    }

    const description = incoming.get('description');
    stage = 'gerar PDF';
    const pdf = await generateFilipetaPdf({
      reports: data.list,
      dealershipReading: data.dealershipReading,
      description,
      baseUrl: new URL('/', req.url).origin,
    });

    const filename = `filipetas-${data.dealershipReading?.yearRef || 'leitura'}-${String(data.dealershipReading?.monthRef || '').padStart(2, '0')}.pdf`;
    stage = 'configurar armazenamento S3';
    const storage = getPdfStorageConfig();
    const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '');
    const key = `exports/filipetas/${userId}/${safeId}-${Date.now()}.pdf`;

    stage = 'enviar PDF ao S3';
    await storage.client.send(new PutObjectCommand({
      Bucket: storage.bucket,
      Key: key,
      Body: pdf,
      ContentType: 'application/pdf',
      ContentDisposition: `attachment; filename="${filename}"`,
      CacheControl: 'private, max-age=3600',
    }));

    stage = 'criar link temporário';
    const downloadUrl = await getSignedUrl(
      storage.client,
      new GetObjectCommand({
        Bucket: storage.bucket,
        Key: key,
        ResponseContentType: 'application/pdf',
        ResponseContentDisposition: `attachment; filename="${filename}"`,
      }),
      { expiresIn: 3600 },
    );

    return NextResponse.json({
      success: true,
      filename,
      size: pdf.byteLength,
      expiresIn: 3600,
      downloadUrl,
    }, {
      status: 200,
      headers: { 'Cache-Control': 'private, no-store, max-age=0' },
    });
  } catch (error: any) {
    const errorName = error?.name || error?.Code || 'ErroDesconhecido';
    const rawMessage = error?.message || String(error);
    const safeMessage = rawMessage.length > 240 ? `${rawMessage.slice(0, 237)}...` : rawMessage;
    console.error('[FILIPETA_PDF_ERROR]', { stage, errorName, message: rawMessage, stack: error?.stack });
    return NextResponse.json({
      error: `Falha ao ${stage}.`,
      detail: `${errorName}: ${safeMessage}`,
    }, { status: 500 });
  }
}
