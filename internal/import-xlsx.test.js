import assert from 'node:assert/strict';
import { test } from 'node:test';
import ExcelJS from 'exceljs';
import { HEADERS, ImportValidationError, parseAmplimedXlsx, parseSourceDate } from './import-xlsx.js';

async function workbookBuffer({ headers = HEADERS, rows = [] } = {}) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Dados');
  sheet.addRow(headers);
  for (const row of rows) sheet.addRow(row);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

const first = ['Pessoa Teste', 'teste@example.test', '529.982.247-25', '000123', 'Cardiologia', 'Médico', 'Profissional',
  'Cooperado', '01/03/2024', 'Clínica Teste', '0007', '28'];

test('valida XLSX, preserva linhas e texto original, deriva datas sem alterar valor inválido', async () => {
  const parsed = await parseAmplimedXlsx(await workbookBuffer({ rows: [first, ['Outra Pessoa', '', 52998224725, 123, '', 'Médico', '', '', '29/02/2024', 'Clínica Teste', 7, '01/05/2024']] }));
  assert.equal(parsed.total, 2);
  assert.equal(parsed.records[0].linhaExcel, 2);
  assert.equal(parsed.records[0].crm, '000123');
  assert.equal(parsed.records[0].usuclin, '0007');
  assert.equal(parsed.records[0].ultimoLoginOriginal, '28');
  assert.equal(parsed.records[0].dtUltimoLogin, null);
  assert.equal(parsed.records[1].cpf, '52998224725');
  assert.equal(parsed.records[1].dtCriacao, '2024-02-29T12:00:00');
  assert.equal(parsed.warnings.ultimoLoginInvalido, 1);
  assert.equal(parsed.warnings.identificadoresNumericos, 3);
  assert.equal(parsed.preview[0].cpfMascarado, '***.***.247-**');
  assert.equal(parsed.preview[0].ultimoLoginOriginal, '28');
  assert.equal(JSON.stringify(parsed.preview).includes('teste@example.test'), false);
});

test('rejeita cabeçalho diferente, fórmula e arquivo que não é XLSX', async () => {
  await assert.rejects(parseAmplimedXlsx(Buffer.from('não é XLSX')), ImportValidationError);
  const headers = [...HEADERS]; headers[2] = 'Documento';
  await assert.rejects(parseAmplimedXlsx(await workbookBuffer({ headers, rows: [first] })), /12 cabeçalhos/);
  const formulaRow = [...first]; formulaRow[3] = { formula: '1+1', result: 2 };
  await assert.rejects(parseAmplimedXlsx(await workbookBuffer({ rows: [formulaRow] })), /fórmula/);
});

test('datas inválidas não entram na data derivada', () => {
  assert.equal(parseSourceDate('28'), null);
  assert.equal(parseSourceDate('31/02/2024'), null);
  assert.equal(parseSourceDate('29/02/2024'), '2024-02-29T12:00:00');
});
