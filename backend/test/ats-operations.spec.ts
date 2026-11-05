import { operationSchema, validateOperation } from '../src/ats/ats-operation-schema';
import { AtsService } from '../src/ats/ats.service';
import { XMLParser } from 'fast-xml-parser';

const purchase = () => ({ codSustento:'02',tpIdProv:'03',idProv:'EXTERIOR123',tipoComprobante:'15',tipoProv:'02',denoProv:'PROVEEDOR EXTERIOR',parteRel:'NO',
  fechaRegistro:'15/10/2026',establecimiento:'001',puntoEmision:'001',secuencial:'123',fechaEmision:'10/10/2026',autorizacion:'1234567890',
  baseNoGraIva:'100.00',baseImponible:'0.00',baseImpGrav:'0.00',baseImpExe:'0.00',montoIce:'0.00',montoIva:'0.00',
  valorRetBienes:'0.00',valorRetServicios:'0.00',valRetServ100:'0.00',
  pagoExterior:{pagoLocExt:'02',tipoRegi:'01',paisEfecPagoGen:'249',aplicConvDobTrib:'NO',pagExtSujRetNorLeg:'NO'} });
const exporting = () => ({tpIdClienteEx:'06',idClienteEx:'EXTERIOR123',parteRelExp:'NO',tipoCli:'02',denoExpCli:'CLIENTE EXTERIOR',tipoRegi:'01',paisEfecPagoGen:'249',
  exportacionDe:'03',tipIngExt:'101',ingExtGravOtroPais:'NO',tipoComprobante:'01',fechaEmbarque:'15/10/2026',valorFOB:'100.00',valorFOBComprobante:'100.00',
  establecimiento:'001',puntoEmision:'001',secuencial:'123',autorizacion:'1234567890',fechaEmision:'10/10/2026'});
const cancelled = () => ({tipoComprobante:'01',establecimiento:'001',puntoEmision:'001',secuencialInicio:'1',secuencialFin:'10',autorizacion:'1234567890'});
const reimbursement = () => ({...purchase(),tipoComprobante:'41',tpIdProv:'01',idProv:'0999999999001',totbasesImpReemb:'100.00',
  pagoExterior:{pagoLocExt:'01',aplicConvDobTrib:'NA',pagExtSujRetNorLeg:'NA'},
  reembolsos:{reembolso:[{tipoComprobanteReemb:'01',tpIdProvReemb:'01',idProvReemb:'0999999998001',establecimientoReemb:'001',puntoEmisionReemb:'001',secuencialReemb:'25',
    fechaEmisionReemb:'09/10/2026',autorizacionReemb:'1234567890',baseImponibleReemb:'100.00',baseImpGravReemb:'0.00',baseNoGraIvaReemb:'0.00',baseImpExeReemb:'0.00',montoIceRemb:'0.00',montoIvaRemb:'0.00'}]}});

