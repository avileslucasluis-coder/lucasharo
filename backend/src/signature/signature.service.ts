import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import * as forge from 'node-forge';
import { SignedXml } from 'xml-crypto';
import { DOMParser } from '@xmldom/xmldom';
import { XMLValidator } from 'fast-xml-parser';
import { create } from 'xmlbuilder2';

const DS = 'http://www.w3.org/2000/09/xmldsig#';
const XADES = 'http://uri.etsi.org/01903/v1.3.2#';
const C14N = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315';

/** Perfil XAdES-BES SRI. No persiste certificados ni contraseñas.
 * La verificación local no comprueba confianza/revocación de la CA ni sustituye la autorización SRI.
 */
@Injectable()
export class SignatureService {
  async firmarComprobante(xml: string, p12: Buffer, clave: string): Promise<string> {
    if (!xml || Buffer.byteLength(xml) > 320 * 1024 || /<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true) {
      throw new BadRequestException('El XML a firmar es inválido o excede 320 KB.');
    }
    const dom = new DOMParser().parseFromString(xml, 'text/xml');
    if (dom.documentElement?.getAttribute('id') !== 'comprobante' || dom.getElementsByTagNameNS(DS, 'Signature').length) {
      throw new BadRequestException('Se requiere id="comprobante" en la raíz y un XML sin firma previa.');
    }
    const ids = new Set<string>();
    const elementos = dom.getElementsByTagName('*');
    for (let i = 0; i < elementos.length; i++) {
      for (const atributo of ['id', 'Id', 'ID']) {
        const id = elementos.item(i)?.getAttribute(atributo);
        if (id && ids.has(id)) throw new BadRequestException('El XML contiene identificadores duplicados.');
        if (id) ids.add(id);
      }
    }
    if (!p12.length || p12.length > 1024 * 1024) throw new BadRequestException('El certificado PKCS12 es vacío o supera 1 MB.');
    let almacen: forge.pkcs12.Pkcs12Pfx;
    try { almacen = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(p12.toString('binary')), false, clave); }
    catch { throw new BadRequestException('No se pudo abrir el certificado PKCS12. Revisa el archivo y su contraseña.'); }
    const bolsas = almacen.safeContents.flatMap((s) => s.safeBags);
    const llaves = bolsas.filter((b) => b.key).map((b) => b.key!);
    const certificados = bolsas.filter((b) => b.cert).map((b) => b.cert!);
    const pares = llaves.flatMap((key) => certificados.filter((cert) => {
      const publicKey = cert.publicKey as forge.pki.rsa.PublicKey;
      return key.n && publicKey.n && key.n.equals(publicKey.n) && key.e.equals(publicKey.e);
    }).map((cert) => ({ key, cert })));
    if (pares.length !== 1) throw new BadRequestException('El PKCS12 debe contener una única clave RSA y su certificado correspondiente.');
    const { key, cert } = pares[0];
    const ahora = new Date();
    if (ahora < cert.validity.notBefore || ahora > cert.validity.notAfter) throw new BadRequestException('El certificado está vencido o todavía no es válido.');
    if (key.n.bitLength() < 2048) throw new BadRequestException('El certificado debe usar una clave RSA de al menos 2048 bits.');
    const uso = cert.getExtension('keyUsage') as { digitalSignature?: boolean; nonRepudiation?: boolean } | undefined;
    if (uso && !uso.digitalSignature && !uso.nonRepudiation) throw new BadRequestException('El certificado no permite firma digital.');

