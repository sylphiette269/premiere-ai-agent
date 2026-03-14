export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
}

type LogSink = (line: string, ...args: unknown[]) => void;

interface LogRecord {
  logger: string;
  level: LogLevel;
  message: string;
  timestamp: string;
}

const DEFAULT_LOGGER_NAME = 'app';

const LEVEL_LABELS: Record<LogLevel, string> = {
  [LogLevel.ERROR]: 'ERROR',
  [LogLevel.WARN]: 'WARN',
  [LogLevel.INFO]: 'INFO',
  [LogLevel.DEBUG]: 'DEBUG',
};

function parseLogLevel(value: string | undefined): LogLevel | null {
  const normalized = String(value ?? '').trim().toUpperCase();
  if (!normalized) {
    return null;
  }

  switch (normalized) {
    case 'ERROR':
      return LogLevel.ERROR;
    case 'WARN':
    case 'WARNING':
      return LogLevel.WARN;
    case 'INFO':
      return LogLevel.INFO;
    case 'DEBUG':
      return LogLevel.DEBUG;
    default:
      return null;
  }
}

function resolveDefaultLogLevel(): LogLevel {
  // Keep logs on stderr so MCP stdout stays protocol-only, but default to WARN to reduce noise.
  return parseLogLevel(process.env.PREMIERE_MCP_LOG_LEVEL) ?? LogLevel.WARN;
}

function normalizeLoggerName(name: string): string {
  const candidate = String(name ?? '').trim();
  return candidate.length > 0 ? candidate : DEFAULT_LOGGER_NAME;
}

function normalizeMessage(message: string): string {
  const candidate = String(message ?? '');
  return candidate.length > 0 ? candidate : '(empty message)';
}

function createRecord(logger: string, level: LogLevel, message: string): LogRecord {
  return {
    logger: normalizeLoggerName(logger),
    level,
    message: normalizeMessage(message),
    timestamp: new Date().toISOString(),
  };
}

function formatRecord(record: LogRecord): string {
  return `[${record.timestamp}] [${LEVEL_LABELS[record.level]}] [${record.logger}] ${record.message}`;
}

export class Logger {
  private readonly sink: LogSink;
  private level: LogLevel;
  private name: string;

  constructor(name: string, level: LogLevel = resolveDefaultLogLevel(), sink: LogSink = console.error) {
    this.name = normalizeLoggerName(name);
    this.level = level;
    this.sink = sink;
  }

  private shouldWrite(level: LogLevel): boolean {
    return level <= this.level;
  }

  private write(level: LogLevel, message: string, ...args: unknown[]): void {
    if (!this.shouldWrite(level)) {
      return;
    }

    const record = createRecord(this.name, level, message);
    this.sink(formatRecord(record), ...args);
  }

  error(message: string, ...args: unknown[]): void {
    this.write(LogLevel.ERROR, message, ...args);
  }

  warn(message: string, ...args: unknown[]): void {
    this.write(LogLevel.WARN, message, ...args);
  }

  info(message: string, ...args: unknown[]): void {
    this.write(LogLevel.INFO, message, ...args);
  }

  debug(message: string, ...args: unknown[]): void {
    this.write(LogLevel.DEBUG, message, ...args);
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }
}
