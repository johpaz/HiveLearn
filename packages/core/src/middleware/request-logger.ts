/**
 * HiveLearn — Request Logger Middleware
 * 
 * Middleware para loggear todos los requests HTTP con:
 * - Método, URL, correlation ID
 * - Body (redactado si tiene datos sensibles)
 * - Duración de la request
 * - Status code de respuesta
 * - Errores
 */

import { logger } from '../utils/logger';
import { getOrGenerateCorrelationId, generateCorrelationId } from '../utils/correlation-id';

const log = logger.child('request-logger');

const SENSITIVE_PATTERNS = [
  /api[_-]?key/i,
  /token/i,
  /secret/i,
  /password/i,
  /credential/i,
  /auth/i,
];

/**
 * Redacta datos sensibles de un objeto
 */
function redact(obj: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (seen.has(obj as object)) {
    return '[Circular]';
  }

  seen.add(obj as object);

  if (Array.isArray(obj)) {
    return obj.map((item) => redact(item, seen));
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const isSensitive = SENSITIVE_PATTERNS.some((p) => p.test(key));
    if (isSensitive) {
      result[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      result[key] = redact(value, seen);
    } else {
      result[key] = value;
    }
  }
  return result;
}

interface RequestLogMeta {
  method: string;
  url: string;
  path: string;
  correlationId: string;
  userAgent?: string;
  ip?: string;
  body?: unknown;
  duration?: number;
  statusCode?: number;
  error?: string;
}

/**
 * Extrae el path de una URL
 */
function extractPath(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.pathname;
  } catch {
    return url;
  }
}

/**
 * Determina si el body debe ser redactado
 */
function shouldRedactBody(path: string, method: string): boolean {
  // Redactar todos los POST/PUT que contengan 'key', 'token', 'secret', 'password'
  const sensitivePaths = [
    'api-key',
    'apikey',
    'auth',
    'login',
    'token',
    'secret',
    'password',
    'credential',
  ];

  const lowerPath = path.toLowerCase();
  const isSensitivePath = sensitivePaths.some(p => lowerPath.includes(p));
  const isWriteMethod = ['POST', 'PUT', 'PATCH'].includes(method);

  return isSensitivePath || isWriteMethod;
}

/**
 * Log de inicio de request
 */
export function logRequestStart(req: Request): { 
  correlationId: string; 
  startTime: number;
  path: string;
} {
  const correlationId = getOrGenerateCorrelationId(req);
  const startTime = Date.now();
  const url = req.url;
  const path = extractPath(url);

  const meta: RequestLogMeta = {
    method: req.method,
    url,
    path,
    correlationId,
    userAgent: req.headers.get('user-agent') || undefined,
  };

  log.debug('← Request started', meta);

  return { correlationId, startTime, path };
}

/**
 * Log de fin de request exitoso
 */
export function logRequestSuccess(
  startTime: number,
  correlationId: string,
  path: string,
  statusCode: number,
  responseSize?: number
): void {
  const duration = Date.now() - startTime;

  const meta: RequestLogMeta = {
    method: 'GET', // Se debería pasar el método real
    url: path,
    path,
    correlationId,
    duration,
    statusCode,
  };

  if (responseSize !== undefined) {
    meta.userAgent = responseSize.toString(); // Hack para incluir response size
  }

  if (duration > 1000) {
    log.warn('→ Request completed (slow)', meta);
  } else {
    log.debug('→ Request completed', meta);
  }
}

/**
 * Log de error en request
 */
export function logRequestError(
  startTime: number,
  correlationId: string,
  path: string,
  error: Error,
  statusCode?: number
): void {
  const duration = Date.now() - startTime;

  const meta: RequestLogMeta = {
    method: 'GET',
    url: path,
    path,
    correlationId,
    duration,
    statusCode: statusCode || 500,
    error: error.message,
  };

  log.error('✗ Request failed', {
    ...meta,
    stack: error.stack,
  });
}

/**
 * Log de body de request (redactado si es sensible)
 */
export async function logRequestBody(
  req: Request,
  correlationId: string
): Promise<void> {
  const path = extractPath(req.url);
  const shouldRedact = shouldRedactBody(path, req.method);

  // Solo loggear body para métodos que lo envían
  if (!['POST', 'PUT', 'PATCH'].includes(req.method)) {
    return;
  }

  try {
    // Clonar el request para poder leer el body sin consumirlo
    const clonedReq = req.clone();
    const contentType = req.headers.get('content-type') || '';
    
    let body: unknown;

    if (contentType.includes('application/json')) {
      body = await clonedReq.json();
    } else if (contentType.includes('text/')) {
      body = await clonedReq.text();
    } else {
      body = '[Binary content]';
    }

    const displayBody = shouldRedact ? (redact({ body }) as any).body : body;

    log.debug('Request body', {
      correlationId,
      path,
      contentType,
      body: displayBody,
    });
  } catch (error) {
    // No fallar si no podemos leer el body
    log.debug('Could not read request body', {
      correlationId,
      path,
      error: (error as Error).message,
    });
  }
}

/**
 * Wrapper completo para handlers de fetch
 * 
 * Uso:
 * ```typescript
 * const fetchHandler = withRequestLogging(async (req) => {
 *   // Tu lógica aquí
 *   return new Response('OK');
 * });
 * ```
 */
export function withRequestLogging<T extends (req: Request) => Promise<Response>>(
  handler: T,
  options: {
    logBody?: boolean;
    slowThresholdMs?: number;
  } = {}
): T {
  const { logBody = true, slowThresholdMs = 1000 } = options;

  return (async (req: Request): Promise<Response> => {
    const { correlationId, startTime, path } = logRequestStart(req);

    // Loggear body si está habilitado
    if (logBody) {
      await logRequestBody(req, correlationId);
    }

    try {
      const response = await handler(req);
      
      logRequestSuccess(startTime, correlationId, path, response.status);
      
      return response;
    } catch (error) {
      const statusCode = (error as any)?.statusCode || 500;
      logRequestError(startTime, correlationId, path, error as Error, statusCode);
      throw error;
    }
  }) as T;
}

/**
 * Logger específico para endpoints de API
 */
export const apiLogger = {
  /**
   * Log de entrada a endpoint
   */
  endpointHit(
    method: string,
    path: string,
    correlationId: string,
    params?: Record<string, unknown>
  ): void {
    log.info('API endpoint hit', {
      method,
      path,
      correlationId,
      params: params ? redact(params) : undefined,
    });
  },

  /**
   * Log de respuesta exitosa
   */
  endpointSuccess(
    path: string,
    correlationId: string,
    duration: number,
    statusCode: number = 200
  ): void {
    const meta = { path, correlationId, duration, statusCode };
    
    if (duration > slowThresholdMs) {
      log.warn('API endpoint slow', meta);
    } else {
      log.debug('API endpoint success', meta);
    }
  },

  /**
   * Log de error en endpoint
   */
  endpointError(
    path: string,
    correlationId: string,
    error: Error,
    duration: number,
    statusCode: number = 500
  ): void {
    log.error('API endpoint error', {
      path,
      correlationId,
      duration,
      statusCode,
      error: error.message,
      stack: error.stack,
      code: (error as any).code,
    });
  },
};

const slowThresholdMs = 1000;
