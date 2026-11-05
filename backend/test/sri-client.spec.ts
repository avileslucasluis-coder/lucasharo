import { SriClientService } from '../src/sri/sri-client.service';
import { XMLValidator } from 'fast-xml-parser';
import { validarXmlPruebas } from '../src/sri/sri-xml';
import { claveAcceso, ruc, xmlPruebas } from './sri-fixture';

describe('Contrato SOAP SRI', () => {
  const client = new SriClientService();
  const originalFetch = global.fetch;
  const mockFetch = jest.fn();
  const soap = (contenido: string) => new Response(`<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body>${contenido}</s:Body></s:Envelope>`, { status: 200 });
  beforeEach(() => { global.fetch = mockFetch; mockFetch.mockReset(); });
  afterAll(() => { global.fetch = originalFetch; });

  it.each(['&#xD;', '&#13;', '&#xD;\n&#xA;'])('lee el salto escapado %s antes de la raíz sin alterar el contenido firmado', async padding => {
    const inner = '<factura><razonSocial>A &amp; B</razonSocial><detalle>Uno&#xD;Dos</detalle></factura>';
    const content = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${padding}\n${inner}`;
    mockFetch.mockResolvedValue(soap(`<autorizacionComprobanteResponse><RespuestaAutorizacionComprobante><claveAccesoConsultada>${claveAcceso}</claveAccesoConsultada><autorizaciones><autorizacion><estado>AUTORIZADO</estado><ambiente>PRODUCCIÓN</ambiente><comprobante><![CDATA[${content}]]></comprobante></autorizacion></autorizaciones></RespuestaAutorizacionComprobante></autorizacionComprobanteResponse>`));
    const result = await client.consultar(claveAcceso, 'PRODUCCION');
    expect(XMLValidator.validate(result.autorizaciones[0].comprobante)).toBe(true);
    expect(result.autorizaciones[0].comprobante).toContain(inner);
  });

  it.each(['PRODUCCIÓN', 'PRODUCCION', ' producción ', 'PRODUCCIO\u0301N'])('normaliza el ambiente real del SRI: %s', async ambiente => {
    mockFetch.mockResolvedValue(soap(`<autorizacionComprobanteResponse><RespuestaAutorizacionComprobante><claveAccesoConsultada>${claveAcceso}</claveAccesoConsultada><numeroComprobantes>1</numeroComprobantes><autorizaciones><autorizacion><estado>AUTORIZADO</estado><ambiente>${ambiente}</ambiente><comprobante><![CDATA[${xmlPruebas}]]></comprobante></autorizacion></autorizaciones></RespuestaAutorizacionComprobante></autorizacionComprobanteResponse>`));
    const result = await client.consultar(claveAcceso, 'PRODUCCION');
    expect(result.autorizaciones[0].ambiente).toBe('PRODUCCION');
    expect(result.autorizaciones[0].comprobante).toBe(xmlPruebas);
    expect(mockFetch.mock.calls[0][0]).toBe('https://cel.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline');
  });

  it('explica que se puede reintentar la descarga cuando falla la red', async () => {
    mockFetch.mockRejectedValueOnce(new Error('socket timeout'));
    await expect(client.consultar(claveAcceso, 'PRODUCCION')).rejects.toThrow('sin volver a cargar el TXT');
  });

  it('envía XML UTF8 en base64 al endpoint fijo de pruebas; RECIBIDA no es autorización', async () => {
    mockFetch.mockResolvedValue(soap('<r:validarComprobanteResponse xmlns:r="http://ec.gob.sri.ws.recepcion"><RespuestaRecepcionComprobante><estado>RECIBIDA</estado><comprobantes/></RespuestaRecepcionComprobante></r:validarComprobanteResponse>'));
    expect((await client.recibir(xmlPruebas)).estado).toBe('RECIBIDA');
    expect(mockFetch.mock.calls[0][0]).toBe('https://celcer.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline');
    expect(mockFetch.mock.calls[0][1].body).toContain(`<xml>${Buffer.from(xmlPruebas).toString('base64')}</xml>`);
    expect(mockFetch.mock.calls[0][1].headers.SOAPAction).toBe('""');
  });
  it('usa el endpoint oficial de producción solo cuando el servidor lo configura', async () => {
    const previous = process.env.SRI_ENVIRONMENT;
    process.env.SRI_ENVIRONMENT = 'produccion';
    try {
      mockFetch.mockResolvedValue(soap('<r:validarComprobanteResponse xmlns:r="http://ec.gob.sri.ws.recepcion"><RespuestaRecepcionComprobante><estado>RECIBIDA</estado><comprobantes/></RespuestaRecepcionComprobante></r:validarComprobanteResponse>'));
      await client.recibir(xmlPruebas);
      expect(mockFetch.mock.calls[0][0]).toBe('https://cel.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline');
    } finally {
      if (previous === undefined) delete process.env.SRI_ENVIRONMENT; else process.env.SRI_ENVIRONMENT = previous;
    }
  });
  it('interpreta mensajes de devolución sin perder ceros del identificador', async () => {
    mockFetch.mockResolvedValue(soap(`<validarComprobanteResponse><RespuestaRecepcionComprobante><estado>DEVUELTA</estado><comprobantes><comprobante><claveAcceso>${claveAcceso}</claveAcceso><mensajes><mensaje><identificador>070</identificador><mensaje>EN PROCESAMIENTO</mensaje></mensaje></mensajes></comprobante></comprobantes></RespuestaRecepcionComprobante></validarComprobanteResponse>`));
    expect((await client.recibir(xmlPruebas)).comprobantes[0].mensajes[0].identificador).toBe('070');
  });
  it('interpreta cero autorizaciones sin inventar una aprobación', async () => {
    mockFetch.mockResolvedValue(soap(`<autorizacionComprobanteResponse><RespuestaAutorizacionComprobante><claveAccesoConsultada>${claveAcceso}</claveAccesoConsultada><numeroComprobantes>0</numeroComprobantes><autorizaciones/></RespuestaAutorizacionComprobante></autorizacionComprobanteResponse>`));
    expect((await client.consultar(claveAcceso)).autorizaciones).toEqual([]);
  });
  it('rechaza una respuesta para otra clave', async () => {
    mockFetch.mockResolvedValue(soap('<autorizacionComprobanteResponse><RespuestaAutorizacionComprobante><claveAccesoConsultada>otra</claveAccesoConsultada><numeroComprobantes>0</numeroComprobantes></RespuestaAutorizacionComprobante></autorizacionComprobanteResponse>'));
    await expect(client.consultar(claveAcceso)).rejects.toThrow('no corresponde');
  });
  it('admite el rechazo de consulta observado en SRI sin numeroComprobantes opcional', async () => {
    mockFetch.mockResolvedValue(soap(`<autorizacionComprobanteResponse><RespuestaAutorizacionComprobante><claveAccesoConsultada>${claveAcceso}</claveAccesoConsultada><autorizaciones><autorizacion><estado>RECHAZADA</estado><mensajes><mensaje><identificador>80</identificador><mensaje>ERROR EN LA ESTRUCTURA DE LA CLAVE DE ACCESO</mensaje></mensaje></mensajes></autorizacion></autorizaciones></RespuestaAutorizacionComprobante></autorizacionComprobanteResponse>`));
    const resultado = await client.consultar(claveAcceso);
    expect(resultado.autorizaciones[0].estado).toBe('RECHAZADA');
    expect(resultado.autorizaciones[0].mensajes[0].identificador).toBe('80');
  });
  it('rechaza SOAP Fault y fallas de red con un error recuperable', async () => {
    mockFetch.mockResolvedValueOnce(soap('<s:Fault><faultstring>No disponible</faultstring></s:Fault>'));
    await expect(client.recibir(xmlPruebas)).rejects.toThrow('SRI SOAP');
    mockFetch.mockRejectedValueOnce(new Error('socket timeout'));
    await expect(client.recibir(xmlPruebas)).rejects.toThrow('Consulta la autorización');
  });
});

describe('Prevalidación del comprobante de pruebas', () => {
  it('comprueba clave, identidad y fecha', () => {
    expect(validarXmlPruebas(xmlPruebas, ruc).claveAcceso).toBe(claveAcceso);
    expect(() => validarXmlPruebas(xmlPruebas, 'otro')).toThrow('RUC');
    expect(() => validarXmlPruebas(xmlPruebas.replace('22/10/2026', '31/02/2026'), ruc)).toThrow('fecha');
    expect(() => validarXmlPruebas(xmlPruebas.replace('<ambiente>1', '<ambiente>2'), ruc)).toThrow('PRUEBAS');
    expect(() => validarXmlPruebas(xmlPruebas.replace('<secuencial>000000001', '<secuencial>000000002'), ruc)).toThrow('secuencial');
  });
});
