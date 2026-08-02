import fs from 'node:fs';
import path from 'node:path';

let logDir = null;

export function initFileLogger(databasePath) {
  const dbDir = path.dirname(path.resolve(databasePath || './data/digikot.db'));
  logDir = path.join(dbDir, 'logs');
  fs.mkdirSync(logDir, { recursive: true });
}

function logFilePath() {
  const d = new Date();
  const day = d.toISOString().slice(0, 10);
  return path.join(logDir || './data/logs', `digikot-${day}.log`);
}

export function logLine(level, message, meta) {
  if (!logDir) return;
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    message,
    ...(meta || {}),
  });
  try {
    fs.appendFileSync(logFilePath(), `${line}\n`, 'utf8');
  } catch {
    // ignore logging failures
  }
}
