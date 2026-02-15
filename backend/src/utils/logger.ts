import pino from 'pino';
import path from 'path';
import fs from 'fs';
import { config } from '../config';

// Ensure logs directory exists
fs.mkdirSync(config.paths.logs, { recursive: true });

const targets: pino.TransportTargetOptions[] = [
  // Console output with pretty printing in dev
  {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
    },
    level: config.isDev ? 'debug' : 'info',
  },
  // File output
  {
    target: 'pino/file',
    options: {
      destination: path.join(config.paths.logs, 'app.log'),
      mkdir: true,
    },
    level: 'info',
  },
  // Error log
  {
    target: 'pino/file',
    options: {
      destination: path.join(config.paths.logs, 'error.log'),
      mkdir: true,
    },
    level: 'error',
  },
];

export const logger = pino({
  level: config.isDev ? 'debug' : 'info',
  transport: {
    targets,
  },
  serializers: {
    err: pino.stdSerializers.err,
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
  },
  base: {
    version: config.version,
  },
});

export function createChildLogger(name: string) {
  return logger.child({ module: name });
}
