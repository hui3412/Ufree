const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");
const fixture = require("./fixtures/dated-weekly-axis.json");
const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "schedule-dated-image-parser.js"), "utf8");
const plain = value => JSON.parse(JSON.stringify(value));
function load() {
  const context = vm.createContext({ URL, setTimeout, clearTimeout });
  for (const file of ["schedule-parser.js", "schedule-dated-image-parser.js"]) vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context);
  return context.WhosFreeDatedImageParser;
}
const api = load(), h = api.__test;
const word = ([text, x0, y0, x1, y1]) => ({ text, x0, y0, x1, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, height: y1 - y0, confidence: 95 });
const words = fixture.items.map(word);

function canvas({ omitBottom = false, tag = true } = {}) {
  return { width: fixture.width, height: fixture.height, getContext() { return { getImageData(left, top, width, height) {
    width = Math.floor(width); height = Math.floor(height);
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const sx = Math.floor(left) + x, sy = Math.floor(top) + y;
      const column = fixture.columns.find(value => sx >= value.left && sx <= value.right);
      const block = column && fixture.expected.find(([day, first, last]) => day === column.day && sy > fixture.boundaries[first] && sy < fixture.boundaries[last]);
      let shade = sy < fixture.boundaries[0] || sx < fixture.columns[0].left || block ? 255 : 236;
      const vertical = [0, ...fixture.columns.map(value => value.left), fixture.columns.at(-1).right].some(value => Math.abs(sx - value) < .8);
      const horizontal = fixture.boundaries.some(value => Math.abs(sy - value) < .8);
      if (vertical || (!block && horizontal)) shade = 211;
      if (column) {
        const border = fixture.expected.some(([day, first, last]) => day === column.day && (Math.abs(sy - fixture.boundaries[first]) < .8 || (!(omitBottom && day === "Monday" && last === 9) && Math.abs(sy - fixture.boundaries[last]) < .8)));
        if (border) shade = 0;
        // Dense text reduces white scanline coverage without becoming a rule.
        if (block && sx > column.left + (column.right - column.left) * .3 && sx < column.left + (column.right - column.left) * .55) shade = 0;
        // A partial Classroom-tag border must not split a class.
        if (tag && block && sx > column.left + (column.right - column.left) * .72 && Math.abs(sy - fixture.boundaries[7]) < .8) shade = 0;
      }
      data.set([shade, shade, shade, 255], (y * width + x) * 4);
    }
    return { data };
  } }; } };
}

function geometry(input = words, image = canvas()) {
  const headers = h.datedHeaders(input), columns = h.detectColumns(image, headers), grid = h.detectRows(image, headers, columns);
  const rows = h.validateClockRows(h.readClockRows(input, grid));
  return { headers, columns, grid, rows, regions: h.classRegions(image, columns, grid, rows) };
}

test("dated layout reads all 15 weekly spans, including touching classes and the long afternoon class", () => {
  const result = geometry();
  assert.equal(result.grid.boundaries.length, fixture.boundaries.length);
  assert.deepEqual(plain(result.regions.map(({ day, start, end }) => [day, start, end])), fixture.expected.map(([day, , , start, end]) => [day, start, end]));
  assert.equal(result.regions.filter(region => region.day === "Wednesday").length, 4);
  assert.equal(result.regions.find(region => region.day === "Monday" && region.start === "16:15").end, "19:05");
});

test("calendar dates can change without changing recurring weekdays or times", () => {
  const changed = words.map(value => ({ ...value, text: value.text === "Oct" ? "Nov" : /^(19|20|21|22|23)$/.test(value.text) ? String(Number(value.text) - 10) : value.text }));
  assert.deepEqual(plain(geometry(changed).regions), plain(geometry().regions));
  assert.throws(() => geometry(words.filter(value => value.text !== "Oct")), /dated Monday-to-Friday/);
  assert.throws(() => geometry(words.filter(value => value.text !== "Fri.")), /dated Monday-to-Friday/);
});

test("missing or contradictory clocks and incomplete class borders are rejected, not guessed", () => {
  assert.throws(() => geometry(words.filter(value => value.text !== "08:15")), /every printed start\/end time/);
  assert.throws(() => geometry(words.map(value => value.text === "08:35" ? { ...value, text: "08:55" } : value)), /every printed start\/end time/);
  assert.throws(() => geometry(words, canvas({ omitBottom: true })), /incomplete bottom border/);
  assert.throws(() => geometry([...words, word(["21:15", 12, fixture.height + 2, 32, fixture.height + 8])]), /outside complete timetable rows/);
});

const cellWords = lines => lines.flatMap((line, y) => [word([line, 100, 100 + y * 20, 250, 114 + y * 20])]);
const region = { day: "Monday", start: "11:15", end: "12:35" };
test("new-path text normalization reads s. sections and bare rooms while ignoring Classroom tags", () => {
  const item = h.classFromWords(cellWords(["Workshop", "203-SN1-RE s.00504", "D-307", "Teacher.S", "Classroom"]), region);
  assert.equal(item.course, "Workshop"); assert.equal(item.course_code, "203-SN1-RE");
  assert.equal(item.section, "00504"); assert.equal(item.room, "D-307"); assert.equal(item.instructor, "Teacher.S");
  assert.equal(item.start, "11:15"); assert.equal(item.end, "12:35");
  assert.equal(Object.keys(item).some(key => /date|month|year/i.test(key)), false);
  const uncertain = h.classFromWords(cellWords(["Workshop", "203-SN1-RE s.00504", "1-216", "Teacher.S", "Classroom"]), region);
  assert.equal(uncertain.room, "1-216"); assert.match(uncertain.review_warning, /I and 1/);
  assert.throws(() => h.classFromWords(cellWords(["203-SN1-RE", "201-SN2-RE"]), region), /Several courses/);
});

