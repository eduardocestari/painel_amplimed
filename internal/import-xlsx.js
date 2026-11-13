import ExcelJS from 'exceljs';
import yauzl from 'yauzl';
import { maskCpf, validCpf } from './registry.js';

export const HEADERS = ['Nome', 'Email', 'CPF', 'CRM', 'Especialidade', 'Permissão', 'Perfil', 'Situação', 'Data de Criação', 'Clínica', 'Usuclin', 'Último login'];
const maxEntries = 200;
const maxExpandedBytes = 30 * 1024 * 1024;
const maxEntryBytes = 15 * 1024 * 1024;
const maxRows = 10_000;

export class ImportValidationError extends Error {
  constructor(message, code = 'ARQUIVO_INVALIDO') { super(message); this.status = 422; this.code = code; }
}

function inspectZip(buffer) {
  return new Promise((resolve, reject) => {
    if (buffer.subarray(0, 4).toString('hex') !== '504b0304') {
      reject(new ImportValidationError('O arquivo não é um XLSX válido.'));
      return;
    }
    yauzl.fromBuffer(buffer, { lazyEntries: true, validateEntrySizes: true, strictFileNames: true }, (error, zip) => {
      if (error) { reject(new ImportValidationError('O arquivo não é um XLSX válido.')); return; }
      let settled = false;
      let count = 0;
      let total = 0;
      const names = new Set();
      const fail = () => {
        if (settled) return;
        settled = true;
        zip.close();
        reject(new ImportValidationError('A estrutura do XLSX é inválida ou excede os limites de segurança.'));
      };
      zip.on('error', fail);
      zip.on('entry', entry => {
        count++;
        total += entry.uncompressedSize;
        const name = entry.fileName;
        if (count > maxEntries || total > maxExpandedBytes || entry.uncompressedSize > maxEntryBytes
          || entry.isEncrypted() || names.has(name)
          || /(^|\/)(vbaProject\.bin|externalLinks|activeX|embeddings|oleObjects|connections|queryTables)(\/|$)/i.test(name)) {
          fail(); return;
        }
        names.add(name);
        if (name.endsWith('/')) { zip.readEntry(); return; }
        zip.openReadStream(entry, (streamError, stream) => {
          if (streamError) { fail(); return; }
          let actual = 0;
          let tail = '';
          stream.on('data', chunk => {
            actual += chunk.length;
            if (actual > maxEntryBytes || actual > entry.uncompressedSize) { stream.destroy(); fail(); return; }
            if (/\.(xml|rels)$/i.test(name)) {
              const sample = tail + chunk.toString('utf8');
              if (/<!\s*(DOCTYPE|ENTITY)/i.test(sample)) { stream.destroy(); fail(); return; }
              tail = sample.slice(-32);
            }
          });
          stream.on('error', fail);
          stream.on('end', () => { if (!settled) zip.readEntry(); });
        });
      });
      zip.on('end', () => {
        if (settled) return;
        settled = true;
        if (!['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml'].every(name => names.has(name))) {
          reject(new ImportValidationError('O arquivo não contém a estrutura XLSX esperada.'));
        } else resolve();
      });
      zip.readEntry();
    });
  });
}

function cellText(cell, identifier = false) {
  const value = cell.value;
  if (value == null) return { text: '', numericIdentifier: false };
  if (value instanceof Date) return { text: value.toISOString(), numericIdentifier: false };
  if (typeof value === 'string') return { text: value, numericIdentifier: false };
  if (typeof value === 'number' && Number.isFinite(value)) return { text: String(value), numericIdentifier: identifier };
  throw new ImportValidationError('A planilha contém célula com fórmula, link ou tipo não aceito.', 'CELULA_NAO_ACEITA');
}

