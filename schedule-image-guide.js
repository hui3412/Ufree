(() => {
  'use strict';
  const SEEN_KEY = 'ufree-screenshot-guide-seen-v1';
  const modal = document.getElementById('screenshotGuideModal');
  const template = document.getElementById('screenshotExampleTemplate');
  if (!modal || !template) return;
  const text = (node, value) => window.UFreeI18n ? window.UFreeI18n.setText(node, value) : (node.textContent = value);
  for (const mount of document.querySelectorAll('[data-screenshot-example]')) {
    mount.append(template.content.cloneNode(true));
    window.UFreeI18n?.localize(mount);
  }
  const details = modal.querySelector('details');
  const image = details.querySelector('img');
  const proceed = document.getElementById('screenshotGuideContinue');
  const cancel = document.getElementById('screenshotGuideCancel');
  const retry = document.getElementById('screenshotGuideRetry');
  const status = document.getElementById('screenshotGuideStatus');
  let acknowledged = false, request = null, timer = null, statusSource = '';
  let remaining = 2000, lastTick = 0, loaded = false, failed = false;
  try { acknowledged = localStorage.getItem(SEEN_KEY) === '1'; } catch { /* Session-only acknowledgement still works. */ }

  function exampleVisible() {
    const picture = image.getBoundingClientRect();
    const card = modal.querySelector('.screenshot-guide-card').getBoundingClientRect();
    const visibleHeight = Math.max(0, Math.min(picture.bottom, card.bottom, window.innerHeight) - Math.max(picture.top, card.top, 0));
    return picture.height > 0 && visibleHeight >= picture.height * .9;
  }

  function render() {
    if (!request) return;
    proceed.disabled = !loaded || remaining > 0;
    retry.hidden = !failed;
    const message = failed ? 'The example could not load. Connect to the internet and choose Try again.'
      : !loaded ? 'Loading the screenshot example…'
      : remaining <= 0 ? ''
      : !details.open ? 'Open the example to continue.'
      : !exampleVisible() ? 'Keep the example visible to continue.'
      : '';
    status.hidden = !message;
    if (message !== statusSource) { statusSource = message; text(status, message); }
  }

  function tick() {
    if (!request) return;
    const now = performance.now();
    if (loaded && details.open && !document.hidden && exampleVisible()) remaining = Math.max(0, remaining - (now - lastTick));
    lastTick = now;
    render();
    if (loaded && remaining <= 0 && timer !== null) { clearInterval(timer); timer = null; }
  }

  function startTimer() {
    if (!request || loaded) return;
    loaded = true; failed = false;
    lastTick = performance.now();
    timer = window.setInterval(tick, 100);
    render();
  }

  function close(restoreFocus = true) {
    if (!request) return null;
    const previous = request; request = null;
    if (timer !== null) clearInterval(timer);
    timer = null;
    modal.hidden = true;
    for (const item of previous.background) {
      item.element.toggleAttribute('inert', item.inert);
      if (item.ariaHidden === null) item.element.removeAttribute('aria-hidden');
      else item.element.setAttribute('aria-hidden', item.ariaHidden);
    }
    document.body.style.overflow = previous.overflow;
    if (restoreFocus && previous.focus?.isConnected) previous.focus.focus({ preventScroll: true });
    return previous;
  }

  function choose(openPicker, { firstSchedule = false, returnFocus = document.activeElement } = {}) {
    if (request) return;
    if (!firstSchedule || acknowledged) { openPicker(); return; }
    request = {
      openPicker, focus: returnFocus, overflow: document.body.style.overflow,
      background: [...document.body.children].filter(element => element !== modal && !['SCRIPT', 'TEMPLATE', 'STYLE'].includes(element.tagName))
        .map(element => ({ element, inert: element.hasAttribute('inert'), ariaHidden: element.getAttribute('aria-hidden') })),
    };
    for (const item of request.background) { item.element.setAttribute('inert', ''); item.element.setAttribute('aria-hidden', 'true'); }
    loaded = false; failed = false; remaining = 2000;
    details.open = true;
    modal.hidden = false;
    modal.querySelector('.screenshot-guide-card').scrollTop = 0;
    document.body.style.overflow = 'hidden';
    proceed.disabled = true;
    image.loading = 'eager';
    render();
    document.getElementById('screenshotGuideTitle').focus({ preventScroll: true });
    if (image.complete && image.naturalWidth > 0) startTimer();
    else if (image.complete) { failed = true; render(); }
  }

  image.addEventListener('load', startTimer);
  image.addEventListener('error', () => {
    if (!request) return;
    failed = true; loaded = false; remaining = 2000;
    if (timer !== null) clearInterval(timer);
    timer = null; render();
  });
  retry.addEventListener('click', () => {
    failed = false; render();
    const src = image.getAttribute('src');
    image.removeAttribute('src'); image.setAttribute('src', src);
  });
  details.addEventListener('toggle', () => { lastTick = performance.now(); render(); });
  document.addEventListener('visibilitychange', () => { lastTick = performance.now(); render(); });
  cancel.addEventListener('click', () => close());
  proceed.addEventListener('click', () => {
    tick();
    if (!request || proceed.disabled) return;
    acknowledged = true;
    try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* Do not repeat during this session. */ }
    const previous = close();
    // The native picker stays directly inside this click to preserve iOS's user gesture.
    previous.openPicker();
  });
  modal.addEventListener('click', event => { if (event.target === modal) close(); });
  document.addEventListener('keydown', event => {
    if (!request) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); close(); }
    if (event.key === 'Tab') {
      event.preventDefault(); event.stopImmediatePropagation();
      const controls = [...modal.querySelectorAll('button, summary')].filter(node => !node.disabled && !node.closest('[hidden]'));
      const index = controls.indexOf(document.activeElement);
      const next = index < 0 ? event.shiftKey ? controls.at(-1) : controls[0] : controls[(index + (event.shiftKey ? -1 : 1) + controls.length) % controls.length];
      next?.focus({ preventScroll: true });
    }
  }, true);
  document.addEventListener('focusin', event => {
    if (request && !modal.contains(event.target)) cancel.focus({ preventScroll: true });
  });
  window.UFreeScreenshotGuide = { choose };
})();
