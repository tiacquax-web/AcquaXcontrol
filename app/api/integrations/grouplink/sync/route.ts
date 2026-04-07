import { NextRequest, NextResponse } from 'next/server';
import { validateUserSession } from '@/lib/users';
import { GroupLinkMqttService } from '@/lib/services/grouplink-mqtt-service';

function isAuthorizedByCronSecret(req: NextRequest): boolean {
  const expected = process.env.GROUPLINK_SYNC_SECRET?.trim();
  if (!expected) return false;
  const provided =
    req.headers.get('x-grouplink-sync-secret')?.trim() ||
    req.nextUrl.searchParams.get('secret')?.trim() ||
    '';
  return provided.length > 0 && provided === expected;
}

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const authorizedBySecret = isAuthorizedByCronSecret(req);

    let initiatedByUserId: string | undefined;
    if (!authorizedBySecret) {
      const session = await validateUserSession(req);
      if (!session.userId) {
        return NextResponse.json(
          {
            error:
              'Não autorizado. Use sessão autenticada ou x-grouplink-sync-secret válido.',
          },
          { status: 401 },
        );
      }
      initiatedByUserId = session.userId;
    }

    const body = await req.json().catch(() => ({}));
    const dryRun = Boolean(body?.dryRun);
    const topicOverride = typeof body?.topic === 'string' ? body.topic : undefined;
    const topicsOverride = Array.isArray(body?.topics)
      ? body.topics.filter((topic: unknown): topic is string => typeof topic === 'string')
      : undefined;

    const result = await GroupLinkMqttService.syncOnce({
      initiatedByUserId,
      dryRun,
      topicOverride,
      topicsOverride,
    });

    return NextResponse.json(
      {
        message: 'Sincronização Group Link finalizada',
        data: result,
      },
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Falha na sincronização Group Link',
        details: error instanceof Error ? error.message : 'Erro desconhecido',
      },
      { status: 500 },
    );
  }
}
