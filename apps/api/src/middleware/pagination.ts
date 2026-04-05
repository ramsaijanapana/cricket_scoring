export function parsePagination(query: Record<string, unknown>): { page: number; limit: number; offset: number } {
  const page = Math.max(1, parseInt(String(query.page || '1'), 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(query.limit || '20'), 10) || 20));
  return { page, limit, offset: (page - 1) * limit };
}

export function paginatedResponse<T>(data: T[], page: number, limit: number, total?: number) {
  return {
    data,
    pagination: {
      page,
      limit,
      ...(total !== undefined ? { total, totalPages: Math.ceil(total / limit) } : {}),
    },
  };
}
