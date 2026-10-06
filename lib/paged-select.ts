// PostgREST returns at most `max_rows` rows per request (Supabase's default is 1000) and silently drops the rest, so
// a read of "everything this student ever had" is quietly truncated once the history is long enough. This reads such a
// list in pages instead: the first page also asks for the exact total, and the remaining pages are fetched together.
//
// `fetchPage(from, to, withCount)` must run the same ordered query with .range(from, to) -- and pass
// { count: "exact" } to .select() when withCount is true. Ordering must be total (add a tie-break such as the row id),
// otherwise rows can repeat or go missing between pages.

export const PAGE_SIZE = 1000;

type PageResult<T> = { data: T[] | null; error: unknown; count?: number | null };

export async function fetchAllPages<T>(fetchPage: (from: number, to: number, withCount: boolean) => PromiseLike<PageResult<T>>): Promise<{ data: T[] }> {
  const first = await fetchPage(0, PAGE_SIZE - 1, true);
  if (first.error) throw first.error;
  const rows = [...(first.data ?? [])];
  if (rows.length < PAGE_SIZE) return { data: rows };

  const pageCount = typeof first.count === "number" ? Math.ceil(first.count / PAGE_SIZE) : null;
  if (pageCount !== null) {
    const rest = await Promise.all(Array.from({ length: Math.max(0, pageCount - 1) }, (_, i) => fetchPage((i + 1) * PAGE_SIZE, (i + 2) * PAGE_SIZE - 1, false)));
    for (const page of rest) {
      if (page.error) throw page.error;
      rows.push(...(page.data ?? []));
    }
    return { data: rows };
  }

  // No total available: walk the pages one by one until a short one.
  for (let from = PAGE_SIZE; ; from += PAGE_SIZE) {
    const page = await fetchPage(from, from + PAGE_SIZE - 1, false);
    if (page.error) throw page.error;
    rows.push(...(page.data ?? []));
    if ((page.data ?? []).length < PAGE_SIZE) return { data: rows };
  }
}
