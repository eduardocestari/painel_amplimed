import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createOracleRepository, DuplicateImportError } from './repository.js';

const record = { linhaExcel: 2, nome: 'Pessoa de Teste', email: 'teste@example.test', cpf: '529.982.247-25',
  crm: '000123', especialidade: 'Cardiologia', permissao: 'Médico', perfil: 'Profissional', situacao: 'Cooperado',
  dataCriacaoOriginal: '01/03/2024', dtCriacao: '2024-03-01T12:00:00', clinica: ' Clínica Árvore ', usuclin: '0007',
  ultimoLoginOriginal: '28', dtUltimoLogin: null };
const payload = { records: [record], hash: 'a'.repeat(64), user: { login: 'eacestari' },
  warnings: { cpfInvalido: 0, criacaoInvalida: 0, ultimoLoginInvalido: 1, identificadoresNumericos: 0 } };

function fakeConnection({ duplicate = false, failRows = false, failCommit = false } = {}) {
  const calls = [];
  const connection = {
    calls,
    async execute(sql, binds) {
      calls.push({ operation: 'execute', sql, binds });
      if (sql.includes('FOR UPDATE')) return { rows: [{ NR_ULTIMA_CONCLUSAO: 0 }] };
      if (sql.includes('ARQUIVO_SHA256 = :hash')) return { rows: duplicate ? [['outro-lote']] : [] };
      return { rowsAffected: 1 };
    },
    async executeMany(sql, rows, options) {
      calls.push({ operation: 'executeMany', sql, rows, options });
      if (failRows) throw Object.assign(new Error('Falha simulada'), { code: 'ORA-12899' });
      return { rowsAffected: rows.length };
    },
    async commit() { calls.push({ operation: 'commit' }); if (failCommit) throw new Error('Commit indeterminado'); },
    async rollback() { calls.push({ operation: 'rollback' }); },
    async close() { calls.push({ operation: 'close' }); },
  };
  return connection;
}

test('snapshot grava todas as linhas e conclui em um único commit, com dados brutos preservados', async () => {
  const connection = fakeConnection();
  const repository = createOracleRepository({ schema: 'APP', getConnection: async () => connection });
  const result = await repository.saveSnapshot(payload);
  assert.equal(result.quantidade, 1);
  assert.equal(result.ordem, 1);
  assert.equal(connection.calls.filter(call => call.operation === 'commit').length, 1);
  assert.equal(connection.calls.filter(call => call.operation === 'rollback').length, 0);
  const batch = connection.calls.find(call => call.operation === 'executeMany');
  assert.equal(batch.rows[0].cpfBruto, '529.982.247-25');
  assert.equal(batch.rows[0].cpfNumerico, '52998224725');
  assert.equal(batch.rows[0].crm, '000123');
  assert.equal(batch.rows[0].usuclin, '0007');
  assert.equal(batch.rows[0].ultimoLoginOriginal, '28');
  assert.equal(batch.rows[0].dtUltimoLogin, null);
  assert.equal(batch.rows[0].clinicaChave, 'CLÍNICA ÁRVORE');
  assert.equal(batch.options.autoCommit, false);
  assert.equal(batch.options.batchErrors, false);
  assert.match(batch.sql, /APP\.UDBNU_USUARIOS_AMPLIMED/);
});

test('hash duplicado bloqueia a gravação antes de inserir, salvo confirmação explícita', async () => {
  const connection = fakeConnection({ duplicate: true });
  const repository = createOracleRepository({ schema: 'APP', getConnection: async () => connection });
  await assert.rejects(repository.saveSnapshot(payload), DuplicateImportError);
  assert.equal(connection.calls.some(call => call.operation === 'executeMany'), false);
  assert.equal(connection.calls.filter(call => call.operation === 'rollback').length, 1);
  const accepted = fakeConnection({ duplicate: true });
  const allowed = createOracleRepository({ schema: 'APP', getConnection: async () => accepted });
  assert.equal((await allowed.saveSnapshot({ ...payload, confirmDuplicate: true })).duplicado, true);
});

test('falha antes do commit reverte linhas e registra apenas metadados de falha', async () => {
  const connection = fakeConnection({ failRows: true });
  const repository = createOracleRepository({ schema: 'APP', getConnection: async () => connection });
  await assert.rejects(repository.saveSnapshot(payload), /Falha simulada/);
  assert.equal(connection.calls.filter(call => call.operation === 'rollback').length, 1);
  const audit = connection.calls.find(call => call.sql?.includes("'FALHOU'"));
  assert.equal(audit.binds.erro, 'ORA-12899');
  assert.equal(JSON.stringify(audit.binds).includes('Pessoa de Teste'), false);
  assert.equal(connection.calls.filter(call => call.operation === 'commit').length, 1);
});

test('falha no commit não afirma rollback nem grava auditoria de falha', async () => {
  const connection = fakeConnection({ failCommit: true });
  const repository = createOracleRepository({ schema: 'APP', getConnection: async () => connection });
  await assert.rejects(repository.saveSnapshot(payload), /indeterminado/);
  assert.equal(connection.calls.some(call => call.sql?.includes("'FALHOU'")), false);
  assert.equal(connection.calls.filter(call => call.operation === 'rollback').length, 0);
});

test('leitura usa transação consistente e consulta somente a view do lote concluído', async () => {
  const statements = [];
  const connection = {
    async execute(sql) {
      statements.push(sql);
      if (sql.startsWith('SET TRANSACTION')) return {};
      if (sql.includes('QT_LINHAS FROM')) return { rows: [{ ID_LOTE: 'lote', QT_LINHAS: 1, DT_CONCLUSAO: new Date('2024-05-01T12:00:00Z') }] };
      return { rows: [{ ID_REGISTRO: 7, LINHA_EXCEL: 2, NOME: 'Pessoa de Teste', CPF_BRUTO: '529.982.247-25',
        CRM: '000123', CLINICA: 'Clínica Árvore', ULTIMO_LOGIN_ORIGINAL: '28' }] };
    },
    async rollback() { statements.push('ROLLBACK'); },
    async close() { statements.push('CLOSE'); },
  };
  const repository = createOracleRepository({ schema: 'APP', getConnection: async () => connection });
  const snapshot = await repository.readCurrentSnapshot();
  assert.equal(snapshot.idLote, 'lote');
  assert.equal(snapshot.records[0].cpf, '529.982.247-25');
  assert.equal(snapshot.records[0].ultimoLoginOriginal, '28');
  assert.match(statements[2], /VW_UDBNU_USUARIOS_AMPLIMED_ATUAL/);
  assert.equal(statements[0], 'SET TRANSACTION READ ONLY');
  assert.deepEqual(statements.slice(-2), ['ROLLBACK', 'CLOSE']);
});

test('nome do esquema é validado antes de montar SQL', () => {
  assert.throws(() => createOracleRepository({ schema: 'APP; DROP TABLE X' }), /inválido/);
});
