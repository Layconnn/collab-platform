export type PaginatedResult<T> = {
  items: T[];
  nextCursor: string | null;
};

export function toPaginatedResult<T extends { id: string }>(
  rows: T[],
  take: number,
): PaginatedResult<T> {
  if (rows.length <= take) {
    return {
      items: rows,
      nextCursor: null,
    };
  }

  const items = rows.slice(0, take);
  return {
    items,
    nextCursor: items[items.length - 1]?.id ?? null,
  };
}
