(() => {
  'use strict';
  const KEY = 'ufree-language-v1';
  const catalog = window.UFreeFrench || { exact: {}, templates: [] };
  let language = 'en';
  try { if (localStorage.getItem(KEY) === 'fr') language = 'fr'; } catch { /* Preference is optional. */ }
  const lowercase = Object.fromEntries(Object.entries(catalog.exact).map(([key,value]) => [key.toLowerCase(),value]));
  const bindings = new Set(), textSources = new WeakMap(), attributeSources = new WeakMap();
  const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const templates = catalog.templates.map(item => {
    const slots = []; let pattern = '', cursor = 0;
    for (const match of item.en.matchAll(/\{(\d+)\}/g)) {
      pattern += escape(item.en.slice(cursor, match.index)) + '(' + (item.slotPatterns?.[Number(match[1])] || '[\\s\\S]*?') + ')';
      slots.push(Number(match[1])); cursor = match.index + match[0].length;
    }
    pattern += escape(item.en.slice(cursor));
    return { ...item, slots, match: new RegExp('^' + pattern + '$'), weight: item.en.replace(/\{\d+\}/g, '').length };
  }).sort((a,b) => b.weight-a.weight);
  function translate(value, depth = 0) {
    const source = String(value ?? '');
    if (language !== 'fr' || !source.trim() || depth > 8) return source;
    const key = source.trim();
    let result = catalog.exact[key] ?? lowercase[key.toLowerCase()];
    if (result === undefined) {
      const term = key.match(/^(Winter|Fall) (20\d{2})(.*)$/);
      if (term) result = `${term[1] === 'Fall' ? 'Automne' : 'Hiver'} ${term[2]}${translate(term[3], depth + 1)}`;
    }
    if (result === undefined) for (const item of templates) {
      const found = item.match.exec(key);
      if (!found) continue;
      const values = {};
      item.slots.forEach((slot,i) => { values[slot] = item.translateSlots?.includes(slot) ? translate(found[i+1],depth+1) : found[i+1]; });
      result = item.fr.replace(/\{(\d+)\}/g, (_,slot) => values[slot] ?? '').replace(/\{p(\d+)\}/g, (_,slot) => Number(String(values[slot]).replace(/[, ]/g, '')) === 1 ? '' : 's');
      break;
    }
    if (result === undefined && key.startsWith('· ')) result = '· ' + translate(key.slice(2),depth+1);
    if (result === undefined && key.startsWith('. ')) result = '. ' + translate(key.slice(2),depth+1);
    if (result === undefined && key.includes(' · ')) {
      const translated = key.split(' · ').map(part => translate(part,depth+1)).join(' · ');
      if (translated !== key) result = translated;
    }
    if (result === undefined) {
      const day = key.match(/^(Next )?(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)(\b[\s\S]*)$/);
      if (day) result = (day[1] ? 'Prochain ' : '') + (catalog.exact[day[2]] || day[2]) + day[3];
    }
    if (result === undefined) return source;
    return source.slice(0, source.indexOf(key)) + result + source.slice(source.indexOf(key) + key.length);
  }
  const remember = binding => bindings.add(typeof WeakRef === "function" ? new WeakRef(binding) : binding);
  function render(binding) {
    const value = binding.parts ? binding.parts.map(part => part.translate ? translate(part.text) : part.text).join(binding.separator) : binding.translate ? translate(binding.source) : binding.source;
    if (binding.attribute) binding.node.setAttribute(binding.attribute, value);
    else binding.node.textContent = value;
  }
  function setText(node, value, shouldTranslate = true) {
    const source = String(value ?? '');
    let binding = textSources.get(node);
    if (!binding) { binding = { node }; textSources.set(node,binding); remember(binding); }
    delete binding.parts; Object.assign(binding, { source, translate: shouldTranslate }); render(binding); return value;
  }
  function setParts(node, parts, separator = ' · ', attribute = null) {
    const source = parts.map(part => part.text).join(separator);
    if (attribute) setAttribute(node, attribute, source, false); else setText(node,source,false);
    const binding = attribute ? attributeSources.get(node).get(attribute) : textSources.get(node);
    binding.parts = parts; binding.separator = separator; render(binding);
  }
  function setAttribute(node, attribute, value, shouldTranslate = true) {
    let entries = attributeSources.get(node);
    if (!entries) { entries = new Map(); attributeSources.set(node,entries); }
    let binding = entries.get(attribute);
    if (!binding) { binding = { node, attribute }; entries.set(attribute,binding); remember(binding); }
    Object.assign(binding, { source: String(value ?? ''), translate: shouldTranslate }); render(binding); return value;
  }
  function localize(root) {
    if (root.nodeType === 3) { if (root.textContent.trim()) setText(root,textSources.get(root)?.source ?? root.textContent); return; }
    if (root.nodeType !== 1 && root.nodeType !== 11) return;
    if (root.nodeType === 1) {
      if (['SCRIPT','STYLE','TEXTAREA','SVG'].includes(root.tagName) || root.hasAttribute('data-no-translate')) return;
      // Option labels may change; their submitted values must never change.
      if (root.tagName === 'OPTION' && !root.hasAttribute('value')) root.setAttribute('value',root.textContent);
      for (const name of ['aria-label','title','placeholder','alt','aria-valuetext']) if (root.hasAttribute(name)) setAttribute(root,name,root.getAttribute(name));
      if (root.tagName === 'TEMPLATE') return;
    }
    for (const child of [...root.childNodes]) localize(child);
  }
  function syncButton() {
    const button = document.getElementById('languageToggleButton'); if (!button) return;
    const target = language === 'fr' ? 'en' : 'fr';
    const label = target === 'fr' ? 'Passer en français' : 'Switch to English';
    button.setAttribute('aria-label',label); button.title = label;
    button.querySelector('img').src = target === 'fr' ? 'assets/flag-fr.svg' : 'assets/flag-uk.svg';
    button.querySelector('img').alt = target === 'fr' ? 'Français' : 'English';
    button.querySelector('span').textContent = target === 'fr' ? 'Français' : 'English';
  }
  function setLanguage(next) {
    if (!['en','fr'].includes(next)) return;
    language = next;
    try { localStorage.setItem(KEY,language); } catch { /* Switching still works for this session. */ }
    document.documentElement.lang = language;
    for (const reference of bindings) {
      const binding = reference.deref ? reference.deref() : reference;
      if (!binding) { bindings.delete(reference); continue; }
      // Detached rendered lists should not be retained after switching.
      if (!binding.node.isConnected && binding.node.getRootNode()?.nodeType !== 11) { bindings.delete(reference); continue; }
      render(binding);
    }
    syncButton();
    window.dispatchEvent(new CustomEvent('ufree:languagechange', { detail: { language } }));
  }
  window.UFreeI18n = { translate, setText, setParts, setAttribute, localize, setLanguage,
    sourceText: function sourceText(node) { return textSources.get(node)?.source ?? (node.nodeType === 3 ? node.textContent : [...node.childNodes].map(sourceText).join("")); },
    sourceAttribute: (node,name) => attributeSources.get(node)?.get(name)?.source ?? node.getAttribute(name),
    get language() { return language; }, get locale() { return language === 'fr' ? 'fr-CA' : 'en-CA'; },
  };
  localize(document.documentElement);
  document.documentElement.lang = language;
  syncButton();
  document.getElementById('languageToggleButton')?.addEventListener('click', () => setLanguage(language === 'fr' ? 'en' : 'fr'));
})();
