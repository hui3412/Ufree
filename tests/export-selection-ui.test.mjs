import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Window } from 'happy-dom';

const person = { classes: [{ day: 'Monday', start: '09:00', end: '10:00', course: 'Workshop' }] };
const people = { Alice: person, Bob: person, 'Émilie': person, Outsider: person };
const team = { id: 'team', name: 'Study team', members: ['Alice', 'Bob'], hidden: true };
const empty = { id: 'empty', name: 'Empty', members: [], hidden: false };
const tick = () => new Promise(resolve => setTimeout(resolve, 20));
const plain = value => JSON.parse(JSON.stringify(value));
async function app(url = 'https://youfree.ca/', groups = [team, empty]) {
  const window = new Window({ url, settings: { disableJavaScriptFileLoading: true, disableCSSFileLoading: true } });
  window.document.write(fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8'));
  window.setInterval = () => 0;
  window.matchMedia = () => ({ matches: true, addEventListener() {} });
  Object.assign(window, { TextEncoder, TextDecoder, Blob, CompressionStream, DecompressionStream });
  let copied;
  Object.defineProperty(window.navigator, 'clipboard', { configurable: true, value: { writeText: async text => { copied = text; } } });
  window.localStorage.setItem('whos-free-local-schedules', JSON.stringify({ data: { people }, meta: {} }));
  window.localStorage.setItem('whos-free-groups-v1', JSON.stringify({ groups, showGroups: false, hideUngrouped: true }));
  window.localStorage.setItem('whos-free-people-preferences-v1', JSON.stringify({ nicknames: { Bob: 'Bobby' } }));
  for (const file of ['schedule-availability.js', 'schedule-groups.js', 'schedule-share-code.js', 'assets/qr/qrcodegen.js', 'schedule-qr-batches.js', 'app.js']) window.eval(fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8'));
  const el = id => window.document.getElementById(id);
  const wait = async predicate => { for (let i = 0; i < 200; i++) { if (predicate()) return; await tick(); } throw Error('Selection operation did not finish'); };
  await wait(() => el('importProgressOverlay').hidden && !el('homeExportButton').disabled);
  const inputs = () => [...el('exportPeopleList').querySelectorAll('input')];
  const setSearch = text => { el('exportPeopleSearch').value = text; el('exportPeopleSearch').dispatchEvent(new window.Event('input', { bubbles: true })); };
  const select = (name, checked) => { const input = inputs().find(i => i.dataset.person === name); input.checked = checked; input.dispatchEvent(new window.Event('change', { bubbles: true })); };
  const pick = id => { el('exportGroupButton').click(); el('exportGroupPicker').querySelector(`[data-export-group="${id}"]`).click(); };
  const generate = async (action = 'generateCodeButton') => { el(action).click(); await wait(() => !el('generateCodeButton').disabled); return window.WhosFreeShareCode.decode(el('exportCodeOutput').value); };
  const storage = () => [window.localStorage.getItem('whos-free-local-schedules'), window.localStorage.getItem('whos-free-groups-v1'), window.localStorage.getItem('whos-free-people-preferences-v1')];
  return { window, el, wait, inputs, setSearch, select, pick, generate, storage, copied: () => copied };
}

test('quick sharing has visible search and group controls; search opens the list without changing hidden selections', async () => {
  const a = await app();
  try {
    const before = a.storage(); a.el('homeExportButton').click();
    assert.equal(a.el('exportSelectionControls').hidden, false);
    assert.equal(a.el('exportSelection').open, false);
    assert.equal(a.el('exportGroupButton').querySelectorAll('svg rect').length, 4);
    assert.equal(a.el('exportSelectionToggleLabel').textContent, 'Show people');
    assert.ok(a.el('exportSelection').querySelector('summary .export-selection-chevron'));
    a.setSearch('emilie');
    assert.equal(a.el('exportSelection').open, true);
    assert.deepEqual(a.inputs().filter(i => !i.closest('label').hidden).map(i => i.dataset.person), ['Émilie']);
    assert.match(a.el('exportSelectionSummary').textContent, /1 matching · 4 selected/);
    a.el('selectAllSchedules').checked = false; a.el('selectAllSchedules').dispatchEvent(new a.window.Event('change'));
    a.select('Émilie', true);
    assert.deepEqual(Object.keys((await a.generate()).people), ['Émilie']);
    const code = a.el('exportCodeOutput').value;
    a.setSearch('no such person');
    assert.equal(a.el('exportPeopleEmpty').hidden, false);
    assert.equal(a.el('exportCodeOutput').value, code, 'filtering cannot invalidate an unchanged export');
    assert.equal(a.inputs().filter(i => i.checked).length, 1);
    a.setSearch('bobby');
    assert.deepEqual(a.inputs().filter(i => !i.closest('label').hidden).map(i => i.dataset.person), ['Bob']);
    a.setSearch('');
    assert.equal(a.inputs().filter(i => !i.closest('label').hidden).length, 4);
    a.el('exportSelection').open = false; await tick();
    assert.equal(a.el('exportSelectionToggleLabel').textContent, 'Show people');
    assert.deepEqual(a.storage(), before);
  } finally { await a.window.happyDOM.abort(); }
});

for (const domain of ['https://youfree.ca/', 'https://hui3412.github.io/Ufree/']) test(`group picker exports its full membership and group metadata with every method on ${domain}`, async () => {
  const a = await app(domain);
  try {
    const before = a.storage(); a.el('homeExportButton').click();
    a.setSearch('outsider'); a.pick(team.id);
    assert.equal(a.el('exportPeopleSearch').value, '');
    assert.equal(a.el('exportGroupPicker').hidden, true);
    assert.equal(a.window.document.activeElement, a.el('exportGroupButton'));
    assert.equal(a.el('exportSelectionControls').hidden, false, 'the picker remains available to change groups');
    assert.equal(a.el('exportSelection').open, false);
    assert.match(a.el('exportSelectionSummary').textContent, /Study team · 2 selected/);
    assert.equal(a.el('scheduleModalTitle').textContent, 'Share group: Study team');
    for (const action of ['generateCodeButton', 'exportQrButton', 'copyExportLinkButton']) {
      const incoming = await a.generate(action);
      assert.deepEqual(Object.keys(incoming.people), ['Alice', 'Bob']);
      assert.deepEqual(plain(incoming.shared_group), { id: team.id, name: team.name });
      if (action === 'generateCodeButton') assert.equal(a.copied(), a.el('exportCodeOutput').value);
      else {
        const link = a.el('exportSharePanel').querySelector('textarea').value;
        assert.ok(link.startsWith(domain + '#import='));
        if (action === 'exportQrButton') assert.ok(a.el('exportSharePanel').querySelector('svg'));
        else assert.equal(a.copied(), link);
      }
    }
    a.el('exportFieldOptions').querySelector('input').checked = true;
    a.el('exportFieldOptions').dispatchEvent(new a.window.Event('change'));
    assert.equal(a.el('exportCodeOutput').value, '');
    assert.equal((await a.generate()).shared_group.name, team.name, 'export field changes retain group identity');
    assert.deepEqual(a.storage(), before);
  } finally { await a.window.happyDOM.abort(); }
});

test('editing individual selections clears group identity and generated QRs; choosing Everyone restores ordinary sharing', async () => {
  const a = await app();
  try {
    const before = a.storage(); a.el('homeExportButton').click(); a.pick(team.id); await a.generate('exportQrButton');
    a.setSearch('outside'); a.select('Outsider', true);
    assert.equal(a.el('exportCodeOutput').value, '');
    assert.equal(a.el('exportGroupSummary').hidden, true);
    assert.equal(a.el('scheduleModalTitle').textContent, 'Quick share');
    const modified = await a.generate();
    assert.deepEqual(Object.keys(modified.people), ['Alice', 'Bob', 'Outsider']);
    assert.equal(modified.shared_group, undefined);
    a.pick(team.id); a.pick('');
    const everyone = await a.generate();
    assert.equal(Object.keys(everyone.people).length, 4);
    assert.equal(everyone.shared_group, undefined);
    a.el('closeScheduleModal').click(); a.el('homeExportButton').click();
    assert.equal(a.el('exportPeopleSearch').value, '');
    assert.equal(a.el('exportGroupButton').classList.contains('has-group'), false);
    assert.equal(a.inputs().filter(i => i.checked).length, 4);
    assert.deepEqual(a.storage(), before);
  } finally { await a.window.happyDOM.abort(); }
});

test('group picker disables empty groups and closes on Escape or outside click without closing the modal', async () => {
  const a = await app();
  try {
    a.el('homeExportButton').click(); a.el('exportGroupButton').click();
    assert.equal(a.el('exportGroupPicker').querySelector(`[data-export-group="${empty.id}"]`).disabled, true);
    a.window.document.dispatchEvent(new a.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(a.el('exportGroupPicker').hidden, true);
    assert.equal(a.el('exportGroupButton').getAttribute('aria-expanded'), 'false');
    assert.equal(a.el('scheduleModal').hidden, false);
    assert.equal(a.window.document.activeElement, a.el('exportGroupButton'));
    a.el('exportGroupButton').click(); a.el('exportSelection').querySelector('summary').click();
    assert.equal(a.el('exportGroupPicker').hidden, true);
    a.el('exportGroupButton').click(); a.el('exportPeopleSearch').focus();
    assert.equal(a.el('exportGroupPicker').hidden, true);
    assert.equal(a.el('exportSelection').open, true);
  } finally { await a.window.happyDOM.abort(); }
});

test('no-group state stays usable and selection controls are disabled while an export is being generated', async () => {
  const a = await app('https://youfree.ca/', []);
  try {
    a.el('homeExportButton').click(); a.el('exportGroupButton').click();
    assert.match(a.el('exportGroupPicker').textContent, /No saved groups/);
    a.el('exportGroupPicker').querySelector('button').click();
    const encode = a.window.WhosFreeShareCode.encode;
    let release; a.window.WhosFreeShareCode.encode = async (...args) => { await new Promise(resolve => { release = resolve; }); return encode(...args); };
    a.el('generateCodeButton').click();
    assert.equal(a.el('exportPeopleSearch').disabled, true);
    assert.equal(a.el('exportGroupButton').disabled, true);
    assert.ok(a.inputs().every(i => i.disabled));
    release(); await a.wait(() => !a.el('generateCodeButton').disabled);
    assert.equal(a.el('exportPeopleSearch').disabled, false);
    assert.equal(a.el('exportGroupButton').disabled, false);
  } finally { await a.window.happyDOM.abort(); }
});
