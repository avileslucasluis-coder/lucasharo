import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

function key(): Buffer {
  const value = process.env.DATA_ENCRYPTION_KEY ?? '';
  if (!/^[a-f0-9]{64}$/i.test(value)) throw new ServiceUnavailableException('Configura DATA_ENCRYPTION_KEY para adjuntar o descargar respaldos cifrados.');
  return Buffer.from(value, 'hex');
}
export function encryptPdf(base64: string): string {
  const data = Buffer.from(base64, 'base64');
  if (data.length > 1024 * 1024 || data.subarray(0, 5).toString() !== '%PDF-') throw new BadRequestException('Adjunta un PDF de hasta 1 MB.');
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key(), iv);
  const ciphertext = Buffer.concat([cipher.update(data), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), ciphertext.toString('base64')].join('.');
}
export function decryptPdf(value: string): string {
  const [version, iv, tag, data] = value.split('.');
  if (version !== 'v1') throw new BadRequestException('Formato de respaldo no soportado.');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('base64');
}
