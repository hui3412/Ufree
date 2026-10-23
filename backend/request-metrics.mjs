// Opt-in aggregate diagnostics. Never log tokens, user IDs, schedules, IPs, SQL or share codes.
export function measureDatabase(db) {
  const stats = { statements: 0, rowsRead: 0, rowsWritten: 0, complete: true };
  const observe = (result) => {
    stats.statements++;
    if (
      Number.isFinite(result?.meta?.rows_read) &&
      Number.isFinite(result?.meta?.rows_written)
    ) {
      stats.rowsRead += result.meta.rows_read;
      stats.rowsWritten += result.meta.rows_written;
    } else stats.complete = false;
  };
  const wrap = (raw) => ({
    native: raw,
    bind(...args) {
      return wrap(raw.bind(...args));
    },
    async all() {
      const r = await raw.all();
      observe(r);
      return r;
    },
    async first() {
      const r = await raw.all();
      observe(r);
      return r.results[0] ?? null;
    },
    async run() {
      const r = await raw.run();
      observe(r);
      return r;
    },
  });
  return {
    stats,
    db: db && {
      prepare(sql) {
        return wrap(db.prepare(sql));
      },
      async batch(items) {
        const result = await db.batch(items.map((item) => item.native || item));
        for (const r of result) observe(r);
        return result;
      },
    },
  };
}
export const requestRoute = (path) =>
  /^\/shares\/[a-f0-9]{64}$/.test(path)
    ? "/shares/:code"
    : new Set([
          "/",
          "/health",
          "/admin/diagnostics",
          "/admin/compact",
          "/auth/signup",
          "/auth/login",
          "/auth/session",
          "/auth/logout",
          "/auth/password",
          "/sync",
          "/revision",
          "/shares",
          "/users/lookup",
          "/users/search",
          "/deliveries",
          "/deliveries/respond",
          "/blocks",
          "/connections",
          "/connections/request",
          "/connections/respond",
          "/connections/remove",
          "/profile/personal-schedule",
        ]).has(path)
      ? path
      : "unknown";
