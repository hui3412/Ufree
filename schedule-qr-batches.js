(() => {
  "use strict";

  async function pack(names, makeLink, options = {}) {
    const unique = [...new Set(names)];
    const order = new Map(unique.map((name, index) => [name, index]));
    const maxBytes = options.maxBytes ?? 2331;
    const encoder = new TextEncoder(), cache = new Map();
    let extraChecks = 0, searchNodes = 0;
    const budget = options.maxExtraChecks ?? 160;
    const active = () => {
      if (options.isCancelled?.()) {
        const error = new Error("QR generation cancelled."); error.name = "AbortError"; throw error;
      }
    };
    const measure = async (members, required = false) => {
      active();
      const sorted = [...members].sort((a, b) => order.get(a) - order.get(b));
      const key = JSON.stringify(sorted.map(name => order.get(name)));
      if (cache.has(key)) return cache.get(key);
      if (!required && extraChecks >= budget) return null;
      if (!required) extraChecks++;
      const link = await makeLink(sorted);
      active();
      const size = typeof link === "string" ? encoder.encode(link).length : Infinity;
      // Do not retain large failed exports for every candidate combination.
      const result = { names: sorted, size, link: size <= maxBytes ? link : null };
      cache.set(key, result);
      options.onProgress?.({ checked: cache.size, people: unique.length });
      if (cache.size % 8 === 0) await new Promise(resolve => setTimeout(resolve, 0));
      return result;
    };
    if (!unique.length) return { groups: [], oversized: [] };
    if (options.fullLink) {
      const size = encoder.encode(options.fullLink).length;
      cache.set(JSON.stringify(unique.map((_, i) => i)), { names: unique, size, link: size <= maxBytes ? options.fullLink : null });
    }
    const full = await measure(unique, true);
    if (full.link) return { groups: [full], oversized: [] };

    const singles = [], oversized = [];
    for (const name of unique) {
      const single = await measure([name], true);
      if (single.link) singles.push(single); else oversized.push(name);
    }
    singles.sort((a, b) => b.size - a.size || order.get(a.names[0]) - order.get(b.names[0]));
    // Best-fit decreasing using actual compression, not summed individual sizes.
    let best = [];
    for (const single of singles) {
      let placement = null;
      for (let i = 0; i < best.length; i++) {
        const combined = await measure([...best[i].names, ...single.names]);
        if (combined?.link && (!placement || combined.size > placement.group.size)) placement = { index: i, group: combined };
      }
      if (placement) best[placement.index] = placement.group; else best.push(single);
    }
    // Seek fewer groups by redistributing large and small schedules. Bound
    // new encodings and cached search work instead of an unbounded exact search.
    const search = async (index, groups, target) => {
      active();
      if (++searchNodes > (options.maxSearchNodes ?? 2500)) return null;
      if (searchNodes % 64 === 0) await new Promise(resolve => setTimeout(resolve, 0));
      if (index === singles.length) return groups;
      const single = singles[index], choices = [];
      for (let i = 0; i < groups.length; i++) {
        const combined = await measure([...groups[i].names, ...single.names]);
        if (combined?.link) choices.push({ index: i, group: combined });
      }
      choices.sort((a, b) => b.group.size - a.group.size);
      for (const choice of choices) {
        const next = [...groups]; next[choice.index] = choice.group;
        const found = await search(index + 1, next, target);
        if (found) return found;
      }
      if (groups.length < target) return search(index + 1, [...groups, single], target);
      return null;
    };
    while (best.length > 1) {
      const improved = await search(0, [], best.length - 1);
      if (!improved) break;
      best = improved;
    }
    // Also try complete group merges: compression is not perfectly additive.
    for (let i = 0; i < best.length; i++) for (let j = i + 1; j < best.length;) {
      const combined = await measure([...best[i].names, ...best[j].names]);
      if (combined?.link) { best[i] = combined; best.splice(j, 1); i = -1; break; } else j++;
    }
    active();
    return { groups: best, oversized };
  }
  globalThis.WhosFreeQrBatches = { pack };
  if (typeof module !== "undefined" && module.exports) module.exports = { pack };
})();
