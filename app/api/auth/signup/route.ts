import { NextRequest, NextResponse } from 'next/server';
import { createUser, isSessionValid } from '@/lib/users';

export async function POST(req: NextRequest): Promise<Response> {
  
  // validate user session
  const session = req.cookies.get('session')?.value
  const validSession = session ? await isSessionValid(session) : false
  if (!validSession) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    
  // get userId from session
  const userId = validSession.userId
    
  const { name, email, password } = await req.json();

  if (!name || !email || !password) {
    return NextResponse.json({ error: 'Nome, email, e senha são obrigatórios.' }, { status: 400 });
  }

  const user = await createUser({ name, email, password }, userId);

  return NextResponse.json({ user });
}
