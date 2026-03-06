// Utility Functions Module
// Common helper functions used across the OmniBox proxy worker

import { CONFIG, type EnvVariables } from './config.js';

export interface CorsHeaders {
  'Access-Control-Allow-Origin': string;
  'Access-Control-Allow-Methods': string;
  'Access-Control-Allow-Headers': string;
  'Access-Control-Allow-Credentials': string;
  'Access-Control-Max-Age': string;
  'Access-Control-Expose-Headers': string;
  'X-OmniBox-Proxy-Version': string;
  [key: string]: string;
}

export interface ValidationResult {
  isValid: boolean;
  error?: string;
  normalizedUrl?: string;
}

export interface ContentTypeInfo {
  type: string;
  subtype: string;
  charset: string;
  full: string;
}

export interface TimerResult {
  stop: () => number;
  elapsed: () => number;
}

export interface ProxyErrorContext {
  url?: string;
  method?: string;
  [key: string]: unknown;
}

export class ProxyError extends Error {
  public code: string;
  public context: ProxyErrorContext;
  public timestamp: string;

  constructor(message: string, code: string, context: ProxyErrorContext = {}) {
    super(message);
    this.name = 'ProxyError';
    this.code = code;
    this.context = context;
    this.timestamp = new Date().toISOString();
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      context: this.context,
      timestamp: this.timestamp,
      stack: this.stack
    };
  }
}

export function getUnrestrictedCorsHeaders(): CorsHeaders {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': CONFIG.CORS_MAX_AGE.toString(),
    'Access-Control-Expose-Headers': '*',
    'X-OmniBox-Proxy-Version': CONFIG.VERSION,
    ...CONFIG.HEADERS.ADD_HEADERS
  };
}

export function getCookie(cookieName: string, cookies: string | null): string {
  if (!cookies || !cookieName) return '';

  try {
    const cookieRegex = new RegExp(cookieName + '=([^;]+)');
    const match = cookieRegex.exec(cookies);
    return match ? decodeURIComponent(match[1]) : '';
  } catch (error) {
    console.error('Cookie extraction error:', error);
    return '';
  }
}

export function getHTMLResponse(
  html: string,
  status: number = 200,
  additionalHeaders: Record<string, string> = {}
): Response {
  return new Response(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      ...getUnrestrictedCorsHeaders(),
      ...additionalHeaders
    }
  });
}

export function getRedirect(url: string, status: 301 | 302 | 303 | 307 | 308 = 302): Response {
  return Response.redirect(url, status);
}

export function getJSONResponse(
  data: unknown,
  status: number = 200,
  additionalHeaders: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...getUnrestrictedCorsHeaders(),
      ...additionalHeaders
    }
  });
}

export function validateURL(url: string | null | undefined): ValidationResult {
  if (!url || typeof url !== 'string') {
    return { isValid: false, error: 'URL is required' };
  }

  try {
    let testUrl = url.trim();
    if (!testUrl.startsWith('http://') && !testUrl.startsWith('https://')) {
      testUrl = 'https://' + testUrl;
    }

    const urlObj = new URL(testUrl);

    if (!urlObj.hostname || !urlObj.hostname.includes('.')) {
      return { isValid: false, error: 'Invalid hostname' };
    }

    const pathname = urlObj.pathname.toLowerCase();
    const hasBlockedExtension = CONFIG.BLOCKED_EXTENSIONS.some(ext =>
      pathname.endsWith(ext)
    );

    if (hasBlockedExtension) {
      return { isValid: false, error: 'File type not supported' };
    }

    return { isValid: true, normalizedUrl: urlObj.href };
  } catch {
    return { isValid: false, error: 'Invalid URL format' };
  }
}

export function shouldBlockUserAgent(userAgent: string | null): boolean {
  if (!userAgent) return false;

  return CONFIG.BLOCKED_USER_AGENTS.some(blocked =>
    userAgent.includes(blocked)
  );
}

