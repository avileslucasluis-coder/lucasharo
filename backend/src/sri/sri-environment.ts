import { ForbiddenException, ServiceUnavailableException } from '@nestjs/common';

export type SriEnvironment = 'PRUEBAS' | 'PRODUCCION';

/** The live authorization service uses PRODUCCIÓN, with an accent. */
export function normalizeAuthorizationEnvironment(value: string): string {
  return value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
}

export function sriEnvironment(env: NodeJS.ProcessEnv = process.env): SriEnvironment {
  const configured = (env.SRI_ENVIRONMENT ?? 'pruebas').trim().toLowerCase();
  if (configured === 'pruebas') return 'PRUEBAS';
  if (configured === 'produccion') return 'PRODUCCION';
  throw new ServiceUnavailableException('SRI_ENVIRONMENT debe ser pruebas o produccion.');
}

export function sriEndpoints(environment: SriEnvironment) {
  const base = environment === 'PRODUCCION'
    ? 'https://cel.sri.gob.ec/comprobantes-electronicos-ws/'
    : 'https://celcer.sri.gob.ec/comprobantes-electronicos-ws/';
  return {
    recepcion: base + 'RecepcionComprobantesOffline',
    autorizacion: base + 'AutorizacionComprobantesOffline',
  };
}

/** Producción exige una habilitación inequívoca en el servidor; nunca se activa desde la interfaz. */
export function assertSriProductionEnabled(env: NodeJS.ProcessEnv = process.env) {
  if (sriEnvironment(env) !== 'PRODUCCION') return;
  if (env.NODE_ENV !== 'production' || env.SRI_ENABLE_PRODUCTION !== 'true') {
    throw new ForbiddenException('La emisión SRI en producción no está habilitada en este servidor.');
  }
}

export function xmlEnvironmentCode(environment: SriEnvironment) { return environment === 'PRODUCCION' ? '2' : '1'; }
export function authorizationEnvironment(environment: SriEnvironment) { return environment === 'PRODUCCION' ? ['PRODUCCION', '2'] : ['PRUEBAS', '1']; }
