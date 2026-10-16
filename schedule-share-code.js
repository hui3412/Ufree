(() => {
  "use strict";
  // 14 bits per BMP character. Unified CJK ideographs have no whitespace,
  // surrogate pairs or Unicode normalization changes; messages copy them as text.
  const FIRST = 0x4e00;
  const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const FIELDS = ["course", "course_code", "section", "room", "instructor"];
  const EXPORT_FIELDS = ["instructor", "course_code", "section", "semester", "extras"];
  const CLASS_KEYS = new Set(["day", "start", "end", "kind", ...FIELDS]);
  const PERSON_KEYS = new Set(["classes", "semester"]);
  const MAX_BYTES = 1048576;
  const MAX_CODE = 1800000;
  const STEPS = [1, 5, 15, 30, 60];
  // WF4 token IDs are permanent. Changing this order would corrupt old codes.
  const WORDS = Object.freeze([
    "Differential Calculus", "General Chemistry", "Introduction to College",
    "Cellular Biology", "Calcul différentiel", "Chimie générale",
    "Probability and Stat", "Programming in Scien", "Renforcement en fran",
    "Oeuvres narratives e", "North American Selec", "Introduction to Coll",
    "Introduction to", "Calculus", "calculus", "Calcul", "Chemistry", "Biology",
    "Mechanics", "Mécanique", "Mathematics", "Mathématiques", "Physics",
    "Physique", "English", "French", "History", "Philosophy", "Psychology",
    "Psychologie", "Literature"
  ]);
  const wordPattern = new RegExp(`(^|[^\\p{L}\\p{N}\\p{M}_])(${[...WORDS].sort((a, b) => b.length - a.length).join("|")})(?=$|[^\\p{L}\\p{N}\\p{M}_])`, "gu");
  function tokenize(value) {
    return value.replace(/[\u0000-\u001f]/g, char => "\0" + char).replace(wordPattern, (_, before, word) => before + String.fromCharCode(WORDS.indexOf(word) + 1));
  }
  function untokenize(value) {
    let result = "";
    for (let i = 0; i < value.length; i++) {
      const token = value.charCodeAt(i);
      if (token === 0) {
        if (++i >= value.length || value.charCodeAt(i) > 31) throw new Error("Invalid dictionary escape.");
        result += value[i];
      } else result += token <= 31 ? WORDS[token - 1] : value[i];
      if (result.length > 200) throw new Error("Expanded label is too long.");
    }
    return result;
  }
  function familyName(value) {
    if (typeof value !== "string" || !value.trim()) return value || null;
    const surname = name => {
      if (name.includes(",")) return name.split(",")[0].trim();
      const parts = name.trim().split(/\s+/);
      let start = parts.length - 1;
      const particles = /^(?:de|del|della|di|da|dos|das|du|des|van|von|den|der|ter|ten|la|le|el|al|bin|ibn|st\.?|saint)$/i;
      while (start > 0 && particles.test(parts[start - 1])) start--;
      return parts.slice(start).join(" ");
    };
    // Keep separately listed instructors and hyphenated surnames intact.
    return value.split(/\s*(?:\/|;|&)\s*|\s+(?:and|et)\s+/).map(surname).filter(Boolean).join("/") || null;
  }
  const normalizedName = name => name.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
  const time = value => {
    if (typeof value !== "string" || !/^\d{2}:\d{2}$/.test(value)) return NaN;
    const [h, m] = value.split(":").map(Number);
    return h < 24 && m < 60 ? h * 60 + m : NaN;
  };
  function base14(bytes) {
    const result = [];
    let bits = 0, buffer = 0;
    for (const byte of bytes) {
      buffer = (buffer << 8) | byte; bits += 8;
      while (bits >= 14) { bits -= 14; result.push(String.fromCharCode(FIRST + ((buffer >>> bits) & 16383))); }
      buffer &= (1 << bits) - 1;
    }
    if (bits) result.push(String.fromCharCode(FIRST + ((buffer << (14 - bits)) & 16383)));
    return String((14 - bits) % 14 / 2) + result.join("");
  }
  function unbase14(text) {
    const padding = Number(text[0]) * 2;
    const length = ((text.length - 1) * 14 - padding) / 8;
    if (!/^[0-6][\u4e00-\u8dff]+$/.test(text) || !Number.isInteger(length) || length < 1 || length > MAX_BYTES + 4) throw new Error("The code is incomplete or contains an invalid character. Paste the full export code.");
    const result = new Uint8Array(length);
    let bits = 0, buffer = 0, offset = 0;
    for (let i = 1; i < text.length; i++) {
      buffer = (buffer << 14) | (text.charCodeAt(i) - FIRST); bits += 14;
      while (bits >= 8) { bits -= 8; const byte = (buffer >>> bits) & 255; if (offset < length) result[offset++] = byte; else if (byte) throw new Error("The code is incomplete or changed."); }
      buffer &= (1 << bits) - 1;
    }
    if (buffer || base14(result) !== text) throw new Error("The code is incomplete. Ask your friend to copy the full code again.");
    return result;
  }
  function checksum(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }
  async function transform(bytes, Stream, format) {
    const reader = new Blob([bytes]).stream().pipeThrough(new Stream(format)).getReader();
    const chunks = [];
    let length = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        length += value.length;
        if (length > MAX_BYTES) throw new Error("This code is too large. Export fewer schedules at once.");
        chunks.push(value);
      }
    } catch (error) {
      await reader.cancel().catch(() => {});
      throw error;
    } finally { reader.releaseLock(); }
    const output = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length; }
    return output;
  }
  function validatePayload(payload) {
    if (!payload || payload.v !== 1 || !Array.isArray(payload.p) || !payload.p.length || payload.p.length > 250) throw new Error("This code does not contain a supported schedule collection.");
    const names = new Set();
    let count = 0;
    for (const person of payload.p) {
      if (!person || typeof person.n !== "string" || !person.n.trim() || person.n.length > 200 || !Array.isArray(person.c)) throw new Error("A person in this code is not valid.");
      const name = normalizedName(person.n);
      if (names.has(name)) throw new Error("This code contains repeated person names.");
      names.add(name);
      if (person.s != null && (typeof person.s !== "string" || !/^(Winter|Fall) 20\d{2}$/.test(person.s))) throw new Error("A semester label in this code is not valid.");
      count += person.c.length;
      if (person.c.length > 500 || count > 10000) throw new Error("This code has too many schedule entries. Export fewer schedules at once.");
      for (const row of person.c) {
        if (!Array.isArray(row) || row.length < 3 || row.length > 9 || !Number.isInteger(row[0]) || !DAYS[row[0]] || !Number.isFinite(time(row[1])) || time(row[2]) <= time(row[1]) || !Number.isFinite(time(row[2]))) throw new Error("A schedule in this code has an invalid day or time.");
        for (const value of row.slice(3, 8)) if (value != null && (typeof value !== "string" || value.length > 200)) throw new Error("A schedule label in this code is not valid.");
        if (row[8] != null && row[8] !== "busy_block") throw new Error("A busy block in this code is not valid.");
      }
    }
  }
  function pack(data, compact = false) {
    if (!data?.people || typeof data.people !== "object" || Array.isArray(data.people)) throw new Error("Select schedules to export.");
    const payload = { v: 1, p: Object.entries(data.people).map(([name, person]) => ({
      n: name, ...(person.semester !== undefined ? { s: person.semester } : {}), c: (person.classes || []).map(item => {
        const row = [DAYS.indexOf(item.day), item.start, item.end, ...FIELDS.map(key => compact && (key === "course_code" || key === "section") ? null : compact && key === "instructor" ? familyName(item[key]) : item[key] || null), item.kind === "busy_block" ? "busy_block" : null];
        while (row.length > 3 && row[row.length - 1] == null) row.pop();
        return row;
      }),
    })) };
    validatePayload(payload);
    return payload;
  }
  function packCompact(payload, slim = false) {
    // Numeric times and durations reduce repeated punctuation. Keep every label
    // intact: compression handles repeated courses without a course dictionary.
    return payload.p.map(person => [person.n, person.c.map(row => {
      const compact = [row[0] | (row[8] === "busy_block" ? 8 : 0), time(row[1]), time(row[2]) - time(row[1]), ...(slim ? [row[3], row[6], row[7]] : row.slice(3, 8))];
      while (compact.length > 3 && compact[compact.length - 1] == null) compact.pop();
      return compact;
    }), ...(person.s !== undefined ? [person.s] : [])]);
  }
  function unpackCompact(compact, slim = false) {
    const invalid = () => { throw new Error("This code does not contain valid schedule data."); };
    if (!Array.isArray(compact) || !compact.length || compact.length > 250) invalid();
    let count = 0;
    const clock = minute => `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
    const people = compact.map(person => {
      if (!Array.isArray(person) || person.length < 2 || person.length > 3 || !Array.isArray(person[1]) || person[1].length > 500) invalid();
      count += person[1].length; if (count > 10000) invalid();
      return { n: person[0], ...(person.length === 3 ? { s: person[2] } : {}), c: person[1].map(row => {
        if (!Array.isArray(row) || row.length < 3 || row.length > (slim ? 6 : 8)) invalid();
        const [day, start, duration] = row;
        if (!Number.isInteger(day) || day < 0 || day > 14 || (day & 7) > 6 || !Number.isInteger(start) || start < 0 || !Number.isInteger(duration) || duration <= 0 || start + duration > 1439) invalid();
        return [day & 7, clock(start), clock(start + duration), ...(slim ? [row[3] ?? null, null, null, row[4] ?? null, row[5] ?? null] : FIELDS.map((_, i) => row[i + 3] ?? null)), day & 8 ? "busy_block" : null];
      }) };
    });
    const payload = { v: 1, p: people };
    validatePayload(payload);
    return payload;
  }
  function packBinary(payload, variant, dictionary = false, options = {}) {
    // Try literal labels, shared strings, and recurring class patterns. Keep row
    // order and exact minutes; the selected time unit must divide every time.
    const rows = payload.p.flatMap(person => person.c);
    const step = options.timeTable ? 1 : [...STEPS].reverse().find(unit => rows.every(row => time(row[1]) % unit === 0 && (time(row[2]) - time(row[1])) % unit === 0));
    const out = [];
    const byte = value => {
      if (out.length >= MAX_BYTES) throw new Error("Binary selection is too large.");
      out.push(value);
    };
    const integer = value => {
      do { const next = value % 128; value = Math.floor(value / 128); byte(next | (value ? 128 : 0)); } while (value);
    };
    const string = value => {
      const modern = dictionary && options.dictIndex ? DICTS5[options.dictIndex] : null;
      const encoded = modern ? value : dictionary ? tokenize(value) : value;
      const literalBytes = new TextEncoder().encode(encoded);
      const bytes = modern ? modern.encode(value) : literalBytes;
      // UTF-8 replaces lone surrogates. Let the JSON candidate preserve them.
      if (new TextDecoder("utf-8", { ignoreBOM: true }).decode(literalBytes) !== encoded) throw new Error("Use JSON for this label.");
      integer(bytes.length); for (const value of bytes) byte(value);
    };
    const writeTime = value => { if(value % 5 === 0 && value / 5 < 255) byte(value / 5); else { byte(255); integer(value); } };
    const strings = [], ids = new Map();
    if (variant) for (const row of rows) for (const label of row.slice(3, 8)) {
      if (label && !ids.has(label)) { ids.set(label, strings.length); strings.push(label); }
    }
    const labels = row => {
      const mask = FIELDS.reduce((mask, _, i) => mask | (row[i + 3] ? 1 << i : 0), row[8] === "busy_block" ? 32 : 0);
      byte(mask);
      for (let i = 0; i < FIELDS.length; i++) if (mask & (1 << i)) {
        if (variant) integer(ids.get(row[i + 3])); else string(row[i + 3]);
      }
    };
    const patternKey = row => JSON.stringify([time(row[1]), time(row[2]), ...FIELDS.map((_, i) => row[i + 3] || null), row[8] || null]);
    const patterns = [], patternIds = new Map();
    byte(variant | (STEPS.indexOf(step) << 2) | (dictionary ? 32 : 0) | (options.timeTable ? 64 : options.personUnits ? 128 : 0));
    if (variant) { integer(strings.length); for (const label of strings) string(label); }
    if (variant === 2) {
      for (const row of rows) {
        const key = patternKey(row);
        if (!patternIds.has(key)) { patternIds.set(key, patterns.length); patterns.push(row); }
      }
      integer(patterns.length);
      for (const row of patterns) {
        if(options.timeTable){writeTime(time(row[1]));writeTime(time(row[2])-time(row[1]));}else{integer(time(row[1])/step);integer((time(row[2])-time(row[1]))/step);} labels(row);
      }
    }
    integer(payload.p.length);
    for (const person of payload.p) {
      string(person.n);
      integer(person.s === undefined ? 0 : person.s === null ? 1 : 2 + (Number(person.s.slice(-4)) - 2000) * 2 + (person.s.startsWith("Fall") ? 1 : 0));
      integer(person.c.length);
      const localStep = options.personUnits && variant !== 2 ? [...STEPS].reverse().find(unit => person.c.every(row => time(row[1]) % unit === 0 && (time(row[2]) - time(row[1])) % unit === 0)) : step;
      if(options.personUnits && variant !== 2)byte(STEPS.indexOf(localStep));
      const previous = DAYS.map(() => 480 / localStep);
      for (const row of person.c) {
        if (variant === 2) integer(patternIds.get(patternKey(row)) * 8 + row[0]);
        else {
          if(options.timeTable){byte(row[0]);writeTime(time(row[1]));writeTime(time(row[2])-time(row[1]));}
          else{const start=time(row[1])/localStep,delta=start-previous[row[0]];integer((delta<0?-delta*2-1:delta*2)*8+row[0]);previous[row[0]]=start;integer((time(row[2])-time(row[1]))/localStep);} labels(row);
        }
      }
    }
    return Uint8Array.from(out);
  }
  function unpackBinary(bytes, version4 = false, version5 = false) {
    const invalid = () => { throw new Error("This code does not contain valid schedule data."); };
    let offset = 0;
    const byte = () => { if (offset >= bytes.length) invalid(); return bytes[offset++]; };
    const integer = max => {
      let value = 0;
      for (let i = 0; i < 4; i++) {
        const next = byte(); value += (next & 127) * 2 ** (7 * i);
        if (next < 128) { if (value > max || (i && next === 0)) invalid(); return value; }
      }
      invalid();
    };
    const string = () => {
      const length = integer(600);
      if (offset + length > bytes.length) invalid();
      let value;
      try { value = version5 && dictionary ? DICTS5[3].decode(bytes.subarray(offset,offset+length)) : new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes.subarray(offset, offset + length)); } catch { invalid(); }
      offset += length;
      if (dictionary && !version5) { try { value = untokenize(value); } catch { invalid(); } }
      if (value.length > 200) invalid(); return value;
    };
    const header = byte(), variant = header & 3, dictionary = version4 && Boolean(header & 32), step = STEPS[(version4 ? header & 31 : header) >> 2];
    const timeTable = version5 && Boolean(header & 64), personUnits = version5 && Boolean(header & 128);
    if (variant > 2 || !step || (version4 && !version5 && header & 192) || (timeTable && (personUnits || step !== 1))) invalid();
    const readTime = () => { const value=byte();return value===255?integer(1439):value*5; };
    const strings = [];
    if (variant) { const count = integer(50000); for (let i = 0; i < count; i++) strings.push(string()); }
    const labels = () => {
      const mask = byte(); if (mask > 63) invalid();
      return [...FIELDS.map((_, i) => {
        if (!(mask & (1 << i))) return null;
        if (!variant) return string();
        if (!strings.length) invalid();
        return strings[integer(strings.length - 1)];
      }), mask & 32 ? "busy_block" : null];
    };
    const clock = minute => `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
    const row = (day, start, duration, details, unit = step) => {
      start *= unit; duration *= unit;
      if (day > 6 || start < 0 || duration < 1 || start + duration > 1439) invalid();
      return [day, clock(start), clock(start + duration), ...details];
    };
    const patterns = [];
    if (variant === 2) {
      const count = integer(10000);
      for (let i = 0; i < count; i++) {
        const start = timeTable ? readTime() : integer(1439), duration = timeTable ? readTime() : integer(1439), details = labels();
        row(0, start, duration, details); patterns.push({ start, duration, details });
      }
    }
    const count = integer(250); if (!count) invalid();
    const people = []; let total = 0;
    for (let i = 0; i < count; i++) {
      const name = string(), semester = integer(201), entries = integer(500);
      total += entries; if (total > 10000) invalid();
      const person = { n: name, ...(semester ? { s: semester === 1 ? null : `${(semester - 2) % 2 ? "Fall" : "Winter"} ${2000 + Math.floor((semester - 2) / 2)}` } : {}), c: [] };
      const localStep = personUnits && variant !== 2 ? STEPS[byte()] : step;
      if(!localStep)invalid();
      const previous = DAYS.map(() => 480 / localStep);
      for (let j = 0; j < entries; j++) {
        if (variant === 2) {
          if (!patterns.length) invalid();
          const token = integer(patterns.length * 8 - 1), pattern = patterns[Math.floor(token / 8)];
          person.c.push(row(token & 7, pattern.start, pattern.duration, pattern.details));
        } else if(timeTable){person.c.push(row(byte(),readTime(),readTime(),labels()));}
        else {
          const token = integer(23031), day = token & 7;
          if (day > 6) invalid();
          const delta = Math.floor(token / 8), start = previous[day] + (delta % 2 ? -(delta + 1) / 2 : delta / 2);
          previous[day] = start;
          const duration = integer(1439); person.c.push(row(day, start, duration, labels(), localStep));
        }
      }
      people.push(person);
    }
    if (offset !== bytes.length) invalid();
    const payload = { v: 1, p: people }; validatePayload(payload); return payload;
  }
  // WF5 vocabulary is permanent. Prefix subsets share IDs and decode against
  // the complete table, so trying smaller dictionaries needs no extra metadata.
  const WORDS5 = Object.freeze(["Differential Calculus", "General Chemistry", "Introduction to College", "Cellular Biology", "Calcul différentiel", "Chimie générale", "Probability and Stat", "Programming in Scien", "Renforcement en fran", "Oeuvres narratives e", "North American Selec", "Introduction to Coll", "Introduction to", "Calculus", "calculus", "Calcul", "Chemistry", "Biology", "Mechanics", "Mécanique", "Mathematics", "Mathématiques", "Physics", "Physique", "English", "French", "History", "Philosophy", "Psychology", "Psychologie", "Literature", "Introduction to Psychology", "Introduction to Sociology", "Introduction to Business", "Introduction to World", "Introduction to Literature", "Introduction to Programming", "Organic Chemistry", "Physical Education", "World History", "Linear Algebra", "Integral Calculus", "Applied Mathematics", "Environmental Science", "Computer Science", "Programming in Science", "English Literature", "French Literature", "Social Science", "Political Science", "Human Biology", "General Biology", "General Physics", "Fitness Conditioning", "Music Literature", "Ear Training", "String Lab", "Introduction to Psyc", "Introduction to Worl", "Probability and Statistics", "Calcul intégral", "Algèbre linéaire", "Philosophie et rationalité", "Littérature et imaginaire", "Écriture et littérature", "Méthodes de travail", "Éducation physique", "Sciences humaines", "Sciences de la nature", "Introduction à", "Chimie organique", "Biologie cellulaire", "Statistiques", "19th Century", "20th Century", "Century", "Thinker", "Knowledge", "Science", "Business", "College", "Fitness", "Volleyball", "Badminton", "Basketball", "Swimming", "Soccer", "Dance", "Yoga", "Training", "Music", "Art", "Arts", "Communication", "Computer", "Programming", "Technology", "Engineering", "Sociology", "Anthropology", "Economics", "Geography", "Humanities", "Theatre", "Theater", "Ethics", "Religion", "Statistics", "Algebra", "Differential", "Integral", "General", "Organic", "Physical", "Environmental", "Cellular", "Laboratory", "Laboratoire", "Littérature", "Français", "Anglais", "Histoire", "Philosophie", "Sociologie", "Économie", "Géographie", "Chimie", "Biologie", "Informatique", "Programmation", "Sciences", "Méthodes", "Travail", "Renforcement", "Oeuvres", "Œuvres", "narratives", "Honours", "ENRICHED", "Enriched", "INTENSIVE", "Intensive", "Introduction", "Psych", "Theor", "Theory", "lab", "Lab", "CL", "CL1", "CL2", "CL12"]);
  function dictionary5(table) {
    const indices = new Map(table.map((word, i) => [word, i + 1]));
    const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(^|[^\\p{L}\\p{N}\\p{M}_])(${[...table].sort((a,b) => b.length-a.length).map(escape).join("|")})(?=$|[^\\p{L}\\p{N}\\p{M}_])`, "gu");
    const fail = () => { throw new Error("This code does not contain valid schedule data."); };
    return {
      encode(value) {
        const out = [], encoder = new TextEncoder();
        if (new TextDecoder("utf-8", { ignoreBOM: true }).decode(encoder.encode(value)) !== value) throw new Error("Use JSON for this label.");
        const literal = text => { for (const byte of encoder.encode(text)) { if (byte < 32) out.push(0); out.push(byte); } };
        let offset = 0;
        for (const match of value.matchAll(pattern)) {
          const start = match.index + match[1].length;
          literal(value.slice(offset, start));
          let id = indices.get(match[2]);
          if (id <= 31) out.push(id);
          else { out.push(0); do { const next=id%128; id=Math.floor(id/128); out.push(next | (id ? 128 : 0)); } while (id); }
          offset=start+match[2].length;
        }
        literal(value.slice(offset)); return Uint8Array.from(out);
      },
      decode(bytes) {
        let out="", literals=[];
        const flush=()=>{ if(literals.length){try{out+=new TextDecoder("utf-8",{fatal:true,ignoreBOM:true}).decode(Uint8Array.from(literals));}catch{fail();}literals=[];}if(out.length>200)fail(); };
        for(let i=0;i<bytes.length;i++) {
          const byte=bytes[i];
          if(byte>=32){literals.push(byte);continue;}
          flush();
          if(byte){if(!table[byte-1])fail();out+=table[byte-1];}
          else {
            if(++i>=bytes.length)fail();
            const next=bytes[i];
            if(next<=31)out+=String.fromCharCode(next);
            else {
              let id=0,bits=0,v=next;
              for(;;){id+=(v&127)*2**bits;if(v<128)break;if(++i>=bytes.length||bits>=21)fail();bits+=7;v=bytes[i];}
              if(id<32||id>table.length||(bits&&v===0))fail();out+=table[id-1];
            }
          }
          if(out.length>200)fail();
        }
        flush();return out;
      }
    };
  }
  const DICTS5 = [null, dictionary5(WORDS5.slice(0,63)), dictionary5(WORDS5.slice(0,127)), dictionary5(WORDS5)];
  const alphabet15 = index => String.fromCharCode(index<20992 ? 0x4e00+index : index<27584 ? 0x3400+index-20992 : 0xac00+index-27584);
  const index15 = value => value>=0x4e00&&value<=0x9fff ? value-0x4e00 : value>=0x3400&&value<=0x4dbf ? value-0x3400+20992 : value>=0xac00&&value<=0xc03f ? value-0xac00+27584 : -1;
  function base15(bytes) {
    const out=[];let bits=0,buffer=0;
    for(const byte of bytes){buffer=(buffer<<8)|byte;bits+=8;while(bits>=15){bits-=15;out.push(alphabet15((buffer>>>bits)&32767));}buffer&=(1<<bits)-1;}
    if(bits)out.push(alphabet15((buffer<<(15-bits))&32767));
    return "0123456789abcde"[(15-bits)%15]+out.join("");
  }
  function unbase15(text) {
    const invalid=()=>{throw new Error("The code is incomplete or changed. Paste the full export code.");};
    const padding="0123456789abcde".indexOf(text[0]),length=((text.length-1)*15-padding)/8;
    if(padding<0||!Number.isInteger(length)||length<1||length>MAX_BYTES+4)invalid();
    const bytes=new Uint8Array(length);let bits=0,buffer=0,offset=0;
    for(let i=1;i<text.length;i++){const index=index15(text.charCodeAt(i));if(index<0)invalid();buffer=(buffer<<15)|index;bits+=15;while(bits>=8){bits-=8;const byte=(buffer>>>bits)&255;if(offset<length)bytes[offset++]=byte;else if(byte)invalid();}buffer&=(1<<bits)-1;}
    if(buffer||base15(bytes)!==text)invalid();return bytes;
  }
  const factor5 = (() => {
    const invalid=()=>{throw new Error("This code does not contain valid schedule data.");};
    const assert={ok:value=>{if(!value)invalid();},equal:(a,b)=>{if(a!==b)invalid();}};
    class Writer {
      constructor(){this.bytes=[];this.used=0;this.value=0;this.length=0;}
      bits(n,k){assert.ok(Number.isInteger(n)&&n>=0&&n<2**k);if(this.length+k>MAX_BYTES*8)invalid();for(let i=k-1;i>=0;i--){this.value=this.value*2+Math.floor(n/2**i)%2;this.used++;this.length++;if(this.used===8){this.bytes.push(this.value);this.used=0;this.value=0;}}}
      int(n){assert.ok(Number.isInteger(n)&&n>=0&&n<2**28);do{const byte=n%128;n=Math.floor(n/128);this.bits(byte+(n?128:0),8);}while(n);}
      finish(){if(this.used)this.bytes.push(this.value*2**(8-this.used));return Uint8Array.from(this.bytes);}
    }
    class Reader {
      constructor(bytes){this.bytes=bytes;this.pos=0;}
      bits(k){if(this.pos+k>this.bytes.length*8)invalid();let n=0;for(let i=0;i<k;i++){n=n*2+(this.bytes[Math.floor(this.pos/8)]>>>(7-this.pos%8)&1);this.pos++;}return n;}
      int(max=10000){let n=0;for(let i=0;i<4;i++){const byte=this.bits(8);n+=(byte&127)*2**(7*i);if(byte<128){if(n>max||(i&&byte===0))invalid();return n;}}invalid();}
      index(table,k){const i=this.bits(k);if(i>=table.length)invalid();return table[i];}
      end(){if(this.bytes.length*8-this.pos>=8)invalid();while(this.pos<this.bytes.length*8)if(this.bits(1))invalid();}
    }
    const width=n=>n<=1?0:Math.ceil(Math.log2(n));
const min=t=>Number(t.slice(0,2))*60+Number(t.slice(3)),clock=t=>`${String(Math.floor(t/60)).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`;
const table=xs=>{const a=[],ids=new Map();for(const x of xs){const k=JSON.stringify(x);if(!ids.has(k)){ids.set(k,a.length);a.push(x);}}return {a,id:x=>ids.get(JSON.stringify(x))};};
const configs=[{name:'field-local-tables',split:false},{name:'independent-start-duration-tables',split:true},{name:'weekday-columns',split:true,days:true},{name:'sorted-tables',split:true,sort:true},{name:'byte-align-people',split:true,align:true},{name:'byte-align-columns',split:true,columns:true}];
function encode(payload,cfg,di=3){
  const w=new Writer(),dict=DICTS5[di];w.bits(configs.indexOf(cfg)*4+di,8);
  const writeText=s=>{const bytes=dict?dict.encode(s):new TextEncoder().encode(s);if(!dict&&new TextDecoder('utf-8',{ignoreBOM:true}).decode(bytes)!==s)throw Error("Use JSON for this label.");w.int(bytes.length);for(const b of bytes)w.bits(b,8);};
  const rows=payload.p.flatMap(p=>p.c),fields=[3,7,6].map(f=>table(rows.map(r=>r[f]??null)));
  if(cfg.sort)for(const t of fields){t.a.sort((a,b)=>String(a).localeCompare(String(b),'en'));const indices=new Map(t.a.map((x,i)=>[JSON.stringify(x),i]));t.id=x=>indices.get(JSON.stringify(x));}
  for(const t of fields){w.int(t.a.length);for(const s of t.a){w.bits(s===null?0:1,1);if(s!==null)writeText(s);}}
  const details=table(rows.map(r=>[r[3]??null,r[7]??null,r[8]??null])),dw=width(details.a.length),fw=fields.map(t=>width(t.a.length));
  w.int(details.a.length);for(const a of details.a){w.bits(fields[0].id(a[0]),fw[0]);w.bits(fields[1].id(a[1]),fw[1]);w.bits(a[2]==='busy_block'?1:0,1);}
  const times=cfg.split?[table(rows.map(r=>min(r[1]))),table(rows.map(r=>min(r[2])-min(r[1])))]:[table(rows.map(r=>[min(r[1]),min(r[2])-min(r[1])]))];
  if(cfg.sort)for(const t of times){t.a.sort((a,b)=>a-b);const indices=new Map(t.a.map((x,i)=>[JSON.stringify(x),i]));t.id=x=>indices.get(JSON.stringify(x));}
  const writeTime=n=>{w.bits(n%5===0?n/5:288,9);if(n%5)w.bits(n,11);};
  for(const t of times){w.int(t.a.length);for(const x of t.a)for(const n of Array.isArray(x)?x:[x])writeTime(n);}
  const align=()=>{while(w.length%8)w.bits(0,1);};
  w.int(payload.p.length);
  for(const p of payload.p){writeText(p.n);w.int(p.s===undefined?0:p.s===null?1:2+(Number(p.s.slice(-4))-2000)*2+(p.s.startsWith('Fall')?1:0));w.int(p.c.length);
    // Columns preserve original row order; days use three bits unless a small
    // day table saves bits after counting its explicit overhead.
    if(cfg.days){const days=table(p.c.map(r=>r[0]));const use=3+days.a.length*3+p.c.length*width(days.a.length)<p.c.length*3;w.bits(use?1:0,1);if(use){w.bits(days.a.length,3);for(const day of days.a)w.bits(day,3);for(const r of p.c)w.bits(days.id(r[0]),width(days.a.length));}else for(const r of p.c)w.bits(r[0],3);}else for(const r of p.c)w.bits(r[0],3);
    if(cfg.columns)align();
    for(let i=0;i<times.length;i++){for(const r of p.c)w.bits(times[i].id(cfg.split?(i?min(r[2])-min(r[1]):min(r[1])):[min(r[1]),min(r[2])-min(r[1])]),width(times[i].a.length));if(cfg.columns)align();}
    for(const r of p.c)w.bits(details.id([r[3]??null,r[7]??null,r[8]??null]),dw);
    if(cfg.columns)align();
    for(const r of p.c)w.bits(fields[2].id(r[6]??null),fw[2]);
    if(cfg.align||cfg.columns)align();
  }return w.finish();
}
function decode(bytes){
  const r=new Reader(bytes),h=r.bits(8),cfg=configs[Math.floor(h/4)],dict=DICTS5[h%4];assert.ok(cfg);
  const readText=()=>{const b=Uint8Array.from({length:r.int(600)},()=>r.bits(8));let value;try{value=dict?dict.decode(b):new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(b);}catch{invalid();}if(value.length>200)invalid();return value;};
  const fields=Array.from({length:3},()=>Array.from({length:r.int()},()=>r.bits(1)?readText():null)),fw=fields.map(t=>width(t.length));
  const details=Array.from({length:r.int()},()=>[r.index(fields[0],fw[0]),r.index(fields[1],fw[1]),r.bits(1)?'busy_block':null]),dw=width(details.length);
  const readTime=()=>{const n=r.bits(9);assert.ok(n<=288);const value=n===288?r.bits(11):n*5;if(value>1439)invalid();return value;};
  const times=Array.from({length:cfg.split?2:1},()=>Array.from({length:r.int()},()=>cfg.split?readTime():[readTime(),readTime()]));
  const align=()=>{while(r.pos%8)assert.equal(r.bits(1),0);};
  let total=0;const count=r.int(250);if(!count)invalid();const p=Array.from({length:count},()=>{const n=readText(),s=r.int(201),nc=r.int(500),rs=Array.from({length:nc},()=>({}));total+=nc;if(total>10000)invalid();
    if(cfg.days&&r.bits(1)){const ds=Array.from({length:r.bits(3)},()=>r.bits(3));for(const x of rs)x.day=r.index(ds,width(ds.length));}else for(const x of rs)x.day=r.bits(3);
    if(cfg.columns)align();
    for(let i=0;i<times.length;i++){for(const x of rs){const t=r.index(times[i],width(times[i].length));if(cfg.split){if(i)x.duration=t;else x.start=t;}else [x.start,x.duration]=t;}if(cfg.columns)align();}
    for(const x of rs)x.d=r.index(details,dw);if(cfg.columns)align();for(const x of rs)x.room=r.index(fields[2],fw[2]);if(cfg.align||cfg.columns)align();
    return {n,...(s?{s:s===1?null:`${(s-2)%2?'Fall':'Winter'} ${2000+Math.floor((s-2)/2)}`}:{}) ,c:rs.map(x=>[x.day,clock(x.start),clock(x.start+x.duration),x.d[0],null,null,x.room,x.d[1],x.d[2]])};
  });r.end();const payload={v:1,p};validatePayload(payload);return payload;
}

return {encode,decode,configs};

  })();

  function wrap(bytes, mode, version = 2) {
    const checked = new Uint8Array(bytes.length + 4);
    new DataView(checked.buffer).setUint32(0, checksum(bytes), true);
    checked.set(bytes, 4);
    return `WF${version}${mode}${(version >= 5 ? base15(checked) : base14(checked))}`;
  }
  const extraFields = (value, reserved) => Object.fromEntries(Object.entries(value).filter(([key]) => !reserved.has(key)));
  function selectedPerson(person, mask) {
    return {
      ...(mask & 16 ? extraFields(person, PERSON_KEYS) : {}),
      ...(mask & 8 && person.semester !== undefined ? { semester: person.semester } : {}),
      classes: (person.classes || []).map(item => ({
        ...(mask & 16 ? extraFields(item, CLASS_KEYS) : {}),
        day: item.day, start: item.start, end: item.end,
        course: item.course || null, room: item.room || null,
        kind: item.kind === "busy_block" ? "busy_block" : "class",
        ...(mask & 1 ? { instructor: item.instructor || null } : {}),
        ...(mask & 2 ? { course_code: item.course_code || null } : {}),
        ...(mask & 4 ? { section: item.section || null } : {}),
      })),
    };
  }
  function fieldMask(fields) {
    if (!Array.isArray(fields) || fields.some(field => !EXPORT_FIELDS.includes(field))) throw new Error("Select supported export details.");
    return fields.reduce((mask, field) => mask | (1 << EXPORT_FIELDS.indexOf(field)), 0);
  }
  function selectedEnvelope(core, mask, extras) {
    const length = []; let n = core.length;
    do { const part = n % 128; n = Math.floor(n / 128); length.push(part | (n ? 128 : 0)); } while (n);
    const bytes = new Uint8Array(1 + length.length + core.length + extras.length);
    bytes[0] = mask; bytes.set(length, 1); bytes.set(core, 1 + length.length); bytes.set(extras, 1 + length.length + core.length);
    if (bytes.length > MAX_BYTES) throw new Error("This selection is too large. Export fewer schedules at once.");
    return bytes;
  }
  function validateSharedGroup(group) {
    if (!group || typeof group !== "object" || Array.isArray(group) ||
      typeof group.id !== "string" || !/^[A-Za-z0-9_-]{1,120}$/.test(group.id) ||
      typeof group.name !== "string" || !group.name.trim() || group.name.length > 60 || /[\u0000-\u001f]/.test(group.name)) {
      throw new Error("This code has invalid shared group details.");
    }
    return { id: group.id, name: group.name.trim() };
  }
  // WF7 prefixes the unchanged WF6 selected envelope with bounded group metadata.
  function groupEnvelope(core, group) {
    const metadata = new TextEncoder().encode(JSON.stringify({ v: 1, ...group }));
    const bytes = new Uint8Array(2 + metadata.length + core.length);
    if (metadata.length > 1024 || bytes.length > MAX_BYTES) throw new Error("This selection is too large. Export fewer schedules at once.");
    new DataView(bytes.buffer).setUint16(0, metadata.length, true);
    bytes.set(metadata, 2); bytes.set(core, 2 + metadata.length);
    return bytes;
  }
  function readGroupEnvelope(bytes) {
    if (bytes.length < 3) throw new Error("This code has incomplete shared group details.");
    const length = bytes[0] | bytes[1] << 8;
    if (!length || length > 1024 || 2 + length >= bytes.length) throw new Error("This code has invalid shared group details.");
    let group;
    try { group = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(2, 2 + length))); }
    catch { throw new Error("This code has unreadable shared group details."); }
    if (group?.v !== 1) throw new Error("This shared group format is not supported. Update the app.");
    return { group: validateSharedGroup(group), core: bytes.subarray(2 + length) };
  }
  function readSelectedEnvelope(bytes) {
    const invalid = () => { throw new Error("This code does not contain valid selected schedule data."); };
    const mask = bytes[0]; if (mask === undefined || mask > 31) invalid();
    let offset = 1, length = 0, complete = false;
    for (let i = 0; i < 4; i++) {
      if (offset >= bytes.length) invalid();
      const next = bytes[offset++]; length += (next & 127) * 2 ** (7 * i);
      if (next < 128) { if (i && next === 0) invalid(); complete = true; break; }
    }
    if (!complete || !length || length > MAX_BYTES || offset + length > bytes.length) invalid();
    const core = bytes.subarray(offset, offset + length), tail = bytes.subarray(offset + length);
    if (!(mask & 16) && tail.length) invalid();
    let extras = [];
    if (tail.length) {
      try { extras = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(tail)); } catch { invalid(); }
      if (!Array.isArray(extras) || extras.length > 250) invalid();
    }
    return { core, mask, extras };
  }
  function applyExtraFields(people, extras) {
    const invalid = () => { throw new Error("This code has invalid extra schedule details."); };
    const names = Object.keys(people), seen = new Set();
    const validObject = (value, reserved) => value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).every(key => !reserved.has(key));
    for (const entry of extras) {
      if (!Array.isArray(entry) || entry.length !== 3 || !Number.isInteger(entry[0]) || entry[0] < 0 || entry[0] >= names.length || seen.has(entry[0]) || !validObject(entry[1], PERSON_KEYS) || !Array.isArray(entry[2])) invalid();
      seen.add(entry[0]);
      const name = names[entry[0]], person = people[name], classes = [...person.classes], classSeen = new Set();
      if (entry[2].length > classes.length) invalid();
      for (const row of entry[2]) {
        if (!Array.isArray(row) || row.length !== 2 || !Number.isInteger(row[0]) || row[0] < 0 || row[0] >= classes.length || classSeen.has(row[0]) || !validObject(row[1], CLASS_KEYS)) invalid();
        classSeen.add(row[0]); classes[row[0]] = { ...classes[row[0]], ...row[1] };
      }
      people[name] = { ...person, ...entry[1], classes };
    }
  }
  async function encode(data, options) {
    if (!data?.people || typeof data.people !== "object" || Array.isArray(data.people)) throw new Error("Select schedules to export.");
    const group = Object.hasOwn(data, "shared_group") ? validateSharedGroup(data.shared_group) : null;
    const mask = options === undefined && !group ? null : fieldMask(options?.fields ?? []);
    const projected = mask === null ? data : { people: Object.fromEntries(Object.entries(data?.people || {}).map(([name, person]) => [name, selectedPerson(person, mask)])) };
    const payload = pack(projected, mask === null);
    const extras = mask & 16 ? Object.values(projected.people).map((person, index) => [index, extraFields(person, PERSON_KEYS), person.classes.map((item, i) => [i, extraFields(item, CLASS_KEYS)]).filter(row => Object.keys(row[1]).length)]).filter(row => Object.keys(row[1]).length || row[2].length) : [];
    const extraBytes = extras.length ? new TextEncoder().encode(JSON.stringify(extras)) : new Uint8Array();
    const envelope = core => {
      const selected = mask === null ? core : selectedEnvelope(core, mask, extraBytes);
      return group ? groupEnvelope(selected, group) : selected;
    };
    const slim = mask === null || !(mask & 6);
    let bytes = envelope(new TextEncoder().encode(JSON.stringify(packCompact(payload, slim))));
    if (bytes.length > MAX_BYTES) throw new Error("This selection is too large. Export fewer schedules at once.");
    const candidates = [{ bytes, modes: ["J", "D", "Z"] }];
    for (let variant = 0; variant < 3; variant++) {
      for (const dictionary of [false, true]) {
        try { candidates.push({ bytes: packBinary(payload, variant, dictionary), modes: ["B", "R", "S"] }); }
        catch { /* JSON preserves unusual Unicode and stays available at size limits. */ }
      }
    }
    // Keep every released WF4 candidate as a fallback. Additional WF5 layouts
    // retain the same fields; literal/JSON paths preserve unknown vocabulary.
    for(const dictIndex of [1,2,3])for(let variant=0;variant<3;variant++){
      for(const timeTable of [false,true])try{candidates.push({bytes:packBinary(payload,variant,true,{dictIndex,timeTable}),modes:["B","R","S"]});}catch{}
    }
    for(let variant=0;variant<2;variant++)try{candidates.push({bytes:packBinary(payload,variant,true,{dictIndex:3,personUnits:true}),modes:["B","R","S"]});}catch{}
    if (slim) for(const config of factor5.configs)for(let dictionary=0;dictionary<4;dictionary++)try{candidates.push({bytes:factor5.encode(payload,config,dictionary),modes:["T","U","V"]});}catch{}
    for (let i = 1; i < candidates.length; i++) candidates[i].bytes = envelope(candidates[i].bytes);
    let mode = "J";
    const seen=new Map();
    for (const candidate of candidates) {
      const signature=`${candidate.modes[0]}/${candidate.bytes.length}/${checksum(candidate.bytes)}`;
      const duplicates=seen.get(signature)||[];
      if(duplicates.some(prior=>prior.every((byte,i)=>byte===candidate.bytes[i])))continue;
      duplicates.push(candidate.bytes);seen.set(signature,duplicates);
      if (candidate.bytes.length < bytes.length) { bytes = candidate.bytes; mode = candidate.modes[0]; }
      if (typeof CompressionStream !== "function") continue;
      for (const [i, format] of ["deflate-raw", "deflate"].entries()) {
        try {
          const compressed = await transform(candidate.bytes, CompressionStream, format);
          if (compressed.length < bytes.length) { bytes = compressed; mode = candidate.modes[i + 1]; }
          break;
        } catch { /* Older browsers can use wrapped DEFLATE or uncompressed data. */ }
      }
    }
    const code = wrap(bytes, mode, group ? 7 : mask === null ? 5 : 6);
    if (code.length > MAX_CODE) throw new Error("This selection is too large. Export fewer schedules at once.");
    return code;
  }
  function linkCode(input) {
    if (typeof input !== "string" || input.length > MAX_CODE) throw new Error("This shared link is too large. Ask for fewer schedules.");
    let value = input.trim();
    if (/^https?:\/\//i.test(value)) {
      const url = new URL(value);
      value = new URLSearchParams(url.hash.slice(1)).get("import");
      if (!value) throw new Error("This link does not contain schedules.");
    }
    if (!/^WFL[567]/.test(value)) return value;
    if (!/^WFL[567][JDZBRSTUV][A-Za-z0-9_-]+$/.test(value)) throw new Error("The shared link is incomplete or changed.");
    const text = value.slice(5);
    if (text.length > Math.ceil((MAX_BYTES + 4) * 4 / 3) || text.length % 4 === 1) throw new Error("The shared link is incomplete or too large.");
    const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    if (urlBytes(bytes) !== text) throw new Error("The shared link is incomplete or changed.");
    return `WF${value[3]}${value[4]}${base15(bytes)}`;
  }
  function urlBytes(bytes) {
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function createLink(code, baseUrl) {
    if (typeof code !== "string" || code.length > MAX_CODE || !/^WF[567][JDZBRSTUV]/.test(code)) throw new Error("Generate a new export code first.");
    const checked = unbase15(code.slice(4));
    if (checked.length < 4 || checksum(checked.subarray(4)) !== new DataView(checked.buffer).getUint32(0, true)) throw new Error("The code is incomplete or changed.");
    const url = new URL(baseUrl);
    if (!/^https?:$/.test(url.protocol)) throw new Error("Use an HTTP or HTTPS app address.");
    url.search = "";
    url.hash = `import=WFL${code[2]}${code[3]}${urlBytes(checked)}`;
    return url.href;
  }
  async function decode(input) {
    if (typeof input !== "string" || input.length > MAX_CODE) throw new Error("This code is too large. Ask for fewer schedules in one code.");
    const code = linkCode(input).replace(/\s+/g, "");
    const decompress = async (bytes, format) => {
      if (typeof DecompressionStream !== "function") throw new Error("Your browser cannot open this compressed code. Update Safari or use a recent Chrome or Firefox.");
      try { return await transform(bytes, DecompressionStream, format); }
      catch (error) { throw new Error(error.message.includes("too large") ? error.message : "The compressed code could not be opened. Ask for a new export code."); }
    };
    const json = bytes => {
      try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
      catch { throw new Error("This code does not contain readable schedule data."); }
    };
    let payload, selection = null, group = null;
    if (code.slice(0, 3).toUpperCase() === "WF1") {
      // Restore the original alphanumeric format as well as keeping WF2.
      const legacy = code.toUpperCase(), alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
      if (!/^WF1[GJ][0-9A-F]{8}[A-Z2-7]+$/.test(legacy)) throw new Error("That is not a valid Who’s Free? export code. Paste the full code from your friend.");
      const text = legacy.slice(12), length = Math.floor(text.length * 5 / 8);
      if (!length || length > MAX_BYTES) throw new Error("This code is too large. Ask for fewer schedules in one code.");
      let bytes = new Uint8Array(length), bits = 0, buffer = 0, offset = 0;
      for (const character of text) {
        buffer = (buffer << 5) | alphabet.indexOf(character); bits += 5;
        if (bits >= 8) { bits -= 8; bytes[offset++] = (buffer >>> bits) & 255; }
        buffer &= (1 << bits) - 1;
      }
      if (buffer || Math.ceil(length * 8 / 5) !== text.length || checksum(bytes).toString(16).padStart(8, "0").toUpperCase() !== legacy.slice(4, 12)) throw new Error("The code is incomplete or changed. Ask your friend to copy it again.");
      if (legacy[3] === "G") bytes = await decompress(bytes, "gzip");
      payload = json(bytes); validatePayload(payload);
    } else if(/^WF[567][JDZBRSTUV]/.test(code)){
      if(!/^WF[567][JDZBRSTUV][0-9a-e][\u3400-\u4dbf\u4e00-\u9fff\uac00-\uc03f]+$/.test(code))throw new Error("That is not a valid Who’s Free? export code. Paste the full code from your friend.");
      const checked=unbase15(code.slice(4));
      if(checked.length<4)throw new Error("The code is incomplete or changed.");
      let bytes=checked.subarray(4);
      if(checksum(bytes)!==new DataView(checked.buffer).getUint32(0,true))throw new Error("The code is incomplete or changed. Ask your friend to copy it again.");
      if("DRU".includes(code[3]))bytes=await decompress(bytes,"deflate-raw");
      else if("ZSV".includes(code[3]))bytes=await decompress(bytes,"deflate");
      if (code[2] === "7") { const envelope = readGroupEnvelope(bytes); group = envelope.group; bytes = envelope.core; }
      if ("67".includes(code[2])) { selection = readSelectedEnvelope(bytes); bytes = selection.core; }
      if (selection && selection.mask & 6 && "TUV".includes(code[3])) throw new Error("This code has an invalid field layout.");
      payload="TUV".includes(code[3])?factor5.decode(bytes):"BRS".includes(code[3])?unpackBinary(bytes,true,true):unpackCompact(json(bytes),!selection || !(selection.mask & 6));
      if (selection) for (const person of payload.p) {
        if (!(selection.mask & 8) && person.s !== undefined) throw new Error("This code has unselected semester details.");
        for (const row of person.c) for (const [bit, index] of [[1,7],[2,4],[4,5]]) if (!(selection.mask & bit) && row[index] != null) throw new Error("This code has unselected class details.");
      }
    } else {
      if (!/^WF(?:2[JDZ]|[34][JDZBRS])[0-6][\u4e00-\u8dff]+$/.test(code)) throw new Error("That is not a valid Who’s Free? export code. Paste the full code from your friend.");
      const checked = unbase14(code.slice(4));
      if (checked.length < 4) throw new Error("The code is incomplete or changed.");
      let bytes = checked.subarray(4);
      if (checksum(bytes) !== new DataView(checked.buffer).getUint32(0, true)) throw new Error("The code is incomplete or changed. Ask your friend to copy it again.");
      if ("DR".includes(code[3])) bytes = await decompress(bytes, "deflate-raw");
      else if ("ZS".includes(code[3])) bytes = await decompress(bytes, "deflate");
      if (bytes.length > MAX_BYTES) throw new Error("This code is too large. Ask for fewer schedules in one code.");
      payload = "BRS".includes(code[3]) ? unpackBinary(bytes, code[2] === "4") : unpackCompact(json(bytes), code[2] === "4");
    }
    const people = Object.create(null);
    for (const person of payload.p) {
      people[person.n] = { ...(!selection || !(selection.mask & 16) ? { source_file: "Shared code" } : {}), ...(person.s !== undefined ? { semester: person.s } : {}), classes: person.c.map(row => ({
        day: DAYS[row[0]], start: row[1], end: row[2],
        ...Object.fromEntries(FIELDS.map((key, index) => [key, row[index + 3] || null])),
        kind: row[8] || "class",
      })) };
    }
    if (selection) applyExtraFields(people, selection.extras);
    return { schema_version: 1, ...(selection ? { share_profile: "selected", share_fields: EXPORT_FIELDS.filter((_, i) => selection.mask & (1 << i)) } : "45".includes(code[2]) ? { share_profile: "compact" } : {}), ...(group ? { shared_group: group } : {}), people };
  }
  function sameSchedule(a, b, compact = false) {
    if (Array.isArray(compact)) {
      const mask = fieldMask(compact);
      const canonical = value => {
        if (Array.isArray(value)) return value.map(canonical);
        if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
        return value;
      };
      const signature = person => {
        const projected = selectedPerson(person, mask);
        projected.classes = projected.classes.map(item => JSON.stringify(canonical(item))).sort();
        return JSON.stringify(canonical(projected));
      };
      return signature(a) === signature(b);
    }
    const signature = person => JSON.stringify([
      person.semester ?? null,
      (person.classes || []).map(item => JSON.stringify([
        item.day, item.start, item.end, ...FIELDS.map(key => compact && (key === "course_code" || key === "section") ? null : compact && key === "instructor" ? familyName(item[key]) : item[key] || null),
        item.kind === "busy_block" ? "busy_block" : "class"
      ])).sort()
    ]);
    // Class order, source files and local OCR review markers are not timetable content.
    return signature(a) === signature(b);
  }
  function numberedName(name, number) {
    const suffix = ` ${number}`;
    return `${name.trim().slice(0, 120 - suffix.length).trimEnd()}${suffix}`;
  }
  async function merge(existing, incoming, resolveConflict) {
    const people = { ...(existing?.people || {}) };
    const names = new Map(Object.keys(people).map(name => [normalizedName(name), name]));
    const reserved = new Set(Object.keys(incoming.people).map(normalizedName));
    const renamed = [];
    const nameMap = Object.create(null);
    let added = 0, replaced = 0, skipped = 0, kept = 0;
    for (const [name, person] of Object.entries(incoming.people)) {
      const normalized = normalizedName(name), existingName = names.get(normalized);
      let target = name;
      if (existingName !== undefined) {
        nameMap[name] = existingName;
        if (sameSchedule(people[existingName], person, incoming.share_profile === "selected" ? incoming.share_fields : incoming.share_profile === "compact")) { skipped++; continue; }
        let number = 2;
        while (names.has(normalizedName(numberedName(existingName, number))) || reserved.has(normalizedName(numberedName(existingName, number)))) number++;
        const newName = numberedName(existingName, number);
        if (typeof resolveConflict !== "function") throw new Error(`Choose how to import the different schedule for ${existingName}.`);
        const choice = await resolveConflict({ name, existingName, newName, existing: people[existingName], incoming: person });
        if (choice === "old") { kept++; continue; }
        if (choice === "replace") {
          Object.defineProperty(people, existingName, { value: person, enumerable: true, configurable: true, writable: true });
          replaced++; continue;
        }
        if (choice !== "both") throw new Error("Schedule import canceled. Nothing was saved.");
        target = newName;
        renamed.push({ from: name, to: target });
      }
      Object.defineProperty(people, target, { value: person, enumerable: true, configurable: true, writable: true });
      names.set(normalizedName(target), target); added++;
      nameMap[name] = target;
    }
    return { data: { ...(existing || {}), schema_version: existing?.schema_version || 1, people }, added, replaced, skipped, kept, renamed, nameMap };
  }
  globalThis.WhosFreeShareCode = { encode, decode, merge, createLink, __test: { base14, unbase14, wrap, MAX_BYTES, sameSchedule, pack, packCompact, packBinary, unpackBinary, familyName, tokenize, untokenize, WORDS, WORDS5, DICTS5, base15, unbase15, alphabet15, factor5 } };
})();



