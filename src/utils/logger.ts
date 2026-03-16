import pino, { type Logger } from 'pino';

// ─── Global type augmentation ────────────────────────────────────────────────
// Extends the Node.js global namespace so that `logger` is typed everywhere
// without needing an explicit import. To swap the logger implementation later,
// change only this file — all call-sites stay untouched.
declare global {
  // eslint-disable-next-line no-var
  var logger: Logger;
}

// ─── Logger factory ──────────────────────────────────────────────────────────
function createLogger(): Logger {
  const isProduction = process.env.NODE_ENV === 'production';

  return pino({
    level: process.env.LOG_LEVEL || 'info',
    ...(!isProduction && {
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
          messageFormat: '{msg}',
        },
      },
    }),
    // In production: plain JSON → ready for CloudWatch, Datadog, ELK
    // Fields are kept flat so log-aggregation queries are easy.
    formatters: {
      level: (label) => ({ level: label.toUpperCase() }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}

// ─── Singleton on globalThis ─────────────────────────────────────────────────
// Guard prevents re-initialisation on hot-reload (ts-node-dev watch mode).
if (!global.logger) {
  global.logger = createLogger();
}

// Named export for files that want an explicit import (e.g. pino-http).
export { };