test("all existing reader functions remain byte-for-byte unchanged", () => {
  const oldCore = fs.readFileSync(path.join(root, "schedule-image-parser.js"), "utf8").split("  async function parseScheduleImage(")[0];
  assert.equal(crypto.createHash("sha256").update(oldCore).digest("hex"), fixture.primaryCoreSha256);
});

test("a successful primary reader returns untouched without loading OCR or invoking the fallback", async () => {
  const reader = load(), expected = { person: { classes: [region] }, needsReview: true };
  reader.parseScheduleCanvas = () => { throw Error("Fallback must not run"); };
  const input = { width: 700, height: 900 };
  const wrapped = reader.withFallback(async (canvas, name, options) => {
    assert.equal(canvas, input); assert.equal(name, "old.png"); assert.equal(options.releaseSourceCanvas, false); return expected;
  }, () => { throw Error("OCR must not load"); });
  assert.equal(await wrapped(input, "old.png"), expected);
  assert.equal(input.width, 700);
});

test("fallback runs only after primary failure, retains its canvas, then honors requested release", async () => {
  const reader = load(), input = { width: 700, height: 900 }, order = [], result = { person: { classes: [region] } };
  const failure = Error("Original class borders were rejected");
  reader.parseScheduleCanvas = async canvas => { order.push("fallback"); assert.equal(canvas.width, 700); return result; };
  const wrapped = reader.withFallback(async (canvas, filename, options) => { order.push("primary"); assert.equal(options.releaseSourceCanvas, false); throw failure; }, async () => { order.push("ocr"); return {}; });
  assert.equal(await wrapped(input, "new.png", { releaseSourceCanvas: true }), result);
  assert.deepEqual(order, ["primary", "ocr", "fallback"]); assert.equal(input.width, 1); assert.equal(input.height, 1);
});

test("unrelated images retain the primary error and OCR startup failures never invoke the fallback", async () => {
  const reader = load(), original = Error("Original validation error"); let calls = 0;
  reader.parseScheduleCanvas = async () => { calls++; throw Object.assign(Error("Not a dated layout"), { code: "NOT_DATED_LAYOUT" }); };
  const wrapped = reader.withFallback(async () => { throw original; }, async () => ({}));
  await assert.rejects(wrapped({ width: 1, height: 1 }, "other.png"), error => error === original); assert.equal(calls, 1);
  const stopped = Error("Picture recognition could not load");
  await assert.rejects(reader.withFallback(async () => { throw stopped; }, () => { throw Error("Must not load"); })({}, "image.png"), error => error === stopped);
  assert.equal(calls, 1);
});

for (const incomplete of [false, true]) test(`complete fallback OCR pipeline ${incomplete ? "rejects missing clocks" : "returns recurring classes"} and terminates its worker`, async () => {
  const image = canvas(), context = vm.createContext({ URL, setTimeout, clearTimeout, document: { baseURI: "https://youfree.ca/" } });
  for (const file of ["schedule-parser.js", "schedule-dated-image-parser.js"]) vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context);
  const reader = context.WhosFreeDatedImageParser;
  const fullWords = [...words];
  for (const [day, first, last] of fixture.expected) {
    const column = fixture.columns.find(value => value.day === day), center = (fixture.boundaries[first] + fixture.boundaries[last]) / 2;
    for (const [i, text] of ["Workshop", "203-SN1-RE s.00001", "D-307", "Teacher.S", "Classroom"].entries()) {
      fullWords.push(word([text, column.left + 8, center - 23 + i * 10, column.right - 8, center - 15 + i * 10]));
    }
  }
  const values = incomplete ? fullWords.filter(value => value.text !== "08:15") : fullWords;
  const data = { blocks: [{ paragraphs: [{ lines: [{ words: values.map(value => ({ text: value.text, confidence: 95, bbox: { x0: value.x0, x1: value.x1, y0: value.y0, y1: value.y1 } })) }] }] }] };
  let terminated = 0, recognized = 0;
  const Tesseract = { async createWorker(language, mode, options) {
    assert.equal(language, "eng+fra"); assert.equal(options.workerBlobURL, false);
    assert.match(options.workerPath, /^https:\/\/youfree.ca\/assets\/ocr\//);
    return { async setParameters() {}, async recognize() { recognized++; return { data }; }, async terminate() { terminated++; } };
  } };
  const wrapped = reader.withFallback(async () => { throw Error("Primary borders rejected"); }, async () => Tesseract);
  if (incomplete) await assert.rejects(wrapped(image, "screenshot.png", { releaseSourceCanvas: true }), /every printed start\/end time/);
  else {
    const result = await wrapped(image, "screenshot.png", { releaseSourceCanvas: true });
    assert.equal(result.reader, "dated-weekly-fallback"); assert.equal(result.needsReview, true);
    assert.deepEqual(plain(result.person.classes.map(({ day, start, end }) => [day, start, end])), fixture.expected.map(([day, , , start, end]) => [day, start, end]));
    assert.ok(result.person.classes.every(item => item.course === "Workshop" && item.section === "00001" && item.room === "D-307"));
    assert.equal(JSON.stringify(result).includes("Oct"), false);
  }
  assert.equal(terminated, 1); assert.equal(image.width, 1); assert.equal(image.height, 1);
  assert.equal(recognized, incomplete ? 2 : 1);
});
