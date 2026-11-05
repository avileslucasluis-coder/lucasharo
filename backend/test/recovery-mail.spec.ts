import { RecoveryMailService } from '../src/auth/recovery-mail.service';
jest.mock('nodemailer', () => ({ createTransport: jest.fn() }));

describe('Correo Gmail de recuperación', () => {
  const original = { ...process.env };
  const sendMail = jest.fn();
  const close = jest.fn();
  beforeEach(() => {
    process.env.MAIL_PROVIDER = 'gmail';
    process.env.GMAIL_USER = 'test@gmail.com';
    process.env.GMAIL_APP_PASSWORD = 'abcd efgh ijkl mnop';
    process.env.PASSWORD_RESET_URL = 'https://example.com/recover.html';
    sendMail.mockReset().mockResolvedValue({}); close.mockReset();
    require('nodemailer').createTransport.mockReturnValue({ sendMail, close });
  });
  afterEach(() => { process.env = { ...original }; });
  it('envía con TLS y mantiene el token en el fragmento del enlace', async () => {
    await new RecoveryMailService().send('recipient@example.com', 'a'.repeat(64));
    expect(require('nodemailer').createTransport).toHaveBeenCalledWith(expect.objectContaining({
      host: 'smtp.gmail.com', port: 465, secure: true, tls: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
    }));
    expect(sendMail.mock.calls[0][0].text).toContain('https://example.com/recover.html#token=');
    expect(close).toHaveBeenCalledTimes(1);
  });
  it('no expone errores ni credenciales del proveedor', async () => {
    sendMail.mockRejectedValue(new Error('sensitive provider details'));
    await expect(new RecoveryMailService().send('recipient@example.com', 'token')).rejects.toThrow('No se pudo procesar');
    expect(close).toHaveBeenCalledTimes(1);
  });
  it('rechaza configuración sin contraseña de aplicación o enlace HTTPS', () => {
    delete process.env.GMAIL_APP_PASSWORD;
    expect(() => new RecoveryMailService().checkConfiguration()).toThrow('no está configurada');
    process.env.GMAIL_APP_PASSWORD = 'abcdefghijklmnop';
    process.env.PASSWORD_RESET_URL = 'http://example.com';
    expect(() => new RecoveryMailService().checkConfiguration()).toThrow('no está configurada');
  });
});
