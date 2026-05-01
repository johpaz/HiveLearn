/**
 * HiveLearn — Error Hierarchy
 * 
 * Jerarquía completa de errores para toda la aplicación.
 * Cada error incluye:
 * - code: Código único para identificación programática
 * - statusCode: Status HTTP apropiado
 * - meta: Metadatos adicionales para debugging
 */

// ─────────────────────────────────────────────────────────────────────────────
// Error Base de la Aplicación
// ─────────────────────────────────────────────────────────────────────────────

export class HiveLearnError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly meta?: Record<string, unknown>;
  public readonly timestamp: string;
  public readonly correlationId?: string;

  constructor(
    message: string,
    code: string,
    statusCode: number = 500,
    meta?: Record<string, unknown>,
    correlationId?: string
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.meta = meta;
    this.timestamp = new Date().toISOString();
    this.correlationId = correlationId;

    // Capture stack trace
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      meta: this.meta,
      timestamp: this.timestamp,
      correlationId: this.correlationId,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Errores de Provider y API Keys
// ─────────────────────────────────────────────────────────────────────────────

export class ProviderError extends HiveLearnError {
  constructor(
    message: string,
    code: string,
    statusCode: number = 500,
    meta?: Record<string, unknown>
  ) {
    super(message, code, statusCode, meta);
  }
}

export class ApiKeyError extends ProviderError {
  constructor(
    message: string,
    code: string,
    statusCode: number = 500,
    meta?: Record<string, unknown>
  ) {
    super(message, code, statusCode, meta);
  }
}

export class ApiKeyNotFoundError extends ApiKeyError {
  constructor(providerId: string) {
    super(
      `API key not found for provider: ${providerId}`,
      'API_KEY_NOT_FOUND',
      404,
      { providerId }
    );
  }
}

export class ApiKeyStorageError extends ApiKeyError {
  constructor(message: string, meta?: Record<string, unknown>) {
    super(`Failed to store API key: ${message}`, 'API_KEY_STORAGE_ERROR', 500, meta);
  }
}

export class SecretsPlatformError extends ApiKeyError {
  constructor(platform: string, message: string) {
    super(
      `Secrets platform error on ${platform}: ${message}`,
      'SECRETS_PLATFORM_ERROR',
      500,
      { platform }
    );
  }
}

export class ModelNotFoundError extends ProviderError {
  constructor(modelId: string, providerId?: string) {
    super(
      `Model not found: ${modelId}`,
      'MODEL_NOT_FOUND',
      404,
      { modelId, providerId }
    );
  }
}

export class ProviderNotConfiguredError extends ProviderError {
  constructor(providerId: string) {
    super(
      `Provider not configured: ${providerId}`,
      'PROVIDER_NOT_CONFIGURED',
      400,
      { providerId }
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Errores de Sesión
// ─────────────────────────────────────────────────────────────────────────────

export class SessionError extends HiveLearnError {
  constructor(
    message: string,
    code: string,
    statusCode: number = 500,
    meta?: Record<string, unknown>
  ) {
    super(message, code, statusCode, meta);
  }
}

export class SessionNotFoundError extends SessionError {
  constructor(sessionId: string) {
    super(
      `Session not found: ${sessionId}`,
      'SESSION_NOT_FOUND',
      404,
      { sessionId }
    );
  }
}

export class SessionExpiredError extends SessionError {
  constructor(sessionId: string) {
    super(
      `Session expired: ${sessionId}`,
      'SESSION_EXPIRED',
      401,
      { sessionId }
    );
  }
}

export class SessionConflictError extends SessionError {
  constructor(message: string, meta?: Record<string, unknown>) {
    super(message, 'SESSION_CONFLICT', 409, meta);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Errores de Herramientas/Tools
// ─────────────────────────────────────────────────────────────────────────────

export class ToolError extends HiveLearnError {
  constructor(
    message: string,
    code: string,
    statusCode: number = 500,
    meta?: Record<string, unknown>
  ) {
    super(message, code, statusCode, meta);
  }
}

export class ToolExecutionError extends ToolError {
  constructor(toolName: string, message: string, meta?: Record<string, unknown>) {
    super(
      `Tool execution failed "${toolName}": ${message}`,
      'TOOL_EXECUTION_ERROR',
      500,
      { toolName, ...meta }
    );
  }
}

export class ToolNotFoundError extends ToolError {
  constructor(toolName: string) {
    super(
      `Tool not found: ${toolName}`,
      'TOOL_NOT_FOUND',
      404,
      { toolName }
    );
  }
}

export class ToolValidationError extends ToolError {
  constructor(toolName: string, message: string, meta?: Record<string, unknown>) {
    super(
      `Tool validation failed "${toolName}": ${message}`,
      'TOOL_VALIDATION_ERROR',
      400,
      { toolName, ...meta }
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Errores de Agentes
// ─────────────────────────────────────────────────────────────────────────────

export class AgentError extends HiveLearnError {
  constructor(
    message: string,
    code: string,
    statusCode: number = 500,
    meta?: Record<string, unknown>
  ) {
    super(message, code, statusCode, meta);
  }
}

export class AgentTimeoutError extends AgentError {
  constructor(agentId: string, timeoutMs: number) {
    super(
      `Agent "${agentId}" timed out after ${timeoutMs}ms`,
      'AGENT_TIMEOUT',
      504,
      { agentId, timeoutMs }
    );
  }
}

export class AgentNotFoundError extends AgentError {
  constructor(agentId: string) {
    super(
      `Agent not found: ${agentId}`,
      'AGENT_NOT_FOUND',
      404,
      { agentId }
    );
  }
}

export class AgentExecutionError extends AgentError {
  constructor(agentId: string, message: string, meta?: Record<string, unknown>) {
    super(
      `Agent execution failed "${agentId}": ${message}`,
      'AGENT_EXECUTION_ERROR',
      500,
      { agentId, ...meta }
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Errores de Base de Datos
// ─────────────────────────────────────────────────────────────────────────────

export class DatabaseError extends HiveLearnError {
  constructor(
    message: string,
    code: string,
    statusCode: number = 500,
    meta?: Record<string, unknown>
  ) {
    super(message, code, statusCode, meta);
  }
}

export class DatabaseConnectionError extends DatabaseError {
  constructor(message: string) {
    super(
      `Database connection failed: ${message}`,
      'DATABASE_CONNECTION_ERROR',
      503,
      {}
    );
  }
}

export class DatabaseQueryError extends DatabaseError {
  constructor(message: string, query?: string) {
    super(
      `Database query failed: ${message}`,
      'DATABASE_QUERY_ERROR',
      500,
      { query }
    );
  }
}

export class RecordNotFoundError extends DatabaseError {
  constructor(table: string, id: string | number) {
    super(
      `Record not found in ${table}: ${id}`,
      'RECORD_NOT_FOUND',
      404,
      { table, id }
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Errores de Validación
// ─────────────────────────────────────────────────────────────────────────────

export class ValidationError extends HiveLearnError {
  constructor(
    message: string,
    field?: string,
    meta?: Record<string, unknown>
  ) {
    super(message, 'VALIDATION_ERROR', 400, { field, ...meta });
  }
}

export class RequiredFieldError extends ValidationError {
  constructor(field: string) {
    super(`Field is required: ${field}`, field);
  }
}

export class InvalidFormatError extends ValidationError {
  constructor(field: string, expected: string) {
    super(
      `Invalid format for ${field}: expected ${expected}`,
      field,
      { expected }
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Errores de Autenticación y Autorización
// ─────────────────────────────────────────────────────────────────────────────

export class AuthenticationError extends HiveLearnError {
  constructor(
    message: string,
    code: string = 'AUTHENTICATION_FAILED',
    meta?: Record<string, unknown>
  ) {
    super(message, code, 401, meta);
  }
}

export class AuthorizationError extends HiveLearnError {
  constructor(
    message: string,
    code: string = 'AUTHORIZATION_FAILED',
    meta?: Record<string, unknown>
  ) {
    super(message, code, 403, meta);
  }
}

export class TokenExpiredError extends AuthenticationError {
  constructor() {
    super('Token has expired', 'TOKEN_EXPIRED');
  }
}

export class InvalidTokenError extends AuthenticationError {
  constructor() {
    super('Invalid token', 'INVALID_TOKEN');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Errores de Archivos y Recursos
// ─────────────────────────────────────────────────────────────────────────────

export class FileNotFoundError extends HiveLearnError {
  constructor(filePath: string) {
    super(
      `File not found: ${filePath}`,
      'FILE_NOT_FOUND',
      404,
      { filePath }
    );
  }
}

export class FileWriteError extends HiveLearnError {
  constructor(filePath: string, message: string) {
    super(
      `Failed to write file "${filePath}": ${message}`,
      'FILE_WRITE_ERROR',
      500,
      { filePath }
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Errores de Red y Servicios Externos
// ─────────────────────────────────────────────────────────────────────────────

export class NetworkError extends HiveLearnError {
  constructor(
    message: string,
    url?: string,
    meta?: Record<string, unknown>
  ) {
    super(message, 'NETWORK_ERROR', 503, { url, ...meta });
  }
}

export class ExternalServiceError extends HiveLearnError {
  constructor(
    service: string,
    message: string,
    meta?: Record<string, unknown>
  ) {
    super(
      `External service "${service}" failed: ${message}`,
      'EXTERNAL_SERVICE_ERROR',
      503,
      { service, ...meta }
    );
  }
}

export class RateLimitError extends HiveLearnError {
  constructor(service: string, retryAfter?: number) {
    super(
      `Rate limit exceeded for ${service}`,
      'RATE_LIMIT_EXCEEDED',
      429,
      { service, retryAfter }
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Errores Internos del Servidor
// ─────────────────────────────────────────────────────────────────────────────

export class InternalServerError extends HiveLearnError {
  constructor(message: string, meta?: Record<string, unknown>) {
    super(message, 'INTERNAL_ERROR', 500, meta);
  }
}

export class NotImplementedError extends HiveLearnError {
  constructor(feature: string) {
    super(
      `Feature not implemented: ${feature}`,
      'NOT_IMPLEMENTED',
      501,
      { feature }
    );
  }
}

export class ConfigError extends HiveLearnError {
  constructor(message: string, key?: string) {
    super(
      `Configuration error: ${message}`,
      'CONFIG_ERROR',
      500,
      { key }
    );
  }
}
