type LogLevel = "info" | "warn" | "error";

const formatMessage = (level: LogLevel, message: string, meta?: Record<string, any>) => {
  const entry: Record<string, any> = {
    timestamp: new Date().toISOString(),
    level,
    message,
  };
  if (meta) Object.assign(entry, meta);
  return JSON.stringify(entry);
};

export const logger = {
  info: (message: string, meta?: Record<string, any>) =>
    console.log(formatMessage("info", message, meta)),
  warn: (message: string, meta?: Record<string, any>) =>
    console.warn(formatMessage("warn", message, meta)),
  error: (message: string, meta?: Record<string, any>) =>
    console.error(formatMessage("error", message, meta)),
};
