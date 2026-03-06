import { NextResponse } from 'next/server';
import crypto from 'crypto';
import prisma from '@/lib/prisma';
import sendEmail from '@/lib/sendEmail';

export async function POST(req: Request) {
    try {
        const { email } = await req.json();

        const user = await prisma.user.findUnique({ where: { email } });

        if (!user) {
            return NextResponse.json({ error: 'Email not found' }, { status: 404 });
        }

        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetTokenExpiry = new Date(Date.now() + 3600 * 1000); // 1 hour

        await prisma.user.update({
            where: { email },
            data: { resetToken, resetTokenExpiry },
        });

        const resetUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/reset-password?token=${resetToken}`;

        await sendEmail(email, 'Password Recovery', `Reset your password: ${resetUrl}`);

        return NextResponse.json({ message: 'Recovery email sent' });
    } catch (error) {
        console.error('Error in password recovery:', error);
        return NextResponse.json({ error: 'An error occurred while processing your request' }, { status: 500 });
    }
}
