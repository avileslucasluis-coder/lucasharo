import * as forge from 'node-forge';
import { verify } from 'crypto';
import { execFileSync } from 'child_process';
import { SignatureService } from '../src/signature/signature.service';
import { xmlPruebas } from './sri-fixture';

describe('Firma XAdES-BES con certificado sintético (no autorizado por SRI)', () => {
  const servicio = new SignatureService();
  let p12: Buffer;
  let cert: forge.pki.Certificate;
  let keys: forge.pki.rsa.KeyPair;
  const password = 'clave-sintetica-solo-test';
  function paquete() {
    return Buffer.from(forge.asn1.toDer(forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], password, { algorithm: '3des' })).getBytes(), 'binary');
  }
  beforeAll(() => {
    keys = forge.pki.rsa.generateKeyPair(2048);
    cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = '7a123456789abc';
    cert.validity.notBefore = new Date(Date.now() - 86400000);
    cert.validity.notAfter = new Date(Date.now() + 86400000);
    const nombre = [{ name: 'countryName', value: 'EC' }, { name: 'organizationName', value: 'Pruebas & Desarrollo' }, { name: 'commonName', value: 'Certificado sintético' }];
    cert.setSubject(nombre); cert.setIssuer(nombre);
    cert.setExtensions([{ name: 'keyUsage', digitalSignature: true }]);
    cert.sign(keys.privateKey, forge.md.sha256.create());
    p12 = paquete();
  });

  it('verifica las tres referencias con lxml y la firma RSA con crypto de Node', async () => {
    const xml = await servicio.firmarComprobante(xmlPruebas, p12, password);
    const script = `import sys,json,base64,hashlib,copy
from lxml import etree
root=etree.fromstring(sys.stdin.buffer.read())
ns={'ds':'http://www.w3.org/2000/09/xmldsig#','x':'http://uri.etsi.org/01903/v1.3.2#'}
sig=root.find('ds:Signature',ns)
refs=sig.findall('ds:SignedInfo/ds:Reference',ns)
assert len(refs)==3
assert len(root.findall('.//x:SignedProperties',ns))==1
for ref in refs:
    ident=ref.get('URI')[1:]
    node=root.xpath('//*[@id=$i or @Id=$i or @ID=$i]',i=ident)[0]
    if any(t.get('Algorithm').endswith('enveloped-signature') for t in ref.findall('ds:Transforms/ds:Transform',ns)):
        node=copy.deepcopy(node)
        for s in node.findall('.//ds:Signature',ns): s.getparent().remove(s)
    canon=etree.tostring(node,method='c14n',exclusive=False,with_comments=False)
    assert base64.b64encode(hashlib.sha1(canon).digest()).decode()==ref.findtext('ds:DigestValue',namespaces=ns), ident
print(json.dumps({'signedInfo':base64.b64encode(etree.tostring(sig.find('ds:SignedInfo',ns),method='c14n',exclusive=False,with_comments=False)).decode(),'signature':sig.findtext('ds:SignatureValue',namespaces=ns)}))`;
    const datos = JSON.parse(execFileSync('python', ['-c', script], { input: xml, encoding: 'utf8' }));
    expect(verify('RSA-SHA1', Buffer.from(datos.signedInfo, 'base64'), forge.pki.certificateToPem(cert), Buffer.from(datos.signature, 'base64'))).toBe(true);
    expect(xml).toContain('http://uri.etsi.org/01903#SignedProperties');
    expect(xml).not.toContain(password);
  });

  it('rechaza contraseña equivocada sin incluirla en el error', async () => {
    await expect(servicio.firmarComprobante(xmlPruebas, p12, 'incorrecta')).rejects.toThrow('Revisa el archivo y su contraseña');
  });
  it('rechaza XML firmado previamente', async () => {
    const firmado = await servicio.firmarComprobante(xmlPruebas, p12, password);
    await expect(servicio.firmarComprobante(firmado, p12, password)).rejects.toThrow('sin firma previa');
  });
  it('rechaza DTD e identificadores duplicados', async () => {
    await expect(servicio.firmarComprobante('<!DOCTYPE factura>' + xmlPruebas, p12, password)).rejects.toThrow('inválido');
    await expect(servicio.firmarComprobante(xmlPruebas.replace('<infoFactura>', '<infoFactura id="comprobante">'), p12, password)).rejects.toThrow('duplicados');
  });
  it('rechaza certificado vencido', async () => {
    const anterior = cert.validity.notAfter;
    cert.validity.notAfter = new Date(Date.now() - 1000);
    cert.sign(keys.privateKey, forge.md.sha256.create());
    await expect(servicio.firmarComprobante(xmlPruebas, paquete(), password)).rejects.toThrow('vencido');
    cert.validity.notAfter = anterior;
  });
});
