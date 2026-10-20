/* Account sync has its own storage. It never opens or writes the legacy Local database. */
(function (root) {
  "use strict";
  const copy = (value) =>
    value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const safe = (name) =>
    !["__proto__", "constructor", "prototype"].includes(name);
  function reconcile(base, local, cloud) {
    const result = Object.create(null),
      conflicts = [];
    const names = new Set([
      ...Object.keys(base),
      ...Object.keys(local),
      ...Object.keys(cloud),
    ]);
    const put = (name, value) => {
      if (value !== undefined && safe(name)) result[name] = copy(value);
    };
    for (const name of names) {
      const b = base[name],
        l = local[name],
        r = cloud[name];
      if (same(l, b)) put(name, r);
      else if (same(r, b) || same(l, r)) put(name, l);
      else if (name === "@preferences") {
        const merged = Object.create(null);
        for (const key of new Set([
          ...Object.keys(b || {}),
          ...Object.keys(l || {}),
          ...Object.keys(r || {}),
        ]))
          if (safe(key))
            merged[key] = copy(same(l?.[key], b?.[key]) ? r?.[key] : l?.[key]);
        put(name, merged);
      } else {
        // A deletion keeps the original key deleted; preserve the concurrent edit as a new copy.
        if (l !== undefined && r !== undefined) put(name, r);
        const edited = l === undefined ? r : l;
        if (edited !== undefined) {
          let index = 1,
            label;
          do {
            label = `${name.slice(0, 165)} (sync conflict ${index++})`;
          } while (names.has(label) || Object.hasOwn(result, label));
          names.add(label);
          put(label, edited);
          conflicts.push(label);
        }
      }
    }
    return { records: result, conflicts };
  }
  function differences(base, local) {
    return [...new Set([...Object.keys(base), ...Object.keys(local)])]
      .filter((name) => !same(base[name], local[name]))
      .map((name) => ({ name, value: copy(local[name] ?? null) }));
  }
  class Sync {
    constructor({
      storage,
      key,
      request,
      onChange = () => {},
      onSynced = () => {},
    }) {
      this.storage = storage;
      this.key = key;
      this.request = request;
      this.onChange = onChange;
      this.onSynced = onSynced;
      this.running = null;
      this.lastCheck = 0;
      this.timer = null;
      this.error = "";
      this.reload();
    }
    reload() {
      const raw = this.storage.getItem(this.key);
      this.state = raw
        ? JSON.parse(raw)
        : {
            revision: 0,
            base: {},
            records: {},
            lastSync: null,
            initialized: false,
            conflicts: [],
          };
      if (
        !this.state.records ||
        !this.state.base ||
        !Number.isSafeInteger(this.state.revision)
      )
        throw Error(
          "Account copy could not be read. It has not been replaced.",
        );
    }
    persist(next = this.state) {
      this.storage.setItem(this.key, JSON.stringify(next));
      this.state = next;
      this.onChange(this);
    }
    pending() {
      return differences(this.state.base, this.state.records).length;
    }
    save(records) {
      const before = copy(this.state.records);
      this.reload();
      // Incorporate another tab's work without replacing it with a stale rendered collection.
      const merged = reconcile(before, records, this.state.records);
      if (same(merged.records, this.state.records)) return;
      this.persist({
        ...this.state,
        records: merged.records,
        conflicts: [...this.state.conflicts, ...merged.conflicts],
      });
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.check(true), 800);
    }
    check(force = false) {
      if (this.running) return this.running;
      if (!force && Date.now() - this.lastCheck < 60000)
        return Promise.resolve();
      this.running = (async () => {
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            return await this.perform();
          } catch (error) {
            if (error.status !== 409 || attempt === 2) throw error;
          }
        }
      })()
        .catch((error) => {
          this.error = error.message;
          this.onChange(this);
        })
        .finally(() => {
          this.running = null;
        });
      return this.running;
    }
    async perform() {
      // navigator.locks serializes sync across tabs where available. Server revision checks remain authoritative everywhere.
      const work = async () => {
        this.reload();
        this.error = "";
        this.onChange(this);
        const check = await this.request("/revision");
        this.lastCheck = Date.now();
        if (check.revision !== this.state.revision || !this.state.initialized) {
          const delta = await this.request(
            `/sync?since=${this.state.revision}`,
          );
          const cloud = copy(this.state.base);
          for (const row of delta.changes) {
            if (!safe(row.name)) throw Error("Invalid server record.");
            if (row.value === null) delete cloud[row.name];
            else cloud[row.name] = row.value;
          }
          this.reload();
          const merge = reconcile(this.state.base, this.state.records, cloud);
          this.persist({
            ...this.state,
            revision: delta.revision,
            base: cloud,
            records: merge.records,
            initialized: true,
            conflicts: [...this.state.conflicts, ...merge.conflicts],
          });
        }
        for (let batch = 0; batch < 100; batch++) {
          this.reload();
          const changes = differences(
            this.state.base,
            this.state.records,
          ).slice(0, 50);
          if (!changes.length) break;
          const sentBase = this.state.revision;
          const result = await this.request("/sync", {
            baseRevision: sentBase,
            changes,
          });
          this.reload();
          const base = copy(this.state.base);
          for (const row of changes) {
            if (row.value === null) delete base[row.name];
            else base[row.name] = row.value;
          }
          this.persist({
            ...this.state,
            base,
            revision: result.revision,
            initialized: true,
          });
        }
        this.persist({ ...this.state, lastSync: new Date().toISOString() });
        this.onSynced(this);
      };
      if (root.navigator?.locks)
        await root.navigator.locks.request(this.key, work);
      else await work();
    }
  }
  const api = { reconcile, differences, Sync, copy };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.UFreeAccountSync = api;
})(typeof window === "undefined" ? globalThis : window);
