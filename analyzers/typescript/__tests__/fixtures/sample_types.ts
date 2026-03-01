export type ID = string | number;

export type Nullable<T> = T | null;

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export const DEFAULT_PAGE_SIZE = 20;

export function paginate<T>(items: T[], page: number, pageSize: number = DEFAULT_PAGE_SIZE): PaginatedResult<T> {
  const start = (page - 1) * pageSize;
  const data = items.slice(start, start + pageSize);
  return {
    data,
    total: items.length,
    page,
    pageSize,
    hasMore: start + pageSize < items.length,
  };
}

export const createId = (): string => Math.random().toString(36).slice(2);
