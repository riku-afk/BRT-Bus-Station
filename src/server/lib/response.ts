/**
 * Standard API envelopes.
 *
 * Every endpoint returns { success, data | error, timestamp } so integrators and the SPA
 * handle responses the same way.
 */

export type ApiResponse<T> = {
  success: true;
  data: T;
  message?: string;
  timestamp: string;
};

export type ApiErrorResponse = {
  success: false;
  error: { code: string; message: string; details?: Record<string, unknown> };
  timestamp: string;
};

export function apiResponse<T>(data: T, message?: string): ApiResponse<T> {
  return { success: true, data, ...(message ? { message } : {}), timestamp: new Date().toISOString() };
}

export function errorResponse(code: string, message: string, details?: Record<string, unknown>): ApiErrorResponse {
  return {
    success: false,
    error: { code, message, ...(details ? { details } : {}) },
    timestamp: new Date().toISOString(),
  };
}

/** Throw from services; the error middleware turns it into the envelope above. */
export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  toResponse(): ApiErrorResponse {
    return errorResponse(this.code, this.message, this.details);
  }

  static badRequest(message: string, details?: Record<string, unknown>) {
    return new ApiError(400, 'BAD_REQUEST', message, details);
  }
  static unauthorized(message = 'Authentication required') {
    return new ApiError(401, 'UNAUTHORIZED', message);
  }
  static forbidden(message = 'You do not have permission to perform this action') {
    return new ApiError(403, 'FORBIDDEN', message);
  }
  static notFound(message = 'Resource not found') {
    return new ApiError(404, 'NOT_FOUND', message);
  }
  static conflict(message: string) {
    return new ApiError(409, 'CONFLICT', message);
  }
}