describe('Operaciones complementarias ATS', () => {
  it.each([['IMPORTACION',purchase],['COMPRA_ESPECIAL',purchase],['EXPORTACION',exporting],['REEMBOLSO',reimbursement],['ANULADO',cancelled]] as const)('%s valida con el XSD real', async (kind,make) => {
    await expect(validateOperation(kind,make(),10,2026)).resolves.toBeUndefined();
  });
  it('incluye los campos anidados de rendimientos financieros', () => {
    const schema = operationSchema('RENDIMIENTO');
    expect(schema.fields.find(f => f.name === 'retenciones')?.children?.[0].children?.some(f => f.name === 'airRend')).toBe(true);
  });
  it('valida rendimientos con cuentas exentas y fideicomisos', async () => {
    await validateOperation('RENDIMIENTO',{retenido:'01',idRetenido:'0999999999001',ctaExenta:{totalDep:'1000.00',rendGen:'10.00'}},10,2026);
    await validateOperation('FIDEICOMISO',{tipoBeneficiario:'01',idBeneficiario:'0999999999001',rucFideicomiso:'0999999998001',fValor:{detallefValor:[{tipoFideicomiso:'01',totalF:'100.00',individualF:'100.00',porRetF:'0.00',valorRetF:'0.00'}]}},10,2026);
  });
  it('valida RECAP y exportación de bienes con refrendo', async () => {
    await validateOperation('RECAP',{establecimientoRecap:'01',identificacionRecap:'0999999999001',tipoComprobante:'01',numeroRecap:'123',fechaPago:'15/10/2026',tarjetaCredito:'01',fechaEmisionRecap:'10/10/2026',consumoCero:'100.00',consumoGravado:'0.00',totalConsumo:'100.00',montoIva:'0.00',comision:'1.00',numeroVouchers:'1',valorRetBienes:'0.00',valorRetServicios:'0.00',valRetServ100:'0.00',establecimiento:'001',puntoEmision:'001',secuencial:'123',autorizacion:'1234567890',fechaEmision:'15/10/2026'},10,2026);
    await validateOperation('EXPORTACION',{...exporting(),exportacionDe:'01',tipoComprobante:'16',distAduanero:'028',anio:'2026',regimen:'40',correlativo:'12345678',docTransp:'DOCUMENTO123'},10,2026);
  });
  it('rechaza período distinto y fecha inexistente', async () => {
    await expect(validateOperation('IMPORTACION',purchase(),9,2026)).rejects.toThrow('período');
    await expect(validateOperation('IMPORTACION',{...purchase(),fechaRegistro:'31/02/2026'},2,2026)).rejects.toThrow('inexistente');
  });
  it('exige país fiscal del pago al exterior', async () => {
    const data:any = purchase(); delete data.pagoExterior.paisEfecPagoGen;
    await expect(validateOperation('IMPORTACION',data,10,2026)).rejects.toThrow('paisEfecPagoGen');
  });
  it('exige documentos aduaneros para exportación con refrendo', async () => {
    await expect(validateOperation('EXPORTACION',{...exporting(),exportacionDe:'01'},10,2026)).rejects.toThrow('distAduanero');
  });
  it('detecta bases de reembolso diferentes y sustentos duplicados', async () => {
    await expect(validateOperation('REEMBOLSO',{...reimbursement(),totbasesImpReemb:'99.00'},10,2026)).rejects.toThrow('no coincide');
    const data = reimbursement(); data.reembolsos.reembolso.push({...data.reembolsos.reembolso[0]});
    await expect(validateOperation('REEMBOLSO',data,10,2026)).rejects.toThrow('repetido');
  });
  it('rechaza rangos invertidos y campos ajenos al esquema', async () => {
    await expect(validateOperation('ANULADO',{...cancelled(),secuencialFin:'0'},10,2026)).rejects.toThrow();
    await expect(validateOperation('ANULADO',{...cancelled(),extra:'inventado'},10,2026)).rejects.toThrow('desconocido');
  });
  it('genera compras, reembolso, exportación y anulados en un XML validado', async () => {
    const operations = [['IMPORTACION',purchase()],['REEMBOLSO',reimbursement()],['EXPORTACION',exporting()],['ANULADO',cancelled()]].map(([kind,data],i) => ({id:`op${i}`,kind,data}));
    const company = {ruc:'0999999999001',razonSocial:'PRUEBA ATS ESPECIALES'};
    const prisma:any = {company:{findUnique:async()=>company,findUniqueOrThrow:async()=>company},voucher:{findMany:async()=>[]},atsOperation:{findMany:async()=>operations},establishment:{count:async()=>1},atsReport:{upsert:async()=>({id:'report'})}};
    const {xml} = await new AtsService(prisma,{registrar:async()=>{}} as any).generarXml('company',10,2026,'user');
    const parsed = new XMLParser({parseTagValue:false}).parse(xml).iva;
    expect(parsed.compras.detalleCompras).toHaveLength(2);
    expect(parsed.exportaciones.detalleExportaciones.exportacionDe).toBe('03');
    expect(parsed.anulados.detalleAnulados.secuencialFin).toBe('10');
  });
});
