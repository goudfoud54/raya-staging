// Base PostgREST EN MÉMOIRE partagée par les harnais (alternance_export_test, lecture_paginee_test).
// Reproduit ce qui compte pour les lectures plafonnées : le PLAFOND SERVEUR par réponse (max_rows,
// 1 000 sur la production), appliqué QUELLE QUE SOIT la plage demandée et SANS erreur ; count:'exact'
// + head ; range ; tri multi-colonnes ; contraintes CHECK/UNIQUE optionnelles ; crochets (hooks) pour
// injecter une panne ou une modification concurrente. Ne pas recopier : l'importer.
// cap = plafond serveur par réponse (max_rows), appliqué QUELLE QUE SOIT la plage demandée.
// checks[table](row) → message d'erreur | null (contraintes CHECK). uniques[table] = clés UNIQUE.
function makeDB(opts) {
  opts = opts || {};
  const db = { t: {}, cap: opts.cap || 1000, reads: 0, hooks: {}, log: [] };
  const checks = opts.checks || {}, uniques = opts.uniques || {};
  let seq = 0; const nid = () => 'id' + (++seq);
  const T = n => (db.t[n] = db.t[n] || []);
  const val = (row, k) => row[k];
  class Q {
    constructor(table, kind, payload, o) { this.table = table; this.kind = kind; this.payload = payload; this.o = o || {}; this.f = []; this.ord = []; this.rg = null; this.sel = kind === 'select'; this.one = null; }
    eq(c, v) { this.f.push(r => val(r, c) === v); return this; }
    neq(c, v) { this.f.push(r => val(r, c) !== v); return this; }
    gte(c, v) { this.f.push(r => cmp(val(r, c), v) >= 0); return this; }
    gt(c, v) { this.f.push(r => cmp(val(r, c), v) > 0); return this; }
    lte(c, v) { this.f.push(r => cmp(val(r, c), v) <= 0); return this; }
    lt(c, v) { this.f.push(r => cmp(val(r, c), v) < 0); return this; }
    in(c, vs) { this.f.push(r => vs.includes(val(r, c))); return this; }
    like(c, pat) { const s = pat.replace(/%/g, ''); this.f.push(r => String(val(r, c) || '').includes(s)); return this; }
    not(c, op, v) { if (op === 'is' && v === null) this.f.push(r => val(r, c) != null); return this; }
    order(c, o) { this.ord.push([c, !(o && o.ascending === false)]); return this; }
    // or('type.eq.recurrente,date_specifique.in.(2026-10-06,2026-10-07)') — sous-ensemble utilisé par le code.
    or(expr) { const parts = expr.match(/[a-z_]+\.(eq|in)\.(\([^)]*\)|[^,]+)/g) || [];
      const tests = parts.map(p => { const [c, op, ...v] = p.split('.'); const val = v.join('.');
        return op === 'eq' ? (r => String(r[c]) === val) : (r => val.replace(/[()]/g, '').split(',').includes(String(r[c]))); });
      this.f.push(r => tests.some(t => t(r))); return this; }
    range(a, b) { this.rg = [a, b]; return this; }
    limit(n) { this.rg = [0, n - 1]; return this; }
    select(cols, o) { this.sel = true; this.selOpts = o || {}; return this; }
    maybeSingle() { this.one = 'maybe'; return this; }
    single() { this.one = 'single'; return this; }
    then(res, rej) { try { res(this.run()); } catch (e) { rej(e); } }
    run() {
      const h = db.hooks[this.table + ':' + this.kind]; if (h) { const r = h(this); if (r) return r; }
      const rows = T(this.table), m = r => this.f.every(f => f(r));
      if (this.kind === 'select') {
        db.reads++;
        let out = rows.filter(m);
        if (this.o.count === 'exact' && this.o.head) return { data: null, count: out.length, error: null };
        if (this.ord.length) out = out.slice().sort((a, b) => { for (const [c, asc] of this.ord) { const x = cmp(a[c], b[c]); if (x) return asc ? x : -x; } return 0; });
        if (db.hooks[this.table + ':shuffle']) out = db.hooks[this.table + ':shuffle'](out, this);
        if (this.rg) out = out.slice(this.rg[0], this.rg[1] + 1);
        out = out.slice(0, db.cap);                                   // PLAFOND SERVEUR, silencieux
        out = out.map(r => ({ ...r }));
        if (this.one) return { data: out[0] || null, error: (this.one === 'single' && !out[0]) ? { message: 'no rows' } : null };
        return { data: out, error: null };
      }
      if (this.kind === 'insert' || this.kind === 'upsert') {
        const list = Array.isArray(this.payload) ? this.payload : [this.payload];
        for (const r of list) { const e = checks[this.table] && checks[this.table](r); if (e) return { data: null, error: { message: e } }; }
        const key = uniques[this.table], k = r => key.map(c => r[c]).join('|');
        const written = [];
        for (const r of list) {
          const ex = key && rows.find(x => k(x) === k(r));
          if (ex) { if (this.kind === 'insert') return { data: null, error: { message: 'duplicate key' } }; Object.assign(ex, r); written.push(ex); }
          else { const nr = { id: nid(), ...r }; rows.push(nr); written.push(nr); }
        }
        const d = written.map(r => ({ ...r }));
        return { data: this.one ? d[0] : d, error: null };
      }
      if (this.kind === 'update') { rows.filter(m).forEach(r => Object.assign(r, this.payload)); return { data: null, error: null }; }
      if (this.kind === 'delete') { const hit = rows.filter(m); db.t[this.table] = rows.filter(r => !hit.includes(r)); db.log.push(['delete', this.table, hit.length]); return { data: this.sel ? hit.map(r => ({ id: r.id })) : null, error: null }; }
    }
  }
  const cmp = (a, b) => (a == null && b == null) ? 0 : (a == null ? -1 : (b == null ? 1 : (a < b ? -1 : a > b ? 1 : 0)));
  db.api = { from: tb => ({
    select: (c, o) => new Q(tb, 'select', null, o),
    insert: r => new Q(tb, 'insert', r), upsert: (r, o) => new Q(tb, 'upsert', r, o),
    update: p => new Q(tb, 'update', p), delete: () => new Q(tb, 'delete'),
  }) };
  db.T = T; db.nid = nid;
  return db;
}
module.exports = { makeDB };
