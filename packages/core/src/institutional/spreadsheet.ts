import * as XLSX from 'xlsx'

export const STUDENT_COLUMNS = ['nickname', 'nombre', 'tipo_documento', 'documento', 'edad', 'grupo'] as const
export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
export function studentTemplate(): Uint8Array {
  const book = XLSX.utils.book_new()
  const sheet = XLSX.utils.aoa_to_sheet([[...STUDENT_COLUMNS]])
  sheet['!cols'] = STUDENT_COLUMNS.map(() => ({ wch: 24 }))
  XLSX.utils.book_append_sheet(book, sheet, 'Alumnos')
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
    ['Instrucciones'], ['Complete la hoja Alumnos. Máximo 200 filas. No incluya contraseñas.'],
    ['Documento y nickname deben ser texto. Conserve los ceros iniciales.'],
    ['tipo_documento: cc, ti, ce, pasaporte u otro. Edad: 8 a 120.'],
    ['Use datos autorizados por la institución. No incluya fórmulas.'],
    ['Ejemplo (no se importa):'], [...STUDENT_COLUMNS], ['ana.ia', 'Ana Ejemplo', 'ti', '00123456', 12, 'Grupo A'],
  ]), 'Instrucciones')
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx', compression: true })
}

/** Reject oversized ZIP expansions before the XLSX parser allocates them. */
function checkArchive(bytes: Uint8Array) {
  if (bytes.length > 2 * 1024 * 1024) throw new Error('El archivo supera 2 MB')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let end = -1
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { end = i; break }
  }
  if (end < 0) throw new Error('Se requiere un archivo XLSX válido')
  const count = view.getUint16(end + 10, true)
  let offset = view.getUint32(end + 16, true), total = 0
  if (!count || count > 256) throw new Error('Archivo XLSX demasiado complejo')
  for (let i = 0; i < count; i++) {
    if (offset + 46 > bytes.length || view.getUint32(offset, true) !== 0x02014b50) throw new Error('Archivo XLSX dañado')
    total += view.getUint32(offset + 24, true)
    if (total > 16 * 1024 * 1024 || view.getUint16(offset + 8, true) & 1) throw new Error('Archivo comprimido excesivo o cifrado')
    offset += 46 + view.getUint16(offset + 28, true) + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true)
  }
}
export function parseStudents(bytes: Uint8Array): Record<string, unknown>[] {
  checkArchive(bytes)
  const book = XLSX.read(bytes, { type: 'array', cellFormula: true, sheetRows: 202, sheets: 'Alumnos' })
  const sheet = book.Sheets.Alumnos
  if (!sheet) throw new Error('Falta la hoja Alumnos de la plantilla')
  const range = XLSX.utils.decode_range(sheet['!fullref'] ?? sheet['!ref'] ?? 'A1')
  if (range.e.r > 200 || range.e.c > 5) throw new Error('Máximo 200 alumnos y las seis columnas de la plantilla')
  for (const [address, cell] of Object.entries(sheet)) {
    if (!address.startsWith('!') && cell?.f) throw new Error(`No se permiten fórmulas (${address})`)
  }
  const data = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: '', blankrows: false })
  if (JSON.stringify(data[0]) !== JSON.stringify(STUDENT_COLUMNS)) throw new Error('Encabezados incorrectos: use la plantilla descargable')
  return data.slice(1).map((values, index) => {
    if (typeof values[3] !== 'string') throw new Error(`Fila ${index + 2}: documento debe ser texto para conservar ceros iniciales`)
    return Object.fromEntries(STUDENT_COLUMNS.map((key, i) => [key, values[i]]))
  })
}
