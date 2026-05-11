import { NextRequest } from 'next/server';
import { validateUserSession } from '@/lib/users';
import { getUserContexts } from '@/lib/userContexts';

export interface AdminAuthResult {
  ok: boolean;
  userId?: string;
  isSystem?: boolean;
  companyIds?: string[];
  status?: number;
  error?: string;
}

export async function requireAdminOrCompanyContext(req: NextRequest): Promise<AdminAuthResult> {
  const { userId, error: sessionError } = await validateUserSession(req);
  if (sessionError || !userId) {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }

  const contexts = await getUserContexts(userId);
  const canOperate = contexts.system || contexts.companyIds.length > 0;
  if (!canOperate) {
    return { ok: false, status: 403, error: 'Proibido' };
  }

  return {
    ok: true,
    userId,
    isSystem: contexts.system,
    companyIds: contexts.companyIds,
  };
}
