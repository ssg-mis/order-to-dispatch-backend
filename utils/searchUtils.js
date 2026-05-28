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

module.exports = { buildSearchCondition }
