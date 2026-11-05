import { SriService } from '../src/sri/sri.service';
import { claveAcceso, ruc, xmlPruebas } from './sri-fixture';

describe('Ciclo persistente SRI con respuestas simuladas', () => {
  let doc: any;
  let prisma: any;
  let client: any;
  let service: SriService;
  beforeEach(() => {
    doc = { id: 'documento', companyId: 'empresa', claveAcceso, ambiente: '1', estado: 'FIRMADO', xmlFirmado: xmlPruebas, updatedAt: new Date() };
    prisma = {
      company: { findUniqueOrThrow: jest.fn().mockResolvedValue({ ruc }) },
      electronicDocument: {
        findFirst: jest.fn(async ({ where }) => where.companyId === doc.companyId && where.id === doc.id ? { ...doc } : null),
        findUniqueOrThrow: jest.fn(async () => ({ ...doc })),
        updateMany: jest.fn(async ({ where, data }) => {
          if (where.companyId !== doc.companyId || where.id !== doc.id || where.estado !== doc.estado || (where.updatedAt && where.updatedAt.getTime() !== doc.updatedAt.getTime())) return { count: 0 };
          doc = { ...doc, ...data, updatedAt: new Date(doc.updatedAt.getTime() + 1) }; return { count: 1 };
        }),
        update: jest.fn(async ({ data }) => { doc = { ...doc, ...data, updatedAt: new Date(doc.updatedAt.getTime() + 1) }; return { ...doc }; }),
      },
    };
    client = { recibir: jest.fn(), consultar: jest.fn() };
    service = new SriService(prisma, {} as any, client, { registrar: jest.fn().mockResolvedValue(undefined) } as any);
  });

  it('impide acceso a un comprobante de otra empresa', async () => {
    await expect(service.enviar('otra-empresa', 'documento', 'usuario')).rejects.toThrow('no encontrado');
    expect(client.recibir).not.toHaveBeenCalled();
  });
  it('no envía ni consulta un documento de otro ambiente', async () => {
    doc.ambiente = '2';
    await expect(service.enviar('empresa', 'documento', 'usuario')).rejects.toThrow('otro ambiente');
    await expect(service.consultar('empresa', 'documento', 'usuario')).rejects.toThrow('otro ambiente');
    expect(client.recibir).not.toHaveBeenCalled();
    expect(client.consultar).not.toHaveBeenCalled();
    expect(doc.estado).toBe('FIRMADO');
  });
  it('una recepción exitosa no marca autorizado ni permite reenvío', async () => {
    client.recibir.mockResolvedValue({ estado: 'RECIBIDA', comprobantes: [] });
    expect((await service.enviar('empresa', 'documento', 'usuario')).estado).toBe('RECIBIDA');
    await expect(service.enviar('empresa', 'documento', 'usuario')).rejects.toThrow('Solo se envía');
    expect(client.recibir).toHaveBeenCalledTimes(1);
  });
  it('un timeout conserva un estado incierto y exige consultar', async () => {
    client.recibir.mockRejectedValue(new Error('timeout'));
    await expect(service.enviar('empresa', 'documento', 'usuario')).rejects.toThrow('timeout');
    expect(doc.estado).toBe('POR_CONFIRMAR');
    client.consultar.mockResolvedValue({ claveAcceso, autorizaciones: [] });
    expect((await service.consultar('empresa', 'documento', 'usuario')).estado).toBe('EN_PROCESO');
    await expect(service.enviar('empresa', 'documento', 'usuario')).rejects.toThrow('Solo se envía');
  });
  it('error70 bloquea reenvíos y pasa a consulta', async () => {
    client.recibir.mockResolvedValue({ estado: 'DEVUELTA', comprobantes: [{ claveAcceso, mensajes: [{ identificador: '070' }] }] });
    expect((await service.enviar('empresa', 'documento', 'usuario')).estado).toBe('EN_PROCESO');
  });
  it('solo persiste AUTORIZADO con clave, fecha y ambiente coherentes', async () => {
    doc.estado = 'RECIBIDA';
    client.consultar.mockResolvedValue({ claveAcceso, autorizaciones: [{ estado: 'AUTORIZADO', numeroAutorizacion: claveAcceso,
      fechaAutorizacion: '2026-10-22T15:00:00-05:00', ambiente: 'PRUEBAS', comprobante: xmlPruebas, mensajes: [] }] });
    const resultado = await service.consultar('empresa', 'documento', 'usuario');
    expect(resultado.estado).toBe('AUTORIZADO');
    expect(doc.xmlAutorizado).toContain('<comprobante><![CDATA[');
    expect(doc.respuestaAutorizacion.autorizaciones[0].comprobante).toBeUndefined();
  });
  it('una autorización de producción no cambia el estado local', async () => {
    doc.estado = 'RECIBIDA';
    client.consultar.mockResolvedValue({ claveAcceso, autorizaciones: [{ estado: 'AUTORIZADO', numeroAutorizacion: claveAcceso,
      fechaAutorizacion: '2026-10-22T15:00:00-05:00', ambiente: 'PRODUCCION', comprobante: xmlPruebas, mensajes: [] }] });
    await expect(service.consultar('empresa', 'documento', 'usuario')).rejects.toThrow('no corresponden');
    expect(doc.estado).toBe('RECIBIDA');
  });
  it('dos envíos simultáneos adquieren una sola operación', async () => {
    client.recibir.mockResolvedValue({ estado: 'RECIBIDA', comprobantes: [] });
    const resultados = await Promise.allSettled([service.enviar('empresa', 'documento', 'usuario'), service.enviar('empresa', 'documento', 'usuario')]);
    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(client.recibir).toHaveBeenCalledTimes(1);
  });
});
