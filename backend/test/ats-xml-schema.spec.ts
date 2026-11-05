import { execFileSync } from 'child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';
import { AtsService } from '../src/ats/ats.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/audit/audit.service';
import { XMLParser } from 'fast-xml-parser';
import { tipoIdentificacionAts } from '../src/ats/ats-metadata';

// Valida la salida del servicio real contra resources/ats.xsd, sin base
// de datos y sin ejecutar scripts de muestra con una estructura duplicada.
describe('ATS generado por el servicio — validación XSD', () => {
  const xsd = path.resolve(__dirname, '../resources/ats.xsd');
  let temporal: string;

  beforeAll(() => { temporal = mkdtempSync(path.join(tmpdir(), 'rimpe-ats-')); });
  afterAll(() => { rmSync(temporal, { recursive: true, force: true }); });

  function validarXml(xml: string) {
    const archivo = path.join(temporal, 'ats.xml');
    writeFileSync(archivo, xml, 'utf8');
    try {
      execFileSync('xmllint', ['--noout', '--schema', xsd, archivo], { stdio: 'pipe' });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      execFileSync(process.env.PYTHON ?? 'python', ['-c',
        'from lxml import etree; import sys; etree.XMLSchema(etree.parse(sys.argv[1])).assertValid(etree.parse(sys.argv[2]))',
        xsd, archivo,
      ], { stdio: 'pipe' });
    }
  }

  function servicio(vouchers: object[]) {
    const company = { ruc: '0999999999001', razonSocial: 'CONTRIBUYENTE DE PRUEBA' };
    const prisma = {
      company: { findUnique: jest.fn().mockResolvedValue(company), findUniqueOrThrow: jest.fn().mockResolvedValue(company) },
      voucher: { findMany: jest.fn().mockResolvedValue(vouchers) },
      atsOperation: { findMany: jest.fn().mockResolvedValue([]) },
      establishment: { count: jest.fn().mockResolvedValue(1) },
      atsReport: { upsert: jest.fn().mockResolvedValue({ id: 'reporte' }) },
    };
    return new AtsService(prisma as unknown as PrismaService,
      { registrar: jest.fn() } as unknown as AuditService);
  }

  it('el XSD oficial descargado del SRI existe en el repositorio', () => {
    expect(existsSync(xsd)).toBe(true);
  });

  it('valida el XML real con compras y ventas', async () => {
    const base = {
      atsRevision: { operacionLocal: true, parteRelacionada: 'NO', codSustento: '01', pagos: ['20'] },
      id: 'comprobante', tipoComprobante: 'FACTURA',
      claveAcceso: '1508202601099234567800110010010000000011234567890123'.slice(0, 49),
      rucEmisor: '0992345678001', identificacionContraparte: '0999999999001',
      fechaEmision: new Date(2026, 7, 15), baseImponibleIva: 100,
      baseImponibleIva0: 20, montoIva: 15, withholding: null,
    };
    const { xml } = await servicio([
      { ...base, direccion: 'COMPRA' },
      { ...base, id: 'venta', direccion: 'VENTA', rucEmisor: '0999999999001', identificacionContraparte: '0992345678001' },
    ]).generarXml('empresa', 8, 2026, 'usuario');
    validarXml(xml);
  });

  it('valida un periodo sin comprobantes', async () => {
    const { xml } = await servicio([]).generarXml('empresa', 8, 2026, 'usuario');
    validarXml(xml);
  });

  it('usa catálogos distintos para proveedor y cliente, incluyendo consumidor final', () => {
    expect(tipoIdentificacionAts('0992345678001', false)).toBe('01');
    expect(tipoIdentificacionAts('0992345678001', true)).toBe('04');
    expect(tipoIdentificacionAts('1712345678', true)).toBe('05');
    expect(tipoIdentificacionAts('9999999999999', true)).toBe('07');
    expect(tipoIdentificacionAts('0123456789', true, '06')).toBe('06');
  });

  const venta = {
    atsRevision: { operacionLocal: true, parteRelacionada: 'NO', pagos: ['20'] },
    id: 'venta', tipoComprobante: 'FACTURA', direccion: 'VENTA',
    claveAcceso: '1508202601099234567800110010010000000011234567890123'.slice(0, 49),
    rucEmisor: '0999999999001', identificacionContraparte: '0992345678001',
    fechaEmision: new Date(2026, 7, 15), baseImponibleIva: 100,
    baseImponibleIva0: 0, montoIva: 15, withholding: null,
    xmlOriginal: '<factura><infoFactura><tipoIdentificacionComprador>04</tipoIdentificacionComprador><pagos><pago><formaPago>20</formaPago></pago></pagos></infoFactura></factura>',
  };
  it('agrupa ventas del mismo cliente y conserva formas de pago', async () => {
    const { xml } = await servicio([venta, { ...venta, id: 'venta2' }]).generarXml('empresa', 8, 2026, 'usuario');
    validarXml(xml);
    const detalle = new XMLParser({ parseTagValue: false }).parse(xml).iva.ventas.detalleVentas;
    expect(detalle.tpIdCliente).toBe('04');
    expect(detalle.numeroComprobantes).toBe('2');
    expect(detalle.baseImpGrav).toBe('200.00');
    expect(detalle.formasDePago.formaPago).toBe('20');
  });
  it('incluye nota de crédito de venta positiva y descuenta el total del período', async () => {
    const { xml } = await servicio([venta, { ...venta, id: 'nota', tipoComprobante: 'NOTA_CREDITO', baseImponibleIva: 20, montoIva: 3 }]).generarXml('empresa', 8, 2026, 'usuario');
    validarXml(xml);
    const datos = new XMLParser({ parseTagValue: false }).parse(xml).iva;
    expect(datos.totalVentas).toBe('80.00');
    expect(datos.ventas.detalleVentas[1].tipoComprobante).toBe('04');
    expect(datos.ventas.detalleVentas[1].baseImpGrav).toBe('20.00');
  });
  it('no omite silenciosamente una nota de crédito de compra sin vincular', async () => {
    await expect(servicio([{ ...venta, direccion: 'COMPRA', tipoComprobante: 'NOTA_CREDITO' }]).generarXml('empresa', 8, 2026, 'usuario')).rejects.toThrow('Corrige los datos ATS');
  });
  it('enlaza la retención emitida y conserva sus valores en el ATS de compras', async () => {
    const compra = { ...venta, id: 'compra', direccion: 'COMPRA', rucEmisor: '0992345678001', identificacionContraparte: '0999999999001',
      fechaEmision: new Date(Date.UTC(2026, 6, 15)), fechaRegistroAts: new Date(Date.UTC(2026, 7, 1)),
      atsRevision: { operacionLocal: true, parteRelacionada: 'NO', codSustento: '01', pagos: ['20'] } };
    const retencion = { ...venta, id: 'retencion', direccion: 'RETENCION_EMITIDA', tipoComprobante: 'RETENCION',
      xmlOriginal: `<comprobanteRetencion><impuestos><impuesto><codigo>2</codigo><codigoRetencion>1</codigoRetencion><baseImponible>15</baseImponible><porcentajeRetener>30</porcentajeRetener><valorRetenido>4.50</valorRetenido><codDocSustento>01</codDocSustento><numDocSustento>${compra.claveAcceso.slice(24,39)}</numDocSustento></impuesto></impuestos></comprobanteRetencion>` };
    const { xml } = await servicio([compra, retencion]).generarXml('empresa', 8, 2026, 'usuario');
    validarXml(xml);
    const detalle = new XMLParser({ parseTagValue: false }).parse(xml).iva.compras.detalleCompras;
    expect(detalle.valorRetBienes).toBe('4.50');
    expect(detalle.fechaEmision).toBe('15/07/2026');
    expect(detalle.fechaRegistro).toBe('01/08/2026');
    expect(detalle.autRetencion1).toBe(retencion.claveAcceso);
  });
  it('bloquea retenciones sin sustento en el período en vez de omitirlas', async () => {
    const { errores } = await servicio([{ ...venta, direccion: 'RETENCION_EMITIDA', tipoComprobante: 'RETENCION' }]).validar('empresa', 8, 2026);
    expect(errores.some(e => e.mensaje.includes('sustento'))).toBe(true);
  });
});
