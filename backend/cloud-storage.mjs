// Lossless, server-only content-addressed JSON. Object IDs are never capabilities.
const enc = new TextEncoder();
const dec = new TextDecoder("utf-8", { fatal: true });
export const PREFIX = "@UF1:";
const MAX_RAW = 3 * 1024 * 1024,
  CHUNK = 64000,
  HOLD = 86400000;
const hex = (bytes) =>
  [...new Uint8Array(bytes)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, sorted(value[k])]),
    );
  return value;
}
export const canonical = (value) => JSON.stringify(sorted(value));
const hash = async (kind, raw) =>
  hex(
    await crypto.subtle.digest(
      "SHA-256",
      enc.encode("ufree-storage-v1:" + kind + "\n" + raw),
    ),
  );
const bytesOf = (value) => new Uint8Array(value);
const bindBytes = (value) =>
  value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
async function transform(bytes, Type, format, limit) {
  const reader = new Blob([bytes])
    .stream()
    .pipeThrough(new Type(format))
    .getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) throw Error("Cloud object exceeds its decoded limit.");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    result.set(c, offset);
    offset += c.length;
  }
  return result;
}
export async function encodeObject(value, kind = "json") {
  const raw = canonical(value),
    bytes = enc.encode(raw);
  if (bytes.length > MAX_RAW)
    throw Error("Cloud object exceeds its decoded limit.");
  const compressed = await transform(
    bytes,
    CompressionStream,
    "deflate-raw",
    MAX_RAW + 65536,
  );
  const use = compressed.length < bytes.length;
  return {
    id: await hash(kind, raw),
    kind,
    codec: use ? "deflate-raw" : "json",
    data: use ? compressed : bytes,
    rawBytes: bytes.length,
    personal: null,
    children: [],
  };
}
export class CloudStorage {
  constructor(db) {
    this.db = db;
    this.reads = new Map();
    this.metadata = new Map();
    this.parts = new Map();
    this.encoded = new Map();
  }
  stmt(sql, ...args) {
    return this.db.prepare(sql).bind(...args);
  }
  async all(sql, ...args) {
    return (await this.stmt(sql, ...args).all()).results;
  }
  async prepare(value, { schedule = false, kind = "json" } = {}) {
    if (schedule) {
      // Names and import provenance never participate in the shared timetable ID.
      // Normalize only representation differences; retain the exact original in patches.
      const fields = ["day", "start", "end", "course", "room", "kind"];
      const rows = value.classes.map((c, index) => {
        const core = Object.fromEntries(fields.map(k => [k, k === "kind" ? (c[k] === "busy_block" ? "busy_block" : "class") : (c[k] ?? "")]));
        const patch = Object.fromEntries(Object.entries(c).filter(([k,v]) => !Object.hasOwn(core,k) || canonical(v) !== canonical(core[k])));
        const omit = fields.filter(k => !Object.hasOwn(c,k));
        return { core, patch, omit, index, key: canonical(core) };
      }).sort((a,b) => a.key < b.key ? -1 : a.key > b.key ? 1 : a.index-b.index);
      const core = await encodeObject(rows.map(r => r.core));
      const metadata = Object.fromEntries(Object.entries(value).filter(([k]) => k !== "classes"));
      const patches = rows.map(r => [r.omit, r.patch]);
      const order = rows.map(r => r.index);
      const object = await encodeObject(["ufree-schedule-v2", core.id, metadata, patches, order]);
      object.logicalBytes = enc.encode(canonical(value)).length;
      if (object.logicalBytes > MAX_RAW) throw Error("Cloud object exceeds its decoded limit.");
      object.children = [core.id];
      const objects = new Map([[core.id,core],[object.id,object]]);
      return {ref:PREFIX+object.id, objects};
    }
    const cacheKey = kind + ":" + canonical(value);
    if (!this.encoded.has(cacheKey))
      this.encoded.set(cacheKey, encodeObject(value, kind));
    const object = { ...(await this.encoded.get(cacheKey)), children: [] },
      objects = new Map([[object.id, object]]);
    return { ref: PREFIX + object.id, objects };
  }
  async stage(prepared) {
    // Staging leases protect in-flight references from GC. Roots are attached only after all bytes exist.
    const objects = new Map();
    for (const p of prepared)
      for (const [id, o] of p.objects) {
        const prior = objects.get(id);
        objects.set(
          id,
          prior
            ? {
                ...o,
                personal: o.personal || prior.personal,
                children: [...new Set([...o.children, ...prior.children])],
              }
            : o,
        );
      }
    let batch = [];
    const flush = async () => {
      if (batch.length) {
        await this.db.batch(batch);
        batch = [];
      }
    };
    const values = [...objects.values()];
    const inline = values.filter((o) => o.data.length <= CHUNK);
    for (let start = 0; start < inline.length; start += 11) {
      const group = inline.slice(start, start + 11);
      batch.push(
        this.stmt(
          `INSERT INTO cloud_objects(id,kind,codec,raw_bytes,stored_bytes,data,personal_id,last_used,logical_bytes) VALUES ${group.map(() => "(?,?,?,?,?,?,?,?,?)").join(",")} ON CONFLICT(id) DO UPDATE SET last_used=MAX(cloud_objects.last_used,excluded.last_used),personal_id=COALESCE(excluded.personal_id,cloud_objects.personal_id),logical_bytes=excluded.logical_bytes`,
          ...group.flatMap((o) => [
            o.id,
            o.kind,
            o.codec,
            o.rawBytes,
            o.data.length,
            o.data.length <= CHUNK ? bindBytes(o.data) : null,
            o.personal,
            Date.now(),
            o.logicalBytes ?? o.rawBytes,
          ]),
        ),
      );
      if (batch.length >= 20) await flush();
    }
    await flush();
    for (const o of values.filter((o) => o.data.length > CHUNK)) {
      // A large object and every chunk become visible atomically. An interrupted batch leaves no partial object.
      const writes = [
        this.stmt(
          "INSERT INTO cloud_objects(id,kind,codec,raw_bytes,stored_bytes,data,personal_id,last_used,logical_bytes) VALUES(?,?,?,?,?,NULL,?,?,?) ON CONFLICT(id) DO UPDATE SET last_used=MAX(cloud_objects.last_used,excluded.last_used),personal_id=COALESCE(excluded.personal_id,cloud_objects.personal_id),logical_bytes=excluded.logical_bytes",
          o.id,
          o.kind,
          o.codec,
          o.rawBytes,
          o.data.length,
          o.personal,
          Date.now(),
          o.logicalBytes ?? o.rawBytes,
        ),
      ];
      for (
        let start = 0, part = 0;
        start < o.data.length;
        start += CHUNK, part++
      )
        writes.push(
          this.stmt(
            "INSERT OR IGNORE INTO cloud_chunks(object_id,part,data) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM cloud_objects WHERE id=? AND data IS NULL AND ?<(stored_bytes+63999)/64000)",
            o.id,
            part,
            bindBytes(o.data.subarray(start, start + CHUNK)),
            o.id,
            part,
          ),
        );
      await this.db.batch(writes);
    }
    let edges = [];
    const flushEdges = async () => {
      if (edges.length) {
        batch.push(
          this.stmt(
            `INSERT OR IGNORE INTO cloud_edges(parent_id,child_id) VALUES ${edges.map(() => "(?,?)").join(",")}`,
            ...edges.flat(),
          ),
        );
        edges = [];
        if (batch.length >= 20) await flush();
      }
    };
    for (const o of values)
      for (const id of o.children) {
        edges.push([o.id, id]);
        if (edges.length >= 40) await flushEdges();
      }
    await flushEdges();
    await flush();
  }
  async preload(ids) {
    const missing = [...new Set(ids)].filter((id) => !this.metadata.has(id));
    for (let start = 0; start < missing.length; start += 40) {
      const batch = missing.slice(start, start + 40);
      const rows = await this.all(
        `SELECT * FROM cloud_objects WHERE id IN (${batch.map(() => "?").join(",")})`,
        ...batch,
      );
      for (const row of rows) this.metadata.set(row.id, row);
      const chunked = rows.filter((r) => r.data === null).map((r) => r.id);
      if (chunked.length) {
        const parts = await this.all(
          `SELECT object_id,part,data FROM cloud_chunks WHERE object_id IN (${chunked.map(() => "?").join(",")}) ORDER BY object_id,part`,
          ...chunked,
        );
        for (const id of chunked)
          this.parts.set(
            id,
            parts.filter((p) => p.object_id === id),
          );
      }
    }
  }
  async records(rows) {
    await this.preload(
      rows
        .filter(
          (r) => typeof r.payload === "string" && r.payload.startsWith(PREFIX),
        )
        .map((r) => r.payload.slice(PREFIX.length)),
    );
    await this.preloadCores(rows.filter(r => r.payload?.startsWith(PREFIX)).map(r => r.payload.slice(PREFIX.length)));
    const result = [];
    for (const row of rows)
      result.push({
        name: row.name,
        value: await this.record(row.payload, row.name),
        revision: row.revision,
      });
    return result;
  }
  async object(id, kind = "json") {
    if (!/^[a-f0-9]{64}$/.test(id)) throw Error("Invalid cloud reference.");
    const cacheKey = kind + ":" + id;
    if (this.reads.has(cacheKey)) return this.reads.get(cacheKey);
    const promise = (async () => {
      const row =
        this.metadata.get(id) ||
        (await this.stmt("SELECT * FROM cloud_objects WHERE id=?", id).first());
      if (
        !row ||
        row.kind !== kind ||
        !Number.isInteger(row.raw_bytes) ||
        row.raw_bytes < 0 ||
        row.raw_bytes > MAX_RAW ||
        !Number.isInteger(row.stored_bytes) ||
        row.stored_bytes < 0 ||
        row.stored_bytes > MAX_RAW ||
        !["json", "deflate-raw"].includes(row.codec)
      )
        throw Error("Cloud object is missing or invalid.");
      let data;
      if (row.data !== null) data = bytesOf(row.data);
      else {
        const parts =
          this.parts.get(id) ||
          (await this.all(
            "SELECT part,data FROM cloud_chunks WHERE object_id=? ORDER BY part",
            id,
          ));
        data = new Uint8Array(row.stored_bytes);
        let offset = 0;
        for (let i = 0; i < parts.length; i++) {
          if (parts[i].part !== i) throw Error("Cloud object is incomplete.");
          const b = bytesOf(parts[i].data);
          if (offset + b.length > data.length)
            throw Error("Cloud object is incomplete.");
          data.set(b, offset);
          offset += b.length;
        }
        if (offset !== data.length) throw Error("Cloud object is incomplete.");
      }
      if (data.length !== row.stored_bytes)
        throw Error("Cloud object is incomplete.");
      const raw =
        row.codec === "json"
          ? data
          : await transform(
              data,
              DecompressionStream,
              "deflate-raw",
              row.raw_bytes,
            );
      if (raw.length !== row.raw_bytes)
        throw Error("Cloud object is incomplete.");
      const text = dec.decode(raw);
      if ((await hash(kind, text)) !== id)
        throw Error("Cloud object failed integrity verification.");
      return JSON.parse(text);
    })();
    this.reads.set(cacheKey, promise);
    return promise;
  }
  async preloadCores(ids) {
    const cores = [];
    for (const id of ids) {
      const value = await this.object(id);
      if (Array.isArray(value) && value[0] === "ufree-schedule-v2") cores.push(value[1]);
    }
    await this.preload(cores);
  }
  async person(id) {
    const value = await this.object(id);
    if (!Array.isArray(value) || value[0] !== "ufree-schedule-v2") return value;
    const [,coreId,metadata,patches,order] = value;
    const core = await this.object(coreId);
    const classes = new Array(core.length);
    for (let i=0;i<core.length;i++) {
      const [omit,patch] = patches[i];
      classes[order[i]] = Object.fromEntries([
        ...Object.entries(core[i]).filter(([k]) => !omit.includes(k)),
        ...Object.entries(patch),
      ]);
    }
    return {...metadata, classes};
  }
  async record(payload, name = "") {
    if (payload === null) return null;
    const value = payload.startsWith(PREFIX)
      ? await (name.startsWith("p:") ? this.person(payload.slice(PREFIX.length)) : this.object(payload.slice(PREFIX.length)))
      : JSON.parse(payload);
    if (
      name.startsWith("f:") &&
      typeof value.person === "string" &&
      value.person.startsWith(PREFIX)
    )
      return {
        ...value,
        person: await this.person(value.person.slice(PREFIX.length)),
      };
    return value;
  }
  async repack({userId = null, limit = 10} = {}) {
    const jobs = await this.all(`SELECT * FROM cloud_repack ${userId ? "WHERE user_id=?" : ""} LIMIT ?`, ...(userId ? [userId] : []), limit);
    let count=0, bytes=0;
    for (const job of jobs) {
      const table = job.target;
      if (table!=="records") throw Error("Invalid maintenance job.");
      const predicate = table === "records" ? "user_id=? AND name=?" : "id=?";
      const args = table === "records" ? [job.user_id,job.row_key] : [job.row_key];
      const row = await this.stmt(`SELECT payload FROM ${table} WHERE ${predicate}`, ...args).first();
      if (row?.payload != null) {
        const value = await this.record(row.payload,job.row_key);
        bytes += enc.encode(canonical(value)).length;
        if (count && bytes > 5*1024*1024) break;
        const prepared = await this.prepare(value,{schedule:job.row_key.startsWith("p:")});
        await this.stage([prepared]);
        const verified = await this.record(prepared.ref,job.row_key);
        if (canonical(verified) !== canonical(value)) throw Error("Maintenance round-trip verification failed.");
        // A maintenance conversion never changes sync revisions or resurrects deleted data.
        await this.stmt(`UPDATE ${table} SET payload=? WHERE ${predicate} AND payload=?`, prepared.ref,...args,row.payload).run();
      }
      await this.stmt("DELETE FROM cloud_repack WHERE target=? AND user_id=? AND row_key=?",table,job.user_id,job.row_key).run();
      count++;
      this.encoded.clear(); this.reads.clear(); this.metadata.clear(); this.parts.clear();
    }
    return count;
  }
  async hasLegacy(userId) {
    if ((await this.stmt("SELECT 1 AS pending FROM cloud_repack WHERE user_id=? LIMIT 1",userId).first())?.pending) return true;
    const result = await this.stmt(
      `SELECT
      EXISTS(SELECT 1 FROM records WHERE user_id=? AND payload IS NOT NULL AND substr(payload,1,5)<>'@UF1:' AND CASE WHEN name LIKE 'f:%' AND json_valid(payload) THEN substr(json_extract(payload,'$.person'),1,5) IS NOT '@UF1:' ELSE 1 END)
      AS pending`, userId,
    ).first();
    return !!result.pending;
  }
  async compact({ userId = null, limit = 10 } = {}) {
    // Compare-and-swap: maintenance cannot overwrite a simultaneous user edit or deletion.
    let count = await this.repack({userId,limit}),
      processedBytes = 0;
    const budget = 5 * 1024 * 1024;
    if (count >= limit) return count;
    const records = await this.all(
      `SELECT user_id,name,payload FROM records WHERE payload IS NOT NULL AND substr(payload,1,5)<>'@UF1:' AND CASE WHEN name LIKE 'f:%' AND json_valid(payload) THEN substr(json_extract(payload,'$.person'),1,5) IS NOT '@UF1:' ELSE 1 END ${userId ? "AND user_id=?" : ""} LIMIT ?`,
      ...(userId ? [userId] : []),
      limit,
    );
    for (const row of records) {
      // New live wrappers already contain a reference, not duplicated schedule data.
      if (
        row.name.startsWith("f:") &&
        typeof JSON.parse(row.payload).person === "string" &&
        JSON.parse(row.payload).person.startsWith(PREFIX)
      )
        continue;
      const bytes = enc.encode(row.payload).length;
      if (count && processedBytes + bytes > budget) return count;
      processedBytes += bytes;
      const value = await this.record(row.payload, row.name);
      const p = await this.prepare(value, {
        schedule: row.name.startsWith("p:"),
      });
      await this.stage([p]);
      await this.stmt(
        "UPDATE records SET payload=? WHERE user_id=? AND name=? AND payload=?",
        p.ref,
        row.user_id,
        row.name,
        row.payload,
      ).run();
      count++;
      this.encoded.clear();
      this.reads.clear();
      this.metadata.clear();
      this.parts.clear();
    }
    return count;
  }
  async collect(now = Date.now()) {
    // A single atomic reachability delete protects all accounts, snapshots, inboxes and live schedules.
    await this.stmt(
      `WITH RECURSIVE roots(id) AS (
    SELECT substr(payload,6) FROM records WHERE substr(payload,1,5)='@UF1:'
    UNION SELECT substr(json_extract(payload,'$.person'),6) FROM records WHERE name LIKE 'f:%' AND json_valid(payload) AND substr(json_extract(payload,'$.person'),1,5)='@UF1:'
    UNION SELECT id FROM cloud_objects WHERE last_used>=?
   ), live(id) AS (SELECT id FROM roots UNION SELECT e.child_id FROM cloud_edges e JOIN live l ON e.parent_id=l.id)
   DELETE FROM cloud_objects WHERE id NOT IN (SELECT id FROM live)`,
      now - HOLD,
    ).run();
  }
}
