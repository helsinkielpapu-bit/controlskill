// F-11. Decimal flexible: acepta coma o punto como separador.
export function parseDecimal(raw: unknown): number {
  const s = String(raw).trim().replace(/\s/g, '');
  if (!s) return NaN;
  const nCommas = (s.match(/,/g) || []).length;
  const nDots = (s.match(/\./g) || []).length;
  if (nCommas === 0 && nDots <= 1) return parseFloat(s);
  if (nCommas > 0 && nDots > 0) {
    return s.lastIndexOf(',') > s.lastIndexOf('.')
      ? parseFloat(s.replace(/\./g, '').replace(',', '.'))
      : parseFloat(s.replace(/,/g, ''));
  }
  if (nCommas > 0) {
    return nCommas === 1 ? parseFloat(s.replace(',', '.')) : parseFloat(s.replace(/,/g, ''));
  }
  return parseFloat(s.replace(/\./g, ''));
}

/** Conversión simple de celdas de Excel: reemplaza solo la primera coma. */
export function parseExcelCell(raw: unknown): number {
  return parseFloat(String(raw).replace(',', '.'));
}
