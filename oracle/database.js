import { existsSync } from 'node:fs';
import { resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import oracledb from 'oracledb';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
let poolPromise;
let thickReady = false;

function config(name) { return String(process.env[name] ?? '').trim(); }

function connectString() {
  if (config('ORACLE_DSN')) return config('ORACLE_DSN');
  const host = config('ORACLE_HOST');
  const port = Number(config('ORACLE_PORT') || 1521);
  const service = config('ORACLE_SERVICE');
  if (!host || !service || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Configuração Oracle incompleta.');
  }
  return `${host}:${port}/${service}`;
}

function initClient() {
  if (thickReady) return;
  if (config('ORACLE_THICK_MODE').toUpperCase() !== 'TRUE') {
    throw new Error('ORACLE_THICK_MODE deve ser TRUE.');
  }
  const configured = config('ORACLE_CLIENT_LIB_DIR');
  const libDir = isAbsolute(configured) ? configured : resolve(projectRoot, configured);
  if (!configured || !existsSync(resolve(libDir, process.platform === 'win32' ? 'oci.dll' : 'libclntsh.so'))) {
    throw new Error('Oracle Instant Client não encontrado.');
  }
  if (process.platform === 'win32') oracledb.initOracleClient({ libDir });
  else oracledb.initOracleClient();
  if (oracledb.thin !== false) throw new Error('Oracle Thick Mode não foi ativado.');
  thickReady = true;
}

async function getPool() {
  if (poolPromise) return poolPromise;
  const user = config('ORACLE_USER');
  const password = config('ORACLE_PASSWORD');
  if (!user || !password) throw new Error('Credenciais Oracle incompletas.');
  initClient();
  const poolMin = Number(config('ORACLE_POOL_MIN') || 1);
  const poolMax = Number(config('ORACLE_POOL_MAX') || 4);
  const poolIncrement = Number(config('ORACLE_POOL_INCREMENT') || 1);
  if (![poolMin, poolMax, poolIncrement].every(n => Number.isInteger(n) && n > 0) || poolMin > poolMax) {
    throw new Error('Pool Oracle inválido.');
  }
  poolPromise = oracledb.createPool({ user, password, connectString: connectString(), poolMin, poolMax, poolIncrement })
    .catch(error => { poolPromise = undefined; throw error; });
  return poolPromise;
}

export async function acquireConnection() {
  return (await getPool()).getConnection();
}

export async function checkConnection() {
  const connection = await (await getPool()).getConnection();
  try {
    connection.callTimeout = 5000;
    await connection.execute('SET TRANSACTION READ ONLY');
    const result = await connection.execute('SELECT 1 FROM dual');
    return result.rows?.[0]?.[0] === 1 && oracledb.thin === false;
  } finally {
    try { await connection.rollback(); } finally { await connection.close(); }
  }
}

export async function getServerVersion() {
  const connection = await (await getPool()).getConnection();
  try { return connection.oracleServerVersionString; }
  finally { await connection.close(); }
}

export async function closePool() {
  if (!poolPromise) return;
  const current = await poolPromise;
  await current.close(10);
  poolPromise = undefined;
}

export function isThickInitialized() { return thickReady && oracledb.thin === false; }
