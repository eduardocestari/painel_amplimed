import { randomUUID } from 'node:crypto';
import oracledb from 'oracledb';
import { clinicKey, validCpf } from '../internal/registry.js';
import { acquireConnection } from './database.js';

const limits = {
  nome: 300, email: 320, cpf: 100, crm: 100, especialidade: 250, permissao: 100,
  perfil: 100, situacao: 100, dataCriacaoOriginal: 100, clinica: 500, usuclin: 100, ultimoLoginOriginal: 100,
};

export class DuplicateImportError extends Error {
  constructor() { super('Arquivo idêntico a um lote concluído. Confirmação explícita necessária.'); this.status = 409; }
}

function ownerName(schema) {
  const value = String(schema || '').trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9_$#]{0,127}$/.test(value)) throw new Error('ORACLE_APP_SCHEMA inválido.');
  return value;
}

const dateValue = value => {
  if (value == null || value === '') return null;
  const text = String(value).slice(0, 19);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(text)) throw new Error('Data normalizada inválida.');
  return text;
};
const iso = value => value instanceof Date ? value.toISOString() : value == null ? null : String(value);
const string = value => value == null ? '' : String(value);

function validateSnapshot({ records, hash, user, warnings }) {
  if (!Array.isArray(records) || records.length < 1 || records.length > 10_000 || !/^[a-f0-9]{64}$/i.test(hash || '')
    || !user?.login || String(user.login).length > 200) throw new Error('Lote inválido.');
  const lines = new Set();
  for (const record of records) {
    if (!Number.isSafeInteger(record.linhaExcel) || record.linhaExcel < 2 || lines.has(record.linhaExcel)) throw new Error('Linha de origem inválida.');
    lines.add(record.linhaExcel);
    for (const [field, max] of Object.entries(limits)) {
      const value = string(record[field]);
      if ([...value].length > max || Buffer.byteLength(value, 'utf8') > 4000) throw new Error('Valor acima do limite da coluna.');
    }
    dateValue(record.dtCriacao);
    dateValue(record.dtUltimoLogin);
  }
  for (const key of ['cpfInvalido', 'criacaoInvalida', 'ultimoLoginInvalido', 'identificadoresNumericos']) {
    if (!Number.isSafeInteger(warnings?.[key]) || warnings[key] < 0 || warnings[key] > records.length * 3) throw new Error('Contagem de avisos inválida.');
  }
}

function rowBinds(record, idLote) {
  const cpfNumerico = validCpf(record.cpf);
  return { idLote, linhaExcel: record.linhaExcel, nome: record.nome, email: record.email, cpfBruto: record.cpf,
    cpfNumerico, cpfValido: cpfNumerico ? 'S' : 'N', crm: record.crm, especialidade: record.especialidade,
    permissao: record.permissao, perfil: record.perfil, situacao: record.situacao,
    dataCriacaoOriginal: record.dataCriacaoOriginal, dtCriacao: dateValue(record.dtCriacao),
    clinica: record.clinica, clinicaChave: clinicKey(record.clinica), usuclin: record.usuclin,
    ultimoLoginOriginal: record.ultimoLoginOriginal, dtUltimoLogin: dateValue(record.dtUltimoLogin) };
}

const textBind = maxSize => ({ type: oracledb.STRING, maxSize });
const bindDefs = {
  idLote: textBind(36), linhaExcel: { type: oracledb.NUMBER }, nome: textBind(1200), email: textBind(1280),
  cpfBruto: textBind(400), cpfNumerico: textBind(11), cpfValido: textBind(1), crm: textBind(400),
  especialidade: textBind(1000), permissao: textBind(400), perfil: textBind(400), situacao: textBind(400),
  dataCriacaoOriginal: textBind(400), dtCriacao: textBind(19), clinica: textBind(2000), clinicaChave: textBind(2000),
  usuclin: textBind(400), ultimoLoginOriginal: textBind(400), dtUltimoLogin: textBind(19),
};

function mapRecord(row) {
  return { id: row.ID_REGISTRO, linhaExcel: row.LINHA_EXCEL, nome: string(row.NOME), email: string(row.EMAIL),
    cpf: string(row.CPF_BRUTO), cpfNumerico: row.CPF_NUMERICO, crm: string(row.CRM),
    especialidade: string(row.ESPECIALIDADE), permissao: string(row.PERMISSAO), perfil: string(row.PERFIL),
    situacao: string(row.SITUACAO), dataCriacaoOriginal: string(row.DATA_CRIACAO_ORIGINAL), dtCriacao: iso(row.DT_CRIACAO),
    clinica: string(row.CLINICA), usuclin: string(row.USUCLIN), ultimoLoginOriginal: string(row.ULTIMO_LOGIN_ORIGINAL),
    dtUltimoLogin: iso(row.DT_ULTIMO_LOGIN) };
}

