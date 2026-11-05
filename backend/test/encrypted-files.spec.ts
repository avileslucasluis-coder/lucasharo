import { encryptPdf, decryptPdf } from '../src/security/encrypted-files';
import { randomBytes } from 'crypto';
describe('Respaldos cifrados', () => {
  const original = process.env.DATA_ENCRYPTION_KEY;
  beforeEach(() => { process.env.DATA_ENCRYPTION_KEY = randomBytes(32).toString('hex'); });
  afterAll(() => { if (original === undefined) delete process.env.DATA_ENCRYPTION_KEY; else process.env.DATA_ENCRYPTION_KEY = original; });
  it('recupera el PDF y usa un nonce distinto en cada archivo', () => {
    const pdf = Buffer.from('%PDF-1.7\nrespaldo de prueba').toString('base64');
    const first = encryptPdf(pdf), second = encryptPdf(pdf);
    expect(first).not.toBe(second);
    expect(decryptPdf(first)).toBe(pdf);
    const parts = first.split('.');
    parts[2] = randomBytes(16).toString('base64');
    expect(() => decryptPdf(parts.join('.'))).toThrow();
  });
  it('rechaza otros formatos y no almacena sin clave', () => {
    expect(() => encryptPdf(Buffer.from('otro archivo').toString('base64'))).toThrow();
    delete process.env.DATA_ENCRYPTION_KEY;
    expect(() => encryptPdf(Buffer.from('%PDF-1.7').toString('base64'))).toThrow();
  });
});
