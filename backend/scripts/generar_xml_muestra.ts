import { create } from 'xmlbuilder2';
import { writeFileSync } from 'fs';

/// Reproduce exactamente la misma estructura y orden de campos que
/// ats.service.ts, pero con datos de muestra fijos (sin depender de la
/// base de datos), para poder validarla con xmllint contra el XSD oficial
/// guardado en resources/ats.xsd.
const doc = create({ version: '1.0', encoding: 'UTF-8' }).ele('iva');
doc.ele('TipoIDInformante').txt('R').up();
doc.ele('IdInformante').txt('0999999999001').up();
doc.ele('razonSocial').txt('CONTRIBUYENTE DE PRUEBA').up();
doc.ele('Anio').txt('2026').up();
doc.ele('Mes').txt('08').up();
doc.ele('numEstabRuc').txt('001').up();
doc.ele('totalVentas').txt('544.52').up();
doc.ele('codigoOperativo').txt('IVA').up();

const compras = doc.ele('compras');
const detCompra = compras.ele('detalleCompras');
detCompra.ele('codSustento').txt('01').up();
detCompra.ele('tpIdProv').txt('01').up();
detCompra.ele('idProv').txt('0992345678001').up();
detCompra.ele('tipoComprobante').txt('01').up();
detCompra.ele('parteRel').txt('NO').up();
detCompra.ele('fechaRegistro').txt('15/08/2026').up();
detCompra.ele('establecimiento').txt('001').up();
detCompra.ele('puntoEmision').txt('001').up();
detCompra.ele('secuencial').txt('123456789').up();
detCompra.ele('fechaEmision').txt('15/08/2026').up();
detCompra.ele('autorizacion').txt('1508202601099234567800110010010000000011234567890').up();
detCompra.ele('baseNoGraIva').txt('0.00').up();
detCompra.ele('baseImponible').txt('20.54').up();
detCompra.ele('baseImpGrav').txt('123.98').up();
detCompra.ele('baseImpExe').txt('0.00').up();
detCompra.ele('montoIce').txt('0.00').up();
detCompra.ele('montoIva').txt('18.60').up();
detCompra.ele('valRetBien10').txt('0.00').up();
detCompra.ele('valRetServ20').txt('0.00').up();
detCompra.ele('valorRetBienes').txt('0.00').up();
detCompra.ele('valRetServ50').txt('0.00').up();
detCompra.ele('valorRetServicios').txt('13.02').up();
detCompra.ele('valRetServ100').txt('0.00').up();
detCompra.ele('pagoExterior')
  .ele('pagoLocExt').txt('01').up()
  .ele('aplicConvDobTrib').txt('NA').up()
  .ele('pagExtSujRetNorLeg').txt('NA').up()
  .up();

const ventas = doc.ele('ventas');
const detVenta = ventas.ele('detalleVentas');
detVenta.ele('tpIdCliente').txt('01').up();
detVenta.ele('idCliente').txt('0993456789001').up();
detVenta.ele('parteRelVtas').txt('NO').up();
detVenta.ele('tipoComprobante').txt('01').up();
detVenta.ele('tipoEmision').txt('E').up();
detVenta.ele('numeroComprobantes').txt('1').up();
detVenta.ele('baseNoGraIva').txt('0.00').up();
detVenta.ele('baseImponible').txt('220.54').up();
detVenta.ele('baseImpGrav').txt('323.98').up();
detVenta.ele('montoIva').txt('39.10').up();
detVenta.ele('montoIce').txt('0.00').up();
detVenta.ele('valorRetIva').txt('0.00').up();
detVenta.ele('valorRetRenta').txt('0.00').up();

const xml = doc.end({ prettyPrint: true });
writeFileSync('/tmp/ats_muestra.xml', xml);
console.log(xml);
