import { NextResponse } from 'next/server';
import { compare } from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Credentials': 'true',
    },
  });
}

const JWT_SECRET = process.env.JWT_SECRET!;

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();

    // Verificar se o usuário existe
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      console.warn('Invalid email:', email);
      return NextResponse.json({ error: 'Invalid email' }, { status: 401 });
    }

    // Verificar se a senha é válida
    const isPasswordValid = await compare(password, user.password);

    if (!isPasswordValid) {
      console.warn('Invalid credentials for user:', email);
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    // Criar o token JWT
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '1h' });

    // Criar uma nova sessão no banco de dados
    const session = await prisma.session.create({
      data: {
        token,
        userId: user.id,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hora
        deletedAt: null,
      },
    });

    // Set the token in the cookies
    const response = NextResponse.json({
      message: 'Login successful',
      token: session.token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        mustUpdateCredentials: user.mustUpdateCredentials,
      },
    });

    response.cookies.set('session', session.token, {
      httpOnly: true,
      maxAge: 60 * 60, // 1 hour
      path: '/',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });

    return response;
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
