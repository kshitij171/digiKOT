import { supabase } from './supabaseClient';

async function run(query) {
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export const dbAdapter = {
  async select(table, options = {}) {
    const {
      columns = '*',
      filters = [],
      orderBy = null,
      ascending = true,
      limit = null,
      single = false,
    } = options;
    let q = supabase.from(table).select(columns);
    filters.forEach(({ column, operator = 'eq', value }) => {
      if (operator === 'in') {
        q = q.in(column, value);
        return;
      }
      if (operator === 'is') {
        q = q.is(column, value);
        return;
      }
      q = q[operator](column, value);
    });
    if (orderBy) q = q.order(orderBy, { ascending });
    if (limit) q = q.limit(limit);
    if (single) q = q.maybeSingle();
    return run(q);
  },

  async insert(table, payload, options = {}) {
    const rows = Array.isArray(payload) ? payload : [payload];
    let q = supabase.from(table).insert(rows);
    if (options.returning) q = q.select(options.returning);
    return run(q);
  },

  async update(table, payload, filters = [], options = {}) {
    let q = supabase.from(table).update(payload);
    filters.forEach(({ column, operator = 'eq', value }) => {
      if (operator === 'in') {
        q = q.in(column, value);
        return;
      }
      if (operator === 'is') {
        q = q.is(column, value);
        return;
      }
      q = q[operator](column, value);
    });
    if (options.returning) q = q.select(options.returning);
    return run(q);
  },

  async delete(table, filters = []) {
    let q = supabase.from(table).delete();
    filters.forEach(({ column, operator = 'eq', value }) => {
      if (operator === 'in') {
        q = q.in(column, value);
        return;
      }
      if (operator === 'is') {
        q = q.is(column, value);
        return;
      }
      q = q[operator](column, value);
    });
    return run(q);
  },
};