export function sanitizeHTML(html: string | null): string {
  if (!html) return '';

  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, '');
}

export function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return '';
  }
}

export function isAbsoluteURL(url: string | null | undefined): boolean {
  if (!url) return false;

  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

export function generateCacheKey(input: string, maxLength: number = 200): string {
  if (!input) return '';

  const invalidCharsRegex = /[^a-zA-Z0-9\-_./]/g;
  let key = input
    .replace(invalidCharsRegex, '_')
    .substring(0, maxLength);

  key = key.replace(/^[_\-.]+|[_\-.]+$/g, '');

  return key || 'default_key';
}

export function getStringSize(str: string | null | undefined): number {
  if (!str) return 0;
  return new TextEncoder().encode(str).length;
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';

  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));

  return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + sizes[i];
}

export function debounce<T extends(...args: unknown[]) => unknown>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  return function executedFunction(...args: Parameters<T>): void {
    const later = () => {
      timeout = null;
      func(...args);
    };
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

export function throttle<T extends(...args: unknown[]) => unknown>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;
  return function (this: unknown, ...args: Parameters<T>): void {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

export function checkRateLimit(
  identifier: string,
  rateLimitMap: Map<string, number[]>,
  maxRequests: number = 60,
  windowMs: number = 60000
): boolean {
  const now = Date.now();
  const windowStart = now - windowMs;

  if (!rateLimitMap.has(identifier)) {
    rateLimitMap.set(identifier, []);
  }

  const requests = rateLimitMap.get(identifier)!;
  const validRequests = requests.filter(timestamp => timestamp > windowStart);

  if (validRequests.length >= maxRequests) {
    return false;
  }

  validRequests.push(now);
  rateLimitMap.set(identifier, validRequests);

  return true;
}

export function getClientIP(request: Request): string {
  const headers = request.headers;

  return headers.get('CF-Connecting-IP') ||
         headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
         headers.get('X-Real-IP') ||
         headers.get('X-Client-IP') ||
         'unknown';
}

export function parseContentType(contentTypeHeader: string | null): ContentTypeInfo {
  if (!contentTypeHeader) {
    return { type: '', subtype: '', charset: 'utf-8', full: '' };
  }

  const [mediaType, ...params] = contentTypeHeader.split(';');
  const [type, subtype] = (mediaType?.trim() || '').split('/');

  let charset = 'utf-8';
  const charsetParam = params.find(p => p.trim().startsWith('charset='));
  if (charsetParam) {
    charset = charsetParam.split('=')[1]?.trim() || 'utf-8';
  }

  return {
    type: type || '',
    subtype: subtype || '',
    charset,
    full: mediaType?.trim() || ''
  };
}

export function isTextContentType(contentType: string | null): boolean {
  if (!contentType) return false;

  const textTypes = [
    'text/', 'application/json', 'application/xml',
    'application/javascript', 'application/x-javascript'
  ];

  return textTypes.some(type => contentType.toLowerCase().includes(type));
}

export function generateRequestId(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

export function safeJSONParse<T>(jsonString: string, fallback: T): T {
  try {
    return JSON.parse(jsonString);
  } catch {
    return fallback;
  }
}

export function cleanURLForLogging(url: string): string {
  try {
    const urlObj = new URL(url);

    const sensitiveParams = ['token', 'api_key', 'access_token', 'password', 'secret'];
    sensitiveParams.forEach(param => {
      if (urlObj.searchParams.has(param)) {
        urlObj.searchParams.set(param, '[REDACTED]');
      }
    });

    return urlObj.href;
  } catch {
    return url;
  }
}

export function createTimer(label: string): TimerResult {
  const start = Date.now();

  return {
    stop(): number {
      const duration = Date.now() - start;
      console.log(`[Timer] ${label}: ${duration}ms`);
      return duration;
    },

    elapsed(): number {
      return Date.now() - start;
    }
  };
}

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === maxRetries) {
        throw lastError;
      }

      const delay = baseDelay * Math.pow(2, attempt);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

export interface LogContext {
  module?: string;
  operation?: string;
  [key: string]: unknown;
}

export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  module?: string;
  operation?: string;
  context?: Record<string, unknown>;
  requestId?: string;
  version: string;
}

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

export class Logger {
  private level: LogLevel;
  private levels: Record<LogLevel, number> = { error: 0, warn: 1, info: 2, debug: 3 };
  private module: string;
  private requestId: string | null;
  private version: string;

  constructor(module: string, env: EnvVariables = {}) {
    this.module = module;
    this.level = (env.LOG_LEVEL as LogLevel) || 'warn';
    this.requestId = null;
    this.version = CONFIG.VERSION;
  }

  setRequestId(requestId: string | null): void {
    this.requestId = requestId;
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  private shouldLog(level: LogLevel): boolean {
    return this.levels[level] <= this.levels[this.level];
  }

  private formatEntry(level: LogLevel, message: string, context?: LogContext): LogEntry {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: level.toUpperCase(),
      message,
      module: this.module,
      version: this.version
    };

    if (this.requestId) {
      entry.requestId = this.requestId;
    }

    if (context) {
      const { module: _, operation, ...rest } = context;
      if (operation) entry.operation = operation;
      if (Object.keys(rest).length > 0) {
        entry.context = rest as Record<string, unknown>;
      }
    }

    return entry;
  }

  error(message: string, context?: LogContext): void {
    if (this.shouldLog('error')) {
      const entry = this.formatEntry('error', message, context);
      console.error(JSON.stringify(entry));
    }
  }

  warn(message: string, context?: LogContext): void {
    if (this.shouldLog('warn')) {
      const entry = this.formatEntry('warn', message, context);
      console.warn(JSON.stringify(entry));
    }
  }

  info(message: string, context?: LogContext): void {
    if (this.shouldLog('info')) {
      const entry = this.formatEntry('info', message, context);
      console.info(JSON.stringify(entry));
    }
  }

  debug(message: string, context?: LogContext): void {
    if (this.shouldLog('debug')) {
      const entry = this.formatEntry('debug', message, context);
      console.log(JSON.stringify(entry));
    }
  }

  time(label: string): () => number {
    const start = Date.now();
    const fullLabel = `[${this.module}] ${label}`;

    return (): number => {
      const duration = Date.now() - start;
      this.debug(`${fullLabel}: ${duration}ms`);
      return duration;
    };
  }

  withContext(_additionalContext: LogContext): Logger {
    const childLogger = new Logger(this.module, { LOG_LEVEL: this.level });
    childLogger.requestId = this.requestId;
    return childLogger;
  }

  static create(module: string, env: EnvVariables = {}): Logger {
    return new Logger(module, env);
  }
}

export function log(
  level: LogLevel,
  message: string,
  data: unknown = null,
  env: EnvVariables = {}
): void {
  const logLevel = env.LOG_LEVEL || 'warn';
  const levels: Record<string, number> = { error: 0, warn: 1, info: 2, debug: 3 };

  if (levels[level] <= levels[logLevel]) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level: level.toUpperCase(),
      message,
      ...(data !== null && { data })
    };

    console.log(JSON.stringify(logEntry));
  }
}

export function nthIndex(str: string, pattern: string, n: number): number {
  let index = -1;
  for (let i = 0; i < n; i++) {
    index = str.indexOf(pattern, index + 1);
    if (index === -1) break;
  }
  return index;
}

export function isPositionInTag(html: string, pos: number): boolean {
  if (pos > html.length || pos < 0) return false;

  let start = html.lastIndexOf('<', pos);
  if (start === -1) start = 0;

  let end = html.indexOf('>', pos);
  if (end === -1) end = html.length;

  const content = html.slice(start + 1, end);
  return !content.includes('>') && !content.includes('<');
}
