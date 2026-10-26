/* Revision-based cloud sync and shared-device reconciliation. */
(function (root) {
  "use strict";
  const copy = (value) =>
    value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  // Cloud JSON sorts keys for deduplication; key order must not become an edit.
  const ordered = (value) =>
    Array.isArray(value)
      ? value.map(ordered)
      : value && typeof value === "object"
        ? Object.fromEntries(
            Object.keys(value)
              .sort()
              .map((key) => [key, ordered(value[key])]),
          )
        : value;
  const same = (a, b) =>
    JSON.stringify(ordered(a)) === JSON.stringify(ordered(b));
  const recent = (timestamp) => {
    const age = Date.now() - Number(timestamp);
    return age >= 0 && age < 60000;
  };
  const delayed = (state) => {
    const remaining = state.retryAt - Date.now();
    return remaining > 0 && remaining <= (state.quotaExhausted ? 86400000 : 300000);
  };
  const safe = (name) =>
    !["__proto__", "constructor", "prototype"].includes(name);
  function reconcile(base, local, cloud, unchanged = (name, side) => same((side === "local" ? local : cloud)[name], base[name])) {
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
      if (name.startsWith("f:")) {
        put(name, r);
        continue;
      }
      if (unchanged(name, "local")) put(name, r);
      else if (unchanged(name, "cloud") || same(l, r)) put(name, l);
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
      .filter(
        (name) => !name.startsWith("f:") && !same(base[name], local[name]),
      )
      .map((name) => ({ name, value: copy(local[name] ?? null) }));
  }
  class Sync {
    constructor({
      storage,
      key,
      request,
      onChange = () => {},
      onSynced = () => {},
      scheduleLimit = Infinity,
      preferredSchedule = () => null,
    }) {
      this.storage = storage;
      this.key = key;
      this.request = request;
      this.onChange = onChange;
      this.onSynced = onSynced;
      this.scheduleLimit = scheduleLimit;
      this.preferredSchedule = preferredSchedule;
      this.running = null;
      this.lastCheck = 0;
      this.timer = null;
      this.error = "";
      this.authBlocked = false;
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
      const serialized = JSON.stringify(next);
      if (this.storage.getItem(this.key) !== serialized)
        this.storage.setItem(this.key, serialized);
      this.state = next;
      this.onChange(this);
    }
    pending() {
      return differences(this.state.base, this.cloudRecords()).length;
    }
    cloudRecords() {
      const values = this.state.records;
      const personal = "p:" + (this.preferredSchedule() ?? this.state.personalSchedule);
      if (this.cloudProjection?.state === this.state && this.cloudProjection.personal === personal) return this.cloudProjection.values;
      const names = [...new Set([personal, ...Object.keys(this.state.base), ...Object.keys(values)])]
        .filter(name => name.startsWith("p:") && Object.hasOwn(values, name));
      const allowed = new Set(names.slice(0, this.scheduleLimit));
      const projected = Object.fromEntries(Object.entries(values).filter(([name]) => !name.startsWith("p:") || allowed.has(name)));
      this.cloudProjection = {state:this.state,personal,values:projected};
      return projected;
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
      this.timer = setTimeout(() => this.check("save"), 800);
      this.timer.unref?.();
    }
    check(force = false) {
      if (this.running) return this.running;
      this.reload();
      if (
        force !== true &&
        (this.authBlocked ||
          delayed(this.state) ||
          (force === "save" && root.document?.hidden))
      )
        return Promise.resolve();
      if (
        !force &&
        !this.state.failures &&
        this.state.initialized &&
        !this.pending() &&
        recent(Math.max(this.lastCheck, this.state.checkedAt || 0))
      )
        return Promise.resolve();
      this.running = (async () => {
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            return await this.perform(force);
          } catch (error) {
            if (error.status !== 409 || attempt === 2) throw error;
          }
        }
      })()
        .catch((error) => {
          this.error = error.message;
          this.authBlocked = [401, 403].includes(error.status);
          this.reload();
          const failures = Math.min((this.state.failures || 0) + 1, 6);
          const delay = Math.min(
            300000,
            (error.status === 429 ? 60000 : 15000) * 2 ** (failures - 1),
          );
          const quotaExhausted = error.code === "DAILY_QUOTA_EXHAUSTED";
          const retryAt = quotaExhausted && error.retryAt > Date.now() && error.retryAt <= Date.now() + 86400000 ? error.retryAt : Date.now() + delay;
          this.persist({
            ...this.state,
            failures,
            quotaExhausted,
            retryAt,
          });
          if (
            !quotaExhausted &&
            !this.authBlocked &&
            this.pending() &&
            root.navigator?.onLine !== false &&
            root.document?.hidden !== true
          ) {
            clearTimeout(this.timer);
            this.timer = setTimeout(() => this.check("save"), delay);
            this.timer.unref?.();
          }
        })
        .finally(() => {
          this.running = null;
        });
      return this.running;
    }
    async perform(force = false) {
      // navigator.locks serializes sync across tabs where available. Server revision checks remain authoritative everywhere.
      const work = async () => {
        this.reload();
        // Recheck after acquiring the cross-tab lock: another tab may just have checked.
        if (force !== true && (this.authBlocked || delayed(this.state))) return;
        if (
          !force &&
          !this.state.failures &&
          this.state.initialized &&
          !this.pending() &&
          recent(this.state.checkedAt || 0)
        )
          return;
        const beforeRecords = copy(this.state.records);
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
            personalSchedule:
              delta.personalSchedule ?? this.state.personalSchedule,
            base: cloud,
            records: merge.records,
            initialized: true,
            conflicts: [...this.state.conflicts, ...merge.conflicts],
          });
        }
        this.persist({
          ...this.state,
          ...(check.personalSchedule !== undefined &&
          check.revision === this.state.revision
            ? { personalSchedule: check.personalSchedule }
            : {}),
          ...(Number.isSafeInteger(check.inboxRevision)
            ? { inboxRevision: check.inboxRevision }
            : {}),
        });
        for (let batch = 0; batch < 100; batch++) {
          this.reload();
          const changes = differences(
            this.state.base,
            this.cloudRecords(),
          ).sort((a,b) => Number(b.value === null) - Number(a.value === null)).slice(0, 50);
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
        this.persist({
          ...this.state,
          lastSync: new Date().toISOString(),
          checkedAt: Date.now(),
          retryAt: 0,
          quotaExhausted: false,
          failures: 0,
        });
        this.authBlocked = false;
        this.onSynced(this, {
          changed: !same(beforeRecords, this.state.records),
        });
      };
      if (root.navigator?.locks)
        await root.navigator.locks.request(this.key, work);
      else await work();
    }
  }
  async function deviceBaseline(records) {
    const signatures = Object.fromEntries(await Promise.all(Object.entries(records).map(async ([name, value]) => {
      const bytes = new TextEncoder().encode(JSON.stringify(ordered(value)));
      const digest = await root.crypto.subtle.digest("SHA-256", bytes);
      return [name, Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, "0")).join("")];
    })));
    return { signatures, preferences: copy(records["@preferences"] || {}) };
  }
  async function reconcileDevice(baseline, phone, account) {
    const [local, cloud] = await Promise.all([deviceBaseline(phone), deviceBaseline(account)]);
    const signatures = baseline?.signatures || {};
    return reconcile({ ...signatures, "@preferences": baseline?.preferences || {} }, phone, account,
      (name, side) => (side === "local" ? local : cloud).signatures[name] === signatures[name]);
  }
  const api = { reconcile, reconcileDevice, deviceBaseline, differences, Sync, copy };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.UFreeAccountSync = api;
})(typeof window === "undefined" ? globalThis : window);
