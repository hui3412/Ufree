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
// Same explicit privacy projection as migration 0002; never used to replace the full private object.
export function personalProjection(person) {
  const out = {
    classes: person.classes.map((c) =>
      Object.fromEntries(
        [
          "day",
          "start",
          "end",
          "course",
          "course_code",
          "section",
          "room",
          "instructor",
          "kind",
        ]
          .filter((k) => typeof c[k] === "string")
          .map((k) => [k, c[k]]),
      ),
    ),
  };
  if (person.semester !== undefined && person.semester !== null)
    out.semester = person.semester;
  return out;
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
    const cacheKey = kind + ":" + canonical(value);
    if (!this.encoded.has(cacheKey))
      this.encoded.set(cacheKey, encodeObject(value, kind));
    const object = { ...(await this.encoded.get(cacheKey)), children: [] },
      objects = new Map([[object.id, object]]);
    if (schedule) {
      const projected = await encodeObject(personalProjection(value));
      projected.personal = projected.id;
      object.personal = projected.id;
      if (projected.id !== object.id) {
        object.children.push(projected.id);
        objects.set(projected.id, projected);
      }
    }
    return { ref: PREFIX + object.id, objects };
  }
  async collection(people) {
    const objects = new Map(),
      entries = [];
    for (const [name, person] of Object.entries(people)) {
      const prepared = await this.prepare(person);
      for (const [id, o] of prepared.objects) objects.set(id, o);
      entries.push([name, prepared.ref.slice(PREFIX.length)]);
    }
    const root = await encodeObject(entries, "collection");
    root.children = [...new Set(entries.map((e) => e[1]))];
    objects.set(root.id, root);
    return { ref: PREFIX + root.id, objects };
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
    for (let start = 0; start < inline.length; start += 10) {
      const group = inline.slice(start, start + 10);
      batch.push(
        this.stmt(
          `INSERT INTO cloud_objects(id,kind,codec,raw_bytes,stored_bytes,data,personal_id,last_used) VALUES ${group.map(() => "(?,?,?,?,?,?,?,?)").join(",")} ON CONFLICT(id) DO UPDATE SET last_used=MAX(cloud_objects.last_used,excluded.last_used),personal_id=COALESCE(excluded.personal_id,cloud_objects.personal_id)`,
          ...group.flatMap((o) => [
            o.id,
            o.kind,
            o.codec,
            o.rawBytes,
            o.data.length,
            o.data.length <= CHUNK ? bindBytes(o.data) : null,
            o.personal,
            Date.now(),
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
          "INSERT INTO cloud_objects(id,kind,codec,raw_bytes,stored_bytes,data,personal_id,last_used) VALUES(?,?,?,?,?,NULL,?,?) ON CONFLICT(id) DO UPDATE SET last_used=MAX(cloud_objects.last_used,excluded.last_used),personal_id=COALESCE(excluded.personal_id,cloud_objects.personal_id)",
          o.id,
          o.kind,
          o.codec,
          o.rawBytes,
          o.data.length,
          o.personal,
          Date.now(),
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
  async record(payload, name = "") {
    if (payload === null) return null;
    const value = payload.startsWith(PREFIX)
      ? await this.object(payload.slice(PREFIX.length))
      : JSON.parse(payload);
    if (
      name.startsWith("f:") &&
      typeof value.person === "string" &&
      value.person.startsWith(PREFIX)
    )
      return {
        ...value,
        person: await this.object(value.person.slice(PREFIX.length)),
      };
    return value;
  }
  async people(payload) {
    if (!payload.startsWith(PREFIX)) return JSON.parse(payload);
    const entries = await this.object(
      payload.slice(PREFIX.length),
      "collection",
    );
    if (!Array.isArray(entries) || entries.length > 2000)
      throw Error("Invalid cloud collection.");
    await this.preload(entries.map((entry) => entry[1]));
    const result = [];
    for (const entry of entries) {
      if (
        !Array.isArray(entry) ||
        entry.length !== 2 ||
        typeof entry[0] !== "string"
      )
        throw Error("Invalid cloud collection.");
      result.push([entry[0], await this.object(entry[1])]);
    }
    return Object.fromEntries(result);
  }
  async compact({ userId = null, limit = 10 } = {}) {
    // Compare-and-swap: maintenance cannot overwrite a simultaneous user edit or deletion.
    let count = 0,
      processedBytes = 0;
    const budget = 5 * 1024 * 1024;
    const records = await this.all(
      `SELECT user_id,name,payload FROM records WHERE payload IS NOT NULL AND substr(payload,1,5)<>'@UF1:' AND CASE WHEN name LIKE 'f:%' AND json_valid(payload) THEN substr(json_extract(payload,'$.person'),1,5) IS NOT '@UF1:' ELSE 1 END ${userId ? "AND user_id=?" : ""} ORDER BY CASE WHEN name LIKE 'f:%' THEN 1 ELSE 0 END LIMIT ?`,
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
    for (const table of ["shares", "deliveries"]) {
      const owner = table === "shares" ? "owner_id" : "sender_id";
      const rows = await this.all(
        `SELECT id,payload FROM ${table} WHERE substr(payload,1,5)<>'@UF1:' ${userId ? "AND " + owner + "=?" : ""} LIMIT ?`,
        ...(userId ? [userId] : []),
        Math.min(1, Math.max(0, limit - count)),
      );
      for (const row of rows) {
        const bytes = enc.encode(row.payload).length;
        if (count && processedBytes + bytes > budget) return count;
        processedBytes += bytes;
        const p = await this.collection(JSON.parse(row.payload));
        await this.stage([p]);
        await this.stmt(
          `UPDATE ${table} SET payload=? WHERE id=? AND payload=?`,
          p.ref,
          row.id,
          row.payload,
        ).run();
        count++;
        this.encoded.clear();
        this.reads.clear();
        this.metadata.clear();
        this.parts.clear();
      }
    }
    return count;
  }
  async collect(now = Date.now()) {
    // A single atomic reachability delete protects all accounts, snapshots, inboxes and live projections.
    await this.stmt(
      `WITH RECURSIVE roots(id) AS (
    SELECT substr(payload,6) FROM records WHERE substr(payload,1,5)='@UF1:'
    UNION SELECT substr(payload,6) FROM shares WHERE substr(payload,1,5)='@UF1:'
    UNION SELECT substr(payload,6) FROM deliveries WHERE substr(payload,1,5)='@UF1:'
    UNION SELECT substr(json_extract(payload,'$.person'),6) FROM records WHERE name LIKE 'f:%' AND json_valid(payload) AND substr(json_extract(payload,'$.person'),1,5)='@UF1:'
    UNION SELECT id FROM cloud_objects WHERE last_used>=?
   ), live(id) AS (SELECT id FROM roots UNION SELECT e.child_id FROM cloud_edges e JOIN live l ON e.parent_id=l.id)
   DELETE FROM cloud_objects WHERE id NOT IN (SELECT id FROM live)`,
      now - HOLD,
    ).run();
  }
}
