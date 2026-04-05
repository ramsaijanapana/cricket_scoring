// Strips sensitive fields from user objects
export function sanitizeUser(user: Record<string, any>) {
  const { passwordHash, ...safe } = user;
  return safe;
}

// Standard API response wrapper
export function apiResponse<T>(data: T, meta?: Record<string, unknown>) {
  return { data, ...(meta ? { meta } : {}) };
}

// Standard error response
export function apiError(code: string, message: string, details?: unknown) {
  return { error: { code, message, ...(details ? { details } : {}) } };
}
