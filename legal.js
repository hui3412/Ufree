(() => {
  "use strict";
  const key = "ufree-language-v1";
  function select(language, persist = false) {
    if (!["en", "fr"].includes(language)) return;
    document.documentElement.lang = language;
    for (const node of document.querySelectorAll("[data-language-content]")) node.hidden = node.dataset.languageContent !== language;
    for (const node of document.querySelectorAll("[data-language]")) node.setAttribute("aria-pressed", String(node.dataset.language === language));
    if (persist) { try { localStorage.setItem(key, language); } catch {} }
  }
  let initial = "en";
  try { if (localStorage.getItem(key) === "fr") initial = "fr"; } catch {}
  select(initial);
  for (const node of document.querySelectorAll("[data-language]")) node.addEventListener("click", () => select(node.dataset.language, true));
})();
