import { NextRequest } from 'next/server';

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO', 
  WARN = 'WARN',
  ERROR = 'ERROR'
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  category: string;
  message: string;
  metadata?: Record<string, any>;
  requestId?: string;
  userId?: string;
  roomId?: string;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

class ServerLogger {
  private logs: LogEntry[] = [];
  private maxLogs = 1000; // Keep last 1000 logs
  private listeners: ((log: LogEntry) => void)[] = [];

  private createLogEntry(
    level: LogLevel,
    category: string,
    message: string,
    metadata?: Record<string, any>,
    error?: Error
  ): LogEntry {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      category,
      message,
      metadata,
      error: error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : undefined
    };

    // Add to logs array
    this.logs.push(entry);
    
    // Keep only last maxLogs entries
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    // Notify listeners
    this.listeners.forEach(listener => listener(entry));

    // Also log to console for server logs
    const consoleMessage = `[${entry.timestamp}] ${level} [${category}] ${message}`;
    switch (level) {
      case LogLevel.ERROR:
        console.error(consoleMessage, metadata, error);
        break;
      case LogLevel.WARN:
        console.warn(consoleMessage, metadata);
        break;
      case LogLevel.INFO:
        console.info(consoleMessage, metadata);
        break;
      case LogLevel.DEBUG:
        console.debug(consoleMessage, metadata);
        break;
    }

    return entry;
  }

  debug(category: string, message: string, metadata?: Record<string, any>) {
    return this.createLogEntry(LogLevel.DEBUG, category, message, metadata);
  }

  info(category: string, message: string, metadata?: Record<string, any>) {
    return this.createLogEntry(LogLevel.INFO, category, message, metadata);
  }

  warn(category: string, message: string, metadata?: Record<string, any>) {
    return this.createLogEntry(LogLevel.WARN, category, message, metadata);
  }

  error(category: string, message: string, metadata?: Record<string, any>, error?: Error) {
    return this.createLogEntry(LogLevel.ERROR, category, message, metadata, error);
  }

  // Log API requests
  logRequest(req: NextRequest, metadata?: Record<string, any>) {
    const requestMetadata = {
      method: req.method,
      url: req.url,
      userAgent: req.headers.get('user-agent'),
      ...metadata
    };
    
    this.info('API_REQUEST', `${req.method} ${req.url}`, requestMetadata);
  }

  // Log API responses
  logResponse(req: NextRequest, status: number, duration: number, metadata?: Record<string, any>) {
    const responseMetadata = {
      method: req.method,
      url: req.url,
      status,
      duration: `${duration}ms`,
      ...metadata
    };
    
    const level = status >= 400 ? LogLevel.WARN : LogLevel.INFO;
    this.createLogEntry(level, 'API_RESPONSE', `${req.method} ${req.url} - ${status} (${duration}ms)`, responseMetadata);
  }

  // Log LiveKit operations
  logLiveKit(operation: string, roomId: string, message: string, metadata?: Record<string, any>) {
    this.info('LIVEKIT', `[${roomId}] ${operation}: ${message}`, { roomId, operation, ...metadata });
  }

  // Log LiveKit errors
  logLiveKitError(operation: string, roomId: string, message: string, error?: Error, metadata?: Record<string, any>) {
    this.error('LIVEKIT_ERROR', `[${roomId}] ${operation}: ${message}`, { roomId, operation, ...metadata }, error);
  }

  // Get recent logs
  getRecentLogs(limit?: number): LogEntry[] {
    return limit ? this.logs.slice(-limit) : this.logs;
  }

  // Get logs by category
  getLogsByCategory(category: string, limit?: number): LogEntry[] {
    const filtered = this.logs.filter(log => log.category === category);
    return limit ? filtered.slice(-limit) : filtered;
  }

  // Get logs by level
  getLogsByLevel(level: LogLevel, limit?: number): LogEntry[] {
    const filtered = this.logs.filter(log => log.level === level);
    return limit ? filtered.slice(-limit) : filtered;
  }

  // Add listener for real-time monitoring
  addListener(listener: (log: LogEntry) => void) {
    this.listeners.push(listener);
  }

  // Remove listener
  removeListener(listener: (log: LogEntry) => void) {
    this.listeners = this.listeners.filter(l => l !== listener);
  }

  // Clear all logs
  clear() {
    this.logs = [];
  }
}

// Singleton instance
export const serverLogger = new ServerLogger();

// Utility function to wrap API handlers with logging
export function withLogging<T extends any[], R>(
  category: string,
  operation: string,
  handler: (...args: T) => Promise<R>
) {
  return async (...args: T): Promise<R> => {
    const startTime = Date.now();
    
    try {
      serverLogger.debug(category, `Starting ${operation}`, { args: args.length });
      const result = await handler(...args);
      const duration = Date.now() - startTime;
      serverLogger.info(category, `Completed ${operation}`, { duration: `${duration}ms` });
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      serverLogger.error(category, `Failed ${operation}`, { duration: `${duration}ms` }, error as Error);
      throw error;
    }
  };
}

// Middleware helper
export function createRequestLogger(req: NextRequest) {
  const requestId = Math.random().toString(36).substring(2, 15);
  const startTime = Date.now();
  
  // Log the incoming request
  serverLogger.logRequest(req, { requestId });
  
  return {
    requestId,
    logResponse: (status: number, metadata?: Record<string, any>) => {
      const duration = Date.now() - startTime;
      serverLogger.logResponse(req, status, duration, { requestId, ...metadata });
    },
    log: (level: LogLevel, message: string, metadata?: Record<string, any>) => {
      return serverLogger[level.toLowerCase() as 'debug' | 'info' | 'warn' | 'error']('REQUEST', message, { requestId, ...metadata });
    }
  };
}
