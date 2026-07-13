/**
 * Builds a PostgreSQL WHERE clause that matches both the original search term
 * (with spaces) AND the space-stripped version, so "hkrbo15kg" matches "HK RBO 15 KG".
 *
 * @param {string[]} columns  - e.g. ['lrc.so_no', 'lrc.party_name']
 * @param {string}   search   - raw search input from the user
 * @param {number}   paramIndex - current $N index in the query
 * @returns {{ clause: string, params: string[], newIndex: number }}
 */
function buildSearchCondition(columns, search, paramIndex) {
  const normalized = search.replace(/\s+/g, '').toLowerCase()
  const p1 = paramIndex       // $N  — original  %search%
  const p2 = paramIndex + 1  // $N+1 — normalized %searchstripped%

  const regular  = columns.map(col => `${col} ILIKE $${p1}`).join(' OR ')
  const stripped = columns.map(col => `REPLACE(LOWER(${col}), ' ', '') LIKE $${p2}`).join(' OR ')

  return {
    clause:   `(${regular} OR ${stripped})`,
    params:   [`%${search}%`, `%${normalized}%`],
    newIndex: p2 + 1,
  }
}

/**
 * Shared filter builder for the dispatch-stage search bar. Appends:
 *  - free-text search across DO No. (lrc.so_no) only, space-insensitive
 *  - Manual Sauda No. (od.processid) — contains match
 *  - DO Date range (od.party_so_date) — from/to (inclusive)
 * Mutates whereConditions/queryParams in place and returns the next param index.
 * Requires order_dispatch to be joined as `od` in the query the WHERE is used by.
 *
 * @param {Object}   filters         - { search, manual_sauda_no, do_date_from, do_date_to }
 * @param {string[]} whereConditions - array of SQL conditions to append to
 * @param {any[]}    queryParams     - array of bound params to append to
 * @param {number}   paramIndex      - current $N index
 * @returns {number} the next param index
 */
function applyDispatchFilters(filters, whereConditions, queryParams, paramIndex) {
  if (filters.search) {
    const { clause, params, newIndex } = buildSearchCondition(['lrc.so_no'], filters.search, paramIndex);
    whereConditions.push(clause);
    queryParams.push(...params);
    paramIndex = newIndex;
  }
  if (filters.manual_sauda_no) {
    whereConditions.push(`od.processid ILIKE $${paramIndex}`);
    queryParams.push(`%${filters.manual_sauda_no}%`);
    paramIndex++;
  }
  if (filters.do_date_from) {
    whereConditions.push(`od.party_so_date::date >= $${paramIndex}::date`);
    queryParams.push(filters.do_date_from);
    paramIndex++;
  }
  if (filters.do_date_to) {
    whereConditions.push(`od.party_so_date::date <= $${paramIndex}::date`);
    queryParams.push(filters.do_date_to);
    paramIndex++;
  }
  return paramIndex;
}

module.exports = { buildSearchCondition, applyDispatchFilters }
