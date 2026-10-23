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
  const { Sync, copy } = window.UFreeAccountSync;
  const SESSION = "ufree-test-session-v1",
    VIEW = "ufree-test-view-v1",
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
    mode = "local",
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
    if (session?.user?.modelVersion !== 2) {
      session=null;localStorage.removeItem(SESSION);localStorage.setItem(VIEW,"local");
    }
    mode =
      localStorage.getItem(VIEW) === "account" && session?.user?.id
        ? "account"
        : "local";
  } catch {}
  const active = () => mode === "account" && !!session?.user?.id;
  const prefix = () => (active() ? PREFIX + session.user.id + ":pref:" : "");
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
    return {...engine?.state.records,"@preferences":preferences};
  }
  function linkedRecords() {
    return Object.fromEntries(
      Object.entries(engine?.state.records || {}).filter(([name]) =>
        name.startsWith("f:"),
      ),
    );
  }
  function pendingPersonal() {return null;}
  async function flushPersonalChange() {}
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
    const people = {};
    liveNames.clear();
    const own = engine.state.records["p:Personal"];
    if (own) {
      const label="@"+session.user.username;
      people[label]=copy(own);
      liveNames.set(label,{id:session.user.id,username:session.user.username,nickname:engine.state.records["@profile"]?.nickname || ""});
    }
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
      liveNames.set(label, { id: name.slice(2), username: value.username, nickname:value.nickname || "" });
    }
    return {
      data: { people },
      meta: { filename: "Account", peopleCount: Object.keys(people).length },
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
    hydrate();
  }
  setupEngine();
  window.UFreeAccounts = {
    active,
    prefix,
    isLive: (name) => active() && liveNames.has(name),
    nickname: (name) => active() ? liveNames.get(name)?.nickname || "" : "",
    profile: () => { if (!session) return open(); if (!panel.open) {focusBefore=bridge.prepareDialog();panel.showModal();} profileForm(); },
    renamed: () => {},
    uiIdle: () => {
      if (needsReload) queueMicrotask(applySync);
    },
    read: () => accountRecord(),
    save: () => { throw Error("Online schedules are read-only here. Edit your schedule in Profile."); },
    clear: () => { throw Error("Online schedules are attached to accounts. Manage your followers in Profile."); },
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
    async receive() { throw Error("Cloud snapshot sharing has been removed."); },
  };
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
      active() ? "Online schedules" : "Local schedules",
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
          tr("Conflicting edits were preserved as local drafts. Review them in Profile."),
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
      if (event.key === SESSION || event.key === VIEW) location.reload();
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
    const tabs=element("div","",null,{class:"account-view-switch",role:"group","aria-label":"Schedule collection"});
    document.querySelector(".people-panel").prepend(tabs);
    for (const [value,label] of [["local","Local schedules"],["account","Online schedules"]]) {
      const tab=action(label,tabs,()=>session ? switchView(value) : value==="account" ? open() : undefined);
      tab.id=value==="local"?"localSchedulesTab":"onlineSchedulesTab";
      tab.setAttribute("aria-pressed",String(mode===value));
    }
    if (session) action("Find accounts",tabs,()=>{if(!panel.open){focusBefore=bridge.prepareDialog();panel.showModal();}searchAccounts();});
    updateCollectionLabels();
    window.addEventListener("ufree:languagechange", () => {
      updateCollectionLabels();
      renderStatus();
    });
    renderStatus();
  }
  function updateCollectionLabels() {
    if (!session) return;
    for (const parent of [
      document.querySelector(".people-panel"),
      document.getElementById("scheduleModal").querySelector("[role=dialog]"),
    ]) {
      let label = parent.querySelector(".account-collection-label");
      if (!label) {
        label = element("p", "", null, { class: "account-collection-label" });
        parent.prepend(label);
      }
      text(
        label,
        active() ? "Online schedules" : "Local schedules",
      );
    }
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
      "Local schedules are fixed copies on this device. Online shows your attached schedule and people you mutually follow.",
      main,
    );
    const controls = element("div", "", main, { class: "account-actions" });
    action("Local view", controls, () => switchView("local"));
    action("Online schedules", controls, () => switchView("account"));
    action("Refresh sync", controls, () => sync(true));

    action("Find accounts", controls, searchAccounts);
    action("Followers", controls, followingForm);
    action("Edit profile", controls, profileForm);

    action("Inbox", controls, () => inbox(true));
    action("Change password", controls, passwordForm);
    action("Sign in again", controls, () => authForm(false));
    action("Block or unblock a username", controls, blockForm);
    action("Sign out", controls, async () => {
      try {
        await request("/auth/logout", {});
      } catch {}
      localStorage.removeItem(SESSION);
      localStorage.setItem(VIEW, "local");
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
    let school, personal, consent, nickname;
    if (signup) {
      element(
        "p",
        "Your username cannot change. There is no password recovery: losing your password means losing access.",
        main,
      );
      element(
        "p",
        "Only the schedule you select as your own is attached to your account. Other Local schedules stay on this device and are never uploaded.",
        main,
      );
      element(
        "p",
        "Cloud storage is not end-to-end encrypted. Your school and personal schedule are not shared automatically.",
        main,
      );
      nickname=field("Account nickname");nickname.required=false;nickname.maxLength=60;
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
        "I confirm this is my own schedule and agree to attach it to my account.",
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
        const snapshot = signup ? bridge.snapshot() : null;
        if (signup) validateAttached(snapshot.data.people[personal.value]);
        const result = await request(
          "/auth/" + (signup ? "signup" : "login"),
          {
            username: username.value,
            password: password.value,
            ...(signup
              ? {
                  school: school.value,
                  personalSchedule: "Personal",
                  nickname: nickname.value.trim(),
                  people: {Personal:copy(snapshot.data.people[personal.value])},
                  consent: true,
                }
              : {}),
          },
          false,
        );
        // Save identity and initial queued upload before changing view. Never touch legacy Local keys.
        ready = false; // Reload before applying a different identity to the current collection bridge.
        session = result;
        localStorage.setItem(SESSION, JSON.stringify(result));
        setupEngine();

        await engine.check(true);
        if (!engine.state.initialized && !signup) {
          localStorage.setItem(VIEW, "local");
          location.reload();
          return;
        }
        localStorage.setItem(VIEW, "account");
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
  async function switchView(next) {
    if (next === mode) return;
    if (bridge.isBusy())
      throw Error("Finish the current import or export first.");
    if (next === "account" && !engine.state.initialized) {
      await engine.check(true);
      if (!engine.state.initialized)
        throw Error(engine.error || "Connect to download your account first.");
    }
    localStorage.setItem(VIEW, next);
    location.reload();
  }
  async function applySync() {
    if (!ready || !active() || !needsReload || bridge.isBusy()) return;
    needsReload = false;
    hydrate();
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
    const result = await request("/connections/inbox");
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
    if (!(result.followRequests || []).length) {
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
      active() ? "Online schedules" : "Local schedules",
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
          "You now follow each other. Personal schedules stay updated in Online schedules.",
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
        element("p", (match.nickname ? match.nickname+" · " : "")+"@" + match.username, row, { "data-no-translate": "" });
        if (match.connection?.status === "accepted") {
          element("p", "Following each other", row);

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
    element("h3", "Followers", main);
    element(
      "p",
      "Online schedules refresh when UFree opens, returns online, or you refresh sync. Offline copies may differ until synced.",
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
      element("p", (connection.nickname ? connection.nickname+" · " : "")+"@" + connection.username, row, { "data-no-translate": "" });
      element(
        "p",
        connection.status === "accepted"
          ? "Following each other"
          : connection.direction === "incoming"
            ? "This person wants to follow you."
            : "Follow request pending.",
        row,
      );

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
  function validateAttached(person) {
    if (!person || !Array.isArray(person.classes) || person.classes.length>500) throw Error("Invalid schedule.");
    for (const c of person.classes) {
      if (!c || typeof c.course!=="string" || !c.course.trim() || c.course.length>300 || !["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"].includes(c.day) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(c.start) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(c.end) || c.end<=c.start) throw Error("Every class needs a course name, day, start time and later end time.");
    }
  }
  function profileForm() {
    clear();element("h3","Edit profile",main);
    element("p","@"+session.user.username,main,{"data-no-translate":""});
    element("p","Your username cannot change. Your nickname and attached schedule update for your followers.",main);
    const nickname=field("Account nickname","text",engine.state.records["@profile"]?.nickname || session.user.nickname || "");nickname.required=false;nickname.maxLength=60;
    let parsing=false;
    let original=copy(engine.state.records["p:Personal"] || {classes:[]});
    const semester=field("Semester","text",original.semester || "");semester.required=false;semester.placeholder="Fall 2026";
    const list=element("div","",main,{class:"profile-classes"});
    const inputs=[];
    const add=(item={day:"Monday",start:"",end:"",course:""})=>{
      const row=element("fieldset","",list,{class:"profile-class"});element("legend","Class",row);
      const values={};
      for (const [key,label,type] of [["course","Course name","text"],["day","Day","select"],["start","Start time","time"],["end","End time","time"],["room","Room","text"],["instructor","Teacher","text"],["course_code","Course code","text"],["section","Section","text"]]) {
        const wrap=element("label",label,row),input=element(type==="select"?"select":"input","",wrap,{...(type==="select"?{}:{type}),"data-profile-field":key});
        if (type==="select") for(const day of ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"])element("option",day,input,{value:day});
        input.value=item[key] || "";input.required=["course","day","start","end"].includes(key);if (key==="course")input.maxLength=300;
        values[key]=input;
      }
      inputs.push({row,values,original:copy(item)});
      action("Remove class",row,()=>row.remove());
    };
    const load=(person)=>{original=copy(person);semester.value=person.semester || "";list.replaceChildren();inputs.length=0;for(const c of person.classes || [])add(c);};
    load(original);
    for (const name of engine.state.conflicts || []) {
      const draft=engine.state.records[name];
      if (name.startsWith("draft:") && draft?.classes) action("Review saved conflict draft",main,()=>load(draft));
    }
    action("Add class",main,()=>add());
    const photo=element("label","Upload your schedule picture",main),file=element("input","",photo,{type:"file",accept:"image/*"});
    file.addEventListener("change",async()=>{try {const selected=file.files?.[0];if(!selected)return;parsing=true;const parsed=await window.WhosFreeImageParser.parseScheduleImage(selected);load(parsed.person);text(status,"Check every class before saving.");}catch(error){showError(error);}finally{parsing=false;file.value="";}});
    action("Use one of my Local schedules",main,async()=>{
      const local=await bridge.localSnapshot();const wrap=element("label","Your personal schedule",main),select=element("select","",wrap);
      for(const name of Object.keys(local?.data?.people || {})) element("option",name,select,{value:name,"data-no-translate":""});
      action("Load my schedule for review",main,()=>{if(select.value)load(local.data.people[select.value]);});
    });
    formButton("Save profile",async()=>{
      if(parsing)throw Error("Wait for the picture to finish loading.");
      const classes=[];
      for (const entry of inputs.filter(x=>x.row.isConnected)) {
        for (const input of Object.values(entry.values)) if (!input.checkValidity()) {input.reportValidity();throw Error("Every class needs a course name, day, start time and later end time.");}
        const c={...entry.original};for(const [key,input] of Object.entries(entry.values)){const value=input.value.trim();if(value)c[key]=value;else delete c[key];}classes.push(c);
      }
      const person={...original,classes};
      if (semester.value.trim()) {if(!/^(Winter|Fall) 20\d{2}$/.test(semester.value.trim()))throw Error("Use Winter or Fall followed by a year.");person.semester=semester.value.trim();}else delete person.semester;
      validateAttached(person);
      if (nickname.value.trim().length>60)throw Error("Nickname must be 60 characters or fewer.");
      const values={...engine.state.records,"p:Personal":person,"@profile":{nickname:nickname.value.trim()}};
      const conflictsBefore=engine.state.conflicts.length;
      engine.save(values);session.user.nickname=nickname.value.trim();localStorage.setItem(SESSION,JSON.stringify(session));needsReload=true;
      await sync(true);
      if (engine.state.conflicts.length>conflictsBefore) {
        text(status,"Conflicting edits were preserved as local drafts. Review them in Profile.");
        const draftName=engine.state.conflicts.at(-1),draft=engine.state.records[draftName];
        if (draft?.classes) action("Review saved conflict draft",main,()=>load(draft));
      } else text(status,engine.error || "Profile saved. Pending edits stay on this device until synced.");
    });
    action("Followers",main,followingForm);
    backToAccount();
  }

  async function cloudHash() {
    if (!ready || !location.hash.startsWith("#cloud=")) return;
    try {
      await window.UFreeAccounts.receive(location.href);
      history.replaceState(null, "", location.pathname + location.search);
    } catch (error) {
      await notice(error.message);
      history.replaceState(null,"",location.pathname+location.search);
    }
  }
})();
