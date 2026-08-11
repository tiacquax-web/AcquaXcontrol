import { NextRequest, NextResponse } from 'next/server';
import { validateUserSession } from '@/lib/users';
import { generateFilipetaPdf } from '@/lib/services/filipeta-pdf-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

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

  try {
    // Reutiliza a mesma rota de dados da Filipeta para manter filtros,
    // permissões e histórico idênticos à visualização atual.
    const dataUrl = new URL(`/api/dealership-readings/${encodeURIComponent(id)}/filipeta`, req.url);
    const incoming = req.nextUrl.searchParams;
    for (const key of ['order', 'block_id', 'apartment_id']) {
      const value = incoming.get(key);
      if (value) dataUrl.searchParams.set(key, value);
    }

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
    const pdf = await generateFilipetaPdf({
      reports: data.list,
      dealershipReading: data.dealershipReading,
      description,
      baseUrl: new URL('/', req.url).origin,
    });

    const filename = `filipetas-${data.dealershipReading?.yearRef || 'leitura'}-${String(data.dealershipReading?.monthRef || '').padStart(2, '0')}.pdf`;
    return new Response(pdf, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(pdf.byteLength),
        'Cache-Control': 'private, no-store, max-age=0',
      },
    });
  } catch (error: any) {
    console.error('[FILIPETA_PDF_ERROR]', error?.message || error);
    return NextResponse.json({ error: 'Erro ao gerar o PDF das filipetas.' }, { status: 500 });
  }
}
