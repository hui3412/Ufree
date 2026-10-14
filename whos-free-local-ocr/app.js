(() => {
  "use strict";

  const WORK_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
  const ALL_DAYS = [...WORK_DAYS, "Saturday", "Sunday"];

  const state = {
    data: { people: {} },
    hasData: false,
    scheduleMeta: null,
    storageBackend: "checking",
    useLiveTime: true,
    selectedDay: "Monday",
    selectedTime: "12:00",
    selectedPerson: null,
    showEveryone: false,
    theme: loadTheme(),
    loadError: null,
    isParsing: false,
    pendingImage: null,
    imagePreviewUrl: null,
    notificationsEnabled: false,
    mutedPeople: new Set(),
    nicknames: {},
    pinnedPeople: new Set(),
    accentTheme: "blue",
    lastPeopleSignature: "",
    lastDetailPerson: null,
    lastFreeCountText: "",
  };

  const LOCAL_DB_NAME = "whos-free-local";
  const LOCAL_DB_VERSION = 1;
  const LOCAL_STORE_NAME = "app";
  const LOCAL_SCHEDULE_KEY = "schedules";
  const LOCAL_STORAGE_FALLBACK_KEY = "whos-free-local-schedules";
  const NOTIFICATION_SETTINGS_KEY = "whos-free-notification-settings-v1";
  const NOTIFICATION_HISTORY_KEY = "whos-free-notification-history-v1";
  const PEOPLE_PREFERENCES_KEY = "whos-free-people-preferences-v1";
  const ACCENT_THEME_KEY = "whos-free-accent-theme-v1";
  const ACCENT_THEMES = new Set(["blue", "violet", "rose", "mint", "orange"]);
  const BREAK_THRESHOLD_MINUTES = 10;
  const APP_URL = "https://hui3412.github.io/Ufree/";

  const els = {
    root: document.documentElement,
    themeMeta: document.querySelector('meta[name="theme-color"]'),
    lightThemeButton: document.getElementById("lightThemeButton"),
    darkThemeButton: document.getElementById("darkThemeButton"),
    scheduleDataButton: document.getElementById("scheduleDataButton"),
    settingsButton: document.getElementById("settingsButton"),
    scheduleFileInput: document.getElementById("scheduleFileInput"),
    schedulePdfInput: document.getElementById("schedulePdfInput"),
    scheduleImageInput: document.getElementById("scheduleImageInput"),
    addScheduleImageButton: document.getElementById("addScheduleImageButton"),
    manualScheduleButton: document.getElementById("manualScheduleButton"),
    reviewGrid: document.getElementById("reviewGrid"),
    imageParserStatus: document.getElementById("imageParserStatus"),
    imageReview: document.getElementById("imageReview"),
    imageReviewName: document.getElementById("imageReviewName"),
    imageReviewPreview: document.getElementById("imageReviewPreview"),
    imageReviewClasses: document.getElementById("imageReviewClasses"),
    imageReviewError: document.getElementById("imageReviewError"),
    addReviewClassButton: document.getElementById("addReviewClassButton"),
    saveImageScheduleButton: document.getElementById("saveImageScheduleButton"),
    cancelImageScheduleButton: document.getElementById("cancelImageScheduleButton"),
    scheduleModal: document.getElementById("scheduleModal"),
    closeScheduleModal: document.getElementById("closeScheduleModal"),
    scheduleStorageStatus: document.getElementById("scheduleStorageStatus"),
    addSchedulePdfButton: document.getElementById("addSchedulePdfButton"),
    parserStatus: document.getElementById("parserStatus"),
    importSchedulesButton: document.getElementById("importSchedulesButton"),
    shareSchedulesButton: document.getElementById("shareSchedulesButton"),
    peopleManagerCount: document.getElementById("peopleManagerCount"),
    peopleManagerList: document.getElementById("peopleManagerList"),
    removeSchedulesButton: document.getElementById("removeSchedulesButton"),
    settingsModal: document.getElementById("settingsModal"),
    closeSettingsModal: document.getElementById("closeSettingsModal"),
    breakNotificationToggle: document.getElementById("breakNotificationToggle"),
    notificationPermissionStatus: document.getElementById("notificationPermissionStatus"),
    testNotificationButton: document.getElementById("testNotificationButton"),
    notificationPeopleCount: document.getElementById("notificationPeopleCount"),
    notificationPeopleList: document.getElementById("notificationPeopleList"),
    colorThemeGrid: document.getElementById("colorThemeGrid"),
    liveToggle: document.getElementById("liveToggle"),
    daySelect: document.getElementById("daySelect"),
    timeInput: document.getElementById("timeInput"),
    refreshButton: document.getElementById("refreshButton"),
    peopleHeading: document.getElementById("peopleHeading"),
    viewToggleButton: document.getElementById("viewToggleButton"),
    freeCount: document.getElementById("freeCount"),
    statusLine: document.getElementById("statusLine"),
    peopleList: document.getElementById("peopleList"),
    detailPanel: document.getElementById("detailPanel"),
    toast: document.getElementById("toast"),
    dataSetupTemplate: document.getElementById("dataSetupTemplate"),
  };

  function loadTheme() {
    try {
      const saved = localStorage.getItem("whos-free-theme");
      return saved === "light" || saved === "dark" ? saved : "dark";
    } catch {
      return "dark";
    }
  }

  function saveTheme(theme) {
    try {
      localStorage.setItem("whos-free-theme", theme);
    } catch {
      // Theme persistence is optional.
    }
  }

  function loadAccentTheme() {
    try {
      const saved = localStorage.getItem(ACCENT_THEME_KEY);
      return ACCENT_THEMES.has(saved) ? saved : "blue";
    } catch {
      return "blue";
    }
  }

  function saveAccentTheme(theme) {
    try {
      localStorage.setItem(ACCENT_THEME_KEY, theme);
    } catch {
      // Appearance persistence is optional.
    }
  }

  function syncThemeMeta() {
    // Match Safari/PWA chrome to the currently selected full theme.
    requestAnimationFrame(() => {
      const background = getComputedStyle(els.root).getPropertyValue("--bg").trim();
      if (background) els.themeMeta.setAttribute("content", background);
    });
  }

  function animateThemeSurfaceChange() {
    if (!canAnimate()) return;
    const surfaces = document.querySelectorAll(".control-bar, .people-panel, .detail-panel");
    window.gsap.fromTo(surfaces, { opacity: 0.96, scale: 0.998 }, { opacity: 1, scale: 1, duration: 0.22, stagger: 0.015, ease: "power1.out", clearProps: "opacity,transform" });
  }

  function applyTheme(theme) {
    state.theme = theme;
    els.root.dataset.theme = theme;
    els.lightThemeButton?.classList.toggle("active", theme === "light");
    els.darkThemeButton?.classList.toggle("active", theme === "dark");
    els.lightThemeButton?.setAttribute("aria-pressed", String(theme === "light"));
    els.darkThemeButton?.setAttribute("aria-pressed", String(theme === "dark"));
    saveTheme(theme);
    syncThemeMeta();
  }

  function applyAccentTheme(theme, animate = true) {
    const next = ACCENT_THEMES.has(theme) ? theme : "blue";
    state.accentTheme = next;
    els.root.dataset.accentTheme = next;
    saveAccentTheme(next);
    syncThemeMeta();
    if (animate) animateThemeSurfaceChange();

    if (els.colorThemeGrid) {
      for (const button of els.colorThemeGrid.querySelectorAll("[data-color-theme]")) {
        const active = button.dataset.colorTheme === next;
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", String(active));
        if (active && animate && canAnimate()) {
          window.gsap.fromTo(button, { scale: 0.97 }, { scale: 1, duration: 0.24, ease: "back.out(1.8)", clearProps: "transform" });
        }
      }
    }
  }


  function prefersReducedMotion() {
    return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  }

  function canAnimate() {
    return Boolean(window.gsap) && !prefersReducedMotion();
  }

  function animateModalOpen(backdrop, panel) {
    if (!canAnimate() || !backdrop || !panel) return;
    window.gsap.killTweensOf([backdrop, panel]);
    window.gsap.fromTo(backdrop, { opacity: 0 }, { opacity: 1, duration: 0.18, ease: "power1.out" });
    window.gsap.fromTo(
      panel,
      { opacity: 0, y: 8, scale: 0.985 },
      { opacity: 1, y: 0, scale: 1, duration: 0.24, ease: "power2.out" }
    );
  }

  function animateCardsIfNeeded(signature) {
    if (!canAnimate() || state.lastPeopleSignature === signature) return;
    const cards = Array.from(els.peopleList.querySelectorAll(".person-card"));
    if (!cards.length) return;
    window.gsap.fromTo(
      cards,
      { opacity: 0, y: 6 },
      { opacity: 1, y: 0, duration: 0.24, stagger: 0.025, ease: "power2.out", clearProps: "opacity,transform" }
    );
  }

  function animateSelectedCard() {
    if (!canAnimate()) return;
    const selected = els.peopleList.querySelector(".person-card.selected");
    if (!selected) return;
    window.gsap.fromTo(
      selected,
      { scale: 0.992 },
      { scale: 1, duration: 0.2, ease: "power2.out", clearProps: "transform" }
    );
  }

  function animateDetailIfNeeded(name) {
    if (!canAnimate() || state.lastDetailPerson === name) return;
    const children = Array.from(els.detailPanel.children);
    window.gsap.fromTo(
      children,
      { opacity: 0, y: 6 },
      { opacity: 1, y: 0, duration: 0.24, stagger: 0.035, ease: "power2.out", clearProps: "opacity,transform" }
    );
    const blocks = Array.from(els.detailPanel.querySelectorAll(".timeline-class"));
    if (blocks.length) {
      window.gsap.fromTo(
        blocks,
        { scaleX: 0, transformOrigin: "left center" },
        { scaleX: 1, duration: 0.32, stagger: 0.03, ease: "power2.out", clearProps: "transform" }
      );
    }
  }

  function animateCountIfChanged(nextText) {
    if (!canAnimate() || state.lastFreeCountText === nextText) return;
    window.gsap.fromTo(
      els.freeCount,
      { scale: 0.96 },
      { scale: 1, duration: 0.2, ease: "back.out(1.7)", clearProps: "transform" }
    );
  }

  function animateAppEntrance() {
    if (!canAnimate()) return;
    const targets = [
      document.querySelector(".brand-copy"),
      document.querySelector(".header-actions"),
      document.querySelector(".control-bar"),
      document.querySelector(".people-panel"),
      document.querySelector(".detail-panel"),
    ].filter(Boolean);
    window.gsap.fromTo(
      targets,
      { opacity: 0, y: 5 },
      { opacity: 1, y: 0, duration: 0.28, stagger: 0.035, ease: "power2.out", clearProps: "opacity,transform" }
    );
  }

  function animateSettingsContent() {
    if (!canAnimate()) return;
    const sections = Array.from(els.settingsModal.querySelectorAll(".settings-section"));
    window.gsap.fromTo(
      sections,
      { opacity: 0, y: 4 },
      { opacity: 1, y: 0, duration: 0.22, stagger: 0.035, ease: "power1.out", clearProps: "opacity,transform" }
    );
  }

  function animateRefreshFeedback() {
    if (!canAnimate()) return;
    window.gsap.fromTo(els.refreshButton, { scale: 0.97 }, { scale: 1, duration: 0.18, ease: "back.out(1.6)", clearProps: "transform" });
  }

  function loadNotificationSettings() {
    try {
      const raw = localStorage.getItem(NOTIFICATION_SETTINGS_KEY);
      if (!raw) return { enabled: false, mutedPeople: [] };
      const parsed = JSON.parse(raw);
      return {
        enabled: Boolean(parsed?.enabled),
        mutedPeople: Array.isArray(parsed?.mutedPeople) ? parsed.mutedPeople.filter(Boolean) : [],
      };
    } catch {
      return { enabled: false, mutedPeople: [] };
    }
  }

  function saveNotificationSettings() {
    try {
      localStorage.setItem(NOTIFICATION_SETTINGS_KEY, JSON.stringify({
        enabled: state.notificationsEnabled,
        mutedPeople: Array.from(state.mutedPeople).sort((a, b) => a.localeCompare(b)),
      }));
    } catch {
      // Notification preferences are best-effort local settings.
    }
  }

  function dateKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function readNotificationHistory() {
    try {
      const parsed = JSON.parse(localStorage.getItem(NOTIFICATION_HISTORY_KEY) || "null");
      if (!parsed || parsed.date !== dateKey() || !Array.isArray(parsed.keys)) {
        return { date: dateKey(), keys: [] };
      }
      return parsed;
    } catch {
      return { date: dateKey(), keys: [] };
    }
  }

  function writeNotificationHistory(history) {
    try {
      localStorage.setItem(NOTIFICATION_HISTORY_KEY, JSON.stringify(history));
    } catch {
      // Duplicate prevention is best-effort.
    }
  }

  function breakEventsForPerson(name, day) {
    const classes = classesForDay(name, day);
    const breaks = [];
    let current = classes[0];
    for (let index = 0; index < classes.length - 1; index += 1) {
      const next = classes[index + 1];
      const start = toMinutes(current.end);
      const end = toMinutes(next.start);
      const duration = end - start;
      if (duration > BREAK_THRESHOLD_MINUTES) {
        breaks.push({
          name,
          day,
          start: current.end,
          end: next.start,
          duration,
          afterClass: current,
          beforeClass: next,
        });
      }
      if (toMinutes(next.end) > toMinutes(current.end)) current = next;
    }
    return breaks;
  }

  function groupedBreaksStartingNow(now = new Date()) {
    if (!state.hasData || !ALL_DAYS.includes(now.toLocaleDateString("en-CA", { weekday: "long" }))) return [];
    const day = now.toLocaleDateString("en-CA", { weekday: "long" });
    const nowTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const due = [];

    for (const name of Object.keys(peopleMap())) {
      if (state.mutedPeople.has(name)) continue;
      for (const breakEvent of breakEventsForPerson(name, day)) {
        if (breakEvent.start === nowTime) due.push(breakEvent);
      }
    }

    return due;
  }

  function compactNameList(names) {
    if (names.length <= 3) {
      if (names.length === 1) return names[0];
      if (names.length === 2) return `${names[0]} and ${names[1]}`;
      return `${names[0]}, ${names[1]} and ${names[2]}`;
    }
    return `${names.slice(0, 3).join(", ")} +${names.length - 3} more`;
  }

  async function showSystemNotification(title, options = {}) {
    if (!("Notification" in window) || Notification.permission !== "granted") return false;

    try {
      if ("serviceWorker" in navigator) {
        const registration = await navigator.serviceWorker.ready;
        await registration.showNotification(title, options);
        return true;
      }
    } catch {
      // Fall back to the page-level Notification constructor.
    }

    try {
      const notification = new Notification(title, options);
      notification.onclick = () => {
        window.focus();
        notification.close();
      };
      return true;
    } catch {
      return false;
    }
  }

  async function sendGroupedBreakNotification(breaks) {
    if (!breaks.length) return;

    const names = breaks.map(item => displayName(item.name));
    const durations = breaks.map(item => item.duration);
    const minDuration = Math.min(...durations);
    const maxDuration = Math.max(...durations);
    const allSameEnd = breaks.every(item => item.end === breaks[0].end);

    const title = breaks.length === 1
      ? `${displayName(breaks[0].name)} is on break`
      : `${breaks.length} friends are on break`;

    let body;
    if (breaks.length === 1) {
      body = `Free for ${breaks[0].duration} min · until ${formatTime(breaks[0].end)}`;
    } else if (allSameEnd) {
      body = `${compactNameList(names)} · free until ${formatTime(breaks[0].end)}`;
    } else {
      const durationText = minDuration === maxDuration ? `${minDuration} min` : `${minDuration}–${maxDuration} min`;
      body = `${compactNameList(names)} · breaks ${durationText}`;
    }

    await showSystemNotification(title, {
      body,
      icon: "./assets/icon-192.png?v=83",
      badge: "./assets/icon-192.png?v=83",
      tag: `whos-free-break-${dateKey()}-${breaks[0].start}`,
      data: { url: "./" },
    });
  }

  async function checkBreakNotifications() {
    if (!state.notificationsEnabled || !state.hasData || !("Notification" in window) || Notification.permission !== "granted") return;

    const due = groupedBreaksStartingNow();
    if (!due.length) return;

    const history = readNotificationHistory();
    const known = new Set(history.keys);
    const unseen = due.filter(item => !known.has(`${item.name}|${item.day}|${item.start}|${item.end}`));
    if (!unseen.length) return;

    await sendGroupedBreakNotification(unseen);

    for (const item of unseen) {
      known.add(`${item.name}|${item.day}|${item.start}|${item.end}`);
    }
    history.date = dateKey();
    history.keys = Array.from(known);
    writeNotificationHistory(history);
  }

  function notificationSupportText() {
    if (!("Notification" in window)) {
      return { tone: "error", text: "Notifications are not supported in this browser. On iPhone, add UFree to the Home Screen and open it from there." };
    }
    if (Notification.permission === "denied") {
      return { tone: "error", text: "Notifications are blocked. Re-enable them in your browser or device settings." };
    }
    if (Notification.permission === "granted") {
      return { tone: "success", text: state.notificationsEnabled ? "Break notifications are on." : "Notification permission is ready. Turn alerts on whenever you want." };
    }
    return { tone: "neutral", text: "Turn alerts on to let UFree ask for notification permission." };
  }

  async function handleNotificationToggle() {
    const requested = els.breakNotificationToggle.checked;

    if (!requested) {
      state.notificationsEnabled = false;
      saveNotificationSettings();
      updateSettingsModal();
      showToast("Break notifications turned off");
      return;
    }

    if (!("Notification" in window)) {
      state.notificationsEnabled = false;
      els.breakNotificationToggle.checked = false;
      updateSettingsModal();
      showToast("Notifications are not supported here");
      return;
    }

    let permission = Notification.permission;
    if (permission === "default") {
      try {
        permission = await Notification.requestPermission();
      } catch {
        permission = Notification.permission;
      }
    }

    state.notificationsEnabled = permission === "granted";
    saveNotificationSettings();
    updateSettingsModal();

    if (state.notificationsEnabled) {
      showToast("Long break notifications are on");
      checkBreakNotifications();
    } else {
      showToast(permission === "denied" ? "Notifications were blocked" : "Notification permission was not granted");
    }
  }

  async function sendTestNotification() {
    if (!("Notification" in window) || Notification.permission !== "granted") {
      showToast("Turn notifications on first");
      return;
    }
    const ok = await showSystemNotification("UFree notifications work", {
      body: "You'll get grouped alerts when friends start breaks longer than 10 minutes.",
      icon: "./assets/icon-192.png?v=83",
      badge: "./assets/icon-192.png?v=83",
      tag: "whos-free-test",
      data: { url: "./" },
    });
    showToast(ok ? "Test notification sent" : "Could not show a notification");
  }

  function togglePersonMute(name, button = null) {
    if (state.mutedPeople.has(name)) state.mutedPeople.delete(name);
    else state.mutedPeople.add(name);
    saveNotificationSettings();
    updateSettingsModal();

    if (canAnimate() && button) {
      window.gsap.fromTo(button, { scale: 0.84, rotate: -8 }, { scale: 1, rotate: 0, duration: 0.28, ease: "back.out(2)", clearProps: "transform" });
    }
  }

  function renderNotificationPeople() {
    const names = Object.keys(peopleMap()).sort(comparePeopleNames);
    els.notificationPeopleCount.textContent = String(names.length);
    els.notificationPeopleList.replaceChildren();

    if (!names.length) {
      const empty = document.createElement("p");
      empty.className = "people-manager-empty";
      empty.textContent = "Add a schedule before personalizing people.";
      els.notificationPeopleList.append(empty);
      return;
    }

    for (const name of names) {
      const muted = state.mutedPeople.has(name);
      const pinned = state.pinnedPeople.has(name);
      const nickname = state.nicknames[name] || "";
      const row = document.createElement("div");
      row.className = `notification-person-row people-preference-card${pinned ? " pinned" : ""}`;

      const top = document.createElement("div");
      top.className = "people-preference-top";

      const copy = document.createElement("div");
      copy.className = "notification-person-copy";

      const title = document.createElement("div");
      title.className = "notification-person-name";
      title.textContent = displayName(name);

      const meta = document.createElement("div");
      meta.className = "notification-person-meta";
      const longBreaks = ALL_DAYS.reduce((count, day) => count + breakEventsForPerson(name, day).length, 0);
      const parts = [];
      if (nickname) parts.push(name);
      parts.push(pinned ? "Pinned to top" : `${longBreaks} long break${longBreaks === 1 ? "" : "s"}`);
      if (muted) parts.push("alerts muted");
      meta.textContent = parts.join(" · ");
      copy.append(title, meta);

      const actions = document.createElement("div");
      actions.className = "people-preference-actions";

      const pin = document.createElement("button");
      pin.type = "button";
      pin.className = `preference-icon-button pin-button${pinned ? " active" : ""}`;
      pin.textContent = "📌";
      pin.setAttribute("aria-pressed", String(pinned));
      pin.setAttribute("aria-label", pinned ? `Unpin ${displayName(name)}` : `Pin ${displayName(name)} to the top`);
      pin.title = pinned ? "Unpin" : "Pin to top";
      pin.addEventListener("click", () => togglePersonPin(name, pin));

      const bell = document.createElement("button");
      bell.type = "button";
      bell.className = `bell-button${muted ? " muted" : ""}`;
      bell.textContent = muted ? "🔕" : "🔔";
      bell.setAttribute("aria-pressed", String(muted));
      bell.setAttribute("aria-label", muted ? `Unmute break notifications for ${displayName(name)}` : `Mute break notifications for ${displayName(name)}`);
      bell.title = muted ? "Unmute break notifications" : "Mute break notifications";
      bell.addEventListener("click", () => togglePersonMute(name, bell));

      actions.append(pin, bell);
      top.append(copy, actions);

      const nicknameRow = document.createElement("label");
      nicknameRow.className = "nickname-row";
      const nicknameLabel = document.createElement("span");
      nicknameLabel.className = "nickname-label";
      nicknameLabel.textContent = "Nickname";
      const input = document.createElement("input");
      input.type = "text";
      input.className = "nickname-input";
      input.maxLength = 30;
      input.placeholder = "Use full name";
      input.value = nickname;
      input.autocomplete = "off";
      input.spellcheck = false;
      input.setAttribute("aria-label", `Nickname for ${name}`);

      const saveValue = () => {
        const next = input.value.trim();
        const before = state.nicknames[name] || "";
        if (next === before) return;
        setNickname(name, next);
        showToast(next ? `Nickname saved: ${next}` : `Showing ${name}`);
      };
      input.addEventListener("change", saveValue);
      input.addEventListener("keydown", event => {
        if (event.key === "Enter") {
          event.preventDefault();
          input.blur();
        }
      });

      nicknameRow.append(nicknameLabel, input);
      row.append(top, nicknameRow);
      els.notificationPeopleList.append(row);
    }

    if (canAnimate()) {
      const rows = Array.from(els.notificationPeopleList.querySelectorAll(".people-preference-card"));
      window.gsap.fromTo(rows, { opacity: 0, y: 4 }, { opacity: 1, y: 0, duration: 0.2, stagger: 0.018, ease: "power1.out", clearProps: "opacity,transform" });
    }
  }

  function updateSettingsModal() {
    if (!els.settingsModal) return;

    els.breakNotificationToggle.checked = state.notificationsEnabled;
    const support = notificationSupportText();
    els.notificationPermissionStatus.textContent = support.text;
    els.notificationPermissionStatus.dataset.tone = support.tone;
    els.testNotificationButton.disabled = !("Notification" in window) || Notification.permission !== "granted";

    applyTheme(state.theme);
    applyAccentTheme(state.accentTheme, false);
    renderNotificationPeople();
  }

  function openSettingsModal() {
    updateSettingsModal();
    els.settingsModal.hidden = false;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => {
      animateModalOpen(els.settingsModal, els.settingsModal.querySelector(".settings-modal"));
      animateSettingsContent();
      els.closeSettingsModal.focus();
    });
  }

  function closeSettingsModal() {
    els.settingsModal.hidden = true;
    if (els.scheduleModal.hidden) document.body.style.overflow = "";
  }

  function toMinutes(hhmm) {
    if (typeof hhmm !== "string" || !/^\d{2}:\d{2}$/.test(hhmm)) return NaN;
    const [hour, minute] = hhmm.split(":").map(Number);
    if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return NaN;
    return hour * 60 + minute;
  }

  function formatTime(hhmm) {
    const minutes = toMinutes(hhmm);
    if (!Number.isFinite(minutes)) return hhmm || "";
    const hour24 = Math.floor(minutes / 60);
    const minute = minutes % 60;
    const period = hour24 >= 12 ? "PM" : "AM";
    const hour12 = hour24 % 12 || 12;
    return `${hour12}:${String(minute).padStart(2, "0")} ${period}`;
  }

  function shortTime(hhmm) {
    const minutes = toMinutes(hhmm);
    if (!Number.isFinite(minutes)) return hhmm || "";
    const hour24 = Math.floor(minutes / 60);
    const minute = minutes % 60;
    const hour12 = hour24 % 12 || 12;
    return `${hour12}:${String(minute).padStart(2, "0")}`;
  }

  function classLabel(c) {
    const title = c?.course || c?.course_code || "Class";
    return c?.room ? `${title} · ${c.room}` : title;
  }

  function shortClassLabel(c) {
    return String(c?.course_code || c?.course || "Class").slice(0, 18);
  }

  function peopleMap() {
    return state.data?.people && typeof state.data.people === "object" ? state.data.people : {};
  }

  function loadPeoplePreferences() {
    try {
      const raw = localStorage.getItem(PEOPLE_PREFERENCES_KEY);
      if (!raw) return { nicknames: {}, pinnedPeople: [] };
      const parsed = JSON.parse(raw);
      const nicknames = parsed?.nicknames && typeof parsed.nicknames === "object" && !Array.isArray(parsed.nicknames)
        ? parsed.nicknames
        : {};
      const pinnedPeople = Array.isArray(parsed?.pinnedPeople) ? parsed.pinnedPeople.filter(Boolean) : [];
      return { nicknames, pinnedPeople };
    } catch {
      return { nicknames: {}, pinnedPeople: [] };
    }
  }

  function savePeoplePreferences() {
    try {
      localStorage.setItem(PEOPLE_PREFERENCES_KEY, JSON.stringify({
        nicknames: state.nicknames,
        pinnedPeople: Array.from(state.pinnedPeople),
      }));
    } catch {
      // Personalization is best-effort local state.
    }
  }

  function cleanPeoplePreferences() {
    const valid = new Set(Object.keys(peopleMap()));
    let changed = false;
    for (const name of Object.keys(state.nicknames)) {
      if (!valid.has(name)) {
        delete state.nicknames[name];
        changed = true;
      }
    }
    for (const name of Array.from(state.pinnedPeople)) {
      if (!valid.has(name)) {
        state.pinnedPeople.delete(name);
        changed = true;
      }
    }
    if (changed) savePeoplePreferences();
  }

  function displayName(name) {
    const nickname = String(state.nicknames[name] || "").trim();
    return nickname || name;
  }

  function comparePeopleNames(a, b) {
    const pinnedA = state.pinnedPeople.has(a);
    const pinnedB = state.pinnedPeople.has(b);
    if (pinnedA !== pinnedB) return pinnedA ? -1 : 1;
    return displayName(a).localeCompare(displayName(b), undefined, { sensitivity: "base" });
  }

  function setNickname(name, value) {
    const next = String(value || "").trim().slice(0, 30);
    if (next) state.nicknames[name] = next;
    else delete state.nicknames[name];
    savePeoplePreferences();
    updateScheduleModal();
    updateSettingsModal();
    refresh({ preserveScroll: true });
  }

  function togglePersonPin(name, button = null) {
    if (state.pinnedPeople.has(name)) state.pinnedPeople.delete(name);
    else state.pinnedPeople.add(name);
    savePeoplePreferences();
    updateSettingsModal();
    refresh({ preserveScroll: true });
    if (button && canAnimate()) {
      window.gsap.fromTo(button, { scale: 0.8, rotate: -7 }, { scale: 1, rotate: 0, duration: 0.3, ease: "back.out(2)", clearProps: "transform" });
    }
  }

  function classesForDay(name, day) {
    const person = peopleMap()[name] || {};
    const classes = Array.isArray(person.classes) ? person.classes : [];
    return classes
      .filter(c => c && c.day === day && Number.isFinite(toMinutes(c.start)) && Number.isFinite(toMinutes(c.end)))
      .slice()
      .sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
  }

  function currentClass(name, day, minute) {
    for (const c of classesForDay(name, day)) {
      if (toMinutes(c.start) <= minute && minute < toMinutes(c.end)) return c;
    }
    return null;
  }

  function isFree(name, day, minute) {
    if (!ALL_DAYS.includes(day)) return true;
    return currentClass(name, day, minute) === null;
  }

  function previousClasses(name, day, minute) {
    if (!ALL_DAYS.includes(day)) return [];
    return classesForDay(name, day).filter(c => toMinutes(c.end) <= minute);
  }

  function nextClassToday(name, day, minute) {
    if (!ALL_DAYS.includes(day)) return null;
    return classesForDay(name, day).find(c => toMinutes(c.start) > minute) || null;
  }

  function nextClassInWeek(name, day, minute) {
    const person = peopleMap()[name] || {};
    if (!Array.isArray(person.classes) || person.classes.length === 0) return null;

    const selectedIndex = ALL_DAYS.indexOf(day);
    if (selectedIndex < 0) return null;

    for (let daysAhead = 0; daysAhead < 8; daysAhead += 1) {
      const candidateDay = ALL_DAYS[(selectedIndex + daysAhead) % 7];
      if (!ALL_DAYS.includes(candidateDay)) continue;

      for (const c of classesForDay(name, candidateDay)) {
        if (daysAhead === 0 && toMinutes(c.start) <= minute) continue;
        return { day: candidateDay, classItem: c, daysAhead };
      }
    }
    return null;
  }

  function setLiveValues() {
    const now = new Date();
    const day = now.toLocaleDateString("en-CA", { weekday: "long" });
    state.selectedDay = ALL_DAYS.includes(day) ? day : "Monday";
    state.selectedTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    els.daySelect.value = state.selectedDay;
    els.timeInput.value = state.selectedTime;
  }

  function syncLiveControls() {
    els.liveToggle.checked = state.useLiveTime;
    els.daySelect.disabled = state.useLiveTime;
    els.timeInput.disabled = state.useLiveTime;
  }

  function selectedMoment() {
    const day = els.daySelect.value;
    const time = els.timeInput.value;
    const minute = toMinutes(time);
    if (!ALL_DAYS.includes(day) || !Number.isFinite(minute)) return null;
    state.selectedDay = day;
    state.selectedTime = time;
    return { day, minute };
  }

  function visiblePeople(day, minute) {
    const people = Object.keys(peopleMap()).sort(comparePeopleNames);
    const free = people.filter(name => isFree(name, day, minute)).sort(comparePeopleNames);
    const freeSet = new Set(free);
    const busy = people.filter(name => !freeSet.has(name)).sort(comparePeopleNames);

    if (!state.showEveryone) return { free, busy, visible: free };

    const pinned = people.filter(name => state.pinnedPeople.has(name));
    const pinnedSet = new Set(pinned);
    const remainingFree = free.filter(name => !pinnedSet.has(name));
    const remainingBusy = busy.filter(name => !pinnedSet.has(name));
    return { free, busy, visible: [...pinned, ...remainingFree, ...remainingBusy] };
  }

  function showToast(message) {
    els.toast.textContent = message;
    els.toast.hidden = false;
    if (canAnimate()) {
      window.gsap.killTweensOf(els.toast);
      window.gsap.fromTo(
        els.toast,
        { opacity: 0, y: 8, scale: 0.985 },
        { opacity: 1, y: 0, scale: 1, duration: 0.2, ease: "power2.out", clearProps: "transform" }
      );
    }
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => {
      if (canAnimate()) {
        window.gsap.to(els.toast, {
          opacity: 0,
          y: 5,
          duration: 0.15,
          ease: "power1.in",
          onComplete: () => {
            els.toast.hidden = true;
            window.gsap.set(els.toast, { clearProps: "opacity,transform" });
          },
        });
      } else {
        els.toast.hidden = true;
      }
    }, 2600);
  }

  function createEmptyList(headline, detail) {
    const wrap = document.createElement("div");
    wrap.className = "empty-list";
    wrap.innerHTML = `<h3></h3><p></p>`;
    wrap.querySelector("h3").textContent = headline;
    wrap.querySelector("p").textContent = detail;
    return wrap;
  }

  function renderDataSetup() {
    els.peopleHeading.textContent = "Schedules";
    els.freeCount.textContent = "Local only";
    els.statusLine.textContent = state.loadError
      ? "Schedule data needs your attention."
      : "Add a schedule PDF or import a shared database.";
    els.viewToggleButton.disabled = true;
    els.peopleList.replaceChildren();

    const fragment = els.dataSetupTemplate.content.cloneNode(true);
    const title = fragment.querySelector(".data-setup-title");
    const message = fragment.querySelector(".data-setup-message");

    if (state.loadError) {
      title.textContent = "Couldn't load that file";
      message.textContent = state.loadError;
    }

    fragment.querySelector(".choose-schedules").addEventListener("click", chooseScheduleFile);
    fragment.querySelector(".add-pdf").addEventListener("click", chooseSchedulePdf);
    fragment.querySelector(".add-picture").addEventListener("click", chooseScheduleImage);
    els.peopleList.append(fragment);
    renderEmptyDetail();
  }

  function chooseScheduleFile() {
    // Clearing the value allows choosing the same file again after replacing it.
    els.scheduleFileInput.value = "";
    els.scheduleFileInput.click();
  }

  function chooseSchedulePdf() {
    // A real file picker must be opened directly from the user's click/tap.
    // showPicker() is more reliable in Safari/iOS PWAs; click() remains the fallback.
    els.schedulePdfInput.value = "";
    try {
      if (typeof els.schedulePdfInput.showPicker === "function") {
        els.schedulePdfInput.showPicker();
        return;
      }
    } catch (error) {
      console.warn("showPicker() was unavailable; falling back to click().", error);
    }
    els.schedulePdfInput.click();
  }

  function chooseScheduleImage() {
    if (state.isParsing || state.pendingImage) return;
    els.scheduleImageInput.value = "";
    els.scheduleImageInput.click();
  }

  function setImageStatus(message, tone = "working") {
    els.imageParserStatus.textContent = message;
    els.imageParserStatus.dataset.tone = tone;
  }

  function addReviewClass(item = {}) {
    const card = document.createElement("fieldset");
    card.className = "review-class";
    card.dataset.kind = item.kind || "class";
    if (item.review_warning) card.dataset.warning = item.review_warning;
    const legend = document.createElement("legend");
    legend.textContent = item.review_warning || "Edit busy block — only the day and times are required";
    card.append(legend);
    for (const [key, label, type] of [["day", "Day", "select"], ["start", "Starts", "time"], ["end", "Ends", "time"], ["course", "Label (optional)", "text"], ["course_code", "Course code", "text"], ["section", "Section", "text"], ["room", "Room", "text"], ["instructor", "Instructor", "text"]]) {
      const wrapper = document.createElement("label");
      wrapper.className = "field-group";
      const caption = document.createElement("span");
      caption.textContent = label;
      const input = document.createElement(type === "select" ? "select" : "input");
      if (type === "select") for (const day of ALL_DAYS) {
        const option = document.createElement("option");
        option.value = day;
        option.textContent = day;
        input.append(option);
      }
      else input.type = type;
      input.dataset.field = key;
      input.value = item[key] || (key === "day" ? "Monday" : "");
      if (["start", "end"].includes(key)) { input.required = true; input.step = "60"; }
      if (type === "text") input.maxLength = 200;
      wrapper.append(caption, input);
      card.append(wrapper);
    }
    const remove = document.createElement("button");
    remove.className = "mini-danger-button";
    remove.type = "button";
    remove.textContent = "Remove busy block";
    remove.addEventListener("click", () => { card.remove(); const first = els.imageReviewClasses.querySelector(".review-class"); if (first) selectReviewCard(first); renderReviewGrid(); });
    card.append(remove);
    els.imageReviewClasses.append(card);
    card.addEventListener("input", renderReviewGrid);
    card.addEventListener("change", renderReviewGrid);
    selectReviewCard(card);
    renderReviewGrid();
  }

  function reviewValue(card, field) {
    return card.querySelector(`[data-field="${field}"]`).value;
  }

  function selectReviewCard(card) {
    els.imageReviewClasses.querySelectorAll(".review-class").forEach(item => { item.hidden = item !== card; });
  }

  function renderReviewGrid() {
    const cards = [...els.imageReviewClasses.querySelectorAll(".review-class")];
    const valid = cards.filter(card => /^\d{2}:\d{2}$/.test(reviewValue(card, "start")) && /^\d{2}:\d{2}$/.test(reviewValue(card, "end")) && toMinutes(reviewValue(card, "end")) > toMinutes(reviewValue(card, "start")));
    const first = Math.min(480, ...valid.map(card => Math.floor(toMinutes(reviewValue(card, "start")) / 60) * 60));
    const last = Math.max(1200, ...valid.map(card => Math.ceil(toMinutes(reviewValue(card, "end")) / 60) * 60));
    els.reviewGrid.replaceChildren();
    const axis = document.createElement("div");
    axis.className = "review-time-axis";
    const clock = minute => `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
    for (let time = first; time <= last; time += 60) {
      const label = document.createElement("span");
      label.textContent = clock(time);
      label.style.top = `${time - first + 48}px`;
      axis.append(label);
    }
    els.reviewGrid.append(axis);
    for (const day of ALL_DAYS) {
      const column = document.createElement("div");
      column.className = "review-day";
      const add = document.createElement("button");
      add.type = "button";
      add.className = "review-day-heading";
      add.textContent = `${day} +`;
      add.setAttribute("aria-label", `Add busy block on ${day}`);
      add.addEventListener("click", () => addReviewClass({ day, start: "08:15", end: "09:35", kind: "busy_block" }));
      const track = document.createElement("div");
      track.className = "review-day-track";
      track.style.height = `${last - first}px`;
      const entries = valid.filter(card => reviewValue(card, "day") === day).sort((a, b) => toMinutes(reviewValue(a, "start")) - toMinutes(reviewValue(b, "start")));
      let occupiedUntil = null;
      for (const card of entries) {
        const start = toMinutes(reviewValue(card, "start"));
        const end = toMinutes(reviewValue(card, "end"));
        if (occupiedUntil !== null && start > occupiedUntil) {
          const gap = document.createElement("div");
          gap.className = "review-break";
          gap.style.top = `${occupiedUntil - first}px`;
          gap.style.height = `${start - occupiedUntil}px`;
          gap.textContent = `Break ${start - occupiedUntil} min`;
          gap.title = `${day} break ${clock(occupiedUntil)}–${clock(start)}`;
          track.append(gap);
        }
        const block = document.createElement("button");
        block.type = "button";
        block.className = "review-grid-block";
        block.style.top = `${start - first}px`;
        block.style.height = `${end - start}px`;
        block.textContent = `${card.dataset.warning ? "⚠ " : ""}${clock(start)}–${clock(end)} ${reviewValue(card, "course") || "Busy block"}`;
        block.title = `${day} ${block.textContent}. ${card.dataset.warning || "Select to edit."}`;
        block.setAttribute("aria-label", block.title);
        block.addEventListener("click", () => { selectReviewCard(card); card.scrollIntoView?.({ block: "nearest" }); card.querySelector('[data-field="course"]').focus(); });
        track.append(block);
        occupiedUntil = Math.max(occupiedUntil ?? end, end);
      }
      column.append(add, track);
      els.reviewGrid.append(column);
    }
  }

  function openManualSchedule(name = "", person = { source_file: "manual", classes: [] }) {
    if (state.isParsing || state.pendingImage) return;
    state.pendingImage = { name, person };
    els.imageReviewName.value = name;
    els.imageReviewClasses.replaceChildren();
    els.imageReviewPreview.closest("details").hidden = true;
    person.classes.forEach(addReviewClass);
    renderReviewGrid();
    els.imageReview.hidden = false;
    openScheduleModal();
    updateScheduleModal();
    setImageStatus("Add busy times using a day’s + button. Empty time is free; labels are optional.", "success");
    els.imageReviewName.focus();
  }

  function clearImageReview() {
    state.pendingImage = null;
    if (state.imagePreviewUrl) URL.revokeObjectURL(state.imagePreviewUrl);
    state.imagePreviewUrl = null;
    els.imageReviewPreview.removeAttribute("src");
    els.imageReviewClasses.replaceChildren();
    els.imageReview.hidden = true;
    els.imageReviewError.textContent = "";
    updateScheduleModal();
  }

  async function handleScheduleImage(event) {
    const file = event.target.files?.[0];
    if (!file || state.isParsing || state.pendingImage) return;
    if (els.scheduleModal.hidden) openScheduleModal();
    state.isParsing = true;
    updateScheduleModal();
    setImageStatus("Reading the picture on this device…");
    try {
      const result = await window.WhosFreeImageParser.parseScheduleImage(file, { onProgress: message => setImageStatus(message) });
      state.pendingImage = result;
      state.imagePreviewUrl = URL.createObjectURL(file);
      els.imageReviewPreview.src = state.imagePreviewUrl;
      els.imageReviewPreview.closest("details").hidden = false;
      els.imageReviewName.value = result.name || "";
      els.imageReviewClasses.replaceChildren();
      result.person.classes.forEach(addReviewClass);
      selectReviewCard(els.imageReviewClasses.querySelector(".review-class"));
      els.imageReview.hidden = false;
      if (els.scheduleModal.hidden) openScheduleModal();
      const busyCount = result.person.classes.filter(item => item.kind === "busy_block").length;
      setImageStatus(`${result.person.classes.length - busyCount} classes${busyCount ? ` and ${busyCount} other busy blocks` : ""} recognized. Check the schedule below before saving.`, "success");
      document.getElementById("imageReviewTitle").focus();
    } catch (error) {
      if (state.pendingImage) clearImageReview();
      setImageStatus(error.message || "The picture could not be read. Try a clear screenshot.", "error");
    } finally {
      state.isParsing = false;
      event.target.value = "";
      updateScheduleModal();
    }
  }

  async function saveImageSchedule() {
    if (!state.pendingImage || state.isParsing) return;
    els.imageReviewError.textContent = "";
    const name = els.imageReviewName.value.trim();
    if (!name) { els.imageReviewError.textContent = "Enter the person's name before saving."; els.imageReviewName.focus(); return; }
    const classes = [...els.imageReviewClasses.querySelectorAll(".review-class")].map(card => ({ ...Object.fromEntries(
      [...card.querySelectorAll("[data-field]")].map(input => [input.dataset.field, input.value.trim() || null])
    ), kind: card.dataset.kind || "class" }));
    // An empty manual schedule represents someone with no busy times.
    const workingData = state.hasData ? JSON.parse(JSON.stringify(state.data)) : { schema_version: 1, people: {} };
    const replacement = Object.prototype.hasOwnProperty.call(workingData.people, name);
    // Define an own property safely even if a person's name is __proto__.
    Object.defineProperty(workingData.people, name, { value: { source_file: state.pendingImage.person.source_file, classes }, writable: true, enumerable: true, configurable: true });
    try { validateData(workingData); }
    catch (error) { els.imageReviewError.textContent = error.message; return; }
    if (replacement && !window.confirm(`Replace the existing schedule for ${name} with these reviewed classes?`)) return;
    state.isParsing = true;
    updateScheduleModal();
    try {
      state.data = workingData;
      state.selectedPerson = name;
      const warning = await persistCurrentDatabase("Local schedule collection");
      clearImageReview();
      setImageStatus(`Saved ${classes.length} schedule entries for ${name} on this device.`, "success");
      showToast(warning || `Saved ${name}'s schedule`);
    } catch (error) { els.imageReviewError.textContent = error.message; }
    finally { state.isParsing = false; updateScheduleModal(); }
  }

  function openLocalDatabase() {
    return new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) {
        reject(new Error("IndexedDB is unavailable."));
        return;
      }

      const request = indexedDB.open(LOCAL_DB_NAME, LOCAL_DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(LOCAL_STORE_NAME)) {
          db.createObjectStore(LOCAL_STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Could not open local storage."));
    });
  }

  async function idbGet(key) {
    const db = await openLocalDatabase();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(LOCAL_STORE_NAME, "readonly");
        const request = tx.objectStore(LOCAL_STORE_NAME).get(key);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error("Could not read local schedule data."));
      });
    } finally {
      db.close();
    }
  }

  async function idbSet(key, value) {
    const db = await openLocalDatabase();
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(LOCAL_STORE_NAME, "readwrite");
        tx.objectStore(LOCAL_STORE_NAME).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error("Could not save local schedule data."));
        tx.onabort = () => reject(tx.error || new Error("Could not save local schedule data."));
      });
    } finally {
      db.close();
    }
  }

  async function idbDelete(key) {
    const db = await openLocalDatabase();
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(LOCAL_STORE_NAME, "readwrite");
        tx.objectStore(LOCAL_STORE_NAME).delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error("Could not remove local schedule data."));
        tx.onabort = () => reject(tx.error || new Error("Could not remove local schedule data."));
      });
    } finally {
      db.close();
    }
  }

  function fallbackRead() {
    const raw = localStorage.getItem(LOCAL_STORAGE_FALLBACK_KEY);
    return raw ? JSON.parse(raw) : null;
  }

  function fallbackWrite(value) {
    localStorage.setItem(LOCAL_STORAGE_FALLBACK_KEY, JSON.stringify(value));
  }

  function fallbackDelete() {
    localStorage.removeItem(LOCAL_STORAGE_FALLBACK_KEY);
  }

  async function readLocalScheduleRecord() {
    try {
      const record = await idbGet(LOCAL_SCHEDULE_KEY);
      state.storageBackend = "indexeddb";
      return record || null;
    } catch {
      try {
        const record = fallbackRead();
        state.storageBackend = "localstorage";
        return record;
      } catch {
        state.storageBackend = "memory";
        return null;
      }
    }
  }

  async function saveLocalScheduleRecord(record) {
    try {
      await idbSet(LOCAL_SCHEDULE_KEY, record);
      state.storageBackend = "indexeddb";
      return;
    } catch {
      try {
        fallbackWrite(record);
        state.storageBackend = "localstorage";
        return;
      } catch {
        state.storageBackend = "memory";
        throw new Error("This browser would not allow the app to save a local copy. The schedules will work until the page is closed, but may need to be selected again later.");
      }
    }
  }

  async function deleteLocalScheduleRecord() {
    let removed = false;
    try {
      await idbDelete(LOCAL_SCHEDULE_KEY);
      removed = true;
    } catch {
      // Try fallback storage too.
    }
    try {
      fallbackDelete();
      removed = true;
    } catch {
      // Nothing else to remove.
    }
    return removed;
  }

  function validateData(data) {
    if (!data || typeof data !== "object" || !data.people || typeof data.people !== "object" || Array.isArray(data.people)) {
      throw new Error("This JSON does not contain a valid 'people' schedule database.");
    }

    for (const [name, person] of Object.entries(data.people)) {
      if (!person || typeof person !== "object") {
        throw new Error(`The schedule entry for ${name} is not valid.`);
      }
      if (person.classes !== undefined && !Array.isArray(person.classes)) {
        throw new Error(`The classes for ${name} are not in the expected format.`);
      }
      for (const classItem of person.classes || []) {
        if (!classItem || typeof classItem !== "object") {
          throw new Error(`A class for ${name} is not valid.`);
        }
        if (!ALL_DAYS.includes(classItem.day)) {
          throw new Error(`A class for ${name} has an invalid day.`);
        }
        const start = toMinutes(classItem.start);
        const end = toMinutes(classItem.end);
        if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
          throw new Error(`A class for ${name} has an invalid start or end time.`);
        }
      }
    }
  }

  function makeScheduleMeta(file, data) {
    return {
      filename: file?.name || "schedules.json",
      importedAt: new Date().toISOString(),
      peopleCount: Object.keys(data.people || {}).length,
    };
  }

  async function requestPersistentStorage() {
    try {
      if (navigator.storage?.persist) await navigator.storage.persist();
    } catch {
      // Persistence requests are optional and browser-controlled.
    }
  }

  function makeCollectionMeta(data, label = "Local schedule collection") {
    return {
      filename: label,
      importedAt: new Date().toISOString(),
      peopleCount: Object.keys(data.people || {}).length,
    };
  }

  async function persistCurrentDatabase(label = "Local schedule collection") {
    validateData(state.data);
    const meta = makeCollectionMeta(state.data, label);
    const record = { data: state.data, meta };
    let storageWarning = null;
    try {
      await saveLocalScheduleRecord(record);
      await requestPersistentStorage();
    } catch (error) {
      storageWarning = error.message;
    }
    state.hasData = true;
    state.scheduleMeta = meta;
    state.loadError = null;
    updateScheduleModal();
    updateSettingsModal();
    refresh({ preserveScroll: true });
    return storageWarning;
  }

  function setParserStatus(message, tone = "") {
    els.parserStatus.textContent = message || "";
    els.parserStatus.dataset.tone = tone;
  }

  async function parsePdfWithNameFallback(file) {
    try {
      return await window.WhosFreeParser.parseSchedulePdf(file);
    } catch (error) {
      if (error?.code !== "NAME_NOT_FOUND") throw error;
      const fallback = window.prompt(`Who's schedule is ${file.name}? Enter the student's name:`);
      if (!fallback?.trim()) throw new Error("The student's name is required to add this schedule.");
      return window.WhosFreeParser.parseSchedulePdf(file, { nameOverride: fallback.trim() });
    }
  }

  async function handleSchedulePdfs(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    if (els.scheduleModal.hidden) openScheduleModal();

    if (!window.WhosFreeParser?.parseSchedulePdf) {
      setParserStatus("The PDF parser did not load. Refresh the page and try again.", "error");
      event.target.value = "";
      return;
    }

    state.isParsing = true;
    els.addSchedulePdfButton.disabled = true;
    els.importSchedulesButton.disabled = true;
    els.shareSchedulesButton.disabled = true;
    setParserStatus(`Reading ${files.length === 1 ? files[0].name : `${files.length} schedule PDFs`}…`, "working");

    const workingData = state.hasData
      ? JSON.parse(JSON.stringify(state.data))
      : { schema_version: 1, people: {} };
    if (!workingData.schema_version) workingData.schema_version = 1;
    if (!workingData.people || typeof workingData.people !== "object") workingData.people = {};

    let added = 0;
    let updated = 0;
    const failures = [];

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      setParserStatus(`Reading ${file.name} (${index + 1} of ${files.length})…`, "working");
      try {
        const parsed = await parsePdfWithNameFallback(file);
        if (Object.prototype.hasOwnProperty.call(workingData.people, parsed.name)) updated += 1;
        else added += 1;
        workingData.people[parsed.name] = parsed.person;
      } catch (error) {
        failures.push(`${file.name}: ${error.message}`);
      }
    }

    if (added || updated) {
      state.data = workingData;
      state.selectedPerson = null;
      const warning = await persistCurrentDatabase("Local schedule collection");
      const resultParts = [];
      if (added) resultParts.push(`${added} added`);
      if (updated) resultParts.push(`${updated} updated`);
      if (failures.length) resultParts.push(`${failures.length} failed`);
      setParserStatus(`Done — ${resultParts.join(" · ")}.`, failures.length ? "warning" : "success");
      showToast(warning || `Schedule database updated: ${resultParts.join(", ")}`);
    } else {
      setParserStatus(failures[0] || "No schedules were added.", "error");
    }

    if (failures.length > 1) {
      console.warn("UFree PDF import errors\n" + failures.join("\n"));
    }

    state.isParsing = false;
    updateScheduleModal();
    event.target.value = "";
  }

  function databaseJsonText() {
    const data = state.hasData ? state.data : { schema_version: 1, people: {} };
    const exportData = {
      ...data,
      app_url: APP_URL,
    };
    return `${JSON.stringify(exportData, null, 2)}\n`;
  }

  function downloadDatabaseFile(file) {
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = "schedules.json";
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function shareSchedules() {
    if (!state.hasData) return;
    const file = new File([databaseJsonText()], "schedules.json", { type: "application/json" });
    const shareText = `Import this schedules.json into UFree\n${APP_URL}`;

    try {
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({
            title: "UFree schedules",
            text: shareText,
            url: APP_URL,
            files: [file],
          });
        } catch (error) {
          if (error?.name === "AbortError") return;
          await navigator.share({
            title: "UFree schedules",
            text: shareText,
            files: [file],
          });
        }
        showToast("Opened the share sheet with the app link");
        return;
      }
    } catch (error) {
      if (error?.name === "AbortError") return;
    }

    downloadDatabaseFile(file);
    showToast("Downloaded schedules.json — the UFree link is included in the file");
  }

  async function handleLocalScheduleFile(event) {
    const [file] = event.target.files || [];
    if (!file) return;
    const hadData = state.hasData;

    try {
      const text = await file.text();
      const imported = JSON.parse(text);
      validateData(imported);

      const existingPeople = hadData ? (state.data.people || {}) : {};
      const importedPeople = imported.people || {};
      const duplicateNames = Object.keys(importedPeople).filter(name => Object.prototype.hasOwnProperty.call(existingPeople, name));

      const merged = {
        schema_version: imported.schema_version || state.data.schema_version || 1,
        people: {
          ...existingPeople,
          ...importedPeople,
        },
      };
      validateData(merged);

      state.data = merged;
      state.hasData = true;
      state.selectedPerson = null;
      state.loadError = null;
      const warning = await persistCurrentDatabase(hadData ? "Merged schedule collection" : file.name);

      closeScheduleModal();
      updateScheduleModal();
      const importedCount = Object.keys(importedPeople).length;
      const duplicateText = duplicateNames.length ? ` · ${duplicateNames.length} updated` : "";
      showToast(warning || `Imported ${importedCount} ${importedCount === 1 ? "person" : "people"}${duplicateText}`);
    } catch (error) {
      const message = `That file could not be loaded: ${error.message}`;
      if (hadData) {
        state.loadError = null;
        refresh({ preserveScroll: true });
        showToast(message);
      } else {
        state.hasData = false;
        state.data = { people: {} };
        state.scheduleMeta = null;
        state.loadError = message;
        renderDataSetup();
      }
      updateScheduleModal();
      openScheduleModal();
    } finally {
      event.target.value = "";
    }
  }

  async function loadSchedulesFromDevice() {
    els.statusLine.textContent = "Checking this device for schedule data…";
    try {
      const record = await readLocalScheduleRecord();
      if (!record?.data) {
        state.hasData = false;
        state.data = { people: {} };
        state.scheduleMeta = null;
        state.loadError = null;
        renderDataSetup();
        updateScheduleModal();
        return;
      }

      validateData(record.data);
      state.data = record.data;
      state.hasData = true;
      state.scheduleMeta = record.meta || {
        filename: "schedules.json",
        importedAt: null,
        peopleCount: Object.keys(record.data.people || {}).length,
      };
      state.loadError = null;
      refresh();
      updateScheduleModal();
    } catch (error) {
      state.hasData = false;
      state.data = { people: {} };
      state.scheduleMeta = null;
      state.loadError = `The saved local copy could not be read: ${error.message}`;
      renderDataSetup();
      updateScheduleModal();
    }
  }

  function formatImportedAt(value) {
    if (!value) return "Previously imported on this device";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Previously imported on this device";
    return `Imported ${date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}`;
  }

  async function removePerson(name) {
    if (!state.hasData || !Object.prototype.hasOwnProperty.call(state.data.people || {}, name)) return;
    const confirmed = window.confirm(`Remove ${displayName(name)} from this device?`);
    if (!confirmed) return;

    delete state.data.people[name];
    state.mutedPeople.delete(name);
    state.pinnedPeople.delete(name);
    delete state.nicknames[name];
    saveNotificationSettings();
    savePeoplePreferences();
    if (state.selectedPerson === name) state.selectedPerson = null;

    const remaining = Object.keys(state.data.people || {}).length;
    if (remaining === 0) {
      await deleteLocalScheduleRecord();
      state.data = { people: {} };
      state.hasData = false;
      state.scheduleMeta = null;
      state.loadError = null;
      renderDataSetup();
      updateScheduleModal();
      updateSettingsModal();
      showToast(`Removed ${displayName(name)}`);
      return;
    }

    const warning = await persistCurrentDatabase("Local schedule collection");
    updateScheduleModal();
    updateSettingsModal();
    showToast(warning || `Removed ${displayName(name)}`);
  }

  function renderPeopleManager() {
    const names = Object.keys(peopleMap()).sort(comparePeopleNames);
    els.peopleManagerCount.textContent = String(names.length);
    els.peopleManagerList.replaceChildren();

    if (!names.length) {
      const empty = document.createElement("p");
      empty.className = "people-manager-empty";
      empty.textContent = "No people added yet.";
      els.peopleManagerList.append(empty);
      return;
    }

    for (const name of names) {
      const row = document.createElement("div");
      row.className = "people-manager-row";

      const copy = document.createElement("div");
      copy.className = "people-manager-copy";
      const title = document.createElement("div");
      title.className = "people-manager-name";
      title.textContent = displayName(name);
      const detail = document.createElement("div");
      detail.className = "people-manager-meta";
      const person = peopleMap()[name] || {};
      const identity = displayName(name) !== name ? `${name} · ` : "";
      detail.textContent = `${identity}${Array.isArray(person.classes) ? person.classes.length : 0} class meetings${person.source_file ? ` · ${person.source_file}` : ""}`;
      copy.append(title, detail);

      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "mini-danger-button";
      removeButton.textContent = "Remove";
      removeButton.disabled = state.isParsing || Boolean(state.pendingImage);
      removeButton.setAttribute("aria-label", `Remove ${displayName(name)}`);
      removeButton.addEventListener("click", () => removePerson(name));

      const editButton = document.createElement("button");
      editButton.type = "button";
      editButton.className = "secondary-button";
      editButton.textContent = "Edit";
      editButton.disabled = state.isParsing || Boolean(state.pendingImage);
      editButton.setAttribute("aria-label", `Edit ${displayName(name)}`);
      editButton.addEventListener("click", () => openManualSchedule(name, JSON.parse(JSON.stringify(person))));
      row.append(copy, editButton, removeButton);
      els.peopleManagerList.append(row);
    }
  }

  function updateScheduleModal() {
    const peopleCount = Object.keys(peopleMap()).length;
    renderPeopleManager();
    const importBusy = state.isParsing || Boolean(state.pendingImage);
    els.addSchedulePdfButton.disabled = importBusy;
    els.addScheduleImageButton.disabled = importBusy;
    els.manualScheduleButton.disabled = importBusy;
    els.importSchedulesButton.disabled = importBusy;
    els.shareSchedulesButton.disabled = importBusy || !state.hasData || peopleCount === 0;
    els.removeSchedulesButton.disabled = importBusy || !state.hasData;
    els.saveImageScheduleButton.disabled = state.isParsing;
    els.cancelImageScheduleButton.disabled = state.isParsing;

    if (state.hasData) {
      const meta = state.scheduleMeta || {};
      els.scheduleStorageStatus.innerHTML = `
        <div class="storage-status-row">
          <div>
            <div class="storage-status-label">Local schedule database</div>
            <div class="storage-status-value"></div>
            <div class="storage-status-meta"></div>
          </div>
          <span class="local-badge">On device</span>
        </div>`;
      els.scheduleStorageStatus.querySelector(".storage-status-value").textContent = meta.filename || "Local schedule collection";
      els.scheduleStorageStatus.querySelector(".storage-status-meta").textContent = `${peopleCount} ${peopleCount === 1 ? "person" : "people"} · ${formatImportedAt(meta.importedAt)}`;
      els.importSchedulesButton.textContent = "Import another schedules.json";
    } else {
      els.scheduleStorageStatus.innerHTML = `
        <div class="storage-status-row">
          <div>
            <div class="storage-status-label">This device</div>
            <div class="storage-status-value">No schedules stored</div>
            <div class="storage-status-meta">Add a schedule picture or PDF, or import schedules.json.</div>
          </div>
        </div>`;
      els.importSchedulesButton.textContent = "Import schedules.json";
    }
    updateSettingsModal();
  }

  function openScheduleModal() {
    updateScheduleModal();
    els.scheduleModal.hidden = false;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => {
      animateModalOpen(els.scheduleModal, els.scheduleModal.querySelector(".schedule-modal"));
      els.closeScheduleModal.focus();
    });
  }

  function closeScheduleModal() {
    els.scheduleModal.hidden = true;
    if (els.settingsModal.hidden) document.body.style.overflow = "";
  }

  async function removeSchedules() {
    if (!state.hasData) return;
    const confirmed = window.confirm("Remove the schedules stored in this browser? You can add the JSON file again later.");
    if (!confirmed) return;

    await deleteLocalScheduleRecord();
    state.data = { people: {} };
    state.hasData = false;
    state.scheduleMeta = null;
    state.selectedPerson = null;
    state.loadError = null;
    closeScheduleModal();
    renderDataSetup();
    updateScheduleModal();
    updateSettingsModal();
    showToast("Removed local schedule data");
  }

  function renderPersonCard(name, day, minute) {
    const busyClass = currentClass(name, day, minute);
    const busy = Boolean(busyClass);
    const selected = name === state.selectedPerson;
    const pinned = state.pinnedPeople.has(name);

    const button = document.createElement("button");
    button.type = "button";
    button.className = `person-card${selected ? " selected" : ""}${pinned ? " pinned" : ""}`;
    button.setAttribute("role", "listitem");
    button.setAttribute("aria-pressed", String(selected));

    const dot = document.createElement("span");
    dot.className = `person-status-dot${busy ? " busy" : ""}`;
    dot.setAttribute("aria-hidden", "true");

    const copy = document.createElement("span");
    copy.className = "person-copy";

    const personName = document.createElement("span");
    personName.className = "person-name";
    personName.textContent = displayName(name);
    if (pinned) {
      const pinMark = document.createElement("span");
      pinMark.className = "person-pin-mark";
      pinMark.textContent = "📌";
      pinMark.setAttribute("aria-hidden", "true");
      personName.append(" ", pinMark);
    }

    const detail = document.createElement("span");
    detail.className = "person-detail";
    if (busy) {
      detail.textContent = classLabel(busyClass);
    } else {
      const next = nextClassToday(name, day, minute);
      detail.textContent = next ? `Next ${formatTime(next.start)} · ${classLabel(next)}` : "No more classes today";
    }

    copy.append(personName, detail);

    const badge = document.createElement("span");
    badge.className = `status-badge ${busy ? "busy" : "free"}`;
    badge.textContent = busy ? `IN CLASS\nuntil ${formatTime(busyClass.end)}` : "FREE";
    badge.style.whiteSpace = "pre-line";

    button.append(dot, copy, badge);
    button.addEventListener("click", () => {
      state.selectedPerson = name;
      refresh({ preserveScroll: true });
      animateSelectedCard();
      if (window.matchMedia("(max-width: 880px)").matches) {
        requestAnimationFrame(() => els.detailPanel.scrollIntoView({ behavior: "smooth", block: "start" }));
      }
    });

    return button;
  }

  function renderEmptyDetail() {
    state.lastDetailPerson = null;
    els.detailPanel.innerHTML = `
      <div class="empty-detail">
        <div class="empty-symbol" aria-hidden="true">◎</div>
        <h2>Select someone</h2>
        <p>See their day at a glance, including their class timeline.</p>
      </div>`;
  }

  function detailCard(title, headline, detail, accent = "accent") {
    const card = document.createElement("section");
    card.className = "detail-card";

    const label = document.createElement("div");
    label.className = `detail-label${accent === "busy" ? " busy" : ""}`;
    label.textContent = title;

    const headlineEl = document.createElement("div");
    headlineEl.className = "detail-headline";
    headlineEl.textContent = headline;

    card.append(label, headlineEl);

    if (detail) {
      const copy = document.createElement("div");
      copy.className = "detail-copy";
      copy.textContent = detail;
      card.append(copy);
    }

    return card;
  }

  function timelineCard(name, day, minute) {
    const classes = classesForDay(name, day);
    const card = document.createElement("section");
    card.className = "detail-card timeline-card";

    const label = document.createElement("div");
    label.className = "detail-label";
    label.textContent = `${day} timeline`;
    card.append(label);

    if (classes.length === 0) {
      const copy = document.createElement("div");
      copy.className = "detail-copy";
      copy.textContent = "No classes this day.";
      card.append(copy);
      return card;
    }

    const first = Math.min(...classes.map(c => toMinutes(c.start)));
    const last = Math.max(...classes.map(c => toMinutes(c.end)));
    const rangeStart = Math.max(0, first - 20);
    const rangeEnd = Math.min(24 * 60, last + 20);
    const span = Math.max(rangeEnd - rangeStart, 60);

    const pos = value => ((value - rangeStart) / span) * 100;

    const timeline = document.createElement("div");
    timeline.className = "timeline";
    timeline.append(Object.assign(document.createElement("div"), { className: "timeline-axis" }));

    classes.forEach((c, index) => {
      const start = toMinutes(c.start);
      const end = toMinutes(c.end);
      const left = Math.max(0, Math.min(100, pos(start)));
      const right = Math.max(left, Math.min(100, pos(end)));
      const width = Math.max(1.5, right - left);

      const block = document.createElement("div");
      const timingClass = end <= minute ? "past" : start <= minute && minute < end ? "current" : "future";
      block.className = `timeline-class ${timingClass}`;
      block.style.left = `${left}%`;
      block.style.width = `${width}%`;
      block.title = `${formatTime(c.start)}–${formatTime(c.end)} · ${classLabel(c)}`;
      if (width >= 15) block.textContent = shortClassLabel(c);
      timeline.append(block);

      const timeLabel = document.createElement("div");
      timeLabel.className = `timeline-time${index === 0 ? " start" : ""}`;
      timeLabel.style.left = `${left}%`;
      timeLabel.textContent = shortTime(c.start);
      timeline.append(timeLabel);
    });

    const lastClass = classes.reduce((latest, c) => toMinutes(c.end) > toMinutes(latest.end) ? c : latest, classes[0]);
    const endLabel = document.createElement("div");
    endLabel.className = "timeline-time end";
    endLabel.style.left = `${Math.max(0, Math.min(100, pos(toMinutes(lastClass.end))))}%`;
    endLabel.textContent = shortTime(lastClass.end);
    timeline.append(endLabel);

    if (minute >= rangeStart && minute <= rangeEnd) {
      const markerLeft = Math.max(0, Math.min(100, pos(minute)));
      const marker = document.createElement("div");
      marker.className = "timeline-marker";
      marker.style.left = `${markerLeft}%`;
      const markerLabel = document.createElement("div");
      markerLabel.className = "timeline-marker-label";
      markerLabel.style.left = `${markerLeft}%`;
      markerLabel.dataset.edge = markerLeft < 12 ? "start" : markerLeft > 88 ? "end" : "center";
      markerLabel.textContent = state.useLiveTime ? "now" : formatTime(state.selectedTime);
      timeline.append(marker, markerLabel);
    }

    card.append(timeline);
    return card;
  }

  function renderDetail(name, day, minute) {
    if (!peopleMap()[name]) {
      state.selectedPerson = null;
      renderEmptyDetail();
      return;
    }

    const current = currentClass(name, day, minute);
    const busy = Boolean(current);
    const previous = previousClasses(name, day, minute);
    const nextToday = nextClassToday(name, day, minute);

    els.detailPanel.replaceChildren();

    const header = document.createElement("div");
    header.className = "detail-header";
    const nameEl = document.createElement("h2");
    nameEl.textContent = displayName(name);
    const statusRow = document.createElement("div");
    statusRow.className = "detail-status-row";

    const badge = document.createElement("span");
    badge.className = `status-badge ${busy ? "busy" : "free"}`;
    badge.textContent = busy ? "IN CLASS" : "FREE";
    statusRow.append(badge);

    if (busy) {
      const until = document.createElement("span");
      until.className = "until-copy";
      until.textContent = `until ${formatTime(current.end)}`;
      statusRow.append(until);
    }

    header.append(nameEl, statusRow);
    els.detailPanel.append(header, timelineCard(name, day, minute));

    if (busy) {
      els.detailPanel.append(detailCard(
        "Current class",
        `${formatTime(current.start)}–${formatTime(current.end)}`,
        classLabel(current),
        "busy"
      ));
    }

    if (previous.length > 0) {
      const last = previous[previous.length - 1];
      els.detailPanel.append(detailCard(
        "Earlier today",
        `${previous.length} class${previous.length === 1 ? "" : "es"} finished`,
        `Last ended at ${formatTime(last.end)}\n${classLabel(last)}`
      ));
    } else {
      els.detailPanel.append(detailCard(
        "Earlier today",
        "No classes finished yet",
        "They haven't had a class end today."
      ));
    }

    if (nextToday) {
      const until = toMinutes(nextToday.start) - minute;
      const hours = Math.floor(until / 60);
      const mins = until % 60;
      const away = hours && mins ? `in ${hours}h ${mins}m` : hours ? `in ${hours}h` : `in ${mins}m`;
      els.detailPanel.append(detailCard(
        "Next class",
        `${formatTime(nextToday.start)}–${formatTime(nextToday.end)}`,
        `${away}\n${classLabel(nextToday)}`
      ));
    } else {
      const future = nextClassInWeek(name, day, minute);
      if (future) {
        const when = future.daysAhead > 0 ? `Next ${future.day}` : future.day;
        els.detailPanel.append(detailCard(
          "Next class",
          "No more classes today",
          `${when} at ${formatTime(future.classItem.start)}\n${classLabel(future.classItem)}`
        ));
      } else {
        els.detailPanel.append(detailCard("Next class", "No upcoming class found", ""));
      }
    }

    animateDetailIfNeeded(name);
    state.lastDetailPerson = name;
  }

  function refresh({ preserveScroll = false } = {}) {
    if (!state.hasData || state.loadError) {
      renderDataSetup();
      return;
    }

    els.viewToggleButton.disabled = false;

    if (state.useLiveTime) setLiveValues();
    syncLiveControls();

    const moment = selectedMoment();
    if (!moment) {
      showToast("Choose a valid day and time.");
      return;
    }

    const { day, minute } = moment;
    const { free, busy, visible } = visiblePeople(day, minute);
    const peopleCount = Object.keys(peopleMap()).length;
    const oldScroll = els.peopleList.scrollTop;

    els.peopleHeading.textContent = state.showEveryone ? "Everyone" : state.useLiveTime ? "Free now" : "Free";
    els.viewToggleButton.textContent = state.showEveryone ? "Show only free" : "Show everyone";
    const nextFreeCountText = `${free.length} of ${peopleCount} free`;
    els.freeCount.textContent = nextFreeCountText;
    animateCountIfChanged(nextFreeCountText);
    state.lastFreeCountText = nextFreeCountText;
    els.statusLine.textContent = `${state.useLiveTime ? "Live · " : ""}${day} at ${formatTime(state.selectedTime)} · ${busy.length} in class`;

    els.peopleList.replaceChildren();

    if (peopleCount === 0) {
      els.peopleList.append(createEmptyList("No people in this file", "Replace the schedule file from the Schedules button."));
      state.selectedPerson = null;
      renderEmptyDetail();
      return;
    }

    if (visible.length === 0) {
      els.peopleList.append(createEmptyList("Nobody is free", "Try another time or choose Show everyone."));
      state.selectedPerson = null;
      renderEmptyDetail();
      return;
    }

    if (state.selectedPerson && !visible.includes(state.selectedPerson)) {
      state.selectedPerson = null;
    }

    visible.forEach(name => els.peopleList.append(renderPersonCard(name, day, minute)));

    const peopleSignature = [
      state.showEveryone ? "all" : "free",
      ...visible.map(name => `${name}:${currentClass(name, day, minute)?.course_code || (isFree(name, day, minute) ? "free" : "busy")}`),
    ].join("|");
    animateCardsIfNeeded(peopleSignature);
    state.lastPeopleSignature = peopleSignature;

    if (preserveScroll) els.peopleList.scrollTop = oldScroll;

    if (state.selectedPerson) renderDetail(state.selectedPerson, day, minute);
    else renderEmptyDetail();
  }

  function bindEvents() {
    els.lightThemeButton.addEventListener("click", () => {
      applyTheme("light");
      if (canAnimate()) window.gsap.fromTo(els.lightThemeButton, { scale: 0.97 }, { scale: 1, duration: 0.2, ease: "back.out(1.7)", clearProps: "transform" });
    });
    els.darkThemeButton.addEventListener("click", () => {
      applyTheme("dark");
      if (canAnimate()) window.gsap.fromTo(els.darkThemeButton, { scale: 0.97 }, { scale: 1, duration: 0.2, ease: "back.out(1.7)", clearProps: "transform" });
    });
    els.colorThemeGrid.addEventListener("click", event => {
      const button = event.target.closest("[data-color-theme]");
      if (!button) return;
      applyAccentTheme(button.dataset.colorTheme, true);
    });
    els.scheduleDataButton.addEventListener("click", openScheduleModal);
    els.settingsButton.addEventListener("click", openSettingsModal);
    els.closeScheduleModal.addEventListener("click", closeScheduleModal);
    els.closeSettingsModal.addEventListener("click", closeSettingsModal);
    els.breakNotificationToggle.addEventListener("change", handleNotificationToggle);
    els.testNotificationButton.addEventListener("click", sendTestNotification);
    els.addSchedulePdfButton.addEventListener("click", chooseSchedulePdf);
    els.addScheduleImageButton.addEventListener("click", chooseScheduleImage);
    els.scheduleImageInput.addEventListener("change", handleScheduleImage);
    els.manualScheduleButton.addEventListener("click", () => openManualSchedule());
    els.addReviewClassButton.addEventListener("click", () => addReviewClass({ start: "08:15", end: "09:35", kind: "busy_block" }));
    els.saveImageScheduleButton.addEventListener("click", saveImageSchedule);
    els.cancelImageScheduleButton.addEventListener("click", () => { clearImageReview(); setImageStatus("Schedule editing canceled. Nothing was saved.", ""); });
    els.importSchedulesButton.addEventListener("click", chooseScheduleFile);
    els.shareSchedulesButton.addEventListener("click", shareSchedules);
    els.removeSchedulesButton.addEventListener("click", removeSchedules);
    els.scheduleFileInput.addEventListener("change", handleLocalScheduleFile);
    els.schedulePdfInput.addEventListener("change", handleSchedulePdfs);

    els.scheduleModal.addEventListener("click", event => {
      if (event.target === els.scheduleModal) closeScheduleModal();
    });

    els.settingsModal.addEventListener("click", event => {
      if (event.target === els.settingsModal) closeSettingsModal();
    });

    document.addEventListener("keydown", event => {
      if (event.key !== "Escape") return;
      if (!els.settingsModal.hidden) closeSettingsModal();
      else if (!els.scheduleModal.hidden) closeScheduleModal();
    });

    els.liveToggle.addEventListener("change", () => {
      state.useLiveTime = els.liveToggle.checked;
      if (state.useLiveTime) setLiveValues();
      syncLiveControls();
      refresh();
    });

    els.daySelect.addEventListener("change", () => {
      state.selectedDay = els.daySelect.value;
      state.selectedPerson = null;
      refresh();
    });

    els.timeInput.addEventListener("change", () => {
      state.selectedTime = els.timeInput.value;
      state.selectedPerson = null;
      refresh();
    });

    els.refreshButton.addEventListener("click", () => {
      refresh();
      animateRefreshFeedback();
    });

    els.viewToggleButton.addEventListener("click", () => {
      state.showEveryone = !state.showEveryone;
      state.selectedPerson = null;
      refresh();
    });

    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && state.useLiveTime) refresh();
      if (!document.hidden) checkBreakNotifications();
    });
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    if (location.protocol !== "https:" && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") return;

    navigator.serviceWorker.register("./service-worker.js?v=83", { updateViaCache: "none" })
      .then(registration => registration.update())
      .catch(() => {
        // The app works normally even if PWA caching isn't available.
      });
  }

  function init() {
    const savedNotificationSettings = loadNotificationSettings();
    state.notificationsEnabled = savedNotificationSettings.enabled;
    state.mutedPeople = new Set(savedNotificationSettings.mutedPeople);

    const savedPeoplePreferences = loadPeoplePreferences();
    state.nicknames = { ...savedPeoplePreferences.nicknames };
    state.pinnedPeople = new Set(savedPeoplePreferences.pinnedPeople);
    state.accentTheme = loadAccentTheme();

    if (!("Notification" in window) || Notification.permission !== "granted") {
      state.notificationsEnabled = false;
      saveNotificationSettings();
    }

    applyTheme(state.theme);
    applyAccentTheme(state.accentTheme, false);
    setLiveValues();
    syncLiveControls();
    bindEvents();
    updateScheduleModal();
    updateSettingsModal();
    registerServiceWorker();
    requestAnimationFrame(animateAppEntrance);

    loadSchedulesFromDevice().then(() => {
      cleanPeoplePreferences();
      updateSettingsModal();
      checkBreakNotifications();
    });

    window.setInterval(() => {
      if (state.useLiveTime && !document.hidden && state.hasData && !state.loadError) {
        refresh({ preserveScroll: true });
      }
      checkBreakNotifications();
    }, 15000);
  }

  init();
})();

