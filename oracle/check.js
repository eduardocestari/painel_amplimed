import { checkConnection, closePool, isThickInitialized } from './database.js';

try {
  if (!await checkConnection()) throw new Error('A consulta de verificação não retornou o valor esperado.');
  console.log('Oracle: conexão e SELECT confirmados (Thick Mode).');
} catch (error) {
  const code = error?.code || (error?.errorNum ? `ORA-${error.errorNum}` : 'CONFIG');
  console.error(`Oracle: falha (${code}); Thick Mode: ${isThickInitialized() ? 'ativo' : 'não confirmado'}.`);
  process.exitCode = 1;
} finally {
  try { await closePool(); } catch { process.exitCode = 1; }
}
