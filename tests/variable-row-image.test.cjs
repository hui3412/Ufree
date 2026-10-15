const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const fixture = require("./fixtures/variable-row-image-axis.json");
const word = ([text, x0, y0, x1, y1]) => ({ text, x0, y0, x1, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, height: y1 - y0 });
const items = fixture.items.map(word);
function load(document) {
  const context = vm.createContext({ document, URL, setTimeout, clearTimeout });
  for (const file of ["schedule-parser.js", "schedule-image-parser.js"]) vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), context);
  return context;
}
const helpers = load().WhosFreeImageParser.__test;
const columns = helpers.headersFromItems(items);
const header = Math.max(...columns.map(column => column.header.y1));
const clocks = items.filter(item => item.x1 <= columns[0].left + 2);

function pixelCanvas(boundaries = fixture.boundaries) {
  return { width: 705, height: 1500, getContext() { return { getImageData(left, top, width, height) {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const sourceX = left + x, sourceY = top + y;
      const column = columns.find(value => sourceX >= value.left && sourceX <= value.right);
      const occupied = column && fixture.expected.find(([day, first, last]) => day === column.day && sourceY > boundaries[first] + 2 && sourceY < boundaries[last] - 2);
      const rule = !occupied && boundaries.some(value => Math.abs(sourceY - value) < .65);
      const ink = occupied && Math.abs(sourceX - column.center) < 8 && Math.abs(sourceY - (boundaries[occupied[1]] + boundaries[occupied[2]]) / 2) < 4;
      const shade = ink ? 30 : rule ? 210 : 255;
      data.set([shade, shade, shade, 255], (y * width + x) * 4);
    }
    return { data };
  } }; } };
}
const evidence = canvas => ({ canvas, column: columns[0] });
const gridFor = (source = clocks, canvas = pixelCanvas()) => helpers.readTimeGrid(source, header, evidence(canvas));

test("real stretched-row OCR falls back to visible borders and retains all seven days", () => {
  // No course text, names or screenshot is retained in the fixture.
  assert.equal(columns.map(column => column.day).join(), "Monday,Tuesday,Wednesday,Thursday,Friday,Saturday,Sunday");
  const canvas = pixelCanvas();
  const regular = helpers.timeGrid(clocks, header, evidence(canvas));
  assert.ok(regular.top - header > regular.rowHeight * .75, "the old linear fit omits morning rows");
  const grid = gridFor(clocks, canvas);
  assert.equal(grid.mode, "variable-half-hour");
  assert.equal(grid.items.length, 40);
  assert.equal(grid.items[0].text, "08:00");
  assert.equal(grid.items.at(-1).text, "18:00");
  assert.equal(grid.boundaries.length, 21);
  fixture.boundaries.forEach((y, i) => assert.ok(Math.abs(grid.boundaries[i] - y) < 1));
  assert.ok(grid.boundaries[2] - grid.boundaries[1] > grid.rowHeight * 2.5);
});

test("all eight occupied spans use physical boundary times rather than pixel row counts", () => {
  const canvas = pixelCanvas(), grid = gridFor(clocks, canvas);
  const cells = helpers.classRegions(canvas, columns, grid).filter(rect => helpers.containsInk(canvas, rect)).map(rect => ({ rect, lines: ["Workshop"] }));
  const actual = helpers.classesFromCells(cells, [], [], grid.rowHeight, grid);
  assert.deepEqual(JSON.parse(JSON.stringify(actual.map(({ day, start, end }) => [day, start, end]))), fixture.expected.map(([day, , , start, end]) => [day, start, end]));
  const saturday = actual.find(item => item.day === "Saturday");
  assert.equal(saturday.start, "08:30"); assert.equal(saturday.end, "09:00");
  const bad = [{ rect: { day: "Saturday", y0: grid.boundaries[1] + 20, y1: grid.boundaries[2] }, lines: ["Workshop"] }];
  assert.throws(() => helpers.classesFromCells(bad, [], [], grid.rowHeight, grid), /does not align/);
});

test("variable rows reject truncated clocks, contradictory labels, missing rules and unlabelled cells", () => {
  assert.throws(() => gridFor(clocks.filter(item => item.text <= "14:30")), /Only part/);
  assert.throws(() => gridFor(clocks.filter(item => item.text >= "10:00")), /Only part/);
  const contradictory = clocks.map(item => item.text === "08:30" ? { ...item, text: "07:30" } : item);
  assert.throws(() => helpers.variableRowTimeGrid(contradictory, header, pixelCanvas(), columns[0]), /Clock labels/);
  const missing = fixture.boundaries.filter((_, i) => i !== 2);
  assert.throws(() => helpers.variableRowTimeGrid(clocks, header, pixelCanvas(missing), columns[0]));
  const unlabelled = clocks.filter(item => item.cy < fixture.boundaries[10] || item.cy > fixture.boundaries[11]);
  assert.throws(() => helpers.variableRowTimeGrid(unlabelled, header, pixelCanvas(), columns[0]), /Clock labels/);
});

test("narrow fallback cells retain a course code split across OCR words", () => {
  const grid = gridFor();
  const rect = { day: "Tuesday", y0: grid.boundaries[13], y1: grid.boundaries[19] };
  const cells = [{ rect, lines: ["Workshop", "602-UF 1-MQ", "sec.00005", "Classroom C-418"] }];
  const result = helpers.classesFromCells(cells, [], [], grid.rowHeight, grid)[0];
  assert.equal(result.kind, "class");
  assert.equal(result.course_code, "602-UF1-MQ");
  assert.equal(result.section, "00005");
  assert.equal(result.room, "C-418");
  assert.equal(result.start, "14:30"); assert.equal(result.end, "17:30");
});

test("the original valid half-hour path stays first and never invokes the fallback", () => {
  const regular = [];
  for (let minute = 480; minute <= 1080; minute += 30) {
    const y = 100 + minute - 480, time = `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
    if (minute > 480) regular.push(word([time, 50, y - 10, 80, y - 4]));
    if (minute < 1080) regular.push(word([time, 50, y + 4, 80, y + 10]));
  }
  const calls = [];
  const canvas = { width: 705, height: 800, getContext() { return { getImageData(left, top, width, height) {
    calls.push({ left, width }); return { data: new Uint8ClampedArray(width * height * 4).fill(255) };
  } }; } };
  const result = helpers.readTimeGrid(regular, 94, { canvas, column: { left: 100 } });
  assert.equal(result.mode, "half-hour");
  assert.deepEqual(JSON.parse(JSON.stringify(result)), JSON.parse(JSON.stringify(helpers.timeGrid(regular, 94))));
  assert.equal(calls.length, 1, "only the existing completeness check reads the canvas");
});
