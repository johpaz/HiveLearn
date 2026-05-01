/**
 * HiveLearn — Middleware Exports
 * 
 * Punto único de export para todo el middleware
 */

export {
  withRequestLogging,
  logRequestStart,
  logRequestSuccess,
  logRequestError,
  logRequestBody,
  apiLogger,
} from './request-logger';

export {
  withErrorHandler,
  handleErrorResponse,
  formatErrorResponse,
  withErrorHandling,
  setupGlobalErrorHandlers,
  ErrorBuilder,
  type ErrorResponse,
} from './error-handler';