    const id = `Signature-${randomUUID()}`;
    const propertiesId = `${id}-SignedProperties`;
    const keyId = `${id}-KeyInfo`;
    const refId = `${id}-Document`;
    const certDer = Buffer.from(forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes(), 'binary');
    const certPem = forge.pki.certificateToPem(cert);
    const properties = create().ele('xades:QualifyingProperties', { 'xmlns:xades': XADES, 'xmlns:ds': DS, Target: `#${id}` });
    const signed = properties.ele('xades:SignedProperties', { Id: propertiesId });
    const signatureProperties = signed.ele('xades:SignedSignatureProperties');
    signatureProperties.ele('xades:SigningTime').txt(ahora.toISOString()).up();
    const signingCert = signatureProperties.ele('xades:SigningCertificate').ele('xades:Cert');
    signingCert.ele('xades:CertDigest').ele('ds:DigestMethod', { Algorithm: DS + 'sha1' }).up()
      .ele('ds:DigestValue').txt(createHash('sha1').update(certDer).digest('base64')).up().up();
    signingCert.ele('xades:IssuerSerial').ele('ds:X509IssuerName').txt(issuerName(cert)).up()
      .ele('ds:X509SerialNumber').txt(BigInt(`0x${cert.serialNumber}`).toString()).up().up();
    signed.ele('xades:SignedDataObjectProperties').ele('xades:DataObjectFormat', { ObjectReference: `#${refId}` })
      .ele('xades:Description').txt('Comprobante electrónico').up().ele('xades:MimeType').txt('text/xml').up()
      .ele('xades:Encoding').txt('UTF-8').up();
    const publicKey = cert.publicKey as forge.pki.rsa.PublicKey;
    const keyInfo = create().ele('ds:X509Data', { 'xmlns:ds': DS }).ele('ds:X509Certificate').txt(certDer.toString('base64')).up().end({ headless: true });
    const keyValue = create().ele('ds:KeyValue', { 'xmlns:ds': DS }).ele('ds:RSAKeyValue')
      .ele('ds:Modulus').txt(unsignedIntegerBase64(publicKey.n.toString(16))).up()
      .ele('ds:Exponent').txt(unsignedIntegerBase64(publicKey.e.toString(16))).up().end({ headless: true });

    try {
      const signer = new SignedXml({
        privateKey: forge.pki.privateKeyToPem(key), publicCert: certPem, signatureAlgorithm: DS + 'rsa-sha1',
        canonicalizationAlgorithm: C14N, keyInfoAttributes: { Id: keyId }, getKeyInfoContent: () => keyInfo + keyValue,
        objects: [{ attributes: { Id: `${id}-Object` }, content: properties.end({ headless: true }) }],
      });
      signer.addReference({ xpath: '/*', transforms: [DS + 'enveloped-signature', C14N], digestAlgorithm: DS + 'sha1', id: refId });
      signer.addReference({ xpath: `//*[@Id='${propertiesId}']`, transforms: [C14N], digestAlgorithm: DS + 'sha1', type: 'http://uri.etsi.org/01903#SignedProperties' });
      signer.addReference({ xpath: `//*[@Id='${keyId}']`, transforms: [C14N], digestAlgorithm: DS + 'sha1' });
      signer.computeSignature(xml, { prefix: 'ds', attrs: { Id: id }, location: { reference: '/*', action: 'append' } });
      const resultado = signer.getSignedXml();
      const verifier = new SignedXml({ publicCert: certPem, getCertFromKeyInfo: () => null });
      verifier.loadSignature(signer.getSignatureXml());
      if (!verifier.checkSignature(resultado) || verifier.getSignedReferences().length !== 3) throw new Error('Verificación de referencias fallida.');
      return resultado;
    } catch {
      throw new InternalServerErrorException('No se pudo crear y verificar la firma XAdES-BES. El comprobante no fue enviado.');
    }
  }
}

function unsignedIntegerBase64(hex: string) { return Buffer.from(hex.length % 2 ? `0${hex}` : hex, 'hex').toString('base64'); }

/** RFC4514: orden inverso al nombre distinguido ASN.1. */
function issuerName(cert: forge.pki.Certificate): string {
  const names: Record<string, string> = { '2.5.4.3': 'CN', '2.5.4.6': 'C', '2.5.4.7': 'L', '2.5.4.8': 'ST', '2.5.4.10': 'O', '2.5.4.11': 'OU', '2.5.4.5': 'serialNumber', '1.2.840.113549.1.9.1': 'E' };
  return cert.issuer.attributes.slice().reverse().map((a) => {
    const valor = String(a.value).replace(/\\/g, '\\\\').replace(/[,+=<>;\"]/g, '\\$&').replace(/^ | $|^#/g, '\\$&').replace(/\x00/g, '\\00');
    return `${names[a.type ?? ''] ?? a.type}=${valor}`;
  }).join(',');
}