export function createOracleRepository({ schema = process.env.ORACLE_APP_SCHEMA, getConnection = acquireConnection } = {}) {
  const owner = ownerName(schema);
  const table = name => `${owner}.${name}`;
  const lotes = table('UDBNU_AMPLIMED_IMPORTACOES');
  const controle = table('UDBNU_AMPLIMED_CONTROLE');
  const usuarios = table('UDBNU_USUARIOS_AMPLIMED');
  const atual = table('VW_UDBNU_USUARIOS_AMPLIMED_ATUAL');
  const currentLotSql = `SELECT ID_LOTE, NR_CONCLUSAO, DT_CONCLUSAO, QT_LINHAS FROM ${lotes}
    WHERE SITUACAO_LOTE = 'CONCLUIDO' AND NR_CONCLUSAO =
      (SELECT MAX(NR_CONCLUSAO) FROM ${lotes} WHERE SITUACAO_LOTE = 'CONCLUIDO')`;
  const rowsSql = `SELECT ID_REGISTRO, LINHA_EXCEL, NOME, EMAIL, CPF_BRUTO, CPF_NUMERICO, CRM, ESPECIALIDADE,
    PERMISSAO, PERFIL, SITUACAO, DATA_CRIACAO_ORIGINAL, DT_CRIACAO, CLINICA, USUCLIN,
    ULTIMO_LOGIN_ORIGINAL, DT_ULTIMO_LOGIN FROM ${atual} ORDER BY LINHA_EXCEL`;
  const insertSql = `INSERT INTO ${usuarios} (ID_LOTE, LINHA_EXCEL, NOME, EMAIL, CPF_BRUTO, CPF_NUMERICO, CPF_VALIDO,
    CRM, ESPECIALIDADE, PERMISSAO, PERFIL, SITUACAO, DATA_CRIACAO_ORIGINAL, DT_CRIACAO, CLINICA, CLINICA_CHAVE,
    USUCLIN, ULTIMO_LOGIN_ORIGINAL, DT_ULTIMO_LOGIN) VALUES (:idLote, :linhaExcel, :nome, :email, :cpfBruto,
    :cpfNumerico, :cpfValido, :crm, :especialidade, :permissao, :perfil, :situacao, :dataCriacaoOriginal,
    TO_DATE(:dtCriacao, 'YYYY-MM-DD"T"HH24:MI:SS'), :clinica, :clinicaChave, :usuclin, :ultimoLoginOriginal,
    TO_DATE(:dtUltimoLogin, 'YYYY-MM-DD"T"HH24:MI:SS'))`;

  return {
    async readCurrentSnapshot() {
      const connection = await getConnection();
      try {
        await connection.execute('SET TRANSACTION READ ONLY');
        const lot = (await connection.execute(currentLotSql, {}, { outFormat: oracledb.OUT_FORMAT_OBJECT })).rows?.[0];
        if (!lot) return null;
        const result = await connection.execute(rowsSql, {}, { outFormat: oracledb.OUT_FORMAT_OBJECT, maxRows: 10_001 });
        const records = (result.rows || []).map(mapRecord);
        if (records.length !== Number(lot.QT_LINHAS)) throw new Error('Contagem do lote atual inconsistente.');
        return { idLote: lot.ID_LOTE, completedAt: iso(lot.DT_CONCLUSAO), records };
      } finally {
        try { await connection.rollback(); } finally { await connection.close(); }
      }
    },

    async listHistory() {
      const connection = await getConnection();
      try {
        const sql = `SELECT * FROM (SELECT ID_LOTE, NR_CONCLUSAO, DT_INICIO, DT_CONCLUSAO, USUARIO_AD,
          QT_LINHAS, QT_CPF_INVALIDO, QT_DATAS_INVALIDAS, QT_IDS_NUMERICOS, SITUACAO_LOTE, ERRO_CODIGO
          FROM ${lotes} ORDER BY DT_INICIO DESC, ID_LOTE DESC) WHERE ROWNUM <= 50`;
        const result = await connection.execute(sql, {}, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        return (result.rows || []).map(row => ({ id: row.ID_LOTE, startedAt: iso(row.DT_INICIO),
          completedAt: iso(row.DT_CONCLUSAO), usuarioAd: row.USUARIO_AD, quantidade: row.QT_LINHAS,
          resultado: row.SITUACAO_LOTE, codigoErro: row.ERRO_CODIGO,
          avisos: { cpfInvalido: row.QT_CPF_INVALIDO, datasInvalidas: row.QT_DATAS_INVALIDAS,
            identificadoresNumericos: row.QT_IDS_NUMERICOS } }));
      } finally { await connection.close(); }
    },

    async saveSnapshot({ records, hash, user, warnings, confirmDuplicate = false }) {
      validateSnapshot({ records, hash, user, warnings });
      const idLote = randomUUID();
      const connection = await getConnection();
      let inserted = false;
      let commitStarted = false;
      try {
        const lock = await connection.execute(`SELECT NR_ULTIMA_CONCLUSAO FROM ${controle} WHERE CHAVE = 1 FOR UPDATE`, {},
          { outFormat: oracledb.OUT_FORMAT_OBJECT, autoCommit: false });
        const previous = lock.rows?.[0]?.NR_ULTIMA_CONCLUSAO;
        if (!Number.isSafeInteger(previous) || previous < 0) throw new Error('Linha de controle ausente ou inválida.');
        const duplicate = await connection.execute(`SELECT ID_LOTE FROM ${lotes}
          WHERE ARQUIVO_SHA256 = :hash AND SITUACAO_LOTE = 'CONCLUIDO' AND ROWNUM = 1`, { hash });
        if (duplicate.rows?.length && !confirmDuplicate) throw new DuplicateImportError();
        await connection.execute(`INSERT INTO ${lotes} (ID_LOTE, USUARIO_AD, ARQUIVO_SHA256, QT_LINHAS,
          QT_CPF_INVALIDO, QT_DATAS_INVALIDAS, QT_IDS_NUMERICOS, SITUACAO_LOTE)
          VALUES (:idLote, :usuario, :hash, :quantidade, :cpfInvalido, :datasInvalidas, :idsNumericos, 'PROCESSANDO')`,
        { idLote, usuario: user.login, hash, quantidade: records.length, cpfInvalido: warnings.cpfInvalido,
          datasInvalidas: warnings.criacaoInvalida + warnings.ultimoLoginInvalido,
          idsNumericos: warnings.identificadoresNumericos }, { autoCommit: false });
        inserted = true;
        let saved = 0;
        for (let start = 0; start < records.length; start += 500) {
          const chunk = records.slice(start, start + 500).map(record => rowBinds(record, idLote));
          const result = await connection.executeMany(insertSql, chunk,
            { bindDefs, autoCommit: false, batchErrors: false });
          saved += result.rowsAffected || 0;
        }
        if (saved !== records.length) throw new Error('Quantidade inserida diferente da validada.');
        const order = previous + 1;
        const completed = await connection.execute(`UPDATE ${lotes} SET SITUACAO_LOTE = 'CONCLUIDO',
          NR_CONCLUSAO = :ordem, DT_CONCLUSAO = SYSTIMESTAMP WHERE ID_LOTE = :idLote AND SITUACAO_LOTE = 'PROCESSANDO'`,
        { ordem: order, idLote }, { autoCommit: false });
        const advanced = await connection.execute(`UPDATE ${controle} SET NR_ULTIMA_CONCLUSAO = :ordem WHERE CHAVE = 1`,
          { ordem: order }, { autoCommit: false });
        if (completed.rowsAffected !== 1 || advanced.rowsAffected !== 1) throw new Error('Conclusão do lote inconsistente.');
        commitStarted = true;
        await connection.commit();
        return { idLote, ordem: order, quantidade: saved, duplicado: Boolean(duplicate.rows?.length) };
      } catch (error) {
        if (commitStarted) throw new Error('Resultado do commit indeterminado; conferir o ID do lote antes de repetir.');
        await connection.rollback();
        if (inserted) {
          const code = /^ORA-\d{5}$/.test(error?.code || '') ? error.code : 'IMPORT_FAILED';
          try {
            await connection.execute(`INSERT INTO ${lotes} (ID_LOTE, USUARIO_AD, ARQUIVO_SHA256, QT_LINHAS,
              QT_CPF_INVALIDO, QT_DATAS_INVALIDAS, QT_IDS_NUMERICOS, SITUACAO_LOTE, ERRO_CODIGO)
              VALUES (:idLote, :usuario, :hash, :quantidade, :cpfInvalido, :datasInvalidas, :idsNumericos, 'FALHOU', :erro)`,
            { idLote, usuario: user.login, hash, quantidade: records.length, cpfInvalido: warnings.cpfInvalido,
              datasInvalidas: warnings.criacaoInvalida + warnings.ultimoLoginInvalido,
              idsNumericos: warnings.identificadoresNumericos, erro: code }, { autoCommit: false });
            await connection.commit();
          } catch { await connection.rollback(); }
        }
        throw error;
      } finally { await connection.close(); }
    },
  };
}
