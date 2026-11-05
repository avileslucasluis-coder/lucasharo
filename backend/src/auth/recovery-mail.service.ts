import { Injectable, ServiceUnavailableException } from '@nestjs/common';

@Injectable()
export class RecoveryMailService {
  checkConfiguration() {
    try {
      const url = new URL(process.env.PASSWORD_RESET_URL ?? '');
      if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw new Error();
      if (process.env.MAIL_PROVIDER === 'gmail') {
        if (!/^[^\s@]+@gmail\.com$/i.test(process.env.GMAIL_USER ?? '') ||
            !/^[a-zA-Z0-9]{16}$/.test((process.env.GMAIL_APP_PASSWORD ?? '').replace(/\s/g, ''))) throw new Error();
      } else if (!process.env.RESEND_API_KEY || !process.env.MAIL_FROM) throw new Error();
    } catch {
      throw new ServiceUnavailableException('La recuperación de contraseña no está configurada. Contacta al administrador.');
    }
  }

  async send(email: string, token: string) {
    this.checkConfiguration();
    const link = new URL(process.env.PASSWORD_RESET_URL!);
    link.hash = `token=${token}`;
    try {
      if (process.env.MAIL_PROVIDER === 'gmail') {
        const transport = require('nodemailer').createTransport({
          host: 'smtp.gmail.com', port: 465, secure: true,
          connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
          auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD!.replace(/\s/g, '') },
          tls: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
          disableFileAccess: true, disableUrlAccess: true,
        });
        try {
          await transport.sendMail({ from: { name: 'Sistema Tributario', address: process.env.GMAIL_USER }, to: email,
            subject: 'Restablecer contraseña de Sistema Tributario',
            text: `Se solicitó restablecer tu contraseña de Sistema Tributario. Abre ${link.toString()} en los próximos 15 minutos. Si no lo solicitaste, ignora este mensaje.` });
        } finally { transport.close(); }
        return;
      }
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST', signal: AbortSignal.timeout(10000),
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: process.env.MAIL_FROM, to: [email], subject: 'Restablecer contraseña de Sistema Tributario',
          text: `Se solicitó restablecer tu contraseña. Abre ${link.toString()} en los próximos 15 minutos. Si no lo solicitaste, ignora este mensaje.` }),
      });
      if (!response.ok) throw new Error();
    } catch {
      throw new ServiceUnavailableException('No se pudo procesar la recuperación. Inténtalo más tarde.');
    }
  }
}
