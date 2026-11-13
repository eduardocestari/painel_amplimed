import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ImportValidationError, parseAmplimedXlsx } from './import-xlsx.js';

const defaultHistoryPath = fileURLToPath(new URL('../data/import-history.json', import.meta.url));
const publicEntry = ({ sha256, ...entry }) => entry;

export function importConfig(env = process.env) {
  const configured = Number(env.SAUDE_INTEGRADA_IMPORT_MAX_BYTES || 10 * 1024 * 1024);
  const maxBytes = Number.isSafeInteger(configured) ? Math.min(20 * 1024 * 1024, Math.max(1024 * 1024, configured)) : 10 * 1024 * 1024;
  const allowedExtension = String(env.SAUDE_INTEGRADA_IMPORT_EXTENSION || '.xlsx').trim().toLowerCase();
  if (allowedExtension !== '.xlsx') throw new Error('A importação suporta somente extensão .xlsx.');
  const logins = new Set(String(env.SAUDE_INTEGRADA_IMPORT_LOGINS || '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean));
  return { maxBytes, allowedExtension, logins };
}

export function createImportService({ historyPath = defaultHistoryPath, parse = parseAmplimedXlsx } = {}) {
  let pending = Promise.resolve();
  const locked = action => {
    const next = pending.then(action);
    pending = next.catch(() => {});
    return next;
  };
  async function readHistory() {
    try {
      const entries = JSON.parse(await readFile(historyPath, 'utf8'));
      if (!Array.isArray(entries)) throw new Error('Histórico de importações inválido.');
      return entries;
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  }
  async function writeHistory(entries) {
    await mkdir(dirname(historyPath), { recursive: true });
    const temporary = `${historyPath}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(entries.slice(-1000), null, 2), { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    await rename(temporary, historyPath);
  }
  async function changeHistory(update) {
    return locked(async () => {
      const entries = await readHistory();
      const result = update(entries);
      await writeHistory(entries);
      return result;
    });
  }
  return {
    list: async () => (await locked(readHistory)).slice(-50).reverse().map(publicEntry),
    simulate: async ({ buffer, fileName, user, maxBytes }) => {
      if (!/\.xlsx$/i.test(fileName || '')) throw new ImportValidationError('Selecione um arquivo com extensão .xlsx.', 'EXTENSAO_INVALIDA');
      if (!Buffer.isBuffer(buffer) || !buffer.length || buffer.length > maxBytes) throw new ImportValidationError('O arquivo está vazio ou excede o tamanho permitido.', 'TAMANHO_INVALIDO');
      const hash = createHash('sha256').update(buffer).digest('hex');
      const entry = { id: randomUUID(), startedAt: new Date().toISOString(), completedAt: null, usuarioAd: user.login,
        quantidade: 0, resultado: 'PROCESSANDO', sha256: hash, duplicadoDe: null, avisos: null, codigoErro: null };
      await changeHistory(entries => { entries.push(entry); });
      try {
        const parsed = await parse(buffer);
        const finished = await changeHistory(entries => {
          const existing = entries.find(item => item.id !== entry.id && item.sha256 === hash && item.resultado === 'VALIDADO');
          Object.assign(entry, { completedAt: new Date().toISOString(), quantidade: parsed.total, resultado: 'VALIDADO',
            duplicadoDe: existing?.id || null, avisos: parsed.warnings });
          const index = entries.findIndex(item => item.id === entry.id);
          entries[index] = entry;
          return { ...entry };
        });
        return { lote: publicEntry(finished), preview: parsed.preview, persistenceAvailable: false };
      } catch (error) {
        const safeError = error instanceof ImportValidationError ? error : new ImportValidationError('Não foi possível validar o arquivo.');
        await changeHistory(entries => {
          Object.assign(entry, { completedAt: new Date().toISOString(), resultado: 'REJEITADO', codigoErro: safeError.code });
          const index = entries.findIndex(item => item.id === entry.id);
          entries[index] = entry;
        });
        throw safeError;
      }
    },
  };
}
