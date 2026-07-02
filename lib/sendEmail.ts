import nodemailer from 'nodemailer';

// Usa Zoho SMTP (mesmas credenciais do email-service.ts)
// Mantém compatibilidade com EMAIL_USER/EMAIL_PASS como fallback
const host = process.env.ZOHO_SMTP_HOST || 'smtp.zoho.com';
const port = parseInt(process.env.ZOHO_SMTP_PORT || '465', 10);
const user = process.env.ZOHO_SMTP_USER || process.env.EMAIL_USER;
const pass = process.env.ZOHO_SMTP_PASS || process.env.EMAIL_PASS;

const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    connectionTimeout: 30_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
});

export default async function sendEmail(to: string, subject: string, text: string) {
    await transporter.sendMail({
        from: `"${process.env.ZOHO_SMTP_FROM_NAME || 'AcquaX do Brasil'}" <${user}>`,
        to,
        subject,
        text,
    });
}
