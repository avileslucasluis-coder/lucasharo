import { assertSriProductionEnabled, authorizationEnvironment, sriEndpoints, sriEnvironment, xmlEnvironmentCode } from '../src/sri/sri-environment';

describe('Configuración de ambientes SRI', () => {
  it('usa pruebas y los endpoints de certificación por defecto', () => {
    expect(sriEnvironment({})).toBe('PRUEBAS');
    expect(sriEndpoints('PRUEBAS').recepcion).toBe('https://celcer.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline');
    expect(xmlEnvironmentCode('PRUEBAS')).toBe('1');
  });

  it('selecciona producción sin dejarla habilitada solo por el nombre del ambiente', () => {
    const env = { SRI_ENVIRONMENT: 'produccion', NODE_ENV: 'production' } as NodeJS.ProcessEnv;
    expect(sriEnvironment(env)).toBe('PRODUCCION');
    expect(sriEndpoints('PRODUCCION').autorizacion).toBe('https://cel.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline');
    expect(() => assertSriProductionEnabled(env)).toThrow('no está habilitada');
    expect(authorizationEnvironment('PRODUCCION')).toEqual(['PRODUCCION', '2']);
  });

  it('solo habilita envío productivo con ambas condiciones explícitas', () => {
    expect(() => assertSriProductionEnabled({ SRI_ENVIRONMENT: 'produccion', NODE_ENV: 'production', SRI_ENABLE_PRODUCTION: 'true' })).not.toThrow();
    expect(() => sriEnvironment({ SRI_ENVIRONMENT: 'otro' })).toThrow('debe ser pruebas o produccion');
  });
});
