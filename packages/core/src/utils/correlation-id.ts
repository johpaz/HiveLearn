/**
 * HiveLearn — Correlation ID System
 * 
 * Sistema para generar y gestionar IDs de correlación que permiten
 * trazar requests a través de todo el sistema.
 * 
 * Cada request recibe un ID único que se propaga a:
 * - Logs
 * - Errores
 * - Llamadas a servicios externos
 * - WebSocket messages
 */

import { randomBytes } from 'node:crypto';

const CORRELATION_ID_HEADER = 'x-correlation-id';
const CORRELATION_ID_LENGTH = 16; // 16 bytes = 32 caracteres hex

/**
 * Genera un correlation ID único
 * Formato: 32 caracteres hex (ej: "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6")
 */
export function generateCorrelationId(): string {
  return randomBytes(CORRELATION_ID_LENGTH).toString('hex');
}

/**
 * Extrae correlation ID de un request HTTP
 * Si no existe, genera uno nuevo
 */
export function getOrGenerateCorrelationId(req: Request): string {
  const fromHeader = req.headers.get(CORRELATION_ID_HEADER);
  if (fromHeader && isValidCorrelationId(fromHeader)) {
    return fromHeader;
  }
  return generateCorrelationId();
}

/**
 * Extrae correlation ID de headers simples
 */
export function getCorrelationIdFromHeaders(
  headers: Headers | Record<string, string | undefined>
): string | null {
  let correlationId: string | null = null;

  if (headers instanceof Headers) {
    correlationId = headers.get(CORRELATION_ID_HEADER);
  } else {
    correlationId = headers[CORRELATION_ID_HEADER] || null;
  }

  if (correlationId && isValidCorrelationId(correlationId)) {
    return correlationId;
  }

  return null;
}

/**
 * Valida que un correlation ID tenga formato correcto
 */
export function isValidCorrelationId(id: string): boolean {
  if (!id || typeof id !== 'string') return false;
  // Debe ser 32 caracteres hex
  return /^[a-f0-9]{32}$/.test(id);
}

/**
 * Crea headers con correlation ID para requests salientes
 */
export function createHeadersWithCorrelationId(
  correlationId: string,
  baseHeaders?: Record<string, string>
): Record<string, string> {
  return {
    ...baseHeaders,
    [CORRELATION_ID_HEADER]: correlationId,
  };
}

/**
 * Contexto asíncrono para correlation ID
 * Permite acceder al correlation ID actual sin pasarlo explícitamente
 */
class CorrelationContext {
  private storage = new Map<string, string>();

  /**
   * Ejecuta una función dentro de un contexto con correlation ID
   */
  async run<T>(correlationId: string, fn: () => Promise<T>): Promise<T> {
    const asyncId = this.getAsyncId();
    this.storage.set(asyncId, correlationId);
    try {
      return await fn();
    } finally {
      this.storage.delete(asyncId);
    }
  }

  /**
   * Obtiene el correlation ID del contexto actual
   */
  getCurrent(): string | undefined {
    const asyncId = this.getAsyncId();
    return this.storage.get(asyncId);
  }

  /**
   * Obtiene el correlation ID actual o genera uno nuevo
   */
  getCurrentOrGenerate(): string {
    return this.getCurrent() || generateCorrelationId();
  }

  /**
   * Obtiene el async ID para usar como key en el storage
   * Nota: En Bun, usamos un workaround ya que no tiene async_hooks
   */
  private getAsyncId(): string {
    // Workaround para Bun: usamos el stack trace para obtener un ID único
    const error = new Error();
    const stack = error.stack || '';
    const stackHash = this.hashStack(stack);
    return stackHash;
  }

  /**
   * Genera un hash simple del stack trace
   */
  private hashStack(stack: string): string {
    let hash = 0;
    for (let i = 0; i < stack.length; i++) {
      const char = stack.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
  }
}

// Instancia global para el contexto de correlación
export const correlationContext = new CorrelationContext();

/**
 * Helper para obtener el correlation ID actual
 */
export function getCurrentCorrelationId(): string | undefined {
  return correlationContext.getCurrent();
}

/**
 * Helper para obtener o generar correlation ID
 */
export function requireCorrelationId(): string {
  return correlationContext.getCurrentOrGenerate();
}

/**
 * Decorador para funciones asíncronas que agrega correlation context
 */
export function withCorrelationContext<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  correlationId?: string
): T {
  return (async (...args: Parameters<T>): Promise<ReturnType<T>> => {
    const corrId = correlationId || generateCorrelationId();
    return await correlationContext.run(corrId, () => fn(...args));
  }) as T;
}

/**
 * Middleware para extraer correlation ID de request y agregarlo al contexto
 */
export function correlationIdMiddleware(
  req: Request,
  next: (correlationId: string) => Response | Promise<Response>
): Response | Promise<Response> {
  const correlationId = getOrGenerateCorrelationId(req);
  return correlationContext.run(correlationId, async () => next(correlationId));
}
