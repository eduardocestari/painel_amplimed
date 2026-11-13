import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createImportService, importConfig } from './import-service.js';
import { ImportValidationError } from './import-xlsx.js';

test('simulação registra histórico sem dados pessoais e aponta hash duplicado', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'saude-integrada-import-'));
  try {
    const historyPath = join(dir, 'history.json');
    const service = createImportService({ historyPath, parse: async () => ({ total: 2,
      warnings: { cpfInvalido: 1, criacaoInvalida: 0, ultimoLoginInvalido: 1, identificadoresNumericos: 0 },
      preview: [{ nome: 'Pessoa Teste', cpfMascarado: '***.***.247-**' }] }) });
    const input = { buffer: Buffer.from('conteúdo sintético'), fileName: 'reseller.xlsx', user: { login: 'eduardo' }, maxBytes: 1024 };
    const first = await service.simulate(input);
    const second = await service.simulate(input);
    assert.equal(first.lote.resultado, 'VALIDADO');
    assert.equal(second.lote.duplicadoDe, first.lote.id);
    assert.equal(second.persistenceAvailable, false);
    const history = await service.list();
    assert.equal(history.length, 2);
    assert.equal(history[0].quantidade, 2);
    const onDisk = await readFile(historyPath, 'utf8');
    assert.equal(onDisk.includes('Pessoa Teste'), false);
    assert.equal(onDisk.includes('cpfMascarado'), false);
  } finally { await rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); }
});

test('configuração limita tamanho e restringe importadores por login explícito', () => {
  const config = importConfig({ SAUDE_INTEGRADA_IMPORT_MAX_BYTES: '500', SAUDE_INTEGRADA_IMPORT_LOGINS: 'Eduardo, ana' });
  assert.equal(config.maxBytes, 1024 * 1024);
  assert.equal(config.logins.has('eduardo'), true);
  assert.equal(config.logins.has('outro'), false);
  assert.throws(() => importConfig({ SAUDE_INTEGRADA_IMPORT_EXTENSION: '.xlsm' }), /somente extensão/);
});

test('arquivo rejeitado fica no histórico sem conteúdo da planilha', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'saude-integrada-rejected-'));
  try {
    const historyPath = join(dir, 'history.json');
    const service = createImportService({ historyPath, parse: async () => { throw new ImportValidationError('Cabeçalhos inválidos.', 'CABECALHOS_INVALIDOS'); } });
    await assert.rejects(service.simulate({ buffer: Buffer.from('texto privado'), fileName: 'dados.xlsx',
      user: { login: 'eduardo' }, maxBytes: 1024 }), /Cabeçalhos inválidos/);
    const [entry] = await service.list();
    assert.equal(entry.resultado, 'REJEITADO');
    assert.equal(entry.codigoErro, 'CABECALHOS_INVALIDOS');
    assert.equal((await readFile(historyPath, 'utf8')).includes('texto privado'), false);
  } finally { await rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); }
});
