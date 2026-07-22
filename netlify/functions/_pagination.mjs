const DEFAULT_PAGE_SIZE = 1000;
const DEFAULT_MAX_ROWS = 100000;

/**
 * Fetch every row from a Supabase query in deterministic pages.
 *
 * buildQuery must return a fresh query builder on each call. Apply a stable
 * order before this helper adds the range, normally order by the table ID.
 */
export async function fetchAllRows(
  buildQuery,
  { pageSize = DEFAULT_PAGE_SIZE, maxRows = DEFAULT_MAX_ROWS } = {},
) {
  if (typeof buildQuery !== 'function') {
    throw new TypeError('fetchAllRows requires a query-builder function.');
  }
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 1000) {
    throw new RangeError('pageSize must be an integer between 1 and 1000.');
  }
  if (!Number.isInteger(maxRows) || maxRows < pageSize) {
    throw new RangeError('maxRows must be an integer at least as large as pageSize.');
  }

  const rows = [];

  for (let from = 0; from < maxRows; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await buildQuery().range(from, to);
    if (error) throw error;

    const page = data ?? [];
    rows.push(...page);

    if (page.length < pageSize) return rows;
  }

  throw new Error(`The query exceeded the safety limit of ${maxRows} rows.`);
}
