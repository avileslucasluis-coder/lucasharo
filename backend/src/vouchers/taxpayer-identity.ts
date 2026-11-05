/** Compare identifiers without losing leading zeroes or changing the source data. */
export function sameTaxpayer(left: string, right: string): boolean {
  const a = left.trim();
  const b = right.trim();
  if (!a || !b) return false;
  if (a === b) return true;
  const cedula = a.length === 10 ? a : b;
  const ruc = a.length === 13 ? a : b;
  // Only a natural person's RUC may be matched to its underlying cédula.
  return /^\d{2}[0-5]\d{7}$/.test(cedula)
    && /^\d{10}001$/.test(ruc)
    && ruc.slice(0, 10) === cedula;
}
