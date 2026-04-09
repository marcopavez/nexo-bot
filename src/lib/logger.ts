type LogLevel = 'info' | 'warn' | 'error';

interface LogMeta {
  correlationId?: string;
  [key: string]: unknown;
}

export function logEvent(level: LogLevel, message: string, meta: LogMeta = {}): void {
  const payload = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...meta,
  };

  const serialized = JSON.stringify(payload);

  if (level === 'error') {
    console.error(serialized);
    return;
  }

  if (level === 'warn') {
    console.warn(serialized);
    return;
  }

  console.info(serialized);
}
