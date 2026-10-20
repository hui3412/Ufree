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
    needsReload = false,
    lastActivityCheck = Date.now();
  try {
    session = JSON.parse(localStorage.getItem(SESSION) || "null");
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
  async function request(path, data, auth = true) {
    const response = await fetch(API + path, {
      method: data === undefined ? "GET" : "POST",
      headers: {
        ...(data === undefined ? {} : { "Content-Type": "application/json" }),
        ...(auth && session?.token
          ? { Authorization: `Bearer ${session.token}` }
          : {}),
      },
      body: data === undefined ? undefined : JSON.stringify(data),
      credentials: "omit",
      cache: "no-store",
    });
    const body = await response.json();
    if (!response.ok)
      throw Object.assign(Error(body.error || "Cloud request failed."), {
        status: response.status,
      });
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
        Object.entries(people).map(([name, value]) => ["p:" + name, value]),
      ),
      "@preferences": preferences,
    };
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
      onSynced: () => {
        needsReload = true;
        queueMicrotask(applySync);
      },
    });
    hydrate();
  }
  setupEngine();
  window.UFreeAccounts = {
    active,
    prefix,
    uiIdle: () => {
      if (needsReload) queueMicrotask(applySync);
    },
    read: () => accountRecord(),
    save: (record) => {
      engine.save(records(record));
      return record;
    },
    clear: () => {
      engine.save({ "@preferences": prefs() });
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
    focusBefore = document.activeElement;
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
      active() ? "Import destination: Account" : "Import destination: Local",
    ];
    if (engine) {
      parts.push(`${tr("Pending changes")}: ${engine.pending()}`);
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
        sync(false).catch(showError);
        inbox().catch(showError);
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
      else if (session && event.key === key()) sync(false);
    });
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
        active() ? "Import destination: Account" : "Import destination: Local",
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
      "Local and Account are separate collections. Signing out keeps both saved copies on this device.",
      main,
    );
    const controls = element("div", "", main, { class: "account-actions" });
    action("Local view", controls, () => switchView("local"));
    action("Account view", controls, () => switchView("account"));
    action("Refresh sync", controls, () => sync(true));
    action("Copy Local to Account", controls, copyLocal);
    action("Cloud sharing", controls, sharing);
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
    clear();
    element("h3", signup ? "Create account" : "Sign in", main);
    const username = field("Username"),
      password = field("Password", "password");
    username.autocomplete = "username";
    password.autocomplete = signup ? "new-password" : "current-password";
    username.pattern = "[A-Za-z0-9_]{3,24}";
    username.maxLength = 24;
    let school, personal, consent;
    if (signup) {
      element(
        "p",
        "Your username cannot change. There is no password recovery: losing your password means losing access.",
        main,
      );
      element(
        "p",
        "Creating an account copies all existing Local schedules and preferences to your private Account collection. Your Local collection stays on this device. Later changes are separate.",
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
        "I agree to copy my Local collection to my private Account.",
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
        // Save identity and initial queued upload before changing view. Never touch legacy Local keys.
        session = result;
        localStorage.setItem(SESSION, JSON.stringify(result));
        setupEngine();
        if (signup) engine.save(records(snapshot, prefs(true)));
        await engine.check(true);
        if (!engine.state.initialized && !signup) {
          text(
            status,
            engine.error ||
              "Cloud unavailable. Retry sign-in to download the Account collection.",
          );
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
  async function copyLocal() {
    const record = await bridge.localSnapshot();
    const confirmed = await confirmDialog(
      "Copy the Local collection into Account? Existing Account schedules with the same name will be kept as separate copies.",
    );
    if (!confirmed) return;
    const values = copy(engine.state.records);
    for (const [name, value] of Object.entries(record?.data?.people || {})) {
      let label = "p:" + name,
        n = 2;
      while (
        Object.hasOwn(values, label) &&
        JSON.stringify(values[label]) !== JSON.stringify(value)
      )
        label = `p:${name} (${n++})`;
      values[label] = value;
    }
    engine.save(values);
    await sync(true);
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
      text(status, "User blocked.");
    });
    action("Unblock", main, async () => {
      await request("/blocks", { username: name.value, blocked: false });
      text(status, "User unblocked.");
    });
  }
  const warning =
    "Recipients can save, screenshot, or reshare their copy. Deleting your account does not delete their copy. Get permission before sharing someone else's schedule.";
  function sharing() {
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
    const detailLabel = element(
        "label",
        "Include course names, rooms and teachers",
        main,
      ),
      details = element("input", "", detailLabel, { type: "checkbox" });
    const selected = () =>
      Object.fromEntries(
        choices
          .filter(([, input]) => input.checked)
          .map(([name]) => [
            name,
            details.checked
              ? copy(values[name])
              : {
                  semester: values[name].semester,
                  classes: values[name].classes.map(({ day, start, end }) => ({
                    day,
                    start,
                    end,
                  })),
                },
          ]),
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
    const recipient = field("Recipient username");
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
          `${tr("Verified recipient")}: @${verified}\n${Object.keys(people).join(", ")}\n${details.checked ? tr("Includes course names, rooms and teachers.") : tr("Includes names, semester and availability only.")}\n${tr(warning)}`,
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
      dialog.showModal();
    });
  }
  async function inbox(force = false) {
    if (
      !session ||
      !ready ||
      busy ||
      (!force && Date.now() - lastInbox < 60000)
    )
      return;
    lastInbox = Date.now();
    const result = await request("/deliveries");
    if (!result.deliveries.length) {
      if (force) text(status, "No pending deliveries.");
      return;
    }
    if (!panel.open) {
      focusBefore = document.activeElement;
      panel.showModal();
    }
    clear();
    element("h3", "Incoming schedules", main);
    element(
      "p",
      active() ? "Import destination: Account" : "Import destination: Local",
      main,
    );
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
      });
    }
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
