(() => {
  "use strict";

  async function pack(names, makeLink, options = {}) {
    const unique = [...new Set(names)];
    const order = new Map(unique.map((name, index) => [name, index]));
    const maxBytes = options.maxBytes ?? 2331;
    const encoder = new TextEncoder(), cache = new Map();
    let phase = "checking", processed = 0, placementTotal = 0;
    const active = () => {
      if (options.isCancelled?.()) {
        const error = new Error("QR generation cancelled."); error.name = "AbortError"; throw error;
      }
    };
    const report = () => {
      active();
      const progress = phase === "complete" ? 1 : phase === "checking" ? .3 * processed / Math.max(1, unique.length)
        : .3 + .65 * processed / Math.max(1, placementTotal);
      options.onProgress?.({ checked: cache.size, people: unique.length, phase, processed, total: phase === "checking" ? unique.length : placementTotal, progress });
    };
    const measure = async members => {
      active();
      const sorted = [...members].sort((a, b) => order.get(a) - order.get(b));
      const key = JSON.stringify(sorted.map(name => order.get(name)));
      if (cache.has(key)) return cache.get(key);
      const link = await makeLink(sorted);
      active();
      const size = typeof link === "string" ? encoder.encode(link).length : Infinity;
      const result = { names: sorted, size, link: size <= maxBytes ? link : null };
      // Failed candidates retain only their size, not large encoded strings.
      cache.set(key, result);
      report();
      if (cache.size % 8 === 0) await new Promise(resolve => setTimeout(resolve, 0));
      return result;
    };
    report();
    if (!unique.length) { phase = "complete"; report(); return { groups: [], oversized: [] }; }
    if (typeof options.fullLink === "string") {
      const size = encoder.encode(options.fullLink).length;
      cache.set(JSON.stringify(unique.map((_, i) => i)), { names: unique, size, link: options.fullLink && size <= maxBytes ? options.fullLink : null });
    }
    const full = await measure(unique);
    if (full.link) { phase = "complete"; report(); return { groups: [full], oversized: [] }; }

    const singles = [], oversized = [];
    for (const name of unique) {
      const single = await measure([name]);
      if (single.link) singles.push(single); else oversized.push(name);
      processed++; report();
    }
    singles.sort((a, b) => b.size - a.size || order.get(a.names[0]) - order.get(b.names[0]));
    phase = "packing"; processed = 0; placementTotal = singles.length; report();
    const groups = [];
    for (const single of singles) {
      active();
      let preferred = -1, roomiest = -1;
      for (let i = 0; i < groups.length; i++) {
        if (roomiest < 0 || groups[i].size < groups[roomiest].size) roomiest = i;
        if (groups[i].size + single.size <= maxBytes && (preferred < 0 || groups[i].size > groups[preferred].size)) preferred = i;
      }
      // Try a likely close fit, then the roomiest QR. Every person gets their
      // own attempts; no shared budget can strand the rest as single QRs.
      // Individual byte sizes only rank candidates. Actual combined encoding
      // decides whether a group fits, since compression is not additive.
      const candidates = [...new Set([preferred, roomiest].filter(index => index >= 0))];
      let placed = false;
      for (const index of candidates) {
        const combined = await measure([...groups[index].names, ...single.names]);
        if (combined.link) { groups[index] = combined; placed = true; break; }
      }
      if (!placed) groups.push(single);
      processed++; report();
    }
    phase = "complete"; report();
    return { groups, oversized };
  }
  globalThis.WhosFreeQrBatches = { pack };
  if (typeof module !== "undefined" && module.exports) module.exports = { pack };
})();

