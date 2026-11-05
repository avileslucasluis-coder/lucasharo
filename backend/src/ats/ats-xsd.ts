import { readFile } from 'fs/promises';
import { join } from 'path';
import { validateXML } from 'xmllint-wasm';
import { BadRequestException } from '@nestjs/common';
export async function validarXsd(xml: string) {
  const schema = await readFile(join(__dirname, '../../resources/ats.xsd'), 'utf8');
  const result = await validateXML({ xml: [{ fileName: 'ats.xml', contents: xml }], schema: [schema], maxMemoryPages: 1024 });
  if (!result.valid) throw new BadRequestException({ message: 'El ATS no cumple el XSD. Corrige los datos antes de descargar.',
    errores: result.errors.slice(0,20).map(e => e.message) });
}