export function parseSourceDate(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(text)) {
    const date = new Date(text);
    return Number.isFinite(date.getTime()) && date.toISOString() === (text.includes('.') ? text : text.replace('Z', '.000Z'))
      ? date.toISOString() : null;
  }
  const match = /^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(text);
  if (!match) return null;
  const [, day, month, year, hour = '12', minute = '00', second = '00'] = match;
  const y = Number(year), m = Number(month), d = Number(day), h = Number(hour), min = Number(minute), sec = Number(second);
  const check = new Date(Date.UTC(y, m - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() + 1 !== m || check.getUTCDate() !== d || h > 23 || min > 59 || sec > 59) return null;
  return `${year}-${month}-${day}T${hour}:${minute}:${second}`;
}

export async function parseAmplimedXlsx(buffer) {
  await inspectZip(buffer);
  const workbook = new ExcelJS.Workbook();
  try { await workbook.xlsx.load(buffer); }
  catch { throw new ImportValidationError('Não foi possível ler o conteúdo do XLSX.'); }
  if (workbook.worksheets.length !== 1) throw new ImportValidationError('O XLSX deve conter exatamente uma aba de dados.');
  const sheet = workbook.worksheets[0];
  if (sheet.rowCount - 1 > maxRows) throw new ImportValidationError('A planilha excede o limite de 10.000 linhas.');
  const headers = HEADERS.map((_, index) => cellText(sheet.getRow(1).getCell(index + 1)).text);
  if (HEADERS.some((expected, index) => headers[index] !== expected) || sheet.getRow(1).cellCount !== HEADERS.length) {
    throw new ImportValidationError('Os 12 cabeçalhos devem corresponder exatamente ao modelo Amplimed, na mesma ordem.', 'CABECALHOS_INVALIDOS');
  }
  const records = [];
  const warnings = { cpfInvalido: 0, criacaoInvalida: 0, ultimoLoginInvalido: 0, identificadoresNumericos: 0 };
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    if (row.cellCount > HEADERS.length) throw new ImportValidationError('Há colunas extras fora do modelo Amplimed.');
    const values = HEADERS.map((_, index) => {
      const { text, numericIdentifier } = cellText(row.getCell(index + 1), [2, 3, 10].includes(index));
      if (text.length > 1000) throw new ImportValidationError('Há valor de célula acima do limite permitido.');
      if (numericIdentifier) warnings.identificadoresNumericos++;
      return text;
    });
    if (values.every(value => value === '')) throw new ImportValidationError('Há linha vazia entre os dados.');
    const [nome, email, cpf, crm, especialidade, permissao, perfil, situacao, dataCriacaoOriginal, clinica, usuclin, ultimoLoginOriginal] = values;
    const cpfNumerico = validCpf(cpf);
    const dtCriacao = parseSourceDate(dataCriacaoOriginal);
    const dtUltimoLogin = parseSourceDate(ultimoLoginOriginal);
    if (!cpfNumerico) warnings.cpfInvalido++;
    if (dataCriacaoOriginal && !dtCriacao) warnings.criacaoInvalida++;
    if (ultimoLoginOriginal && !dtUltimoLogin) warnings.ultimoLoginInvalido++;
    records.push({ id: rowNumber - 1, linhaExcel: rowNumber, nome, email, cpf, cpfNumerico, crm, especialidade, permissao, perfil, situacao,
      dataCriacaoOriginal, dtCriacao, clinica, usuclin, ultimoLoginOriginal, dtUltimoLogin });
  }
  if (!records.length) throw new ImportValidationError('A planilha não contém linhas de dados.');
  return { total: records.length, warnings, records,
    preview: records.slice(0, 5).map(record => ({ linhaExcel: record.linhaExcel, nome: record.nome, clinica: record.clinica,
      especialidade: record.especialidade, permissao: record.permissao, cpfMascarado: maskCpf(record.cpf),
      ultimoLoginOriginal: record.ultimoLoginOriginal,
      ultimoLogin: record.dtUltimoLogin ? record.ultimoLoginOriginal : 'Não informada' })) };
}
