(() => {
  "use strict";
  const API = "https://youfreetest.huien3412.workers.dev";
  // Deliberately disabled outside the test GitHub Pages project and local development.
  if (
    !(
      (location.origin === "https://hui3412.github.io" &&
        location.pathname.startsWith("/Ufree/")) ||
      ["localhost", "127.0.0.1"].includes(location.hostname)
    )
  )
    return;
  const { Sync, copy, reconcileDevice, deviceBaseline } = window.UFreeAccountSync;
  const SESSION = "ufree-test-session-v1",
    PREFIX = "ufree-test-account-v1:";
  const liveNames = new Map();
  let personalChangeTask = null;
  const PREFS = [
    "whos-free-people-preferences-v1",
    "whos-free-person-order-v1",
    "whos-free-groups-v1",
    "whos-free-view-mode-v1",
    "whos-free-accent-theme-v1",
    "whos-free-theme",
    "whos-free-notification-settings-v1",
    "whos-free-notification-history-v1",
    "ufree-has-had-schedules-v1",
  ];
  let session = null,
    bridge = null,
    engine = null,
    ready = false,
    busy = false,
    verified = "",
    lastInbox = 0,
    inboxTask = null,
    needsReload = false,
    lastActivityCheck = Date.now();
  try {
    session = JSON.parse(localStorage.getItem(SESSION) || "null");
  } catch {}
  const active = () => !!session?.user?.id;
  const prefix = () => "";
  const key = () => PREFIX + session.user.id;
  const tr = (s) => window.UFreeI18n?.translate?.(s) || s;
  const text = (node, s) =>
    window.UFreeI18n
      ? window.UFreeI18n.setText(node, s)
      : (node.textContent = s);
  let apiPause = null;
  const API_PAUSE = "ufree-test-api-pause-v1";
  const quotaReset = () => { const n = new Date(); return Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + 1); };
  async function request(path, data, auth = true) {
    let pause = apiPause;
    try { pause = JSON.parse(localStorage.getItem(API_PAUSE) || "null") || apiPause; } catch {}
    if (pause?.retryAt > Date.now() && pause.retryAt <= Date.now() + 86400000)
      throw Object.assign(Error("Cloud requests are paused until the daily quota resets. Local data is preserved."), {status: 429, code: "DAILY_QUOTA_EXHAUSTED", retryAt: pause.retryAt});
    const response = await fetch(API + path, {
      method: data === undefined ? "GET" : "POST",
      headers: {
        ...(data === undefined ? {} : { "Content-Type": "application/json" }),
        ...(auth && session?.token ? { Authorization: `Bearer ${session.token}` } : {}),
      },
      body: data === undefined ? undefined : JSON.stringify(data),
      credentials: "omit", cache: "no-store",
    });
    const raw = await response.text();
    let body;
    try { body = JSON.parse(raw); } catch { body = {}; }
    // Cloudflare can reject a request before the Worker runs, returning an HTML 1027 page.
    const daily = body.code === "DAILY_QUOTA_EXHAUSTED" || (!response.ok && /free tier daily row (read|write) limit|Error 1027|owner has reached their plan limits/i.test(raw));
    if (daily) {
      const retryAt = Number(body.retryAt) > Date.now() && Number(body.retryAt) <= Date.now() + 86400000 ? Number(body.retryAt) : quotaReset();
      apiPause = {retryAt};
      try { localStorage.setItem(API_PAUSE, JSON.stringify({retryAt})); } catch {}
      throw Object.assign(Error("Cloud daily quota exhausted. Local data is preserved. Retry after the daily reset."), {status:429, code:"DAILY_QUOTA_EXHAUSTED", retryAt});
    }
    if (!response.ok) throw Object.assign(Error(body.error || "Cloud request failed."), {status:response.status});
    if (!raw || !Object.keys(body).length) throw Error("Invalid cloud response.");
    return body;
  }
  function prefs(isLocal = false) {
    const out = {};
    for (const name of PREFS) {
      const value = localStorage.getItem((isLocal ? "" : prefix()) + name);
      if (value !== null) out[name] = value;
    }
    return out;
  }
  function records(record, preferences = prefs()) {
    const people = copy(record?.data?.people || {});
    for (const person of Object.values(people))
      if (person.classes === undefined) person.classes = [];
    return {
      ...Object.fromEntries(
        Object.entries(people)
          .filter(([name]) => !liveNames.has(name))
          .map(([name, value]) => ["p:" + name, value]),
      ),
      ...linkedRecords(),
      "@preferences": preferences,
    };
  }
  function linkedRecords() {
    return Object.fromEntries(
      Object.entries(engine?.state.records || {}).filter(([name]) =>
        name.startsWith("f:"),
      ),
    );
  }
  function pendingPersonal() {
    const raw = localStorage.getItem(key() + ":personal-change");
    return raw ? JSON.parse(raw) : null;
  }
  async function flushPersonalChange() {
    if (!session || !engine) return;
    if (personalChangeTask) return personalChangeTask;
    personalChangeTask = (async () => {
      const pending = pendingPersonal();
      if (!pending || !engine.state.base["p:" + pending.to]) return;
      const current =
        engine.state.personalSchedule ?? session.user.personalSchedule;
      if (current !== pending.to) {
        if (current !== pending.from)
          throw Error(
            "Your personal schedule selection changed on another device. Choose it again.",
          );
        await request("/profile/personal-schedule", {
          name: pending.to,
          expected: pending.from,
        });
      }
      session.user.personalSchedule = pending.to;
      localStorage.setItem(SESSION, JSON.stringify(session));
      engine.persist({ ...engine.state, personalSchedule: pending.to });
      localStorage.removeItem(key() + ":personal-change");
    })().finally(() => {
      personalChangeTask = null;
    });
    return personalChangeTask;
  }
  function peopleFromRecords(values) {
    return Object.fromEntries(
      Object.entries(values)
        .filter(([name]) => name.startsWith("p:"))
        .map(([name, value]) => [name.slice(2), value]),
    );
  }
  function hydrate() {
    if (!active() || !engine) return;
    for (const name of PREFS) {
      const value = engine.state.records["@preferences"]?.[name];
      if (value === undefined) localStorage.removeItem(prefix() + name);
      else if (typeof value === "string")
        localStorage.setItem(prefix() + name, value);
    }
  }
  function accountRecord() {
    const people = peopleFromRecords(engine.state.records);
    liveNames.clear();
    for (const [name, value] of Object.entries(linkedRecords()).sort(
      ([a], [b]) => a.localeCompare(b),
    )) {
      if (
        !value?.person ||
        !Array.isArray(value.person.classes) ||
        typeof value.username !== "string"
      )
        continue;
      let label = "@" + value.username,
        index = 2;
      while (Object.hasOwn(people, label))
        label = `@${value.username} (${index++})`;
      people[label] = copy(value.person);
      liveNames.set(label, { id: name.slice(2), username: value.username });
    }
    return {
      data: { people },
      meta: { filename: "Schedule collection", peopleCount: Object.keys(people).length, liveSchedules: Object.fromEntries(liveNames), liveAccount: session.user.id },
    };
  }
  function setupEngine() {
    if (!session?.user?.id) return;
    engine = new Sync({
      storage: localStorage,
      key: key(),
      request,
      onChange: () => {
        renderStatus();
      },
      onSynced: (_, details) => {
        if (details?.changed !== false) needsReload = true;
        queueMicrotask(() =>
          flushPersonalChange().then(applySync).catch(showError),
        );
      },
    });
  }
  setupEngine();
  window.UFreeAccounts = {
    active,
    prefix,
    isLive: (name) => liveNames.has(name),
    renamed: (from, to) => {
      if (!active()) return;
      const pending = pendingPersonal();
      const selected =
        pending?.to ??
        engine.state.personalSchedule ??
        session.user.personalSchedule;
      if (selected !== from) return;
      localStorage.setItem(
        key() + ":personal-change",
        JSON.stringify({ from: pending?.from ?? from, to }),
      );
      engine.check(true).then(flushPersonalChange).catch(showError);
    },
    uiIdle: () => {
      if (needsReload) queueMicrotask(applySync);
    },
    read: () => accountRecord(),
    async restoreDevice(record, write) {
      liveNames.clear();
      for (const [name, value] of Object.entries(record?.meta?.liveSchedules || {}))
        if (!active() || record.meta.liveAccount === session.user.id) liveNames.set(name, value);
      if (!active()) return record;
      let baseline;
      try { baseline = JSON.parse(localStorage.getItem(key() + ":device-base-v1") || "null"); } catch {}
      const account = copy(engine.state.records);
      const merged = await reconcileDevice(baseline, records(record), account);
      // A cloud response may arrive while hashing. Reconcile against its new revision.
      if (JSON.stringify(account) !== JSON.stringify(engine.state.records))
        return window.UFreeAccounts.restoreDevice(record, write);
      engine.save(merged.records);
      if (merged.conflicts.length) engine.persist({ ...engine.state, conflicts: [...(engine.state.conflicts || []), ...merged.conflicts] });
      hydrate();
      const saved = await write(accountRecord());
      await markDevice(saved);
      return saved;
    },
    async save(record, write = bridge.writeDevice) {
      try { engine.save(records(record)); }
      catch (error) { await write(record); throw error; }
      const saved = await write(accountRecord());
      await markDevice(saved);
      return saved;
    },
    async clear(write = bridge.writeDevice) {
      engine.save({ ...linkedRecords(), "@preferences": prefs() });
      const saved = await write(accountRecord());
      await markDevice(saved);
      return true;
    },
    preferences: () => {
      if (active() && ready)
        engine.save({ ...engine.state.records, "@preferences": prefs() });
    },
    ready(value) {
      bridge = value;
      ready = true;
      mount();
      if (session) {
        engine
          .check()
          .then(() => inbox())
          .catch(showError);
      }
      cloudHash();
    },
    isCloudInput(value) {
      return (
        /^UFC1:[a-f0-9]{64}$/i.test(value.trim()) ||
        /^https:\/\/hui3412\.github\.io\/Ufree\/(?:[^#]*)#cloud=[a-f0-9]{64}$/i.test(
          value.trim(),
        )
      );
    },
    async receive(value) {
      const id = value.trim().match(/(?:UFC1:|#cloud=)([a-f0-9]{64})$/i)?.[1];
      if (!id) throw Error("Invalid cloud code.");
      if (!session)
        await notice(
          "Create an account to send cloud snapshots and sync your schedules. You can receive this snapshot without an account.",
        );
      const result = await request("/shares/" + id, undefined, false);
      await bridge.importPeople(result.people);
      return true;
    },
  };
  async function markDevice(record) {
    // Only advance the baseline after the shared phone copy was saved successfully.
    localStorage.setItem(key() + ":device-base-v1", JSON.stringify(await deviceBaseline(records(record))));
  }
  let panel, button, status, main, focusBefore;
  function element(tag, content, parent, attrs = {}) {
    const node = document.createElement(tag);
    if (content) {
      if (Object.hasOwn(attrs, "data-no-translate")) node.textContent = content;
      else text(node, content);
    }
    for (const [key, value] of Object.entries(attrs)) {
      if (["aria-label", "title"].includes(key) && window.UFreeI18n)
        window.UFreeI18n.setAttribute(node, key, value);
      else node.setAttribute(key, value);
    }
    parent?.append(node);
    return node;
  }
  function action(label, parent, callback) {
    const node = element("button", label, parent, {
      type: "button",
      class: "secondary-button",
    });
    node.addEventListener("click", () =>
      Promise.resolve(callback()).catch(showError),
    );
    return node;
  }
  function showError(error) {
    if (status) text(status, error.message || String(error));
  }
  function close() {
    panel.close();
    focusBefore?.focus?.();
  }
  function open() {
    focusBefore = bridge.prepareDialog();
    render();
    panel.showModal();
  }
  function clear() {
    main.onkeydown = null;
    main.replaceChildren();
    verified = "";
    text(status, "");
  }
  function field(label, type = "text", value = "") {
    const wrap = element("label", label, main);
    const input = element("input", "", wrap, {
      type,
      required: "",
      ...(type === "password"
        ? {
            minlength: "12",
            maxlength: "128",
            autocomplete: "current-password",
          }
        : {}),
    });
    input.value = value;
    return input;
  }
  function formButton(label, callback) {
    const node = action(label, main, async () => {
      if (busy) return;
      busy = true;
      node.disabled = true;
      try {
        await callback();
      } finally {
        busy = false;
        node.disabled = false;
      }
    });
    return node;
  }
  function renderStatus() {
    if (!status) return;
    if (!session) return;
    const parts = [
      active() ? "Signed in: syncing this device" : "Signed out: saved on this device",
    ];
    if (engine) {
      parts.push(
        `${tr("Pending changes")}: ${engine.pending() + (pendingPersonal() ? 1 : 0)}`,
      );
      parts.push(
        `${tr("Last sync")}: ${engine.state.lastSync ? new Date(engine.state.lastSync).toLocaleString() : tr("Not synced")}`,
      );
      if (engine.error) parts.push(tr(engine.error));
      if (engine.state.conflicts.length)
        parts.push(
          tr("Conflicting edits were preserved as separate schedules."),
        );
    }
    status.textContent = parts.join(" · ");
  }
  function mount() {
    const nav = document.getElementById("homeNavigation"),
      language = document.getElementById("languageToggleButton");
    const footer = element("div", "", null, { class: "account-nav-footer" });
    language.before(footer);
    footer.append(language);
    button = action(
      session ? "Account" : "Sign in / Create account",
      footer,
      open,
    );
    button.id = "accountMenuButton";
    panel = element("dialog", "", document.body, {
      class: "account-dialog",
      "aria-labelledby": "accountDialogTitle",
    });
    const head = element("div", "", panel, { class: "modal-header" });
    element("h2", "Account", head, { id: "accountDialogTitle" });
    action("Close", head, close);
    main = element("div", "", panel);
    status = element("p", "", panel, { role: "status", "aria-live": "polite" });
    panel.addEventListener("click", (event) => {
      if (event.target === panel) close();
    });
    window.addEventListener("online", () => sync(true).catch(showError));
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        sync(false)
          .then(() => inbox())
          .catch(showError);
      }
    });
    window.addEventListener("pageshow", () => sync(false).catch(showError));
    const authenticatedActivity = () => {
      if (session && Date.now() - lastActivityCheck >= 3600000) {
        lastActivityCheck = Date.now();
        sync(false).catch(showError);
      }
    };
    document.addEventListener("pointerdown", authenticatedActivity, {
      passive: true,
    });
    document.addEventListener("keydown", authenticatedActivity);
    window.addEventListener("hashchange", cloudHash);
    window.addEventListener("storage", (event) => {
      if (event.key === SESSION) location.reload();
      else if (session && event.key === key()) {
        try {
          const before = JSON.parse(event.oldValue || "null"),
            after = JSON.parse(event.newValue || "null");
          // Status/check timestamps written by another tab do not require a cloud check.
          if (
            before?.revision === after?.revision &&
            JSON.stringify(before?.records) === JSON.stringify(after?.records)
          )
            return;
        } catch {}
        needsReload = true;
        sync(false).then(applySync).catch(showError);
      }
    });
    updateCollectionLabels();
    window.addEventListener("ufree:languagechange", () => {
      updateCollectionLabels();
      renderStatus();
    });
    renderStatus();
  }
  function updateCollectionLabels() {
    document.querySelectorAll(".account-collection-label").forEach(node => node.remove());
  }
  async function notice(message) {
    return new Promise((resolve) => {
      const dialog = element("dialog", "", document.body, {
        class: "account-dialog",
      });
      element("p", message, dialog);
      const finish = () => {
        dialog.close();
        dialog.remove();
        resolve();
      };
      action("Continue", dialog, finish);
      dialog.addEventListener("cancel", (event) => {
        event.preventDefault();
        finish();
      });
      bridge.prepareDialog();
      dialog.showModal();
    });
  }
  function render() {
    clear();
    if (!session) {
      authForm(false);
      return;
    }
    element("p", `@${session.user.username}`, main, {
      "data-no-translate": "",
    });
    element(
      "p",
      "Schedules on this device sync with your account while signed in. Signing out keeps them on this device.",
      main,
    );
    const controls = element("div", "", main, { class: "account-actions" });
    action("Refresh sync", controls, () => sync(true));
    action("Find accounts", controls, searchAccounts);
    action("Following", controls, followingForm);
    action("Your personal schedule", controls, personalForm);
    action("Cloud sharing", controls, sharing);
    action("Inbox", controls, () => inbox(true));
    action("Change password", controls, passwordForm);
    action("Sign in again", controls, () => authForm(false));
    action("Block or unblock a username", controls, blockForm);
    action("Sign out", controls, async () => {
      ready = false;
      await engine.running;
      clearTimeout(engine.timer);
      await window.UFreeAccounts.restoreDevice(await bridge.localSnapshot(), bridge.writeDevice);
      clearTimeout(engine.timer);
      try {
        await request("/auth/logout", {});
      } catch {}
      localStorage.removeItem(SESSION);
      location.reload();
    });
    element(
      "p",
      "Account data is private until you share it. Cloud storage is not end-to-end encrypted.",
      main,
    );
    element(
      "p",
      "Accounts are intended to expire after 12 months without authenticated use. Automatic deletion is disabled in this test until the warning method and grace period are decided.",
      main,
    );
    renderStatus();
  }
  function authForm(signup) {
    if (signup && session) {
      text(status, "Sign out before creating another account.");
      return;
    }
    clear();
    element("h3", signup ? "Create account" : "Sign in", main);
    const legalLinks = element("p", "", main);
    element("a", "Privacy notice", legalLinks, {
      href: "legal.html#privacy",
      target: "_blank",
      rel: "noopener noreferrer",
    });
    element("span", " · ", legalLinks);
    element("a", "Terms & ownership", legalLinks, {
      href: "legal.html#terms",
      target: "_blank",
      rel: "noopener noreferrer",
    });
    const username = field("Username"),
      password = field("Password", "password");
    username.autocomplete = "username";
    password.autocomplete = signup ? "new-password" : "current-password";
    username.pattern = "[A-Za-z0-9_]{3,24}";
    username.maxLength = 24;
    if (!signup) element("p", "Signing in syncs this device’s schedules and preferences with your account. Conflicting schedule edits are kept as separate copies.", main);
    let school, personal, consent;
    if (signup) {
      element(
        "p",
        "Your username cannot change. There is no password recovery: losing your password means losing access.",
        main,
      );
      element(
        "p",
        "Signing in syncs this device’s schedules and preferences with your account. Conflicting schedule edits are kept as separate copies.",
        main,
      );
      element(
        "p",
        "Cloud storage is not end-to-end encrypted. Your school and personal schedule are not shared automatically.",
        main,
      );
      school = field("School");
      school.maxLength = 200;
      const label = element("label", "Your personal schedule", main);
      personal = element("select", "", label, { required: "" });
      for (const name of Object.keys(bridge.snapshot().data.people))
        element("option", name, personal, {
          value: name,
          "data-no-translate": "",
        });
      if (!personal.options.length)
        element(
          "p",
          "Add your personal schedule in Import first, then return to create your account.",
          main,
        );
      action("Upload your personal schedule", main, () => {
        close();
        bridge.openImport();
      });
      const l = element(
        "label",
        "I agree to sync this device’s schedules and preferences with my account.",
        main,
      );
      consent = element("input", "", l, { type: "checkbox" });
    }
    const submit = formButton(
      signup ? "Create account" : "Sign in",
      async () => {
        if (!username.checkValidity() || !password.checkValidity()) {
          username.reportValidity();
          password.reportValidity();
          return;
        }
        if (
          signup &&
          (!school.checkValidity() || !personal.value || !consent.checked)
        )
          throw Error(
            "School, personal schedule and upload consent are required.",
          );
        const probe = "ufree-account-write-check";
        localStorage.setItem(probe, "1");
        localStorage.removeItem(probe);
        const snapshot = bridge.snapshot();
        const result = await request(
          "/auth/" + (signup ? "signup" : "login"),
          {
            username: username.value,
            password: password.value,
            ...(signup
              ? {
                  school: school.value,
                  personalSchedule: personal.value,
                  people: peopleFromRecords(records(snapshot)),
                  consent: true,
                }
              : {}),
          },
          false,
        );
        ready = false;
        await engine?.running;
        clearTimeout(engine?.timer);
        session = result;
        localStorage.setItem(SESSION, JSON.stringify(result));
        setupEngine();
        await window.UFreeAccounts.restoreDevice(snapshot, bridge.writeDevice);
        await engine.check(true);
        await window.UFreeAccounts.restoreDevice(await bridge.localSnapshot(), bridge.writeDevice);
        location.reload();
      },
    );
    main.onkeydown = (event) => {
      if (
        event.key === "Enter" &&
        event.target.tagName === "INPUT" &&
        event.target.type !== "checkbox"
      ) {
        event.preventDefault();
        submit.click();
      }
    };
    action(
      signup ? "Already have an account? Sign in" : "Create account",
      main,
      () => authForm(!signup),
    );
  }
  async function applySync() {
    if (!ready || !active() || !needsReload || bridge.isBusy()) return;
    needsReload = false;
    await bridge.reload();
  }
  async function sync(force) {
    if (!session || !engine) return;
    await engine.check(force);
    await flushPersonalChange();
    await applySync();
    renderStatus();
  }
  function passwordForm() {
    clear();
    element("h3", "Change password", main);
    const current = field("Current password", "password"),
      next = field("New password", "password");
    next.autocomplete = "new-password";
    const l = element("label", "Sign out other devices", main);
    const others = element("input", "", l, { type: "checkbox" });
    formButton("Save password", async () => {
      await request("/auth/password", {
        currentPassword: current.value,
        newPassword: next.value,
        signOutOthers: others.checked,
      });
      current.value = "";
      next.value = "";
      render();
      text(status, "Password changed.");
    });
  }
  function blockForm() {
    clear();
    const name = field("Username");
    action("Block", main, async () => {
      await request("/blocks", { username: name.value, blocked: true });
      await sync(true);
      text(status, "User blocked.");
    });
    action("Unblock", main, async () => {
      await request("/blocks", { username: name.value, blocked: false });
      text(status, "User unblocked.");
    });
  }
  const warning =
    "Recipients can save, screenshot, or reshare their copy. Deleting your account does not delete their copy. Get permission before sharing someone else's schedule.";
  function sharing(recipientUsername = "") {
    clear();
    element("h3", "Cloud sharing", main);
    element("p", warning, main);
    element(
      "p",
      "Select schedules to share. Shared copies are fixed snapshots and will not receive future edits.",
      main,
    );
    const values = bridge.snapshot().data.people,
      choices = [];
    for (const name of Object.keys(values)) {
      const label = element("label", name, main, { "data-no-translate": "" }),
        input = element("input", "", label, { type: "checkbox" });
      choices.push([name, input]);
    }
    element("p", "Includes the complete schedule and all saved details.", main);
    const selected = () => Object.fromEntries(
      choices.filter(([,input]) => input.checked).map(([name]) => [name,copy(values[name])]),
    );
    formButton("Create 48-hour link / code", async () => {
      const result = await request("/shares", { people: selected() });
      const output = element("textarea", "", main, {
        readonly: "",
        "aria-label": "Cloud link and code",
      });
      output.value = `${location.origin}${location.pathname}#cloud=${result.code.slice(5)}\n${result.code}`;
      element(
        "p",
        `${tr("Expires")}: ${new Date(result.expiresAt).toLocaleString()}`,
        main,
      );
    });
    const recipient = field("Recipient username", "text", recipientUsername);
    recipient.addEventListener("input", () => {
      verified = "";
    });
    action("Verify recipient", main, async () => {
      const result = await request("/users/lookup", {
        username: recipient.value,
      });
      if (!result.username) throw Error("Recipient unavailable.");
      verified = result.username;
      status.textContent = `${tr("Verified recipient")}: @${verified}`;
    });
    formButton("Send by username", async () => {
      if (!verified || verified !== recipient.value.toLowerCase())
        throw Error("Verify the recipient first.");
      const people = selected();
      if (!Object.keys(people).length) throw Error("Select schedules.");
      const snapshot = JSON.stringify(people);
      if (
        !(await confirmDialog(
          `${tr("Verified recipient")}: @${verified}\n${Object.keys(people).join(", ")}\n${tr("Includes the complete schedule and all saved details.")}\n${tr(warning)}`,
        ))
      )
        return;
      await request("/deliveries", {
        username: verified,
        people: JSON.parse(snapshot),
        confirmed: true,
      });
      text(status, "Schedules sent.");
    });
  }
  async function confirmDialog(message) {
    return new Promise((resolve) => {
      const dialog = element("dialog", "", document.body, {
        class: "account-dialog",
      });
      element("p", message, dialog);
      const done = (result) => {
        dialog.close();
        dialog.remove();
        resolve(result);
      };
      action("Cancel", dialog, () => done(false));
      action("Confirm", dialog, () => done(true));
      dialog.addEventListener("cancel", (event) => {
        event.preventDefault();
        done(false);
      });
      bridge.prepareDialog();
      dialog.showModal();
    });
  }
  function inbox(force = false) {
    if (inboxTask) return inboxTask;
    inboxTask = loadInbox(force).finally(() => {
      inboxTask = null;
    });
    return inboxTask;
  }
  async function loadInbox(force = false) {
    if (
      !session ||
      !ready ||
      busy ||
      (!force &&
        (Date.now() - lastInbox < 60000 ||
          panel?.open ||
          bridge.isBusy() ||
          bridge.canNotify?.() === false))
    )
      return;
    const revision = engine?.state.inboxRevision;
    const seenKey = key() + ":inbox-seen-v1";
    let seen = 0;
    try {
      seen = Number(localStorage.getItem(seenKey) || 0);
    } catch {}
    if (!force && Number.isSafeInteger(revision) && revision <= seen) return;
    lastInbox = Date.now();
    const result = await request("/deliveries");
    if (
      !force &&
      (panel?.open || bridge.isBusy() || bridge.canNotify?.() === false)
    )
      return;
    const receivedRevision = result.inboxRevision ?? revision;
    if (Number.isSafeInteger(receivedRevision)) {
      try {
        localStorage.setItem(seenKey, String(receivedRevision));
      } catch {}
    }
    if (!result.deliveries.length && !(result.followRequests || []).length) {
      if (force) text(status, "No pending deliveries.");
      return;
    }
    if (!panel.open) {
      focusBefore = bridge.prepareDialog();
      panel.showModal();
    }
    clear();
    element("h3", "Incoming schedules", main);
    element(
      "p",
      active() ? "Signed in: syncing this device" : "Signed out: saved on this device",
      main,
    );
    for (const item of result.followRequests || []) {
      const box = element("section", "", main, { class: "follow-result" });
      element("h4", "Follow request", box);
      element("p", "@" + item.sender, box, { "data-no-translate": "" });
      element("p", followConsent, box);
      action("Follow back and share", box, async () => {
        if (
          !(await confirmDialog(
            "@" + item.sender + "\n" + tr(followConsent) + "\n" + tr(warning),
          ))
        )
          return;
        await ensureSynced();
        await request("/connections/respond", {
          id: item.id,
          decision: "accepted",
          sharePersonal: true,
        });
        box.remove();
        await sync(true);
        text(
          status,
          "You now follow each other. Personal schedules will stay updated while signed in.",
        );
      });
      action("Decline", box, async () => {
        await request("/connections/respond", {
          id: item.id,
          decision: "declined",
        });
        box.remove();
      });
      action("Block sender", box, async () => {
        await request("/blocks", { username: item.sender, blocked: true });
        box.remove();
        await sync(true);
      });
    }
    for (const item of result.deliveries) {
      const box = element("section", "", main);
      element("p", `${tr("From")}: @${item.sender}`, box);
      element("p", Object.keys(item.people).join(", "), box, {
        "data-no-translate": "",
      });
      action("Accept", box, async () => {
        if (bridge.isBusy())
          throw Error("Finish the current import or export first.");
        close();
        await bridge.importPeople(item.people);
        await request("/deliveries/respond", {
          id: item.id,
          decision: "accepted",
        });
        box.remove();
      });
      action("Decline", box, async () => {
        await request("/deliveries/respond", {
          id: item.id,
          decision: "declined",
        });
        box.remove();
      });
      action("Block sender", box, async () => {
        await request("/blocks", { username: item.sender, blocked: true });
        box.remove();
        await sync(true);
      });
    }
  }
  const followConsent =
    "Following back shares both selected Account personal schedules, including courses, rooms and teachers, and keeps future changes updated in both directions. Other schedules and school information stay private. Either person can stop following.";
  const requestConsent =
    "If this person follows back, your selected Account personal schedule, including courses, rooms and teachers, will be shared with them and kept updated. You will only see their personal schedule after they agree. Other schedules and school information stay private.";
  async function ensureSynced() {
    await sync(true);
    if (engine.error || engine.pending())
      throw Error(
        engine.error || "Connect and sync your pending changes first.",
      );
  }
  function backToAccount() {
    action("Back to account", main, render);
  }
  function searchAccounts() {
    clear();
    element("h3", "Find accounts", main);
    element(
      "p",
      "Search usernames. Up to 10 matching accounts are shown. Private schedules and schools are never included in search results.",
      main,
    );
    const query = field("Search username");
    query.maxLength = 24;
    query.autocomplete = "off";
    const results = element("div", "", main, {
      class: "follow-results",
      role: "region",
      "aria-label": "Account search results",
      "aria-live": "polite",
    });
    formButton("Search accounts", async () => {
      const response = await request("/users/search", { query: query.value });
      if (!results.isConnected) return;
      results.replaceChildren();
      const users = (response.users || []).slice(0, 10);
      if (!users.length) element("p", "No matching accounts.", results);
      for (const match of users) {
        const row = element("section", "", results, { class: "follow-result" });
        element("p", "@" + match.username, row, { "data-no-translate": "" });
        if (match.connection?.status === "accepted") {
          element("p", "Following each other", row);
          action("Share schedules", row, () => sharing(match.username));
        } else if (match.connection?.status === "pending") {
          element(
            "p",
            match.connection.direction === "incoming"
              ? "This person wants to follow you."
              : "Follow request pending.",
            row,
          );
          if (match.connection.direction === "incoming")
            action("Open inbox", row, () => inbox(true));
        } else {
          const follow = action("Follow", row, async () => {
            if (
              !(await confirmDialog(
                "@" +
                  match.username +
                  "\n" +
                  tr(requestConsent) +
                  "\n" +
                  tr(warning),
              ))
            )
              return;
            await ensureSynced();
            await request("/connections/request", {
              username: match.username,
              sharePersonal: true,
            });
            follow.disabled = true;
            text(follow, "Follow request pending.");
            text(status, "Follow request sent.");
          });
        }
      }
    });
    query.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        [...main.querySelectorAll("button")]
          .find(
            (node) =>
              window.UFreeI18n?.sourceText(node) === "Search accounts" ||
              node.textContent === "Search accounts",
          )
          ?.click();
      }
    });
    backToAccount();
  }
  async function followingForm() {
    clear();
    element("h3", "Following", main);
    element(
      "p",
      "Live personal schedules appear while signed in. They refresh when UFree opens, returns online, or you refresh sync. Offline copies may differ until synced.",
      main,
    );
    const list = element("div", "", main, { class: "follow-results" });
    backToAccount();
    const result = await request("/connections");
    if (!list.isConnected) return;
    if (!result.connections.length)
      element("p", "You are not following anyone yet.", list);
    for (const connection of result.connections) {
      const row = element("section", "", list, { class: "follow-result" });
      element("p", "@" + connection.username, row, { "data-no-translate": "" });
      element(
        "p",
        connection.status === "accepted"
          ? "Following each other"
          : connection.direction === "incoming"
            ? "This person wants to follow you."
            : "Follow request pending.",
        row,
      );
      if (connection.status === "accepted")
        action("Share schedules", row, () => sharing(connection.username));
      if (
        connection.direction === "incoming" &&
        connection.status === "pending"
      )
        action("Open inbox", row, () => inbox(true));
      else
        action(
          connection.status === "accepted"
            ? "Stop following"
            : "Cancel request",
          row,
          async () => {
            if (
              !(await confirmDialog(
                "@" +
                  connection.username +
                  "\n" +
                  tr(
                    "Stop sharing live personal schedules in both directions? Previously saved or reshared copies cannot be erased.",
                  ),
              ))
            )
              return;
            await request("/connections/remove", { id: connection.id });
            row.remove();
            await sync(true);
          },
        );
      action("Block", row, async () => {
        if (
          !(await confirmDialog(
            "@" +
              connection.username +
              "\n" +
              tr(
                "Block this account and stop sharing live personal schedules?",
              ),
          ))
        )
          return;
        await request("/blocks", {
          username: connection.username,
          blocked: true,
        });
        row.remove();
        await sync(true);
      });
    }
  }
  function personalForm() {
    clear();
    element("h3", "Your personal schedule", main);
    element(
      "p",
      "Choose a schedule from your Account collection. Changes to this selection are automatically shared only with people you mutually follow.",
      main,
    );
    const label = element("label", "Your personal schedule", main),
      select = element("select", "", label, {
        required: "",
        "data-testid": "personal-schedule-select",
      });
    element("option", "Choose your personal schedule", select, { value: "" });
    const current =
      pendingPersonal()?.to ??
      engine.state.personalSchedule ??
      session.user.personalSchedule;
    const names = Object.keys(engine.state.records)
      .filter((name) => name.startsWith("p:"))
      .map((name) => name.slice(2));
    for (const name of names)
      element("option", name, select, { value: name, "data-no-translate": "" });
    select.value = names.includes(current) ? current : "";
    if (!select.value)
      element(
        "p",
        "Your selected personal schedule is missing. Choose and sync a replacement to keep sharing updates.",
        main,
      );
    formButton("Use this personal schedule", async () => {
      if (!select.value) throw Error("Select your personal schedule.");
      // An explicit choice replaces any unresolved offline rename choice.
      localStorage.removeItem(key() + ":personal-change");
      await ensureSynced();
      const expected =
        engine.state.personalSchedule ?? session.user.personalSchedule;
      await request("/profile/personal-schedule", {
        name: select.value,
        expected,
      });
      session.user.personalSchedule = select.value;
      localStorage.setItem(SESSION, JSON.stringify(session));
      engine.persist({ ...engine.state, personalSchedule: select.value });
      await sync(true);
      text(status, "Personal schedule updated.");
    });
    backToAccount();
  }

  async function cloudHash() {
    if (!ready || !location.hash.startsWith("#cloud=")) return;
    try {
      await window.UFreeAccounts.receive(location.href);
      history.replaceState(null, "", location.pathname + location.search);
    } catch (error) {
      await notice(error.message);
    }
  }
})();
