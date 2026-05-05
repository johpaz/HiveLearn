/**
 * HiveLearn — Error Handler Middleware
 * 
 * Manejo centralizado de errores con:
 * - Logging consistente
 * - Respuestas HTTP estandarizadas
 * - Clasificación de errores (esperados vs inesperados)
 * - Correlation ID en respuestas
 */

import { logger } from '../utils/logger';
import { HiveLearnError } from '../errors';

const log = logger.child('error-handler');

/**
 * Respuesta de error estandarizada
 */
export interface ErrorResponse {
  error: string;
  code: string;
  statusCode: number;
  meta?: Record<string, unknown>;
  stack?: string; // Solo en desarrollo
}

/**
 * Determina si un error es "esperado" (no requiere logging como error crítico)
 */
function isExpectedError(error: Error): boolean {
  return error instanceof HiveLearnError && 
    error.statusCode >= 400 && 
    error.statusCode < 500;
}

/**
 * Determina si un error es de servidor (requiere logging crítico)
 */
function isServerError(error: Error): boolean {
  if (error instanceof HiveLearnError) {
    return error.statusCode >= 500;
  }
  // Errores no clasificados se asumen como servidores
  return true;
}

/**
 * Formatea un error para respuesta HTTP
 */
export function formatErrorResponse(
  error: Error,
  isDev: boolean = false
): ErrorResponse {
  const isHiveLearnError = error instanceof HiveLearnError;
  
  const response: ErrorResponse = {
    error: error.message || 'An unexpected error occurred',
    code: isHiveLearnError ? error.code : 'INTERNAL_ERROR',
    statusCode: isHiveLearnError ? error.statusCode : 500,
  };

  // Incluir meta si existe
  if (isHiveLearnError && error.meta) {
    response.meta = error.meta;
  }

  // Incluir stack trace solo en desarrollo
  if (isDev && error.stack) {
    response.stack = error.stack;
  }

  return response;
}

/**
 * Maneja errores y retorna respuesta HTTP apropiada
 */
export function handleErrorResponse(
  error: Error,
  req?: Request,
  isDev: boolean = false
): Response {
  const errorResponse = formatErrorResponse(error, isDev);

  // Logging apropiado según tipo de error
  if (isExpectedError(error)) {
    log.warn('Expected error', {
      code: errorResponse.code,
      message: error.message,
    });
  } else if (isServerError(error)) {
    log.error('Server error', {
      code: errorResponse.code,
      message: error.message,
      stack: error.stack,
    });
  }

  // Crear respuesta HTTP
  return new Response(JSON.stringify(errorResponse), {
    status: errorResponse.statusCode,
    headers: {
      'Content-Type': 'application/json',
      'X-Error-Code': errorResponse.code,
    },
  });
}

/**
 * Wrapper para handlers asíncronos con manejo automático de errores
 * 
 * Uso:
 * ```typescript
 * const fetch = withErrorHandler(async (req) => {
 *   // Tu lógica aquí
 *   return new Response('OK');
 * });
 * ```
 */
export function withErrorHandler<T extends (req: Request) => Promise<Response>>(
  handler: T,
  options: {
    isDev?: boolean;
  } = {}
): T {
  const { isDev = process.env.NODE_ENV === 'development' } = options;

  return (async (req: Request): Promise<Response> => {
    try {
      return await handler(req);
    } catch (error) {
      return handleErrorResponse(error as Error, req, isDev);
    }
  }) as T;
}

/**
 * Wrapper para funciones que pueden lanzar errores
 * Útil para servicios y repositorios
 */
export async function withErrorHandling<T>(
  fn: () => Promise<T>,
  options: {
    context?: string;
    defaultCode?: string;
    defaultStatusCode?: number;
  } = {}
): Promise<T> {
  const { context, defaultCode = 'OPERATION_FAILED', defaultStatusCode = 500 } = options;

  try {
    return await fn();
  } catch (error) {
    // Si ya es un HiveLearnError, re-lanzar
    if (error instanceof HiveLearnError) {
      throw error;
    }

    // Crear error envuelto con contexto
    const wrappedError = new HiveLearnError(
      context ? `${context}: ${(error as Error).message}` : (error as Error).message,
      defaultCode,
      defaultStatusCode,
      {
        originalError: (error as Error).message,
      }
    );

    throw wrappedError;
  }
}

/**
 * Manejador global de errores no capturados
 * Debe llamarse una vez al inicio de la aplicación
 */
export function setupGlobalErrorHandlers(): void {
  // Errores no capturados en promesas
  process.on('unhandledRejection', (reason, promise) => {
    log.error('Unhandled Promise Rejection', {
      reason: (reason as Error)?.message || String(reason),
      stack: (reason as Error)?.stack,
    });
    
    // En producción, podríamos querer salir del proceso
    if (process.env.NODE_ENV !== 'development') {
      // No salir inmediatamente, pero loggear críticamente
      log.error('Consider exiting process after unhandled rejection');
    }
  });

  // Errores no capturados excepcionales
  process.on('uncaughtException', (error) => {
    log.error('Uncaught Exception', {
      message: error.message,
      stack: error.stack,
    });
    
    // En producción, reiniciar el proceso
    if (process.env.NODE_ENV !== 'development') {
      setTimeout(() => process.exit(1), 1000);
    }
  });
}

/**
 * Clase helper para construir errores con fluent interface
 * 
 * Uso:
 * ```typescript
 * const error = new ErrorBuilder()
 *   .context('UserService.getUser')
 *   .code('USER_NOT_FOUND')
 *   .statusCode(404)
 *   .meta({ userId: '123' })
 *   .build('User not found');
 * ```
 */
export class ErrorBuilder {
  private _context?: string;
  private _code: string = 'INTERNAL_ERROR';
  private _statusCode: number = 500;
  private _meta?: Record<string, unknown>;

  context(ctx: string): this {
    this._context = ctx;
    return this;
  }

  code(code: string): this {
    this._code = code;
    return this;
  }

  statusCode(status: number): this {
    this._statusCode = status;
    return this;
  }

  meta(meta: Record<string, unknown>): this {
    this._meta = meta;
    return this;
  }

  build(message: string): HiveLearnError {
    const fullMessage = this._context 
      ? `[${this._context}] ${message}` 
      : message;

    return new HiveLearnError(
      fullMessage,
      this._code,
      this._statusCode,
      this._meta
    );
  }
}
