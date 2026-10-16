const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = vm.createContext({ URL, setTimeout, clearTimeout });
for (const file of ['schedule-parser.js', 'schedule-image-parser.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
}
const parser = context.WhosFreeParser;
const parse = parser.parseScheduleClassLines;
const plain = value => JSON.parse(JSON.stringify(value));
const lines = (room, section = 'gr.00003') => ['Workshop', `201-SN1-RE ${section}`, room, '08:00 à 10:00', 'Présentiel'];

test('French gr. labels keep leading zeroes and complete dotted room codes', () => {
  for (const room of ['2P.45', '3P.03', '3H.21', '4P.10', '5B.3']) {
    const item = parse(lines(`Local ${room} L`));
    assert.equal(item.section, '00003');
    assert.equal(item.room, room);
    assert.deepEqual(plain(item.explicitTime), { start: '08:00', end: '10:00' });
    assert.equal(item.instructor, null);
  }
});

test('English Classroom labels retain short dotted rooms as well as their sections', () => {
  for (const room of ['3H.23', '3H.15', '4H.15', '2P.05', '4A.5', '5A.2', '4P.24', '4H.21']) {
    const item = parse(lines(`Classroom ${room}`, 'sec.00053'));
    assert.equal(item.room, room);
    assert.equal(item.section, '00053');
  }
});

test('uncertain OCR room codes are preserved literally and flagged without guessing punctuation or B/8', () => {
  for (const room of ['58.3', '583', '4P10', '33H21', '34H21']) {
    const item = parse(lines(`Local ${room} L`));
    assert.equal(item.room, room);
    assert.match(item.review_warning, /Check the room code/);
  }
});

test('previous letter, numeric, wrapped rooms and teacher parsing remain identical to the original decoder', () => {
  for (const input of [
    ['Workshop', '201-SN1-RE sec.00001', 'Classroom D-307', 'Teacher.S', 'Classroom'],
    ['Workshop', '201-SN1-RE sec.00001', 'Classroom 900', 'Teacher.S', 'Classroom'],
    ['Workshop', '201-SN1-RE sec.00001', 'Classroom D-', '120B', 'Teacher.S', 'Classroom'],
    ['14:30 to 18:15', 'Athletes Student'],
    ['Workshop', '201-SN1-RE sec.00001', 'Classroom', '900', 'Teacher.S'],
    ['Workshop', '201-SN1-RE sec.00001', 'Local A-311', 'Teacher.S', '08:00 to 10:00'],
  ]) assert.deepEqual(plain(parse(input)), plain(parser.__test.parseClassLines(input)));
  const conflict = parse(lines('Local 3H.21', 'sec.00004 gr.00003'));
  assert.equal(conflict.section, '00004');
  assert.equal(parser.__test.parseClassLines(lines('Local 3H.21')).room, null);
  assert.equal(parser.__test.parseClassLines(lines('Local 3H.21')).section, null);
});

test('existing image-cell pipeline receives fallback details without changing weekday, times or review warnings', () => {
  const cells = [{ rect: { day: 'Tuesday' }, lines: lines('Local 58.3 L'), words: [{ text: 'Workshop', confidence: 95 }] }];
  const [item] = context.WhosFreeImageParser.__test.classesFromCells(cells, [], [], 0);
  assert.equal(item.day, 'Tuesday');
  assert.equal(item.start, '08:00');
  assert.equal(item.end, '10:00');
  assert.equal(item.section, '00003');
  assert.equal(item.room, '58.3');
  assert.equal(item.kind, 'class');
  assert.match(item.review_warning, /room code/);
});
