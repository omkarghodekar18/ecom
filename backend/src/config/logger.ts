// pino logger singleton. JSON in production; pretty-printed in development.
import { pino } from 'pino';
import { getEnv, isTest } from './env.js';

const level = isTest() ? 'silent' : getEnv().LOG_LEVEL;

export const logger = pino({
  level,
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.passwordHash', '*.token'],
    censor: '[redacted]',
  },
  ...(getEnv().NODE_ENV === 'development'
    ? { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } } }
    : {}),
  base: { service: 'toolhub-api' },
});

export type Logger = typeof logger;
