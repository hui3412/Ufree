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
    weekPerson: null,
    personWeekRequest: 0,
    personShareName: null,
    personShareRequest: 0,
    personShareBusy: false,
    personShareReturnFocus: null,
    groupPerson: null,
    showEveryone: false,
    theme: loadTheme(),
    loadError: null,
    isParsing: false,
    importProgress: null,
    pendingImage: null,
    duplicatePicture: null,
    codeConflict: null,
    codeMode: null,
    quickExport: false,
    quickExportReturnFocus: null,
    sharedImport: null,
    deviceReady: false,
    sharedLinkStartup: false,
    imagePreviewUrl: null,
    notificationsEnabled: false,
    mutedPeople: new Set(),
    nicknames: {},
    pinnedPeople: new Set(),
    personOrders: Object.create(null),
    activeReorder: null,
    pendingPersonHold: null,
    suppressCardClickUntil: 0,
    groups: [],
    showGroups: false,
    hideUngrouped: false,
    editingGroupId: null,
    weekGroupId: null,
    groupReturnFocus: null,
    groupFromSchedules: false,
    accentTheme: "blue",
    lastPeopleSignature: "",
    lastDetailPerson: null,
    recentChanges: [],
  };

  const LOCAL_DB_NAME = "whos-free-local";
  const LOCAL_DB_VERSION = 1;
  const LOCAL_STORE_NAME = "app";
  const LOCAL_SCHEDULE_KEY = "schedules";
  const LOCAL_STORAGE_FALLBACK_KEY = "whos-free-local-schedules";
  const NOTIFICATION_SETTINGS_KEY = "whos-free-notification-settings-v1";
  const NOTIFICATION_HISTORY_KEY = "whos-free-notification-history-v1";
  const PEOPLE_PREFERENCES_KEY = "whos-free-people-preferences-v1";
  const VIEW_PREFERENCE_KEY = "whos-free-view-mode-v1";
  const PERSON_ORDER_KEY = "whos-free-person-order-v1";
  const GROUP_PREFERENCES_KEY = "whos-free-groups-v1";
  const ACCENT_THEME_KEY = "whos-free-accent-theme-v1";
  const ACCENT_THEMES = new Set(["blue", "violet", "rose", "mint", "orange"]);
  const BREAK_THRESHOLD_MINUTES = window.WhosFreeAvailability.PASSING_MINUTES;
  const APP_URL = "https://hui3412.github.io/Ufree/";

  const els = {
    root: document.documentElement,
    themeMeta: document.querySelector('meta[name="theme-color"]'),
    lightThemeButton: document.getElementById("lightThemeButton"),
    darkThemeButton: document.getElementById("darkThemeButton"),
    scheduleDataButton: document.getElementById("scheduleDataButton"),
    settingsButton: document.getElementById("settingsButton"),
    helpButton: document.getElementById("helpButton"),
    helpModal: document.getElementById("helpModal"),
    closeHelpModal: document.getElementById("closeHelpModal"),
    homeExportButton: document.getElementById("homeExportButton"),
    undoChangesButton: document.getElementById("undoChangesButton"),
    undoScheduleChangesButton: document.getElementById("undoScheduleChangesButton"),
    undoChangesStatus: document.getElementById("undoChangesStatus"),
    scheduleFileInput: document.getElementById("scheduleFileInput"),
    schedulePdfInput: document.getElementById("schedulePdfInput"),
    scheduleImageInput: document.getElementById("scheduleImageInput"),
    addScheduleImageButton: document.getElementById("addScheduleImageButton"),
    manualScheduleButton: document.getElementById("manualScheduleButton"),
    reviewGrid: document.getElementById("reviewGrid"),
    imageParserStatus: document.getElementById("imageParserStatus"),
    imageReview: document.getElementById("imageReview"),
    imageReviewName: document.getElementById("imageReviewName"),
    imageReviewSemester: document.getElementById("imageReviewSemester"),
    imageReviewYear: document.getElementById("imageReviewYear"),
    useCurrentSemesterButton: document.getElementById("useCurrentSemesterButton"),
    recognitionReviewNotice: document.getElementById("recognitionReviewNotice"),
    recognitionReviewSummary: document.getElementById("recognitionReviewSummary"),
    imageReviewPreview: document.getElementById("imageReviewPreview"),
    imageReviewClasses: document.getElementById("imageReviewClasses"),
    imageReviewError: document.getElementById("imageReviewError"),
    addReviewClassButton: document.getElementById("addReviewClassButton"),
    duplicatePicturePrompt: document.getElementById("duplicatePicturePrompt"),
    duplicatePictureMessage: document.getElementById("duplicatePictureMessage"),
    saveImageScheduleButton: document.getElementById("saveImageScheduleButton"),
    cancelImageScheduleButton: document.getElementById("cancelImageScheduleButton"),
    scheduleModal: document.getElementById("scheduleModal"),
    advancedScheduleOptions: document.getElementById("advancedScheduleOptions"),
    advancedSchedulePanel: document.getElementById("advancedSchedulePanel"),
    closeScheduleModal: document.getElementById("closeScheduleModal"),
    scheduleStorageStatus: document.getElementById("scheduleStorageStatus"),
    addSchedulePdfButton: document.getElementById("addSchedulePdfButton"),
    parserStatus: document.getElementById("parserStatus"),
    importProgressOverlay: document.getElementById("importProgressOverlay"),
    importProgressTitle: document.getElementById("importProgressTitle"),
    importProgressMessage: document.getElementById("importProgressMessage"),
    importPictureNameForm: document.getElementById("importPictureNameForm"),
    importPictureName: document.getElementById("importPictureName"),
    importPictureNameHelp: document.getElementById("importPictureNameHelp"),
    finishImportPictureName: document.getElementById("finishImportPictureName"),
    importSchedulesButton: document.getElementById("importSchedulesButton"),
    shareSchedulesButton: document.getElementById("shareSchedulesButton"),
    exportSchedulesButton: document.getElementById("exportSchedulesButton"),
    importCodeButton: document.getElementById("importCodeButton"),
    codeExportPanel: document.getElementById("codeExportPanel"),
    exportPeopleList: document.getElementById("exportPeopleList"),
    selectAllSchedules: document.getElementById("selectAllSchedules"),
    generateCodeButton: document.getElementById("generateCodeButton"),
    exportQrButton: document.getElementById("exportQrButton"),
    copyExportLinkButton: document.getElementById("copyExportLinkButton"),
    exportCodeField: document.getElementById("exportCodeField"),
    exportSelection: document.getElementById("exportSelection"),
    exportSelectionSummary: document.getElementById("exportSelectionSummary"),
    exportCodeOutput: document.getElementById("exportCodeOutput"),
    copyCodeButton: document.getElementById("copyCodeButton"),
    exportCodeStatus: document.getElementById("exportCodeStatus"),
    closeExportButton: document.getElementById("closeExportButton"),
    codeImportPanel: document.getElementById("codeImportPanel"),
    importCodeInput: document.getElementById("importCodeInput"),
    decodeCodeButton: document.getElementById("decodeCodeButton"),
    importCodeStatus: document.getElementById("importCodeStatus"),
    importCodeField: document.getElementById("importCodeField"),
    importCodeHelp: document.getElementById("importCodeHelp"),
    sharedImportPreview: document.getElementById("sharedImportPreview"),
    sharedImportPeople: document.getElementById("sharedImportPeople"),
    exportSharePanel: document.getElementById("exportSharePanel"),
    personSharePanel: document.getElementById("personSharePanel"),
    exportFieldOptions: document.getElementById("exportFieldOptions"),
    personExportFieldOptions: document.getElementById("personExportFieldOptions"),
    codeConflictPrompt: document.getElementById("codeConflictPrompt"),
    codeConflictMessage: document.getElementById("codeConflictMessage"),
    closeImportButton: document.getElementById("closeImportButton"),

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
    peopleHeading: document.getElementById("peopleHeading"),
    viewToggleButton: document.getElementById("viewToggleButton"),
    peopleList: document.getElementById("peopleList"),
    showGroupsToggle: document.getElementById("showGroupsToggle"),
    manageGroupsButton: document.getElementById("manageGroupsButton"),
    groupsModal: document.getElementById("groupsModal"),
    closeGroupsModal: document.getElementById("closeGroupsModal"),
    newGroupButton: document.getElementById("newGroupButton"),
    groupsManagerList: document.getElementById("groupsManagerList"),
    groupForm: document.getElementById("groupForm"),
    groupFormTitle: document.getElementById("groupFormTitle"),
    groupNameInput: document.getElementById("groupNameInput"),
    groupMembersList: document.getElementById("groupMembersList"),
    groupFormError: document.getElementById("groupFormError"),
    cancelGroupButton: document.getElementById("cancelGroupButton"),
    groupWeekModal: document.getElementById("groupWeekModal"),
    groupWeekTitle: document.getElementById("groupWeekTitle"),
    groupWeekSummary: document.getElementById("groupWeekSummary"),
    groupWeekLegend: document.getElementById("groupWeekLegend"),
    groupWeekGrid: document.getElementById("groupWeekGrid"),
    groupSlotDetails: document.getElementById("groupSlotDetails"),
    closeGroupWeekModal: document.getElementById("closeGroupWeekModal"),
    detailPanel: document.getElementById("detailPanel"),
    personWeekModal: document.getElementById("personWeekModal"),
    personWeekTitle: document.getElementById("personWeekTitle"),
    personWeekSemester: document.getElementById("personWeekSemester"),
    personWeekGrid: document.getElementById("personWeekGrid"),
    personWeekEmpty: document.getElementById("personWeekEmpty"),
    closePersonWeekModal: document.getElementById("closePersonWeekModal"),
    exportPersonScheduleButton: document.getElementById("exportPersonScheduleButton"),
    personWeekExport: document.getElementById("personWeekExport"),
    personWeekCode: document.getElementById("personWeekCode"),
    personWeekExportStatus: document.getElementById("personWeekExportStatus"),
    copyPersonWeekCodeButton: document.getElementById("copyPersonWeekCodeButton"),
    personQuickShareModal: document.getElementById("personQuickShareModal"),
    personQuickShareTitle: document.getElementById("personQuickShareTitle"),
    closePersonQuickShare: document.getElementById("closePersonQuickShare"),
    personQuickUrlButton: document.getElementById("personQuickUrlButton"),
    personQuickQrButton: document.getElementById("personQuickQrButton"),
    personQuickCodeButton: document.getElementById("personQuickCodeButton"),
    personQuickExportFields: document.getElementById("personQuickExportFields"),
    personQuickCodeField: document.getElementById("personQuickCodeField"),
    personQuickCode: document.getElementById("personQuickCode"),
    copyPersonQuickCode: document.getElementById("copyPersonQuickCode"),
    personQuickSharePanel: document.getElementById("personQuickSharePanel"),
    personQuickShareStatus: document.getElementById("personQuickShareStatus"),
    personGroupModal: document.getElementById("personGroupModal"),
    personGroupTitle: document.getElementById("personGroupTitle"),
    closePersonGroup: document.getElementById("closePersonGroup"),
    personGroupForm: document.getElementById("personGroupForm"),
    personGroupField: document.getElementById("personGroupField"),
    personGroupSelect: document.getElementById("personGroupSelect"),
    personGroupEmpty: document.getElementById("personGroupEmpty"),
    savePersonGroup: document.getElementById("savePersonGroup"),
    personGroupManage: document.getElementById("personGroupManage"),
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

  // Reveal content inside its own dialog after layout and modal-open focus.
  // Prevent focus from jumping to a different part of the scroll container.
  function revealSection(section, focusTarget = null) {
    requestAnimationFrame(() => {
      if (!section?.isConnected || section.closest("[hidden]")) return;
      focusTarget?.focus({ preventScroll: true });
      const dialog = section.closest(".schedule-modal, .settings-modal");
      const behavior = prefersReducedMotion() ? "auto" : "smooth";
      if (dialog) {
        const padding = parseFloat(getComputedStyle(dialog).paddingTop) || 16;
        const top = dialog.scrollTop + section.getBoundingClientRect().top - dialog.getBoundingClientRect().top - padding;
        dialog.scrollTo({ top: Math.max(0, top), behavior });
      } else {
        section.scrollIntoView?.({ block: "start", inline: "nearest", behavior });
      }
    });
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
    return window.WhosFreeAvailability.realBreaks(classesForDay(name, day)).map(gap => ({
      ...gap, name, day, start: gap.afterClass.end, end: gap.beforeClass.start,
    }));
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
      icon: "./assets/icon-192.png",
      badge: "./assets/icon-192.png",
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
      icon: "./assets/icon-192.png",
      badge: "./assets/icon-192.png",
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
    const openNicknames = new Set(Array.from(els.notificationPeopleList.querySelectorAll(".nickname-disclosure[open]"), editor => editor.dataset.person));
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
      nicknameLabel.className = "nickname-label visually-hidden";
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
      const nicknameEditor = document.createElement("details");
      nicknameEditor.className = "nickname-disclosure";
      nicknameEditor.dataset.person = name;
      nicknameEditor.open = openNicknames.has(name);
      const nicknameSummary = document.createElement("summary");
      nicknameSummary.textContent = nickname ? "Edit nickname" : "Add nickname";
      nicknameEditor.append(nicknameSummary, nicknameRow);
      row.append(top, nicknameEditor);
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
    els.settingsModal.querySelector(".settings-modal").scrollTop = 0;
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

  function currentSemester() {
    const date = new Date();
    const month = date.getMonth(), year = date.getFullYear();
    // Suggest the next term using fixed approximate end-of-term windows.
    // Fall ends on Dec 22 and Winter on May 31 in these defaults.
    // Future years use the same approximate windows; labels remain editable.
    if (month === 11 && date.getDate() >= 23) return { term: "Winter", year: year + 1 };
    return { term: month >= 5 ? "Fall" : "Winter", year };
  }

  function semesterIsOlder(label) {
    const match = /^(Winter|Fall) (20\d{2})$/.exec(label || "");
    if (!match) return false;
    const current = currentSemester();
    return Number(match[2]) * 2 + ["Winter", "Fall"].indexOf(match[1])
      < current.year * 2 + ["Winter", "Fall"].indexOf(current.term);
  }

  function setReviewSemester(label, isNew = false) {
    const match = /^(Winter|Fall) (20\d{2})$/.exec(label || "");
    const current = currentSemester();
    els.imageReviewSemester.value = match ? match[1] : isNew ? current.term : "";
    els.imageReviewYear.value = match ? match[2] : String(current.year);
    els.imageReviewYear.disabled = !els.imageReviewSemester.value;
    els.useCurrentSemesterButton.hidden = !semesterIsOlder(label);
  }

  function applyAutomaticSemester(data) {
    const current = currentSemester();
    for (const person of Object.values(data.people || {})) {
      if (person.semester === undefined) person.semester = `${current.term} ${current.year}`;
    }
    return data;
  }

  function scheduleLabel(person, showUnset = false) {
    const label = person?.semester || (showUnset ? "Semester not set" : "");
    return label + (semesterIsOlder(person?.semester) ? " · Previous semester" : "");
  }

  // Session-only history: never include old schedules in exports or shared codes.
  function scheduleUndoPreferences() {
    return JSON.parse(JSON.stringify({
      nicknames: state.nicknames,
      pinnedPeople: [...state.pinnedPeople],
      mutedPeople: [...state.mutedPeople],
      groups: state.groups,
      personOrders: state.personOrders,
    }));
  }

  function captureScheduleChange() {
    return {
      data: JSON.parse(JSON.stringify(state.data)),
      hasData: state.hasData,
      meta: state.scheduleMeta ? { ...state.scheduleMeta } : null,
      selectedPerson: state.selectedPerson,
      preferences: scheduleUndoPreferences(),
    };
  }

  function rememberScheduleChange(before, label) {
    if (before.hasData === state.hasData && JSON.stringify(before.data) === JSON.stringify(state.data)) return false;
    rememberUndoChange({ ...before, label, afterPreferences: scheduleUndoPreferences() });
    return true;
  }

  function rememberUndoChange(change) {
    state.recentChanges.push(change);
    if (state.recentChanges.length > 20) state.recentChanges.shift();
    updateUndoControls();
  }

  function updateUndoControls() {
    const change = state.recentChanges.at(-1);
    const busy = state.isParsing || Boolean(state.pendingImage) || Boolean(state.codeMode) || Boolean(state.activeReorder);
    const label = change ? `Undo: ${change.label}` : "No recent changes to undo";
    for (const button of [els.undoChangesButton, els.undoScheduleChangesButton]) {
      button.disabled = busy || !change;
      button.title = label;
      button.setAttribute("aria-label", label);
    }
    els.undoChangesStatus.textContent = change
      ? `Last change: ${change.label}. ${state.recentChanges.length} change${state.recentChanges.length === 1 ? "" : "s"} available to undo until you reload.`
      : "No recent changes. Undo keeps the last 20 schedule or order changes until you reload.";
  }

  function restoreSchedulePreferences(change) {
    const before = change.preferences, after = change.afterPreferences;
    for (const scope of new Set([...Object.keys(before.personOrders || {}), ...Object.keys(after.personOrders || {})])) {
      if (JSON.stringify(before.personOrders?.[scope]) === JSON.stringify(after.personOrders?.[scope])) continue;
      if (JSON.stringify(state.personOrders[scope]) !== JSON.stringify(after.personOrders?.[scope])) continue;
      if (before.personOrders?.[scope]) state.personOrders[scope] = [...before.personOrders[scope]];
      else delete state.personOrders[scope];
    }
    savePersonOrders();
    // Reverse only preferences affected by this schedule change. Later changes
    // to themes, pins, nicknames or unrelated group memberships stay intact.
    for (const key of ["pinnedPeople", "mutedPeople"]) {
      const oldNames = new Set(before[key]), newNames = new Set(after[key]);
      for (const name of new Set([...oldNames, ...newNames])) {
        if (oldNames.has(name) === newNames.has(name)) continue;
        if (oldNames.has(name)) state[key].add(name);
        else state[key].delete(name);
      }
    }
    for (const name of new Set([...Object.keys(before.nicknames), ...Object.keys(after.nicknames)])) {
      if (before.nicknames[name] === after.nicknames[name]) continue;
      if (Object.prototype.hasOwnProperty.call(before.nicknames, name)) {
        Object.defineProperty(state.nicknames, name, { value: before.nicknames[name], enumerable: true, writable: true, configurable: true });
      } else delete state.nicknames[name];
    }
    for (const group of state.groups) {
      const oldGroup = before.groups.find(item => item.id === group.id);
      const newGroup = after.groups.find(item => item.id === group.id);
      if (!oldGroup || !newGroup || JSON.stringify(oldGroup.members) === JSON.stringify(newGroup.members)) continue;
      if (JSON.stringify(group.members) === JSON.stringify(newGroup.members)) {
        group.members = [...oldGroup.members];
      } else {
        group.members = group.members.filter(name => !newGroup.members.includes(name) || oldGroup.members.includes(name));
        for (const name of oldGroup.members) if (!newGroup.members.includes(name) && !group.members.includes(name)) group.members.push(name);
      }
    }
    cleanPeoplePreferences();
    cleanGroupPreferences();
    savePeoplePreferences();
    saveNotificationSettings();
    saveGroupPreferences();
  }

  async function undoRecentScheduleChange() {
    if (state.isParsing || state.pendingImage || state.codeMode || state.activeReorder || state.pendingPersonHold || !state.recentChanges.length) return;
    const change = state.recentChanges.at(-1);
    state.isParsing = true;
    updateScheduleModal();
    let warning = null;
    try {
      if (change.kind === "person-order" || change.kind === "group-order") {
        let persisted;
        if (change.kind === "person-order") {
          if (change.previous === null) delete state.personOrders[change.scope];
          else state.personOrders[change.scope] = [...change.previous];
          persisted = savePersonOrders();
        } else {
          const rank = new Map(change.previous.map((id, index) => [id, index]));
          state.groups.sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity));
          persisted = saveGroupPreferences();
        }
        state.recentChanges.pop();
        refresh({ preserveScroll: true });
        showToast(persisted ? `Undid: ${change.label}` : "Order restored for this session, but could not be saved on this device.");
        return;
      }
      if (change.hasData) {
        try { await saveLocalScheduleRecord({ data: change.data, meta: change.meta }); }
        catch (error) { warning = error.message; }
      } else if (!await deleteLocalScheduleRecord()) {
        warning = "Undo works for this session, but the browser couldn't remove the saved copy.";
      }
      state.data = JSON.parse(JSON.stringify(change.data));
      state.hasData = change.hasData;
      state.scheduleMeta = change.meta ? { ...change.meta } : null;
      state.selectedPerson = change.selectedPerson;
      state.loadError = null;
      restoreSchedulePreferences(change);
      state.recentChanges.pop();
      state.lastPeopleSignature = "";
      state.lastDetailPerson = null;
      setParserStatus("");
      setImageStatus("");
      refresh({ preserveScroll: true });
      showToast(warning || `Undid: ${change.label}`);
    } catch (error) {
      showToast(`Could not undo: ${error.message}`);
    } finally {
      state.isParsing = false;
      updateScheduleModal();
    }
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

  function loadPersonOrders() {
    try {
      const saved = JSON.parse(localStorage.getItem(PERSON_ORDER_KEY) || "null");
      if (!saved || typeof saved !== "object" || Array.isArray(saved)) return;
      const allowed = new Set(["main", "ungrouped", ...state.groups.map(group => `group:${group.id}`)]);
      for (const [scope, names] of Object.entries(saved).filter(([scope]) => allowed.has(scope)).slice(0, 102)) {
        if (Array.isArray(names)) state.personOrders[scope] = [...new Set(names.filter(name => typeof name === "string").slice(0, 10000))];
      }
    } catch { /* Invalid or unavailable storage must not block the app. */ }
  }

  function savePersonOrders() {
    const allowed = new Set(["main", "ungrouped", ...state.groups.map(group => `group:${group.id}`)]);
    for (const scope of Object.keys(state.personOrders)) if (!allowed.has(scope)) delete state.personOrders[scope];
    try { localStorage.setItem(PERSON_ORDER_KEY, JSON.stringify(state.personOrders)); return true; }
    catch { showToast("Order changed for this session, but could not be saved on this device."); return false; }
  }

  function orderedPeople(names, scope) {
    const saved = state.personOrders[scope];
    const allowed = new Set(names), seen = new Set();
    const ordered = [...(saved || []), ...names].filter(name => allowed.has(name) && !seen.has(name) && seen.add(name));
    // Pins always win, while preserving manual order within each partition.
    return [...ordered.filter(name => state.pinnedPeople.has(name)), ...ordered.filter(name => !state.pinnedPeople.has(name))];
  }

  function orderScopeMembers(scope) {
    let names = Object.keys(peopleMap());
    if (scope.startsWith("group:")) names = groupMembers(state.groups.find(group => `group:${group.id}` === scope) || { members: [] });
    if (scope === "ungrouped") {
      const assigned = new Set(state.groups.flatMap(group => groupMembers(group)));
      names = names.filter(name => !assigned.has(name));
    }
    // Keep the old pinned/free/busy ordering until a list is explicitly reordered.
    names.sort(comparePeopleNames);
    const minute = toMinutes(state.selectedTime), day = state.selectedDay;
    const pinned = names.filter(name => state.pinnedPeople.has(name));
    const remaining = names.filter(name => !state.pinnedPeople.has(name));
    return orderedPeople([...pinned, ...remaining.filter(name => isFree(name, day, minute)), ...remaining.filter(name => !isFree(name, day, minute))], scope);
  }

  function movePerson(scope, name, target, after = false) {
    const full = orderScopeMembers(scope);
    if (name === target || !full.includes(name) || !full.includes(target)) return false;
    const next = full.filter(item => item !== name);
    next.splice(next.indexOf(target) + (after ? 1 : 0), 0, name);
    let sawUnpinned = false;
    for (const person of next) {
      if (!state.pinnedPeople.has(person)) sawUnpinned = true;
      else if (sawUnpinned) {
        showToast(state.pinnedPeople.has(name) ? "Pinned people must stay above unpinned people." : "Cannot move someone above a pinned person.");
        return false;
      }
    }
    if (JSON.stringify(full) === JSON.stringify(next)) return false;
    const previous = state.personOrders[scope] ? [...state.personOrders[scope]] : null;
    // Store the full list, including people hidden by the Free filter.
    state.personOrders[scope] = next;
    const persisted = savePersonOrders();
    rememberUndoChange({ kind: "person-order", scope, previous, label: `Reordered ${displayName(name)} in ${scope === "main" ? "the main list" : scope === "ungrouped" ? "Ungrouped people" : state.groups.find(group => `group:${group.id}` === scope)?.name || "a group"}` });
    refresh({ preserveScroll: true });
    if (persisted) showToast(`${displayName(name)}'s position saved on this device.`);
    return true;
  }

  function clearReorderMarker() {
    els.peopleList.querySelectorAll(".reorder-before, .reorder-after").forEach(card => card.classList.remove("reorder-before", "reorder-after"));
  }

  function markReorderTarget(card, y) {
    const drag = state.activeReorder;
    clearReorderMarker();
    if (!drag || !card || card.dataset.orderScope !== drag.scope || card.dataset.person === drag.name) {
      if (drag) drag.target = null;
      return;
    }
    drag.target = card.dataset.person;
    const rect = card.getBoundingClientRect();
    drag.after = y >= rect.top + rect.height / 2;
    card.classList.add(drag.after ? "reorder-after" : "reorder-before");
  }

  function finishPersonReorder(cancel = false) {
    const drag = state.activeReorder;
    if (!drag) return;
    state.activeReorder = null;
    clearReorderMarker();
    drag.card.classList.remove("person-dragging");
    updateUndoControls();
    state.suppressCardClickUntil = Date.now() + 400;
    if (!cancel && drag.target) movePerson(drag.scope, drag.name, drag.target, drag.after);
  }

  function attachPersonReorder(card, name, scope) {
    card.dataset.person = name;
    card.dataset.orderScope = scope;
    card.draggable = !window.matchMedia("(pointer: coarse)").matches;
    card.title = "Drag to reorder, or hold then move on touch screens. Keyboard: Alt + Up or Down arrow.";
    card.setAttribute("aria-keyshortcuts", "Alt+ArrowUp Alt+ArrowDown");
    card.setAttribute("aria-describedby", "personOrderHelp");
    card.addEventListener("dragstart", event => {
      if (state.activeReorder) { event.preventDefault(); return; }
      state.activeReorder = { name, scope, card, target: null };
      card.classList.add("person-dragging");
      updateUndoControls();
      if (event.dataTransfer) { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", name); }
    });
    card.addEventListener("dragover", event => {
      if (!state.activeReorder || state.activeReorder.scope !== scope) return;
      event.preventDefault();
      markReorderTarget(card, event.clientY);
    });
    card.addEventListener("drop", event => {
      if (!state.activeReorder || state.activeReorder.scope !== scope) return;
      event.preventDefault(); markReorderTarget(card, event.clientY); finishPersonReorder();
    });
    card.addEventListener("dragend", () => finishPersonReorder(true));
    const cancelHold = () => {
      if (state.pendingPersonHold?.card !== card) return;
      window.clearTimeout(state.pendingPersonHold.timer);
      state.pendingPersonHold = null;
    };
    card.addEventListener("touchstart", event => {
      cancelHold();
      if (event.touches.length !== 1) { if (state.activeReorder?.card === card) finishPersonReorder(true); return; }
      if (state.activeReorder || state.isParsing) return;
      const touch = event.touches[0];
      const hold = { card, id: touch.identifier, x: touch.clientX, y: touch.clientY };
      state.pendingPersonHold = hold;
      hold.timer = window.setTimeout(() => {
        if (state.pendingPersonHold !== hold || !card.isConnected) return;
        state.pendingPersonHold = null;
        state.activeReorder = { name, scope, card, target: null, touchId: hold.id };
        card.classList.add("person-dragging");
        updateUndoControls();
      }, 450);
    }, { passive: true });
    card.addEventListener("touchmove", event => {
      const hold = state.pendingPersonHold;
      const drag = state.activeReorder;
      const touch = Array.from(event.touches).find(item => item.identifier === (drag?.touchId ?? hold?.id));
      if (!touch) { cancelHold(); return; }
      if (hold?.card === card) {
        if (Math.hypot(touch.clientX - hold.x, touch.clientY - hold.y) > 10) cancelHold();
        return; // Ordinary scrolling never starts a reorder.
      }
      if (drag?.card !== card) return;
      if (event.cancelable) event.preventDefault();
      markReorderTarget(document.elementFromPoint(touch.clientX, touch.clientY)?.closest(".person-card"), touch.clientY);
      const rect = els.peopleList.getBoundingClientRect();
      if (touch.clientY < rect.top + 40) els.peopleList.scrollTop -= 16;
      else if (touch.clientY > rect.bottom - 40) els.peopleList.scrollTop += 16;
      if (touch.clientY < 50) window.scrollBy?.(0, -16);
      else if (touch.clientY > window.innerHeight - 50) window.scrollBy?.(0, 16);
    }, { passive: false });
    card.addEventListener("touchend", event => {
      cancelHold();
      if (state.activeReorder?.card !== card) return;
      if (event.cancelable) event.preventDefault();
      finishPersonReorder();
    }, { passive: false });
    card.addEventListener("touchcancel", () => { cancelHold(); if (state.activeReorder?.card === card) finishPersonReorder(true); });
    card.addEventListener("contextmenu", event => {
      if (state.pendingPersonHold?.card === card || state.activeReorder?.card === card || window.matchMedia("(pointer: coarse)").matches) event.preventDefault();
    });
    card.addEventListener("keydown", event => {
      if (event.key === "Escape" && state.activeReorder) { event.preventDefault(); finishPersonReorder(true); return; }
      if (!event.altKey || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
      event.preventDefault();
      const cards = [...card.parentElement.querySelectorAll(".person-card")].filter(item => item.dataset.orderScope === scope);
      const index = cards.indexOf(card), down = event.key === "ArrowDown";
      const target = cards[index + (down ? 1 : -1)];
      if (!target) return;
      movePerson(scope, name, target.dataset.person, down);
      [...els.peopleList.querySelectorAll(".person-card")].find(item => item.dataset.person === name && item.dataset.orderScope === scope)?.focus({ preventScroll: true });
    });
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

  function loadGroupPreferences() {
    try {
      const saved = JSON.parse(localStorage.getItem(GROUP_PREFERENCES_KEY) || "null");
      const ids = new Set();
      const groups = (Array.isArray(saved?.groups) ? saved.groups : []).slice(0, 100).filter(group => {
        if (!group || typeof group.id !== "string" || !group.id || ids.has(group.id) || typeof group.name !== "string" || !group.name.trim() || !Array.isArray(group.members)) return false;
        ids.add(group.id); return true;
      }).map(group => ({ id: group.id, name: group.name.trim().slice(0, 60), members: [...new Set(group.members.filter(name => typeof name === "string"))], hidden: group.hidden === true }));
      return { groups, showGroups: saved?.showGroups === true, hideUngrouped: saved?.hideUngrouped === true };
    } catch { return { groups: [], showGroups: false, hideUngrouped: false }; }
  }

  function saveGroupPreferences() {
    try {
      localStorage.setItem(GROUP_PREFERENCES_KEY, JSON.stringify({ groups: state.groups, showGroups: state.showGroups, hideUngrouped: state.hideUngrouped }));
      return true;
    } catch { showToast("Groups work for this session, but this browser couldn't save them."); return false; }
  }

  function groupMembers(group) {
    return window.WhosFreeGroups.membersOf(group, peopleMap());
  }

  function cleanGroupPreferences() {
    let changed = false;
    for (const group of state.groups) {
      const members = groupMembers(group);
      if (members.length !== group.members.length) { group.members = members; changed = true; }
    }
    if (changed) saveGroupPreferences();
  }

  function setGroupHidden(group, hidden) {
    if (group) group.hidden = hidden;
    else state.hideUngrouped = hidden;
    saveGroupPreferences();
    refresh({ preserveScroll: true });
    const section = [...els.peopleList.querySelectorAll(".people-group")].find(item => item.dataset.groupId === (group?.id || "ungrouped"));
    if (els.groupsModal.hidden) section?.querySelector(".group-hide")?.focus({ preventScroll: true });
    else {
      renderGroupsManager();
      [...els.groupsManagerList.querySelectorAll("button")].find(button => button.getAttribute("aria-label") === `${hidden ? "Show" : "Hide"} group ${group?.name}`)?.focus();
    }
  }

  function sendGroupToTop(group) {
    const index = state.groups.indexOf(group);
    if (index <= 0) return;
    const previous = state.groups.map(item => item.id);
    state.groups.splice(index, 1);
    state.groups.unshift(group);
    const persisted = saveGroupPreferences();
    rememberUndoChange({ kind: "group-order", previous, label: `Sent group ${group.name} to top` });
    refresh({ preserveScroll: true });
    const section = [...els.peopleList.querySelectorAll(".people-group")].find(item => item.dataset.groupId === group.id);
    section?.querySelector(".group-more")?.focus({ preventScroll: true });
    showToast(persisted ? `${group.name} moved to top.` : "Group moved for this session, but could not be saved on this device.");
  }

  let toolbarLayoutFrame = null;

  function fitToolbarLabels() {
    const nav = els.scheduleDataButton.parentElement;
    const peopleActions = els.showGroupsToggle.closest(".people-actions");
    const fits = row => {
      const children = [...row.children].filter(child => getComputedStyle(child).display !== "none");
      const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
      const required = children.reduce((width, child) => width + child.getBoundingClientRect().width, 0)
        + Math.max(0, children.length - 1) * gap;
      return required <= row.getBoundingClientRect().width + 0.5;
    };

    // Start with full labels so widening the row restores them automatically.
    els.helpButton.classList.remove("compact-label");
    els.scheduleDataButton.classList.remove("compact-label");
    if (!fits(nav)) els.helpButton.classList.add("compact-label");
    if (!fits(nav)) els.scheduleDataButton.classList.add("compact-label");

    els.showGroupsToggle.classList.remove("compact-label");
    els.viewToggleButton.classList.remove("compact-label");
    if (!els.manageGroupsButton.hidden && !fits(peopleActions)) {
      els.showGroupsToggle.classList.add("compact-label");
    }
    if (!fits(peopleActions)) els.viewToggleButton.classList.add("compact-label");
    const fullSchedule = document.getElementById("fullScheduleButton");
    if (fullSchedule) {
      fullSchedule.classList.remove("compact-label");
      if (!fits(fullSchedule.closest(".person-detail-actions"))) fullSchedule.classList.add("compact-label");
    }
  }

  function scheduleToolbarLayout() {
    if (toolbarLayoutFrame !== null) return;
    toolbarLayoutFrame = requestAnimationFrame(() => {
      toolbarLayoutFrame = null;
      fitToolbarLabels();
    });
  }

  function watchToolbarLayout() {
    window.addEventListener("resize", scheduleToolbarLayout);
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(scheduleToolbarLayout);
      observer.observe(document.querySelector(".home-header-controls"));
      observer.observe(els.showGroupsToggle.closest(".people-actions"));
    }
    document.fonts?.ready.then(scheduleToolbarLayout);
    fitToolbarLabels();
  }

  function updateGroupToolbar() {
    els.showGroupsToggle.disabled = !state.hasData;
    const busy = state.isParsing || Boolean(state.pendingImage) || Boolean(state.codeMode);
    els.manageGroupsButton.hidden = !state.showGroups;
    els.manageGroupsButton.disabled = !state.hasData || busy;
    setViewToggle(els.showGroupsToggle, state.showGroups ? "Hide groups" : "Show groups", state.showGroups);
    scheduleToolbarLayout();
  }

  function setViewToggle(button, label, pressed) {
    button.setAttribute("aria-label", label); button.title = label;
    button.setAttribute("aria-pressed", String(pressed));
    button.querySelector("[data-toggle-label]").textContent = label;
  }

  function renderGroupsManager() {
    els.groupsManagerList.replaceChildren();
    if (!state.groups.length) {
      const text = document.createElement("p");
      text.textContent = "Create a group to find a time everyone can meet.";
      els.groupsManagerList.append(text);
    }
    for (const group of state.groups) {
      const row = document.createElement("div"); row.className = "group-manager-row";
      const copy = document.createElement("div");
      const title = document.createElement("strong"); title.textContent = group.name;
      const members = document.createElement("small");
      members.textContent = `${groupMembers(group).length} people${group.hidden ? " · Collapsed" : ""}`;
      copy.append(title, members);
      const actions = document.createElement("div"); actions.className = "group-manager-actions";
      for (const [text, action] of [
        ["Edit", () => editGroup(group.id)],
        [group.hidden ? "Show" : "Hide", () => setGroupHidden(group, !group.hidden)],
        ["Delete", () => {
          if (!window.confirm(`Delete the group “${group.name}”? Its people's schedules will stay on this device.`)) return;
          state.groups = state.groups.filter(item => item.id !== group.id);
          if (state.editingGroupId === group.id) cancelGroupEdit();
          saveGroupPreferences(); renderGroupsManager(); refresh({ preserveScroll: true });
        }],
      ]) {
        const button = document.createElement("button"); button.type = "button";
        button.className = text === "Delete" ? "mini-danger-button" : "secondary-button compact";
        button.textContent = text; button.setAttribute("aria-label", `${text} group ${group.name}`);
        button.addEventListener("click", action); actions.append(button);
      }
      row.append(copy, actions); els.groupsManagerList.append(row);
    }
  }

  function editGroup(id = null) {
    const group = state.groups.find(item => item.id === id);
    state.editingGroupId = group?.id || null;
    els.groupForm.hidden = false;
    els.groupFormTitle.textContent = group ? "Edit group" : "New group";
    els.groupNameInput.value = group?.name || "";
    els.groupFormError.textContent = "";
    els.groupMembersList.replaceChildren();
    const selected = new Set(group?.members || []);
    for (const name of Object.keys(peopleMap()).sort(comparePeopleNames)) {
      const label = document.createElement("label"); label.className = "share-selection";
      const input = document.createElement("input"); input.type = "checkbox";
      input.dataset.person = name; input.checked = selected.has(name);
      label.append(input, document.createTextNode(displayName(name)));
      els.groupMembersList.append(label);
    }
    revealSection(els.groupForm, els.groupNameInput);
  }

  function cancelGroupEdit() {
    els.groupForm.hidden = true; state.editingGroupId = null;
    els.newGroupButton.focus();
  }

  function saveGroup(event) {
    event.preventDefault();
    const name = els.groupNameInput.value.trim().slice(0, 60);
    if (!name) { els.groupFormError.textContent = "Enter a group name."; els.groupNameInput.focus(); return; }
    if (state.groups.some(group => group.id !== state.editingGroupId && group.name.normalize("NFC").toLowerCase() === name.normalize("NFC").toLowerCase())) {
      els.groupFormError.textContent = "A group already uses this name. Choose another name."; return;
    }
    const members = [...els.groupMembersList.querySelectorAll("input:checked")].map(input => input.dataset.person);
    const existing = state.groups.find(group => group.id === state.editingGroupId);
    if (existing) { existing.name = name; existing.members = members; }
    else {
      if (state.groups.length >= 100) { els.groupFormError.textContent = "You can save up to 100 groups."; return; }
      if (!state.groups.length) state.showGroups = true;
      const id = window.crypto?.randomUUID?.() || `group-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      state.groups.push({ id, name, members, hidden: false });
    }
    saveGroupPreferences(); cancelGroupEdit(); renderGroupsManager(); refresh({ preserveScroll: true });
    showToast(`Group saved: ${name}`);
  }

  function openGroupsModal(id = null) {
    if (state.isParsing || state.pendingImage || state.codeMode) return;
    state.groupReturnFocus = document.activeElement;
    state.groupFromSchedules = !els.scheduleModal.hidden;
    if (state.groupFromSchedules) els.scheduleModal.hidden = true;
    els.groupsModal.hidden = false; document.body.style.overflow = "hidden";
    renderGroupsManager();
    if (id || !state.groups.length) editGroup(id);
    else { els.groupForm.hidden = true; els.closeGroupsModal.focus(); }
    animateModalOpen(els.groupsModal, els.groupsModal.querySelector(".groups-modal"));
  }

  function closeGroupsModal() {
    els.groupsModal.hidden = true;
    if (state.groupFromSchedules) { els.scheduleModal.hidden = false; updateScheduleModal(); }
    state.groupFromSchedules = false;
    if (els.scheduleModal.hidden && els.settingsModal.hidden && els.groupWeekModal.hidden) document.body.style.overflow = "";
    state.groupReturnFocus?.focus?.();
  }

  function sharedTimeText(weekly, day, minute) {
    if (!weekly.members.length) return "Add people to find a shared break.";
    const next = window.WhosFreeGroups.nextShared(weekly, day, minute);
    if (!next) return "No shared break longer than 10 minutes this school week.";
    const end = formatTime(minuteTime(next.end));
    if (next.now) return `Everyone free now until ${end}`;
    const when = next.daysAhead === 0 ? "" : `${next.daysAhead === 7 ? "Next " : ""}${next.day} · `;
    return `Next everyone free: ${when}${formatTime(minuteTime(next.start))}–${end}`;
  }

  function groupSection(title, members, visible, day, minute, group = null) {
    const section = document.createElement("section"); section.className = "people-group"; section.setAttribute("role", "listitem");
    section.dataset.groupId = group?.id || "ungrouped";
    const collapsed = group ? group.hidden : state.hideUngrouped;
    section.classList.toggle("group-collapsed", collapsed);
    const header = document.createElement("div"); header.className = "people-group-header";
    const copy = document.createElement("div");
    const heading = document.createElement("h3"); heading.textContent = title;
    const count = document.createElement("small");
    count.textContent = `${members.filter(name => isFree(name, day, minute)).length} of ${members.length} free`;
    copy.append(heading, count);
    const actions = document.createElement("div"); actions.className = "people-group-actions";
    const hide = document.createElement("button"); hide.type = "button";
    hide.className = "secondary-button group-hide";
    hide.textContent = collapsed ? "Show" : "Hide";
    hide.title = `${collapsed ? "Show" : "Hide"} group ${title}`;
    hide.setAttribute("aria-label", hide.title);
    hide.setAttribute("aria-expanded", String(!collapsed));
    hide.addEventListener("click", () => setGroupHidden(group, !collapsed));
    actions.append(hide);
    if (group) {
      const menu = document.createElement("details"); menu.className = "group-options";
      const more = document.createElement("summary"); more.className = "secondary-button group-more"; more.textContent = "…";
      more.title = `Options for group ${group.name}`; more.setAttribute("aria-label", more.title);
      const options = document.createElement("div"); options.className = "group-options-panel";
      const top = document.createElement("button"); top.type = "button"; top.className = "secondary-button";
      top.textContent = "Send group to top"; top.setAttribute("aria-label", `Send group ${group.name} to top`);
      top.disabled = state.groups[0]?.id === group.id;
      top.addEventListener("click", () => { menu.open = false; sendGroupToTop(group); });
      const week = document.createElement("button"); week.type = "button"; week.className = "secondary-button";
      week.textContent = "Weekly availability"; week.setAttribute("aria-label", `View weekly availability for ${group.name}`);
      week.addEventListener("click", () => { menu.open = false; openGroupWeek(group.id, more); });
      options.append(top, week); menu.append(more, options); actions.append(menu);
    }
    header.append(copy, actions);
    section.append(header);
    if (collapsed) return section;
    const list = document.createElement("div"); list.setAttribute("role", "list"); list.setAttribute("aria-label", `${title} people`);
    const filtered = visible.filter(name => members.includes(name));
    const scope = group ? `group:${group.id}` : "ungrouped";
    const shown = new Set(filtered);
    orderScopeMembers(scope).filter(name => shown.has(name)).forEach(name => list.append(renderPersonCard(name, day, minute, scope)));
    if (!filtered.length) {
      const message = document.createElement("p"); message.className = "group-empty";
      message.textContent = members.length ? "Nobody in this group is free at this time. Choose Show everyone to see them." : "No people in this group. Edit it to add members.";
      list.append(message);
    }
    section.append(list);
    return section;
  }

  function renderGroupedPeople(visible, day, minute) {
    const assigned = new Set(state.groups.flatMap(group => groupMembers(group)));
    const shown = new Set();
    for (const group of state.groups) {
      const members = groupMembers(group);
      if (!group.hidden) members.forEach(name => shown.add(name));
      els.peopleList.append(groupSection(group.name, members, visible, day, minute, group));
    }
    const ungrouped = Object.keys(peopleMap()).filter(name => !assigned.has(name));
    if (ungrouped.length) {
      if (!state.hideUngrouped) ungrouped.forEach(name => shown.add(name));
      els.peopleList.append(groupSection("Ungrouped people", ungrouped, visible, day, minute));
    }
    if (!els.peopleList.children.length) els.peopleList.append(createEmptyList("No groups shown", "Select a group above, or choose Hide groups to see the usual list."));
    return { visible: visible.filter(name => shown.has(name)), shown };
  }

  function groupBlockLabel(segment, total) {
    const count = segment.available.length;
    return count === total ? "Everyone free" : count === 0 ? "Nobody free" : count === total - 1 ? "All except 1" : `${count} of ${total} free`;
  }

  function showGroupSlot(day, segment, total, button) {
    els.groupWeekGrid.querySelectorAll(".group-time-block").forEach(item => item.setAttribute("aria-pressed", String(item === button)));
    const title = document.createElement("h3");
    title.textContent = `${day} · ${formatTime(minuteTime(segment.start))}–${formatTime(minuteTime(segment.end))}`;
    els.groupSlotDetails.replaceChildren(title);
    const parts = segment.exact || [segment];
    if (parts.length > 1) {
      const note = document.createElement("p"); note.textContent = "Short transitions are blended in the grid. Exact availability:";
      els.groupSlotDetails.append(note);
    }
    for (const part of parts) {
      const wrapper = document.createElement("section"); wrapper.className = "group-exact-period";
      const summary = document.createElement("p");
      summary.textContent = `${parts.length > 1 ? `${formatTime(minuteTime(part.start))}–${formatTime(minuteTime(part.end))} · ` : ""}${groupBlockLabel(part, total)} · ${part.end - part.start} minutes`;
      const free = document.createElement("p"); free.textContent = `Free: ${part.available.map(displayName).join(", ") || "Nobody"}`;
      const busy = document.createElement("p"); busy.textContent = `Busy: ${part.unavailable.map(displayName).join(", ") || "Nobody"}`;
      wrapper.append(summary, free, busy); els.groupSlotDetails.append(wrapper);
    }
    revealSection(els.groupSlotDetails);
  }

  function openGroupWeek(id, trigger = document.activeElement) {
    const group = state.groups.find(item => item.id === id);
    if (!group) return;
    state.weekGroupId = id; state.groupReturnFocus = trigger;
    const weekly = window.WhosFreeGroups.week(group, peopleMap()), total = weekly.members.length;
    els.groupWeekTitle.textContent = `${group.name} · Weekly availability`;
    els.groupWeekSummary.textContent = `${total} ${total === 1 ? "person" : "people"} · ${formatTime(minuteTime(weekly.start))}–${formatTime(minuteTime(weekly.end))} school hours. Shared break suggestions need more than 10 minutes.`;
    els.groupWeekLegend.replaceChildren();
    for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
      const label = document.createElement("span"), swatch = document.createElement("i");
      swatch.style.backgroundColor = window.WhosFreeGroups.shade(fraction, 1).background;
      label.append(swatch, document.createTextNode(fraction === 1 ? "Everyone free" : `${fraction * 100}% free`));
      els.groupWeekLegend.append(label);
    }
    els.groupWeekGrid.replaceChildren();
    els.groupWeekGrid.style.gridTemplateColumns = `54px repeat(${weekly.days.length}, minmax(140px, 1fr))`;
    els.groupWeekGrid.style.minWidth = `${54 + weekly.days.length * 140}px`;
    const axis = document.createElement("div"); axis.className = "review-time-axis";
    for (const minute of [weekly.start, ...Array.from({ length: 12 }, (_, i) => (i + 9) * 60).filter(value => value < weekly.end - 25), weekly.end]) {
      const label = document.createElement("span"); label.textContent = minuteTime(minute);
      label.style.top = `${minute - weekly.start + 48}px`; axis.append(label);
    }
    els.groupWeekGrid.append(axis);
    for (const day of weekly.days) {
      const column = document.createElement("div"); column.className = "review-day";
      const heading = document.createElement("div"); heading.className = "review-day-heading group-day-heading"; heading.textContent = day;
      const track = document.createElement("div"); track.className = "review-day-track"; track.style.height = `${weekly.end - weekly.start}px`;
      if (total) for (const segment of window.WhosFreeGroups.smooth(weekly.availability[day])) {
        const block = document.createElement("button"); block.type = "button"; block.className = "group-time-block";
        block.dataset.available = String(segment.available.length); block.dataset.total = String(total); block.dataset.day = day;
        block.dataset.start = minuteTime(segment.start); block.dataset.end = minuteTime(segment.end);
        block.style.top = `${segment.start - weekly.start}px`; block.style.height = `${segment.end - segment.start}px`;
        const colors = window.WhosFreeGroups.shade(segment.available.length, total);
        block.style.backgroundColor = colors.background; block.style.color = colors.color;
        const label = groupBlockLabel(segment, total);
        block.textContent = segment.end - segment.start < 25 ? `${segment.available.length}/${total}` : `${label}\n${minuteTime(segment.start)}–${minuteTime(segment.end)}`;
        block.title = `${day} ${minuteTime(segment.start)}–${minuteTime(segment.end)} · ${label}. Free: ${segment.available.map(displayName).join(", ") || "Nobody"}. Busy: ${segment.unavailable.map(displayName).join(", ") || "Nobody"}.`;
        if (segment.exact.length > 1) block.title = `${day} ${minuteTime(segment.start)}–${minuteTime(segment.end)} · ${label} (transitions blended). Select for exact times and people.`;
        block.setAttribute("aria-label", block.title); block.setAttribute("aria-pressed", "false");
        block.addEventListener("click", () => showGroupSlot(day, segment, total, block)); track.append(block);
      }
      column.append(heading, track); els.groupWeekGrid.append(column);
    }
    els.groupSlotDetails.textContent = total ? "Select a time block to see the people available." : "This group has no people. Edit the group to add members.";
    els.groupWeekModal.hidden = false; document.body.style.overflow = "hidden";
    els.closeGroupWeekModal.focus();
    animateModalOpen(els.groupWeekModal, els.groupWeekModal.querySelector(".group-week-modal"));
  }

  function closeGroupWeek() {
    els.groupWeekModal.hidden = true; state.weekGroupId = null;
    if (els.scheduleModal.hidden && els.settingsModal.hidden && els.groupsModal.hidden) document.body.style.overflow = "";
    const group = state.groupReturnFocus?.closest?.(".people-group");
    const replacement = group ? [...els.peopleList.querySelectorAll(".people-group")].find(item => item.dataset.groupId === group.dataset.groupId)?.querySelector(".group-more") : null;
    (replacement || els.showGroupsToggle).focus();
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

  function minuteTime(minute) {
    return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
  }

  function isFree(name, day, minute) {
    if (!ALL_DAYS.includes(day)) return true;
    return window.WhosFreeAvailability.isFree(classesForDay(name, day), minute);
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
    els.daySelect.disabled = false;
    els.timeInput.disabled = false;
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

    if (!state.showEveryone) return { free, busy, visible: orderedPeople(free, "main") };

    const pinned = people.filter(name => state.pinnedPeople.has(name));
    const pinnedSet = new Set(pinned);
    const remainingFree = free.filter(name => !pinnedSet.has(name));
    const remainingBusy = busy.filter(name => !pinnedSet.has(name));
    return { free, busy, visible: orderedPeople([...pinned, ...remainingFree, ...remainingBusy], "main") };
  }

  function showToast(message) {
    if (state.importProgress) {
      state.importProgress.toast = message;
      return;
    }
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
    updateGroupToolbar();
    els.peopleHeading.textContent = "UFree";
    els.viewToggleButton.disabled = true;
    els.peopleList.replaceChildren();

    const fragment = els.dataSetupTemplate.content.cloneNode(true);
    const title = fragment.querySelector(".data-setup-title");
    const message = fragment.querySelector(".data-setup-message");

    if (state.loadError) {
      title.textContent = "Couldn't load that file";
      message.textContent = state.loadError;
    }

    fragment.querySelector(".create-schedule").addEventListener("click", () => { openScheduleModal(); openManualSchedule(); });
    fragment.querySelectorAll(".add-picture").forEach(button => button.addEventListener("click", chooseScheduleImage));
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

  function startImportProgress(message, pictureName = false, title = "Importing schedules") {
    els.importProgressTitle.textContent = title;
    if (state.importProgress) { updateImportProgress(message); return; }
    const overlay = els.importProgressOverlay;
    state.importProgress = {
      pictureName: pictureName ? { started: false, edited: false, confirmed: false, composing: false, ready: false, resolve: null } : null,
      focusWithin: overlay,
      focusReturn: document.activeElement,
      bodyOverflow: document.body.style.overflow,
      hadDialog: [...document.querySelectorAll(".modal-backdrop")].some(element => element !== overlay && !element.hidden),
      background: [...document.body.children].filter(element => element !== overlay && !["SCRIPT", "TEMPLATE"].includes(element.tagName)).map(element => ({ element, inert: element.hasAttribute("inert"), ariaHidden: element.getAttribute("aria-hidden") })),
    };
    els.importProgressMessage.textContent = message;
    els.importPictureNameForm.hidden = !pictureName;
    els.importPictureName.value = "";
    els.finishImportPictureName.disabled = false;
    els.finishImportPictureName.textContent = "Done entering name";
    els.importPictureNameHelp.textContent = "Your name will carry over. If you're typing when loading finishes, we'll wait for you.";
    overlay.querySelector(".import-progress-spinner").hidden = false;
    overlay.querySelector(".import-progress-note").textContent = title === "Opening shared schedules" ? "Nothing is added until you confirm." : "Please wait until the import finishes.";
    overlay.setAttribute("aria-busy", "true");
    overlay.hidden = false;
    document.documentElement.classList.remove("shared-link-starting");
    document.body.style.overflow = "hidden";
    overlay.focus({ preventScroll: true });
    for (const { element } of state.importProgress.background) {
      element.setAttribute("inert", "");
      element.setAttribute("aria-hidden", "true");
    }
  }

  function updateImportProgress(message) {
    if (state.importProgress) els.importProgressMessage.textContent = message;
  }

  function editImportPictureName(edited = false) {
    const name = state.importProgress?.pictureName;
    if (!name) return;
    name.started = true;
    name.edited ||= edited;
    name.confirmed = false;
    els.finishImportPictureName.disabled = false;
    if (!name.ready) els.importPictureNameHelp.textContent = "Your name will carry over. If you're typing when loading finishes, we'll wait for you.";
  }

  function finishImportPictureName(event) {
    event.preventDefault();
    const name = state.importProgress?.pictureName;
    if (!name || name.composing) return;
    name.confirmed = true;
    if (name.resolve) {
      const resolve = name.resolve;
      name.resolve = null;
      resolve();
    } else {
      els.importPictureName.blur();
      els.finishImportPictureName.disabled = true;
      els.importPictureNameHelp.textContent = "Name ready. You can still change it while the picture loads.";
    }
  }

  async function waitForImportPictureName(detectedName) {
    const name = state.importProgress.pictureName;
    name.ready = true;
    if (name.started && !name.confirmed) {
      els.importProgressOverlay.querySelector(".import-progress-spinner").hidden = true;
      els.importProgressOverlay.querySelector(".import-progress-note").textContent = "Ready to review once you're done naming.";
      updateImportProgress("Your schedule is ready.");
      els.importPictureNameHelp.textContent = "Finish entering the name, then press Continue to see the schedule.";
      els.finishImportPictureName.textContent = "Continue";
      await new Promise(resolve => { name.resolve = resolve; });
    }
    return name.edited ? els.importPictureName.value.trim() : detectedName || "";
  }

  function endImportProgress(focusTarget = null) {
    const operation = state.importProgress;
    if (!operation) return;
    state.importProgress = null;
    els.importProgressOverlay.hidden = true;
    els.importProgressOverlay.removeAttribute("aria-busy");
    els.importPictureNameForm.hidden = true;
    for (const { element, inert, ariaHidden } of operation.background) {
      if (!inert) element.removeAttribute("inert");
      if (ariaHidden === null) element.removeAttribute("aria-hidden");
      else element.setAttribute("aria-hidden", ariaHidden);
    }
    const hasDialog = [...document.querySelectorAll(".modal-backdrop")].some(element => !element.hidden);
    document.body.style.overflow = hasDialog ? "hidden" : operation.hadDialog ? "" : operation.bodyOverflow;
    const target = focusTarget || operation.focusReturn;
    if (target?.isConnected && !target.disabled && !target.closest("[hidden], [inert]")) target.focus({ preventScroll: true });
    else (hasDialog ? els.closeScheduleModal : els.scheduleDataButton).focus({ preventScroll: true });
    if (operation.toast) showToast(operation.toast);
  }

  function scheduleImportToast(before) {
    const oldPeople = before.hasData ? before.data.people || {} : {};
    const newPeople = peopleMap();
    let added = 0, updated = 0;
    for (const [name, person] of Object.entries(newPeople)) {
      if (!Object.prototype.hasOwnProperty.call(oldPeople, name)) added++;
      else if (JSON.stringify(oldPeople[name]) !== JSON.stringify(person)) updated++;
    }
    const parts = [];
    if (added) parts.push(`${added} schedule${added === 1 ? "" : "s"} added`);
    if (updated) parts.push(`${updated} schedule${updated === 1 ? "" : "s"} updated`);
    return parts.join(" · ") || "No schedule changes";
  }

  function setImageStatus(message, tone = "working") {
    els.imageParserStatus.textContent = message;
    els.imageParserStatus.dataset.tone = tone;
    updateImportProgress(message);
  }

  function addReviewClass(item = {}, openEditor = true) {
    const card = document.createElement("fieldset");
    card.className = "review-class";
    card.dataset.kind = item.kind || "class";
    if (item.review_warning) card.dataset.warning = item.review_warning;
    if (Number.isFinite(item.recognition_confidence)) card.dataset.confidence = String(item.recognition_confidence);
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
    remove.addEventListener("click", () => {
      card.remove();
      selectReviewCard(null);
      renderReviewGrid();
      revealSection(els.addReviewClassButton, els.addReviewClassButton);
    });
    const done = document.createElement("button");
    done.className = "secondary-button";
    done.type = "button";
    done.textContent = "Done editing";
    done.addEventListener("click", () => {
      selectReviewCard(null);
      revealSection(els.addReviewClassButton, els.addReviewClassButton);
    });
    card.append(done, remove);
    els.imageReviewClasses.append(card);
    card.addEventListener("input", renderReviewGrid);
    card.addEventListener("change", renderReviewGrid);
    if (openEditor) selectReviewCard(card);
    else card.hidden = true;
    renderReviewGrid();
  }

  function reviewValue(card, field) {
    return card.querySelector(`[data-field="${field}"]`).value;
  }

  function selectReviewCard(card) {
    els.imageReviewClasses.querySelectorAll(".review-class").forEach(item => { item.hidden = item !== card; });
    els.imageReviewClasses.hidden = !card;
    els.addReviewClassButton.setAttribute("aria-expanded", String(Boolean(card)));
  }

  function renderReviewGrid() {
    const cards = [...els.imageReviewClasses.querySelectorAll(".review-class")];
    const needsCheck = card => Boolean(card.dataset.warning);
    const unchecked = cards.filter(needsCheck);
    els.recognitionReviewNotice.hidden = !unchecked.length;
    els.recognitionReviewSummary.textContent = unchecked.length
      ? `Note: ${unchecked.length} uncertain detection${unchecked.length === 1 ? "" : "s"}. Please double-check the ⚠ blocks before saving.` : "";
    cards.forEach(card => { card.querySelector("legend").textContent = "Edit busy block — only the day and times are required"; });
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
      add.addEventListener("click", () => {
        addReviewClass({ day, start: "08:15", end: "09:35", kind: "busy_block" });
        const card = els.imageReviewClasses.lastElementChild;
        revealSection(card, card.querySelector('[data-field="course"]'));
      });
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
          const passing = start - occupiedUntil <= BREAK_THRESHOLD_MINUTES;
          gap.className = passing ? "review-passing" : "review-break";
          gap.style.top = `${occupiedUntil - first}px`;
          gap.style.height = `${start - occupiedUntil}px`;
          gap.textContent = `${passing ? "Class Soon" : "Break"} ${start - occupiedUntil} min`;
          gap.title = `${day} ${passing ? "Class Soon" : "break"} ${clock(occupiedUntil)}–${clock(start)}`;
          track.append(gap);
        }
        const block = document.createElement("button");
        block.type = "button";
        block.className = "review-grid-block";
        block.style.top = `${start - first}px`;
        block.style.height = `${end - start}px`;
        block.textContent = `${clock(start)}–${clock(end)} ${needsCheck(card) ? "⚠ " : ""}${reviewValue(card, "course") || "Busy block"}`;
        block.title = `${day} ${block.textContent}. ${card.dataset.warning || "Select to edit."}`;
        block.setAttribute("aria-label", `${needsCheck(card) ? "Uncertain detection. " : ""}${block.title}`);
        block.addEventListener("click", () => { selectReviewCard(card); revealSection(card, card.querySelector('[data-field="course"]')); });
        track.append(block);
        occupiedUntil = Math.max(occupiedUntil ?? end, end);
      }
      column.append(add, track);
      els.reviewGrid.append(column);
    }
  }

  function openManualSchedule(name = "", person = { source_file: "manual", classes: [] }) {
    if (state.isParsing || state.pendingImage) return;
    state.pendingImage = { name, person, editingName: name || null };
    els.imageReviewName.value = name;
    setReviewSemester(person.semester, !name);
    els.imageReviewClasses.replaceChildren();
    els.imageReviewPreview.closest("details").hidden = true;
    person.classes.forEach(item => addReviewClass(item, false));
    selectReviewCard(null);
    renderReviewGrid();
    els.imageReview.hidden = false;
    openScheduleModal();
    updateScheduleModal();
    setImageStatus("Check the schedule or choose Add a class to add busy time. Empty time is free; labels are optional.", "success");
    revealSection(els.imageReview, els.imageReviewName);
  }

  function dismissDuplicatePicture(focus = false) {
    state.duplicatePicture = null;
    els.duplicatePicturePrompt.hidden = true;
    updateScheduleModal();
    if (focus) els.saveImageScheduleButton.focus({ preventScroll: true });
  }

  const normalizedScheduleName = name => name.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();

  function nextPictureName(name, people) {
    const existing = new Set(Object.keys(people).map(normalizedScheduleName));
    for (let number = 2; ; number++) {
      const suffix = ` ${number}`;
      const candidate = name.slice(0, 120 - suffix.length).trimEnd() + suffix;
      if (!existing.has(normalizedScheduleName(candidate))) return candidate;
    }
  }

  function clearImageReview() {
    dismissDuplicatePicture();
    state.pendingImage = null;
    if (state.imagePreviewUrl) URL.revokeObjectURL(state.imagePreviewUrl);
    state.imagePreviewUrl = null;
    els.imageReviewPreview.removeAttribute("src");
    els.imageReviewClasses.replaceChildren();
    selectReviewCard(null);
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
    startImportProgress("Reading the picture on this device…", true);
    try {
      const result = await window.WhosFreeImageParser.parseScheduleImage(file, { onProgress: message => setImageStatus(message) });
      const name = await waitForImportPictureName(result.name);
      state.pendingImage = { ...result, isPicture: true };
      state.imagePreviewUrl = URL.createObjectURL(file);
      els.imageReviewPreview.src = state.imagePreviewUrl;
      els.imageReviewPreview.closest("details").hidden = false;
      els.imageReviewName.value = name;
      setReviewSemester(result.person.semester, true);
      els.imageReviewClasses.replaceChildren();
      result.person.classes.forEach(item => addReviewClass(item, false));
      selectReviewCard(null);
      els.imageReview.hidden = false;
      if (els.scheduleModal.hidden) openScheduleModal();
      const busyCount = result.person.classes.filter(item => item.kind === "busy_block").length;
      setImageStatus(`${result.person.classes.length - busyCount} classes${busyCount ? ` and ${busyCount} other busy blocks` : ""} recognized. Check the schedule below before saving.`, "success");
      revealSection(els.imageReview, document.getElementById("imageReviewTitle"));
    } catch (error) {
      if (state.pendingImage) clearImageReview();
      setImageStatus(error.message || "The picture could not be read. Try a clear screenshot.", "error");
    } finally {
      state.isParsing = false;
      event.target.value = "";
      updateScheduleModal();
      endImportProgress(state.pendingImage ? document.getElementById("imageReviewTitle") : els.addScheduleImageButton);
    }
  }

  async function saveImageSchedule(decision = null) {
    if (!state.pendingImage || state.isParsing || state.duplicatePicture) return;
    els.imageReviewError.textContent = "";
    const requestedName = els.imageReviewName.value.trim();
    let name = requestedName;
    if (!name) { els.imageReviewError.textContent = "Enter the person's name before saving."; els.imageReviewName.focus(); return; }
    const term = els.imageReviewSemester.value;
    const year = els.imageReviewYear.value;
    if (term && !/^20\d{2}$/.test(year)) { els.imageReviewError.textContent = "Enter a semester year from 2000 to 2099."; els.imageReviewYear.focus(); return; }
    const semester = term ? `${term} ${year}` : null;
    const classes = [...els.imageReviewClasses.querySelectorAll(".review-class")].map(card => ({ ...Object.fromEntries(
      [...card.querySelectorAll("[data-field]")].map(input => [input.dataset.field, input.value.trim() || null])
    ), kind: card.dataset.kind || "class", ...(card.dataset.warning ? {
      review_warning: card.dataset.warning,
      ...(card.dataset.confidence ? { recognition_confidence: Number(card.dataset.confidence) } : {}),
    } : {}) }));
    // An empty manual schedule represents someone with no busy times.
    const workingData = state.hasData ? JSON.parse(JSON.stringify(state.data)) : { schema_version: 1, people: {} };
    const isPicture = state.pendingImage.isPicture;
    const matchingName = isPicture ? Object.keys(workingData.people).find(existing => normalizedScheduleName(existing) === normalizedScheduleName(name)) : null;
    const approved = decision?.requestedName === requestedName && decision?.existingName === matchingName;
    if (matchingName && approved) {
      name = decision.action === "both" ? nextPictureName(requestedName, workingData.people) : matchingName;
    }
    const editingName = state.pendingImage.editingName;
    const renamed = editingName && editingName !== name;
    const replacement = Object.prototype.hasOwnProperty.call(workingData.people, name);
    // Define an own property safely even if a person's name is __proto__.
    Object.defineProperty(workingData.people, name, { value: { ...state.pendingImage.person, source_file: state.pendingImage.person.source_file, semester, classes }, writable: true, enumerable: true, configurable: true });
    try { validateData(workingData); }
    catch (error) {
      els.imageReviewError.textContent = error.message;
      const invalidIndex = classes.findIndex(item => !ALL_DAYS.includes(item.day) || !Number.isFinite(toMinutes(item.start)) || !Number.isFinite(toMinutes(item.end)) || toMinutes(item.end) <= toMinutes(item.start));
      if (invalidIndex !== -1) {
        const card = els.imageReviewClasses.children[invalidIndex];
        selectReviewCard(card);
        revealSection(card, card.querySelector('[data-field="start"]'));
      }
      return;
    }
    if (matchingName && !approved) {
      state.duplicatePicture = { requestedName, existingName: matchingName };
      els.duplicatePictureMessage.textContent = `A schedule for ${matchingName} already exists. Replace it, keep both as ${nextPictureName(requestedName, workingData.people)}, or cancel?`;
      els.duplicatePicturePrompt.hidden = false;
      updateScheduleModal();
      revealSection(els.duplicatePicturePrompt, els.duplicatePicturePrompt.querySelector('[data-duplicate-action="cancel"]'));
      return;
    }
    if (!isPicture && replacement && !window.confirm(`Replace the existing schedule for ${name} with these reviewed classes?`)) return;
    if (renamed) delete workingData.people[editingName];
    const before = captureScheduleChange();
    state.isParsing = true;
    updateScheduleModal();
    try {
      state.data = workingData;
      if (renamed) {
        if (state.pinnedPeople.delete(editingName)) state.pinnedPeople.add(name);
        if (Object.prototype.hasOwnProperty.call(state.nicknames, editingName)) {
          Object.defineProperty(state.nicknames, name, { value: state.nicknames[editingName], enumerable: true, writable: true, configurable: true });
          delete state.nicknames[editingName];
        }
        for (const group of state.groups) group.members = [...new Set(group.members.map(member => member === editingName ? name : member))];
        for (const scope of Object.keys(state.personOrders)) state.personOrders[scope] = [...new Set(state.personOrders[scope].map(member => member === editingName ? name : member))];
        savePersonOrders();
        savePeoplePreferences(); saveGroupPreferences();
      }
      state.selectedPerson = name;
      const warning = await persistCurrentDatabase("Local schedule collection");
      const changed = rememberScheduleChange(before, `${editingName ? "Edited" : replacement ? "Replaced" : "Added"} ${name}'s schedule`);
      clearImageReview();
      setImageStatus(`Saved ${classes.length} schedule entries for ${name} on this device.`, "success");
      showToast(warning || (changed ? `Schedule ${editingName ? "updated" : replacement ? "replaced" : "added"}: ${displayName(name)}` : "No schedule changes"));
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
      if (person.semester != null && (typeof person.semester !== "string" || !/^(Winter|Fall) 20\d{2}$/.test(person.semester))) {
        throw new Error(`The semester for ${name} must be Winter or Fall followed by a year from 2000 to 2099.`);
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
    cleanGroupPreferences();
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
    updateImportProgress(message);
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
    if (state.isParsing || state.pendingImage || state.codeMode) return;
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
    updateScheduleModal();
    els.importSchedulesButton.disabled = true;
    els.shareSchedulesButton.disabled = true;
    setParserStatus(`Reading ${files.length === 1 ? files[0].name : `${files.length} schedule PDFs`}…`, "working");
    startImportProgress("Reading schedule PDFs…");

    try {
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
          workingData.people[parsed.name] = applyAutomaticSemester({ people: { person: parsed.person } }).people.person;
        } catch (error) {
          failures.push(`${file.name}: ${error.message}`);
        }
      }

      if (added || updated) {
        const before = captureScheduleChange();
        state.data = workingData;
        state.selectedPerson = null;
        const warning = await persistCurrentDatabase("Local schedule collection");
        rememberScheduleChange(before, `Imported ${added + updated} PDF schedule${added + updated === 1 ? "" : "s"}`);
        const resultParts = [];
        if (added) resultParts.push(`${added} added`);
        if (updated) resultParts.push(`${updated} updated`);
        if (failures.length) resultParts.push(`${failures.length} failed`);
        setParserStatus(`Done — ${resultParts.join(" · ")}.`, failures.length ? "warning" : "success");
        showToast(warning || `${scheduleImportToast(before)}${failures.length ? ` · ${failures.length} failed` : ""}`);
      } else {
        setParserStatus(failures[0] || "No schedules were added.", "error");
      }

      if (failures.length > 1) {
        console.warn("UFree PDF import errors\n" + failures.join("\n"));
      }

    } catch (error) {
      setParserStatus(error.message || "The PDFs could not be imported.", "error");
    } finally {
      state.isParsing = false;
      updateScheduleModal();
      event.target.value = "";
      endImportProgress(els.addSchedulePdfButton);
    }
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

  function codeStatus(element, message, tone = "") {
    element.textContent = message;
    element.dataset.tone = tone;
    if (element === els.importCodeStatus) updateImportProgress(message);
  }

  function exportSelectionChanged() {
    const inputs = [...els.exportPeopleList.querySelectorAll("input")];
    const selected = inputs.filter(input => input.checked).length;
    els.selectAllSchedules.checked = selected > 0 && selected === inputs.length;
    els.selectAllSchedules.indeterminate = selected > 0 && selected < inputs.length;
    els.exportSelectionSummary.textContent = selected === inputs.length && selected > 0 ? `Everyone · ${selected}` : `${selected} of ${inputs.length} selected`;
    els.exportCodeOutput.value = "";
    els.exportCodeField.hidden = true;
    els.copyCodeButton.hidden = true;
    resetShareLink(els.exportSharePanel);
    els.copyCodeButton.disabled = true;
    codeStatus(els.exportCodeStatus, `${selected} schedule${selected === 1 ? "" : "s"} selected.`);
  }

  function closeCodePanels() {
    if (state.isParsing) return;
    const fromHome = state.quickExport, returnFocus = state.quickExportReturnFocus;
    state.codeMode = null;
    state.quickExport = false;
    state.quickExportReturnFocus = null;
    resetSharedImport();
    resetShareLink(els.exportSharePanel);
    els.codeExportPanel.hidden = true;
    els.codeImportPanel.hidden = true;
    els.exportCodeOutput.value = "";
    els.importCodeInput.value = "";
    updateScheduleModal();
    if (fromHome) {
      els.scheduleModal.hidden = true;
      document.body.style.overflow = "";
      (returnFocus || els.homeExportButton).focus({ preventScroll: true });
    }
  }

  function openQuickExport(event) {
    if (state.isParsing || state.pendingImage || state.codeMode || !Object.keys(peopleMap()).length) return;
    if (!els.helpModal.hidden) closeHelp();
    state.quickExportReturnFocus = event?.currentTarget || els.homeExportButton;
    openScheduleModal();
    openCodePanel("export", true);
  }

  function openHelp() {
    if (state.isParsing || state.pendingImage || state.codeMode) return;
    els.helpModal.hidden = false;
    document.body.style.overflow = "hidden";
    els.helpModal.querySelector(".help-modal").scrollTop = 0;
    els.closeHelpModal.focus({ preventScroll: true });
  }

  function closeHelp() {
    els.helpModal.hidden = true;
    if (![els.scheduleModal, els.settingsModal, els.groupsModal, els.groupWeekModal, els.personWeekModal].some(modal => !modal.hidden)) document.body.style.overflow = "";
    els.helpButton.focus({ preventScroll: true });
  }

  function openCodePanel(mode, quick = false) {
    if (state.isParsing || state.pendingImage || state.codeMode) return;
    resetSharedImport();
    state.codeMode = mode;
    state.quickExport = quick;
    els.codeExportPanel.hidden = mode !== "export";
    els.codeImportPanel.hidden = mode !== "import";
    if (mode === "export") {
      resetExportFields(els.exportFieldOptions);
      els.exportPeopleList.replaceChildren();
      for (const name of Object.keys(peopleMap()).sort(comparePeopleNames)) {
        const label = document.createElement("label");
        label.className = "share-selection";
        const input = document.createElement("input");
        input.type = "checkbox";
        input.checked = quick;
        input.dataset.person = name;
        input.addEventListener("change", exportSelectionChanged);
        const caption = document.createElement("span");
        caption.textContent = displayName(name) === name ? name : `${displayName(name)} (${name})`;
        label.append(input, caption);
        els.exportPeopleList.append(label);
      }
      exportSelectionChanged();
      els.exportSelection.open = !quick;
      revealSection(els.codeExportPanel, quick ? els.generateCodeButton : els.exportSelection.querySelector("summary"));
    } else {
      els.importCodeInput.value = "";
      codeStatus(els.importCodeStatus, "");
      revealSection(els.codeImportPanel, els.importCodeInput);
    }
    updateScheduleModal();
  }

  function resetExportFields(options) {
    options.open = false;
    options.querySelectorAll("input").forEach(input => { input.checked = false; input.disabled = false; });
    options.querySelector("button").disabled = false;
  }

  function encodeSchedules(names, options) {
    const fields = [...options.querySelectorAll("input:checked")].map(input => input.dataset.exportField);
    return window.WhosFreeShareCode.encode({ people: Object.fromEntries(names.map(name => [name, peopleMap()[name]])) }, { fields });
  }

  function personExportFieldsChanged() {
    state.personWeekRequest++;
    els.personWeekCode.value = "";
    els.personWeekExport.hidden = true;
    els.copyPersonWeekCodeButton.disabled = true;
    resetShareLink(els.personSharePanel);
    codeStatus(els.personWeekExportStatus, "Export again to apply these details.");
  }

  function shareCodeReadyMessage(count, code) {
    const messageSize = code.length <= 1000 ? "Fits a 1,000-character message." : "Over 1,000 characters. Select fewer schedules for one Instagram message.";
    return `Code ready for ${count} schedule${count === 1 ? "" : "s"} · ${code.length.toLocaleString()} characters. ${messageSize}`;
  }

  async function generateShareCode(action = "code") {
    if (state.isParsing || state.codeMode !== "export") return;
    const names = [...els.exportPeopleList.querySelectorAll("input:checked")].map(input => input.dataset.person);
    if (!names.length) { codeStatus(els.exportCodeStatus, "Select at least one schedule to export.", "error"); return; }
    state.isParsing = true;
    updateScheduleModal();
    codeStatus(els.exportCodeStatus, "Creating the code on this device…");
    els.exportFieldOptions.open = false;
    resetShareLink(els.exportSharePanel);
    try {
      const code = action !== "code" && els.exportCodeOutput.value || await encodeSchedules(names, els.exportFieldOptions);
      els.exportCodeOutput.value = code;
      populateShareLink(code, els.exportSharePanel);
      els.exportCodeField.hidden = action !== "code";
      els.copyCodeButton.hidden = action !== "code";
      codeStatus(els.exportCodeStatus, shareCodeReadyMessage(names.length, code), "success");
      if (action === "qr") {
        if (!els.exportSharePanel.querySelector("textarea").value) throw new Error("This code cannot make a QR. Use Export Code instead.");
        toggleScheduleQr(els.exportSharePanel);
      } else if (action === "link") {
        if (!els.exportSharePanel.querySelector("textarea").value) throw new Error("This code cannot make a link. Use Export Code instead.");
        els.exportSharePanel.querySelector(".share-link-field").hidden = false;
        await copyScheduleLink(els.exportSharePanel);
      } else {
        els.exportSharePanel.hidden = true;
        revealSection(els.exportCodeField);
      }
    } catch (error) {
      els.exportCodeOutput.value = "";
      codeStatus(els.exportCodeStatus, error.message || "The code could not be created.", "error");
    } finally { state.isParsing = false; updateScheduleModal(); }
  }

  async function copyShareCode() {
    if (!els.exportCodeOutput.value || state.isParsing) return;
    await copyExportCode(els.exportCodeOutput, els.exportCodeStatus);
  }

  function resetShareLink(panel) {
    panel.hidden = true;
    panel.querySelector("textarea").value = "";
    const qr = panel.querySelector(".share-qr");
    qr.hidden = true;
    qr.replaceChildren();
    const button = shareQrButton(panel);
    if ([els.exportSharePanel, els.personQuickSharePanel].includes(panel)) panel.querySelector(".share-link-field").hidden = true;
    else button.textContent = "Show QR";
    button.setAttribute("aria-expanded", "false");
    codeStatus(panel.querySelector(".share-link-status"), "");
  }

  function populateShareLink(code, panel) {
    resetShareLink(panel);
    try {
      panel.querySelector("textarea").value = window.WhosFreeShareCode.createLink(code, APP_URL);
      panel.hidden = false;
    } catch { /* The original code remains available if link creation fails. */ }
  }

  async function copyScheduleLink(panel) {
    const output = panel.querySelector("textarea"), status = panel.querySelector(".share-link-status");
    if (!output.value) return;
    try {
      await navigator.clipboard.writeText(output.value);
      codeStatus(status, "Link copied. Your friend can open it to review and add schedules.", "success");
    } catch {
      output.focus(); output.select();
      codeStatus(status, "Select and copy the link above.");
    }
  }

  function toggleScheduleQr(panel) {
    const qr = panel.querySelector(".share-qr"), button = shareQrButton(panel);
    const staticLabel = [els.exportSharePanel, els.personQuickSharePanel].includes(panel);
    const status = panel.querySelector(".share-link-status");
    if (!qr.hidden) {
      qr.hidden = true; if (!staticLabel) button.textContent = "Show QR"; button.setAttribute("aria-expanded", "false"); return;
    }
    const link = panel.querySelector("textarea").value;
    if (!link) return;
    try {
      if (link.length > 2331) throw new RangeError("QR selection too large");
      const generator = window.qrcodegen;
      if (!generator) throw new Error("QR generator unavailable");
      const code = generator.QrCode.encodeText(link, generator.QrCode.Ecc.MEDIUM);
      const ns = "http://www.w3.org/2000/svg", svg = document.createElementNS(ns, "svg");
      const size = code.size + 8;
      svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
      svg.setAttribute("role", "img");
      svg.setAttribute("aria-label", "Scan to review and add these schedules in UFree");
      svg.setAttribute("shape-rendering", "crispEdges");
      const background = document.createElementNS(ns, "rect");
      background.setAttribute("width", String(size)); background.setAttribute("height", String(size)); background.setAttribute("fill", "#fff");
      const path = document.createElementNS(ns, "path"), cells = [];
      for (let y = 0; y < code.size; y++) for (let x = 0; x < code.size; x++) if (code.getModule(x, y)) cells.push(`M${x + 4},${y + 4}h1v1h-1z`);
      path.setAttribute("d", cells.join("")); path.setAttribute("fill", "#000");
      svg.append(background, path); qr.replaceChildren(svg); qr.hidden = false;
      if (!staticLabel) button.textContent = "Hide QR"; button.setAttribute("aria-expanded", "true");
      codeStatus(status, code.version > 25 ? "Scan with your phone camera. This QR is dense; select fewer people if scanning is difficult." : "Scan with your phone camera, then open the link. Anyone with the QR or link can read these schedules.");
      revealSection(qr);
    } catch (error) {
      codeStatus(status, error instanceof RangeError ? "Too much data for one QR. Select fewer schedules, or copy the code or link." : "QR could not be created. Refresh the app, or copy the link.", "error");
    }
  }

  function resetSharedImport() {
    state.sharedImport = null;
    els.sharedImportPreview.hidden = true;
    els.sharedImportPeople.replaceChildren();
    els.importCodeField.hidden = false;
    els.importCodeHelp.hidden = false;
    els.decodeCodeButton.textContent = "Import schedules";
    els.closeImportButton.textContent = "Done";
  }

  async function previewSharedImport(input) {
    if (state.isParsing) return;
    state.isParsing = true;
    updateScheduleModal();
    codeStatus(els.importCodeStatus, "Opening shared schedules on this device…");
    startImportProgress("Reading the shared schedules…", false, "Opening shared schedules");
    try {
      // Let the loading popup paint before parsing a potentially large code.
      await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
      const imported = await window.WhosFreeShareCode.decode(input);
      validateData(imported);
      state.sharedImport = imported;
      els.sharedImportPeople.replaceChildren();
      for (const [name, person] of Object.entries(imported.people)) {
        const label = document.createElement("label"); label.className = "share-selection";
        const checkbox = document.createElement("input"); checkbox.type = "checkbox"; checkbox.checked = true; checkbox.dataset.person = name;
        checkbox.addEventListener("change", updateScheduleModal);
        const caption = document.createElement("span");
        caption.textContent = `${name} · ${person.classes.length} class${person.classes.length === 1 ? "" : "es"}${person.semester ? ` · ${person.semester}` : ""}`;
        label.append(checkbox, caption); els.sharedImportPeople.append(label);
      }
      els.sharedImportPreview.hidden = false;
      els.importCodeField.hidden = true;
      els.importCodeHelp.hidden = true;
      els.decodeCodeButton.textContent = "Add schedules";
      els.closeImportButton.textContent = "Cancel";
      codeStatus(els.importCodeStatus, "Add these schedules to this device? Existing duplicates are skipped.");
    } catch (error) {
      resetSharedImport();
      codeStatus(els.importCodeStatus, error.message || "This shared link could not be opened.", "error");
    } finally {
      state.isParsing = false; updateScheduleModal();
      endImportProgress(els.decodeCodeButton);
      els.decodeCodeButton.focus({ preventScroll: true });
    }
  }

  async function openSharedLink() {
    if (!location.hash.startsWith("#import=")) return;
    if (!state.deviceReady) {
      state.sharedLinkStartup = true;
      startImportProgress("Loading your saved schedules…", false, "Opening shared schedules");
      return;
    }
    if (state.isParsing || state.pendingImage || state.codeMode) {
      showToast("Finish the current import or export, then open the shared link again."); return;
    }
    const input = location.href;
    // Consume the fragment before opening dialogs, so refresh cannot import it again.
    try { history.replaceState(null, "", location.pathname + location.search); } catch { /* Read-only browser histories still show the preview. */ }
    if (!els.personQuickShareModal.hidden) closePersonQuickShare();
    if (!els.personGroupModal.hidden) closePersonGroup();
    if (!els.personWeekModal.hidden) closePersonWeek();
    if (!els.settingsModal.hidden) closeSettingsModal();
    if (!els.groupWeekModal.hidden) closeGroupWeek();
    if (!els.groupsModal.hidden) closeGroupsModal();
    if (!els.helpModal.hidden) closeHelp();
    openScheduleModal();
    openCodePanel("import");
    els.importCodeInput.value = input;
    await previewSharedImport(input);
  }

  async function copyExportCode(output, status) {
    if (!output.value) return;
    try {
      await navigator.clipboard.writeText(output.value);
      codeStatus(status, "Code copied. Paste it into your message.", "success");
    } catch {
      output.focus();
      output.select();
      codeStatus(status, "Select and copy the code above, then paste it into your message.");
    }
  }

  function resolveCodeConflict(conflict) {
    return new Promise(resolve => {
      endImportProgress();
      state.codeConflict = { resolve };
      els.codeConflictMessage.textContent = `A different schedule for ${conflict.existingName} already exists. Keep both as ${conflict.newName}, replace the old schedule, or keep the old one?`;
      els.codeConflictPrompt.hidden = false;
      revealSection(els.codeConflictPrompt, els.codeConflictPrompt.querySelector('[data-code-conflict-action="old"]'));
    });
  }

  function finishCodeConflict(choice) {
    if (!state.codeConflict) return;
    const { resolve } = state.codeConflict;
    state.codeConflict = null;
    els.codeConflictPrompt.hidden = true;
    if (choice !== null) startImportProgress("Finishing schedule import…");
    resolve(choice);
  }

  async function importShareCode() {
    if (state.isParsing || state.codeMode !== "import") return;
    if (!state.sharedImport && /^(?:https?:\/\/|WFL[56])/i.test(els.importCodeInput.value.trim())) { await previewSharedImport(els.importCodeInput.value); return; }
    const selected = state.sharedImport ? [...els.sharedImportPeople.querySelectorAll("input:checked")].map(input => input.dataset.person) : null;
    if (selected && !selected.length) return;
    if (!els.importCodeInput.value.trim()) { codeStatus(els.importCodeStatus, "Paste a code to import.", "error"); els.importCodeInput.focus(); return; }
    state.isParsing = true;
    updateScheduleModal();
    codeStatus(els.importCodeStatus, "Opening the code on this device…");
    startImportProgress("Opening the code on this device…");
    try {
      const imported = state.sharedImport ? { ...state.sharedImport, people: Object.fromEntries(selected.map(name => [name, state.sharedImport.people[name]])) } : await window.WhosFreeShareCode.decode(els.importCodeInput.value);
      validateData(imported);
      applyAutomaticSemester(imported);
      const result = await window.WhosFreeShareCode.merge(state.hasData ? state.data : null, imported, resolveCodeConflict);
      validateData(result.data);
      const before = captureScheduleChange();
      let warning = null;
      if (result.added || result.replaced) {
        state.data = result.data;
        warning = await persistCurrentDatabase("Local schedule collection");
        rememberScheduleChange(before, `Imported ${result.added} and replaced ${result.replaced || 0} schedules from a code`);
      }
      const renameNote = result.renamed.length ? ` Imported different schedules as ${result.renamed.map(item => item.to).join(", ")}. You can edit their names in the people list.` : "";
      const choicesNote = result.replaced || result.kept ? ` Replaced ${result.replaced || 0}. Kept ${result.kept || 0} old schedules.` : "";
      codeStatus(els.importCodeStatus, warning || `Imported ${result.added} schedule${result.added === 1 ? "" : "s"}. Skipped ${result.skipped} identical schedules.${choicesNote}${renameNote}`, warning ? "error" : "success");
      showToast(warning || scheduleImportToast(before));
      if (state.sharedImport) { resetSharedImport(); els.importCodeInput.value = ""; }
    } catch (error) {
      codeStatus(els.importCodeStatus, error.message || "The code could not be imported.", "error");
    } finally { finishCodeConflict(null); state.isParsing = false; updateScheduleModal(); endImportProgress(els.decodeCodeButton); els.decodeCodeButton.focus({ preventScroll: true }); }
  }

  async function handleLocalScheduleFile(event) {
    if (state.isParsing || state.pendingImage || state.codeMode) return;
    const [file] = event.target.files || [];
    if (!file) return;
    const hadData = state.hasData;
    state.isParsing = true;
    updateScheduleModal();
    startImportProgress(`Reading ${file.name}…`);

    try {
      const text = await file.text();
      const imported = JSON.parse(text);
      validateData(imported);
      applyAutomaticSemester(imported);

      const existingPeople = hadData ? (state.data.people || {}) : {};
      const importedPeople = imported.people || {};
      const merged = {
        schema_version: imported.schema_version || state.data.schema_version || 1,
        people: {
          ...existingPeople,
          ...importedPeople,
        },
      };
      validateData(merged);

      const before = captureScheduleChange();
      state.data = merged;
      state.hasData = true;
      state.selectedPerson = null;
      state.loadError = null;
      const warning = await persistCurrentDatabase(hadData ? "Merged schedule collection" : file.name);
      rememberScheduleChange(before, `Imported ${file.name}`);

      closeScheduleModal();
      updateScheduleModal();
      showToast(warning || scheduleImportToast(before));
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
      state.isParsing = false;
      updateScheduleModal();
      event.target.value = "";
      endImportProgress();
    }
  }

  async function loadSchedulesFromDevice() {
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
      const needsSemesterMigration = Object.values(record.data.people || {}).some(person => person.semester === undefined);
      applyAutomaticSemester(record.data);
      // Persist the first assigned term so it stays attached after future rollovers.
      let migrationWarning = null;
      if (needsSemesterMigration) {
        try { await saveLocalScheduleRecord(record); }
        catch (error) { migrationWarning = error.message; }
      }
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
      if (migrationWarning) showToast(`Semester labels assigned, but could not be saved: ${migrationWarning}`);
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
    if (state.isParsing || state.pendingImage || state.codeMode) return;
    if (!state.hasData || !Object.prototype.hasOwnProperty.call(state.data.people || {}, name)) return;
    const confirmed = window.confirm(`Remove ${displayName(name)} from this device?`);
    if (!confirmed) return;

    const before = captureScheduleChange();
    const label = `Removed ${displayName(name)}`;
    state.isParsing = true;
    updateScheduleModal();
    delete state.data.people[name];
    state.mutedPeople.delete(name);
    state.pinnedPeople.delete(name);
    delete state.nicknames[name];
    cleanGroupPreferences();
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
      rememberScheduleChange(before, label);
      state.isParsing = false;
      renderDataSetup();
      updateScheduleModal();
      updateSettingsModal();
      showToast(`Schedule removed: ${displayName(name)}`);
      return;
    }

    const warning = await persistCurrentDatabase("Local schedule collection");
    rememberScheduleChange(before, label);
    state.isParsing = false;
    updateScheduleModal();
    updateSettingsModal();
    showToast(warning || `Schedule removed: ${displayName(name)}`);
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
      const label = document.createElement("div");
      label.className = `schedule-semester${semesterIsOlder(person.semester) ? " semester-older" : ""}`;
      label.textContent = scheduleLabel(person, true);
      copy.append(title, detail);
      copy.append(label);

      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "mini-danger-button";
      removeButton.textContent = "Remove";
      removeButton.disabled = state.isParsing || Boolean(state.pendingImage) || Boolean(state.codeMode);
      removeButton.setAttribute("aria-label", `Remove ${displayName(name)}`);
      removeButton.addEventListener("click", () => removePerson(name));

      const editButton = document.createElement("button");
      editButton.type = "button";
      editButton.className = "secondary-button";
      editButton.textContent = "Edit";
      editButton.disabled = state.isParsing || Boolean(state.pendingImage) || Boolean(state.codeMode);
      editButton.setAttribute("aria-label", `Edit ${displayName(name)}`);
      editButton.addEventListener("click", () => openManualSchedule(name, JSON.parse(JSON.stringify(person))));
      row.append(copy, editButton, removeButton);
      els.peopleManagerList.append(row);
    }
  }

  function updateScheduleFlow() {
    const dialog = els.scheduleModal.querySelector(".schedule-modal");
    const sharing = els.codeImportPanel.closest(".schedule-action-section");
    const flow = state.pendingImage ? "review" : state.codeMode ? `code-${state.codeMode}` : "";
    const previous = dialog.dataset.scheduleFlow || "";
    const activeSection = flow === "review" ? els.imageReview : state.codeMode ? sharing : null;

    for (const section of dialog.children) {
      if (section.classList.contains("modal-header")) continue;
      section.hidden = section === els.imageReview ? flow !== "review" : Boolean(flow) && section !== activeSection;
    }
    for (const section of sharing.children) {
      if (section === els.codeImportPanel || section === els.codeExportPanel) continue;
      section.hidden = Boolean(state.codeMode);
    }
    els.codeImportPanel.hidden = state.codeMode !== "import";
    els.codeExportPanel.hidden = state.codeMode !== "export";
    document.getElementById("scheduleModalTitle").textContent = flow === "review" ? "Review schedule" : flow === "code-import" ? "Import schedules" : flow === "code-export" ? state.quickExport ? "Quick share" : "Share schedules" : "Schedule data";
    dialog.querySelector(".modal-header p").hidden = Boolean(flow);
    if (flow) dialog.dataset.scheduleFlow = flow;
    else delete dialog.dataset.scheduleFlow;
    if (previous !== flow) {
      dialog.scrollTop = 0;
      if (!flow && !els.scheduleModal.hidden && !state.importProgress) {
        const target = previous === "review" ? els.addScheduleImageButton : previous === "code-export" ? els.exportSchedulesButton : els.importCodeButton;
        target.focus({ preventScroll: true });
      }
    }
  }

  function updateScheduleModal() {
    updateUndoControls();
    updateGroupToolbar();
    const peopleCount = Object.keys(peopleMap()).length;
    renderPeopleManager();
    const importBusy = state.isParsing || Boolean(state.pendingImage) || Boolean(state.codeMode);
    els.exportSchedulesButton.disabled = importBusy || peopleCount === 0;
    els.homeExportButton.disabled = importBusy || peopleCount === 0;
    els.importCodeButton.disabled = importBusy;
    els.generateCodeButton.disabled = state.isParsing;
    els.exportQrButton.disabled = state.isParsing;
    els.copyExportLinkButton.disabled = state.isParsing;
    els.copyCodeButton.disabled = state.isParsing || !els.exportCodeOutput.value;
    els.decodeCodeButton.disabled = state.isParsing || Boolean(state.sharedImport && !els.sharedImportPeople.querySelector("input:checked"));
    els.closeExportButton.disabled = state.isParsing;
    els.closeImportButton.disabled = state.isParsing;
    els.importCodeInput.disabled = state.isParsing;
    els.closeScheduleModal.disabled = Boolean(state.codeMode) && state.isParsing;
    els.selectAllSchedules.disabled = state.isParsing;
    els.exportPeopleList.querySelectorAll("input").forEach(input => { input.disabled = state.isParsing; });
    els.exportFieldOptions.querySelectorAll("input, button").forEach(input => { input.disabled = state.isParsing; });
    els.sharedImportPeople.querySelectorAll("input").forEach(input => { input.disabled = state.isParsing; });
    els.addSchedulePdfButton.disabled = importBusy;
    els.addScheduleImageButton.disabled = importBusy;
    els.manualScheduleButton.disabled = importBusy;
    els.importSchedulesButton.disabled = importBusy;
    els.shareSchedulesButton.disabled = importBusy || !state.hasData || peopleCount === 0;
    els.removeSchedulesButton.disabled = importBusy || !state.hasData;
    els.saveImageScheduleButton.disabled = state.isParsing || Boolean(state.duplicatePicture);
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
    updateScheduleFlow();
    updateSettingsModal();
  }

  function openScheduleModal() {
    const wasHidden = els.scheduleModal.hidden;
    updateScheduleModal();
    els.scheduleModal.hidden = false;
    document.body.style.overflow = "hidden";
    if (!wasHidden) return;
    els.advancedScheduleOptions.open = false;
    document.getElementById("storedPeopleSection").open = false;
    els.scheduleModal.querySelector(".schedule-modal").scrollTop = 0;
    requestAnimationFrame(() => {
      if (els.scheduleModal.hidden) return;
      animateModalOpen(els.scheduleModal, els.scheduleModal.querySelector(".schedule-modal"));
      els.closeScheduleModal.focus();
    });
  }

  function closeScheduleModal() {
    if (state.codeMode && state.isParsing) return;
    if (state.codeMode) closeCodePanels();
    els.scheduleModal.hidden = true;
    if (els.settingsModal.hidden) document.body.style.overflow = "";
  }

  async function removeSchedules() {
    if (state.isParsing || state.pendingImage || state.codeMode) return;
    if (!state.hasData) return;
    const confirmed = window.confirm("Remove the schedules stored in this browser? You can add the JSON file again later.");
    if (!confirmed) return;

    const before = captureScheduleChange();
    state.isParsing = true;
    updateScheduleModal();
    await deleteLocalScheduleRecord();
    state.data = { people: {} };
    state.hasData = false;
    state.scheduleMeta = null;
    state.selectedPerson = null;
    state.loadError = null;
    cleanGroupPreferences();
    rememberScheduleChange(before, "Removed all local schedules");
    state.isParsing = false;
    closeScheduleModal();
    renderDataSetup();
    updateScheduleModal();
    updateSettingsModal();
    showToast("All local schedules removed");
  }

  function iconAction(label, path, extraClass = "") {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `secondary-button person-action-icon ${extraClass}`.trim();
    button.title = label;
    button.setAttribute("aria-label", label);
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    const shape = document.createElementNS(svg.namespaceURI, "path");
    shape.setAttribute("d", path);
    svg.append(shape); button.append(svg);
    return button;
  }

  function shareQrButton(panel) {
    if (panel === els.exportSharePanel) return els.exportQrButton;
    if (panel === els.personQuickSharePanel) return els.personQuickQrButton;
    return panel.querySelector(".toggle-share-qr");
  }

  function unlockClosedModals() {
    if (![...document.querySelectorAll(".modal-backdrop")].some(modal => !modal.hidden)) document.body.style.overflow = "";
  }

  function personQuickShareButtons() {
    return [els.personQuickUrlButton, els.personQuickQrButton, els.personQuickCodeButton];
  }

  function resetPersonQuickOutputs() {
    els.personQuickCode.value = "";
    els.personQuickCodeField.hidden = true;
    els.copyPersonQuickCode.disabled = true;
    resetShareLink(els.personQuickSharePanel);
    codeStatus(els.personQuickShareStatus, "");
  }

  function openPersonQuickShare(name, returnFocus) {
    if (state.isParsing || state.pendingImage || state.codeMode || !peopleMap()[name]) return;
    state.personShareRequest++;
    state.personShareName = name;
    state.personShareBusy = false;
    state.personShareReturnFocus = returnFocus;
    els.personQuickShareTitle.textContent = `Share ${displayName(name)}`;
    resetExportFields(els.personQuickExportFields);
    resetPersonQuickOutputs();
    personQuickShareButtons().forEach(button => { button.disabled = false; });
    els.personQuickShareModal.hidden = false;
    els.personQuickShareModal.querySelector(".schedule-modal").scrollTop = 0;
    document.body.style.overflow = "hidden";
    els.closePersonQuickShare.focus({ preventScroll: true });
    animateModalOpen(els.personQuickShareModal, els.personQuickShareModal.querySelector(".schedule-modal"));
  }

  function closePersonQuickShare() {
    const name = state.personShareName, returnFocus = state.personShareReturnFocus;
    state.personShareRequest++;
    state.personShareName = null;
    state.personShareBusy = false;
    state.personShareReturnFocus = null;
    els.personQuickShareModal.hidden = true;
    resetPersonQuickOutputs();
    unlockClosedModals();
    const card = [...els.peopleList.querySelectorAll(".person-card")].find(item => item.dataset.person === name);
    const expandedShare = state.selectedPerson === name ? document.getElementById("sharePersonScheduleButton") : null;
    (returnFocus?.isConnected ? returnFocus : expandedShare || card?.querySelector(".person-select-button"))?.focus({ preventScroll: true });
  }

  function personQuickFieldsChanged() {
    state.personShareRequest++;
    resetPersonQuickOutputs();
    codeStatus(els.personQuickShareStatus, "Export again to apply these details.");
  }

  async function exportPersonQuickSchedule(action) {
    const name = state.personShareName;
    if (!name || !peopleMap()[name] || state.personShareBusy) return;
    const request = ++state.personShareRequest;
    state.personShareBusy = true;
    personQuickShareButtons().forEach(button => { button.disabled = true; });
    els.personQuickExportFields.open = false;
    els.personQuickExportFields.querySelectorAll("input, button").forEach(input => { input.disabled = true; });
    resetPersonQuickOutputs();
    codeStatus(els.personQuickShareStatus, "Creating this person's share…");
    try {
      const code = await encodeSchedules([name], els.personQuickExportFields);
      if (request !== state.personShareRequest) return;
      els.personQuickCode.value = code;
      populateShareLink(code, els.personQuickSharePanel);
      if (action === "code") {
        els.personQuickSharePanel.hidden = true;
        els.personQuickCodeField.hidden = false;
        els.copyPersonQuickCode.disabled = false;
        revealSection(els.personQuickCodeField);
      } else {
        if (!els.personQuickSharePanel.querySelector("textarea").value) throw new Error("Use Text Code for this schedule instead.");
        if (action === "qr") toggleScheduleQr(els.personQuickSharePanel);
        else {
          els.personQuickSharePanel.querySelector(".share-link-field").hidden = false;
          await copyScheduleLink(els.personQuickSharePanel);
          if (request !== state.personShareRequest) return;
        }
      }
      codeStatus(els.personQuickShareStatus, shareCodeReadyMessage(1, code), "success");
    } catch (error) {
      if (request === state.personShareRequest) {
        resetPersonQuickOutputs();
        codeStatus(els.personQuickShareStatus, error.message || "This schedule could not be shared.", "error");
      }
    } finally {
      if (request === state.personShareRequest) {
        state.personShareBusy = false;
        personQuickShareButtons().forEach(button => { button.disabled = false; });
        els.personQuickExportFields.querySelectorAll("input, button").forEach(input => { input.disabled = false; });
      }
    }
  }

  function openPersonGroup(name) {
    if (state.isParsing || state.pendingImage || state.codeMode || !peopleMap()[name]) return;
    state.groupPerson = name;
    els.personGroupTitle.textContent = `Add ${displayName(name)} to a group`;
    els.personGroupSelect.replaceChildren();
    for (const group of state.groups.filter(group => !group.members.includes(name))) {
      const option = document.createElement("option");
      option.value = group.id; option.textContent = group.name;
      els.personGroupSelect.append(option);
    }
    const hasOptions = els.personGroupSelect.options.length > 0;
    els.personGroupField.hidden = !hasOptions;
    els.personGroupEmpty.hidden = hasOptions;
    els.personGroupEmpty.textContent = state.groups.length ? "This person already belongs to every group." : "Create a group in Manage groups first.";
    els.savePersonGroup.disabled = !hasOptions;
    els.personGroupModal.hidden = false;
    document.body.style.overflow = "hidden";
    els.closePersonGroup.focus({ preventScroll: true });
    animateModalOpen(els.personGroupModal, els.personGroupModal.querySelector(".schedule-modal"));
  }

  function closePersonGroup() {
    state.groupPerson = null;
    els.personGroupModal.hidden = true;
    unlockClosedModals();
    document.getElementById("addPersonGroupButton")?.focus({ preventScroll: true });
  }

  function addPersonToGroup(event) {
    event.preventDefault();
    const name = state.groupPerson;
    const group = state.groups.find(group => group.id === els.personGroupSelect.value);
    if (!name || !peopleMap()[name] || !group || group.members.includes(name)) return;
    group.members.push(name);
    const persisted = saveGroupPreferences();
    refresh({ preserveScroll: true });
    closePersonGroup();
    if (persisted) showToast(`${displayName(name)} added to ${group.name}.`);
  }

  function renderPersonCard(name, day, minute, scope = "main") {
    const busyClass = currentClass(name, day, minute);
    const busy = !isFree(name, day, minute);
    const selected = name === state.selectedPerson;
    const pinned = state.pinnedPeople.has(name);

    const button = document.createElement("div");
    button.tabIndex = -1;
    button.className = `person-card${semesterIsOlder(peopleMap()[name].semester) ? " semester-expired" : ""}${selected ? " selected" : ""}${pinned ? " pinned" : ""}`;
    button.setAttribute("role", "listitem");

    const dot = document.createElement("span");
    dot.className = `person-status-dot${busy ? " busy" : ""}`;
    dot.setAttribute("aria-hidden", "true");

    const copy = document.createElement("span");
    copy.className = "person-copy";

    const personName = document.createElement("button");
    personName.type = "button";
    personName.className = "person-name person-select-button";
    personName.setAttribute("aria-label", `View details for ${displayName(name)}`);
    personName.setAttribute("aria-pressed", String(selected));
    personName.setAttribute("aria-describedby", "personOrderHelp");
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
    if (busyClass) {
      detail.textContent = classLabel(busyClass);
    } else if (busy) {
      const next = nextClassToday(name, day, minute);
      detail.textContent = `Class Soon · next class at ${formatTime(next.start)}`;
    } else {
      const next = nextClassToday(name, day, minute);
      detail.textContent = next ? `Next ${formatTime(next.start)} · ${classLabel(next)}` : "No more classes today";
    }

    copy.append(personName, detail);
    if (semesterIsOlder(peopleMap()[name].semester)) {
      const label = document.createElement("span");
      label.className = `schedule-semester${semesterIsOlder(peopleMap()[name].semester) ? " semester-older" : ""}`;
      label.textContent = scheduleLabel(peopleMap()[name]);
      copy.append(label);
    }
    if (busy) {
      const times = document.createElement("span");
      times.className = "person-availability";
      const upcoming = window.WhosFreeAvailability.nextFreePeriod(classesForDay(name, day), minute);
      const nextLabel = upcoming.afterClasses ? "Free after classes at" : "Next break starts at";
      times.textContent = `${busyClass ? `This class ends at ${formatTime(busyClass.end)}\n` : ""}${nextLabel} ${formatTime(minuteTime(upcoming.start))}`;
      copy.append(times);
    }

    const badge = document.createElement("span");
    badge.className = `status-badge ${busy ? "busy" : "free"}`;
    badge.textContent = busyClass ? "IN CLASS" : busy ? "Class Soon" : "FREE";
    badge.style.whiteSpace = "pre-line";

    button.append(dot, copy, badge);
    attachPersonReorder(button, name, scope);
    button.addEventListener("click", () => {
      if (state.activeReorder || Date.now() < state.suppressCardClickUntil) return;
      state.selectedPerson = name;
      refresh({ preserveScroll: true });
      animateSelectedCard();
      if (window.matchMedia("(max-width: 880px)").matches) {
        requestAnimationFrame(() => els.detailPanel.scrollIntoView({ behavior: "smooth", block: "start" }));
      }
    });
    button.addEventListener("keydown", event => {
      if (event.target !== button || event.altKey || !["Enter", " "].includes(event.key)) return;
      event.preventDefault(); button.click();
    });

    return button;
  }

  function renderEmptyDetail() {
    state.lastDetailPerson = null;
    els.detailPanel.innerHTML = `
      <div class="empty-detail">
        <div class="empty-symbol" aria-hidden="true">◎</div>
        <h2>Select someone</h2>
        <p>Choose a person to see their day.</p>
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

  function openPersonWeek(name) {
    const person = peopleMap()[name];
    if (!person) return;
    state.weekPerson = name;
    state.personWeekRequest++;
    els.personWeekTitle.textContent = displayName(name);
    els.personWeekSemester.textContent = scheduleLabel(person, true);
    els.personWeekExport.hidden = true;
    resetExportFields(els.personExportFieldOptions);
    resetShareLink(els.personSharePanel);
    els.personWeekCode.value = "";
    els.copyPersonWeekCodeButton.disabled = true;
    els.exportPersonScheduleButton.disabled = false;
    codeStatus(els.personWeekExportStatus, "");
    const classes = ALL_DAYS.flatMap(day => classesForDay(name, day)).filter(item => toMinutes(item.end) > toMinutes(item.start));
    const first = Math.min(480, ...classes.map(item => Math.floor(toMinutes(item.start) / 60) * 60));
    const last = Math.max(1200, ...classes.map(item => Math.ceil(toMinutes(item.end) / 60) * 60));
    els.personWeekEmpty.hidden = classes.length > 0;
    els.personWeekGrid.replaceChildren();
    const axis = document.createElement("div");
    axis.className = "review-time-axis";
    for (let time = first; time <= last; time += 60) {
      const label = document.createElement("span");
      label.textContent = minuteTime(time);
      label.style.top = `${time - first + 48}px`;
      axis.append(label);
    }
    els.personWeekGrid.append(axis);
    for (const day of ALL_DAYS) {
      const column = document.createElement("div");
      column.className = "review-day";
      const heading = document.createElement("div");
      heading.className = "review-day-heading group-day-heading";
      heading.textContent = day;
      const track = document.createElement("div");
      track.className = "review-day-track";
      track.style.height = `${last - first}px`;
      for (const item of classes.filter(item => item.day === day)) {
        const block = document.createElement("div");
        block.className = "review-grid-block person-week-block";
        block.dataset.day = day;
        block.dataset.start = item.start;
        block.dataset.end = item.end;
        block.style.top = `${toMinutes(item.start) - first}px`;
        block.style.height = `${toMinutes(item.end) - toMinutes(item.start)}px`;
        block.textContent = `${item.start}–${item.end}\n${classLabel(item)}${item.instructor ? `\n${item.instructor}` : ""}`;
        block.title = `${day} ${block.textContent}`;
        track.append(block);
      }
      column.append(heading, track);
      els.personWeekGrid.append(column);
    }
    els.personWeekModal.hidden = false;
    const dialog = els.personWeekModal.querySelector(".person-week-modal");
    dialog.scrollTop = 0;
    els.personWeekGrid.parentElement.scrollLeft = 0;
    document.body.style.overflow = "hidden";
    els.closePersonWeekModal.focus();
    animateModalOpen(els.personWeekModal, dialog);
  }

  function closePersonWeek() {
    state.personWeekRequest++;
    state.weekPerson = null;
    els.personWeekModal.hidden = true;
    if (![els.scheduleModal, els.settingsModal, els.groupsModal, els.groupWeekModal].some(modal => !modal.hidden)) document.body.style.overflow = "";
    document.getElementById("fullScheduleButton")?.focus({ preventScroll: true });
  }

  async function exportPersonSchedule() {
    const name = state.weekPerson;
    if (!name || !peopleMap()[name] || els.exportPersonScheduleButton.disabled) return;
    const request = ++state.personWeekRequest;
    els.exportPersonScheduleButton.disabled = true;
    els.personExportFieldOptions.open = false;
    els.personExportFieldOptions.querySelectorAll("input, button").forEach(input => { input.disabled = true; });
    els.copyPersonWeekCodeButton.disabled = true;
    els.personWeekExport.hidden = true;
    els.personWeekCode.value = "";
    codeStatus(els.personWeekExportStatus, "Creating the code on this device…");
    resetShareLink(els.personSharePanel);
    try {
      const code = await encodeSchedules([name], els.personExportFieldOptions);
      if (request !== state.personWeekRequest) return;
      els.personWeekCode.value = code;
      populateShareLink(code, els.personSharePanel);
      els.personWeekExport.hidden = false;
      els.copyPersonWeekCodeButton.disabled = false;
      codeStatus(els.personWeekExportStatus, shareCodeReadyMessage(1, code), "success");
      revealSection(els.personWeekExport, els.personWeekCode);
    } catch (error) {
      if (request === state.personWeekRequest) codeStatus(els.personWeekExportStatus, error.message || "The code could not be created.", "error");
    } finally {
      if (request === state.personWeekRequest) {
        els.exportPersonScheduleButton.disabled = false;
        els.personExportFieldOptions.querySelectorAll("input, button").forEach(input => { input.disabled = false; });
      }
    }
  }

  function renderDetail(name, day, minute) {
    if (!peopleMap()[name]) {
      state.selectedPerson = null;
      renderEmptyDetail();
      return;
    }

    const current = currentClass(name, day, minute);
    const busy = !isFree(name, day, minute);
    const previous = previousClasses(name, day, minute);
    const nextToday = nextClassToday(name, day, minute);

    els.detailPanel.replaceChildren();

    const header = document.createElement("div");
    header.className = "detail-header";
    const nameEl = document.createElement("h2");
    nameEl.textContent = displayName(name);
    const nameRow = document.createElement("div");
    nameRow.className = "detail-name-row";
    const fullSchedule = iconAction(`View full schedule for ${displayName(name)}`, "M5 5h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2ZM7 3v4M17 3v4M3 11h18", "full-schedule-button");
    fullSchedule.id = "fullScheduleButton";
    const fullScheduleLabel = document.createElement("span");
    fullScheduleLabel.className = "nav-button-label";
    fullScheduleLabel.textContent = "Full schedule";
    fullSchedule.append(fullScheduleLabel);
    fullSchedule.setAttribute("aria-haspopup", "dialog");
    fullSchedule.addEventListener("click", () => openPersonWeek(name));
    const actions = document.createElement("div");
    actions.className = "person-detail-actions";
    const addToGroup = iconAction(`Add ${displayName(name)} to a group`, "M12 5v14M5 12h14");
    addToGroup.id = "addPersonGroupButton";
    addToGroup.setAttribute("aria-haspopup", "dialog");
    addToGroup.addEventListener("click", () => openPersonGroup(name));
    const remove = iconAction(`Delete ${displayName(name)}'s schedule from this device`, "M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7", "person-delete-button");
    remove.id = "deletePersonScheduleButton";
    remove.addEventListener("click", () => removePerson(name));
    const share = iconAction(`Share ${displayName(name)}'s schedule`, "M12 3v12m-4-8 4-4 4 4M5 13v7h14v-7");
    share.id = "sharePersonScheduleButton";
    share.setAttribute("aria-haspopup", "dialog");
    share.addEventListener("click", () => openPersonQuickShare(name, share));
    actions.append(fullSchedule, addToGroup, remove, share);
    nameRow.append(nameEl, actions);
    const semesterLabel = document.createElement("p");
    semesterLabel.className = `schedule-semester${semesterIsOlder(peopleMap()[name].semester) ? " semester-older" : ""}`;
    semesterLabel.textContent = scheduleLabel(peopleMap()[name], true);
    const statusRow = document.createElement("div");
    statusRow.className = "detail-status-row";

    const badge = document.createElement("span");
    badge.className = `status-badge ${busy ? "busy" : "free"}`;
    badge.textContent = current ? "IN CLASS" : busy ? "Class Soon" : "FREE";
    statusRow.append(badge);

    if (current) {
      const until = document.createElement("span");
      until.className = "until-copy";
      until.textContent = `This class ends at ${formatTime(current.end)}`;
      statusRow.append(until);
    }

    header.append(nameRow, statusRow);
    header.append(semesterLabel);
    els.detailPanel.append(header, timelineCard(name, day, minute));

    if (current) {
      els.detailPanel.append(detailCard(
        "Current class",
        `${formatTime(current.start)}–${formatTime(current.end)}`,
        classLabel(current),
        "busy"
      ));
    }

    const upcomingBreak = window.WhosFreeAvailability.nextFreePeriod(classesForDay(name, day), minute);
    if (upcomingBreak) {
      els.detailPanel.append(detailCard(
        upcomingBreak.afterClasses ? "Free after classes" : "Next break",
        `${upcomingBreak.afterClasses ? "Free after classes at" : "Next break starts at"} ${formatTime(minuteTime(upcomingBreak.start))}`,
        upcomingBreak.afterClasses ? "No more classes today after this time." : `Until ${formatTime(minuteTime(upcomingBreak.end))} · ${upcomingBreak.end - upcomingBreak.start} min`,
        "free"
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
    scheduleToolbarLayout();
  }

  function refresh({ preserveScroll = false } = {}) {
    if (state.activeReorder || state.pendingPersonHold) return;
    if (!state.hasData || state.loadError) {
      renderDataSetup();
      return;
    }

    els.viewToggleButton.disabled = false;
    updateGroupToolbar();

    if (state.useLiveTime) setLiveValues();
    syncLiveControls();

    const moment = selectedMoment();
    if (!moment) {
      showToast("Choose a valid day and time.");
      return;
    }

    const { day, minute } = moment;
    const { visible } = visiblePeople(day, minute);
    const peopleCount = Object.keys(peopleMap()).length;
    const oldScroll = els.peopleList.scrollTop;
    const openMenus = [...els.peopleList.querySelectorAll(".group-options[open]")].map(menu => menu.closest(".people-group").dataset.groupId);
    const activeMenu = document.activeElement?.closest?.(".group-options");
    const menuFocusLabel = activeMenu ? document.activeElement.getAttribute("aria-label") : null;

    els.peopleHeading.textContent = state.showGroups ? "Groups" : state.showEveryone ? "Everyone" : state.useLiveTime ? "Free now" : "Free";
    setViewToggle(els.viewToggleButton, state.showEveryone ? "Show only free" : "Show everyone", state.showEveryone);
    els.viewToggleButton.querySelector("[data-mode-label]").textContent = state.showEveryone ? "Free" : "All";
    els.peopleList.replaceChildren();

    if (peopleCount === 0) {
      els.peopleList.append(createEmptyList("No people in this file", "Replace the schedule file from the Schedules button."));
      state.selectedPerson = null;
      renderEmptyDetail();
      return;
    }

    if (visible.length === 0 && !state.showGroups) {
      els.peopleList.append(createEmptyList("Nobody is free", "Try another time or choose Show everyone."));
      state.selectedPerson = null;
      renderEmptyDetail();
      return;
    }

    let displayed = visible;
    if (state.showGroups) {
      const grouped = renderGroupedPeople(visible, day, minute);
      displayed = grouped.visible;
    } else visible.forEach(name => els.peopleList.append(renderPersonCard(name, day, minute)));
    for (const section of els.peopleList.querySelectorAll(".people-group")) {
      if (openMenus.includes(section.dataset.groupId)) section.querySelector(".group-options").open = true;
    }
    if (menuFocusLabel) [...els.peopleList.querySelectorAll(".group-options summary, .group-options button")].find(item => item.getAttribute("aria-label") === menuFocusLabel && !item.disabled)?.focus({ preventScroll: true });

    if (state.selectedPerson && !displayed.includes(state.selectedPerson)) {
      state.selectedPerson = null;
      els.peopleList.querySelectorAll(".person-card.selected").forEach(card => { card.classList.remove("selected"); card.querySelector(".person-select-button")?.setAttribute("aria-pressed", "false"); });
    }

    const peopleSignature = [
      state.showEveryone ? "all" : "free",
      state.showGroups ? JSON.stringify(state.groups) : "flat",
      ...displayed.map(name => `${name}:${currentClass(name, day, minute)?.course_code || (isFree(name, day, minute) ? "free" : "busy")}`),
    ].join("|");
    animateCardsIfNeeded(peopleSignature);
    state.lastPeopleSignature = peopleSignature;

    if (preserveScroll) els.peopleList.scrollTop = oldScroll;

    if (state.selectedPerson) renderDetail(state.selectedPerson, day, minute);
    else renderEmptyDetail();
  }

  function bindTimetableScrolling(timetable) {
    const grid = timetable.closest(".review-grid-scroll");
    const dialog = grid.closest(".schedule-modal");
    let gesture = null;
    let momentumFrame = null;

    const stopMomentum = () => {
      if (momentumFrame !== null) cancelAnimationFrame(momentumFrame);
      momentumFrame = null;
    };

    const scrollVertically = (element, delta) => {
      const limit = Math.max(0, element.scrollHeight - element.clientHeight);
      const before = Math.max(0, Math.min(element.scrollTop, limit));
      const after = Math.max(0, Math.min(before + delta, limit));
      element.scrollTop = after;
      return delta - (after - before);
    };
    const scroll = delta => scrollVertically(dialog, scrollVertically(grid, delta));
    const startMomentum = velocity => {
      let previous = performance.now();
      // Exponential slowing keeps the release smooth at any display refresh
      // rate. Integrate the distance rather than stepping a fixed pixel count.
      const frame = now => {
        momentumFrame = null;
        if (grid.closest("[hidden]") || state.importProgress) return;
        const elapsed = Math.min(48, Math.max(0, now - previous));
        previous = now;
        const decay = Math.exp(-elapsed / 325);
        const remaining = scroll(velocity * 325 * (1 - decay));
        velocity *= decay;
        if (Math.abs(remaining) > .5 || Math.abs(velocity) < .03) return;
        momentumFrame = requestAnimationFrame(frame);
      };
      momentumFrame = requestAnimationFrame(frame);
    };
    // Touching anywhere, using another input, or hiding the tab interrupts a
    // coast immediately, including a touch outside the timetable itself.
    for (const type of ["touchstart", "pointerdown", "wheel", "keydown", "click"]) {
      document.addEventListener(type, stopMomentum, { capture: true, passive: true });
    }
    document.addEventListener("visibilitychange", stopMomentum);
    grid.addEventListener("touchstart", event => {
      const touch = event.touches.length === 1 ? event.touches[0] : null;
      const now = performance.now();
      gesture = touch ? { id: touch.identifier, x: touch.clientX, y: touch.clientY, lastY: touch.clientY, lastTime: now, samples: [{ y: touch.clientY, time: now }], direction: 0, axis: null } : null;
    }, { passive: true });
    grid.addEventListener("touchmove", event => {
      if (!gesture || event.touches.length !== 1) { gesture = null; return; }
      const touch = event.touches[0];
      if (touch.identifier !== gesture.id) { gesture = null; return; }
      if (!gesture.axis) {
        const x = Math.abs(touch.clientX - gesture.x), y = Math.abs(touch.clientY - gesture.y);
        if (Math.max(x, y) < 6) return;
        gesture.axis = x > y ? "horizontal" : "vertical";
      }
      if (gesture.axis !== "vertical") return;
      if (!event.cancelable) { gesture = null; return; }
      // Route the whole vertical gesture so Safari cannot latch it to the
      // horizontal scroller. Transfer unused motion to the surrounding dialog,
      // including during the same swipe and when reversing at either edge.
      event.preventDefault();
      const delta = gesture.lastY - touch.clientY;
      const now = performance.now();
      // A reversal starts a fresh velocity estimate rather than carrying the
      // earlier direction into the release. A pause before lifting cancels it.
      if (delta && gesture.direction && Math.sign(delta) !== gesture.direction) {
        gesture.samples = [{ y: gesture.lastY, time: gesture.lastTime }];
      }
      if (delta) gesture.direction = Math.sign(delta);
      gesture.samples.push({ y: touch.clientY, time: now });
      while (gesture.samples.length > 2 && now - gesture.samples[0].time > 100) gesture.samples.shift();
      gesture.lastY = touch.clientY;
      gesture.lastTime = now;
      scroll(delta);
    }, { passive: false });
    const reset = () => { gesture = null; };
    grid.addEventListener("touchend", event => {
      const released = gesture;
      reset();
      if (!released || released.axis !== "vertical" || event.touches.length || performance.now() - released.lastTime >= 100) return;
      if (event.changedTouches?.length && !Array.from(event.changedTouches).some(touch => touch.identifier === released.id)) return;
      const first = released.samples[0], last = released.samples.at(-1);
      const duration = last.time - first.time;
      if (duration <= 0) return;
      const velocity = Math.max(-3.5, Math.min(3.5, (first.y - last.y) / duration)) * Math.exp(-(performance.now() - last.time) / 80);
      if (Math.abs(velocity) >= .08) startMomentum(velocity);
    }, { passive: true });
    grid.addEventListener("touchcancel", () => { reset(); stopMomentum(); }, { passive: true });
  }

  function bindEvents() {
    bindTimetableScrolling(els.reviewGrid);
    bindTimetableScrolling(els.personWeekGrid);
    document.addEventListener("click", event => {
      if (state.importProgress && !els.importProgressOverlay.contains(event.target)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }, true);
    document.addEventListener("focusin", event => {
      if (!state.importProgress) return;
      if (els.importProgressOverlay.contains(event.target)) state.importProgress.focusWithin = event.target;
      else {
        const target = state.importProgress.focusWithin;
        (target && !target.disabled && !target.closest("[hidden]") ? target : els.importProgressOverlay).focus({ preventScroll: true });
      }
    });
    els.importPictureName.addEventListener("focus", () => editImportPictureName());
    els.importPictureName.addEventListener("input", () => editImportPictureName(true));
    els.importPictureName.addEventListener("compositionstart", () => {
      editImportPictureName();
      if (state.importProgress?.pictureName) state.importProgress.pictureName.composing = true;
    });
    els.importPictureName.addEventListener("compositionend", () => {
      if (state.importProgress?.pictureName) state.importProgress.pictureName.composing = false;
    });
    els.importPictureNameForm.addEventListener("submit", finishImportPictureName);
    document.addEventListener("click", event => {
      for (const menu of els.peopleList.querySelectorAll(".group-options[open]")) if (!menu.contains(event.target)) menu.open = false;
    });
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
    els.homeExportButton.addEventListener("click", openQuickExport);
    els.helpButton.addEventListener("click", openHelp);
    els.closeHelpModal.addEventListener("click", closeHelp);
    els.helpModal.addEventListener("click", event => { if (event.target === els.helpModal) closeHelp(); });
    els.settingsButton.addEventListener("click", openSettingsModal);
    els.showGroupsToggle.addEventListener("click", () => {
      state.showGroups = !state.showGroups;
      saveGroupPreferences(); refresh({ preserveScroll: true });
    });
    els.manageGroupsButton.addEventListener("click", () => openGroupsModal());
    els.closeGroupsModal.addEventListener("click", closeGroupsModal);
    els.newGroupButton.addEventListener("click", () => editGroup());
    els.groupForm.addEventListener("submit", saveGroup);
    els.cancelGroupButton.addEventListener("click", cancelGroupEdit);
    els.closeGroupWeekModal.addEventListener("click", closeGroupWeek);
    els.closePersonWeekModal.addEventListener("click", closePersonWeek);
    els.personWeekModal.addEventListener("click", event => { if (event.target === els.personWeekModal) closePersonWeek(); });
    els.closePersonQuickShare.addEventListener("click", closePersonQuickShare);
    els.personQuickShareModal.addEventListener("click", event => { if (event.target === els.personQuickShareModal) closePersonQuickShare(); });
    els.personQuickUrlButton.addEventListener("click", () => exportPersonQuickSchedule("url"));
    els.personQuickQrButton.addEventListener("click", () => exportPersonQuickSchedule("qr"));
    els.personQuickCodeButton.addEventListener("click", () => exportPersonQuickSchedule("code"));
    els.copyPersonQuickCode.addEventListener("click", () => copyExportCode(els.personQuickCode, els.personQuickShareStatus));
    els.closePersonGroup.addEventListener("click", closePersonGroup);
    els.personGroupModal.addEventListener("click", event => { if (event.target === els.personGroupModal) closePersonGroup(); });
    els.personGroupForm.addEventListener("submit", addPersonToGroup);
    els.personGroupManage.addEventListener("click", () => { closePersonGroup(); openGroupsModal(); });
    els.exportPersonScheduleButton.addEventListener("click", exportPersonSchedule);
    els.copyPersonWeekCodeButton.addEventListener("click", () => copyExportCode(els.personWeekCode, els.personWeekExportStatus));
    els.groupsModal.addEventListener("click", event => { if (event.target === els.groupsModal) closeGroupsModal(); });
    els.groupWeekModal.addEventListener("click", event => { if (event.target === els.groupWeekModal) closeGroupWeek(); });
    els.closeScheduleModal.addEventListener("click", closeScheduleModal);
    els.closeSettingsModal.addEventListener("click", closeSettingsModal);
    els.breakNotificationToggle.addEventListener("change", handleNotificationToggle);
    els.testNotificationButton.addEventListener("click", sendTestNotification);
    els.addSchedulePdfButton.addEventListener("click", chooseSchedulePdf);
    els.advancedScheduleOptions.addEventListener("toggle", () => {
      if (els.advancedScheduleOptions.open && !els.scheduleModal.hidden) revealSection(els.advancedSchedulePanel);
    });
    els.addScheduleImageButton.addEventListener("click", chooseScheduleImage);
    els.scheduleImageInput.addEventListener("change", handleScheduleImage);
    els.manualScheduleButton.addEventListener("click", () => openManualSchedule());
    els.addReviewClassButton.addEventListener("click", () => {
      addReviewClass({ start: "08:15", end: "09:35", kind: "busy_block" });
      const card = els.imageReviewClasses.lastElementChild;
      revealSection(card, card.querySelector('[data-field="course"]'));
    });
    els.saveImageScheduleButton.addEventListener("click", saveImageSchedule);
    els.duplicatePicturePrompt.addEventListener("click", event => {
      const button = event.target.closest("[data-duplicate-action]");
      if (!button || !state.duplicatePicture) return;
      const decision = { ...state.duplicatePicture, action: button.dataset.duplicateAction };
      dismissDuplicatePicture(true);
      if (decision.action !== "cancel") saveImageSchedule(decision);
    });
    els.useCurrentSemesterButton.addEventListener("click", () => {
      setReviewSemester(undefined, true);
    });
    els.imageReviewSemester.addEventListener("change", () => { els.imageReviewYear.disabled = !els.imageReviewSemester.value; });
    els.cancelImageScheduleButton.addEventListener("click", () => { clearImageReview(); setImageStatus("Schedule editing canceled. Nothing was saved.", ""); });
    els.importSchedulesButton.addEventListener("click", chooseScheduleFile);
    els.shareSchedulesButton.addEventListener("click", shareSchedules);
    els.exportSchedulesButton.addEventListener("click", () => openCodePanel("export"));
    els.importCodeButton.addEventListener("click", () => openCodePanel("import"));
    els.selectAllSchedules.addEventListener("change", () => {
      els.exportPeopleList.querySelectorAll("input").forEach(input => { input.checked = els.selectAllSchedules.checked; });
      exportSelectionChanged();
    });
    els.generateCodeButton.addEventListener("click", () => generateShareCode("code"));
    els.exportQrButton.addEventListener("click", () => generateShareCode("qr"));
    els.copyExportLinkButton.addEventListener("click", () => generateShareCode("link"));
    for (const options of [els.exportFieldOptions, els.personExportFieldOptions, els.personQuickExportFields]) {
      const changed = options === els.exportFieldOptions ? exportSelectionChanged : options === els.personExportFieldOptions ? personExportFieldsChanged : personQuickFieldsChanged;
      options.addEventListener("change", changed);
      options.querySelector(".export-include-all").addEventListener("click", () => {
        options.querySelectorAll("input").forEach(input => { input.checked = true; });
        changed();
      });
    }
    els.copyCodeButton.addEventListener("click", copyShareCode);
    for (const panel of [els.personSharePanel]) {
      panel.querySelector(".copy-share-link").addEventListener("click", () => copyScheduleLink(panel));
      panel.querySelector(".toggle-share-qr").addEventListener("click", () => toggleScheduleQr(panel));
    }
    els.decodeCodeButton.addEventListener("click", importShareCode);
    els.codeConflictPrompt.addEventListener("click", event => {
      const button = event.target.closest("[data-code-conflict-action]");
      if (button) finishCodeConflict(button.dataset.codeConflictAction);
    });
    els.closeExportButton.addEventListener("click", closeCodePanels);
    els.closeImportButton.addEventListener("click", closeCodePanels);
    window.addEventListener("hashchange", openSharedLink);
    els.removeSchedulesButton.addEventListener("click", removeSchedules);
    els.undoChangesButton.addEventListener("click", undoRecentScheduleChange);
    els.undoScheduleChangesButton.addEventListener("click", undoRecentScheduleChange);
    els.scheduleFileInput.addEventListener("change", handleLocalScheduleFile);
    els.schedulePdfInput.addEventListener("change", handleSchedulePdfs);

    els.scheduleModal.addEventListener("click", event => {
      if (event.target === els.scheduleModal) closeScheduleModal();
    });

    els.settingsModal.addEventListener("click", event => {
      if (event.target === els.settingsModal) closeSettingsModal();
    });

    document.addEventListener("keydown", event => {
      if (state.importProgress) {
        if (event.key === "Tab") {
          const focusable = [...els.importProgressOverlay.querySelectorAll('input, button')].filter(item => !item.disabled && !item.closest("[hidden]"));
          const index = focusable.indexOf(document.activeElement);
          event.preventDefault();
          const next = index === -1 ? event.shiftKey ? focusable.at(-1) : focusable[0] : focusable[(index + (event.shiftKey ? -1 : 1) + focusable.length) % focusable.length];
          (next || els.importProgressOverlay).focus({ preventScroll: true });
        }
        if (event.key === "Escape") event.preventDefault();
        return;
      }
      const groupModal = !els.personQuickShareModal.hidden ? els.personQuickShareModal : !els.personGroupModal.hidden ? els.personGroupModal : !els.personWeekModal.hidden ? els.personWeekModal : !els.groupWeekModal.hidden ? els.groupWeekModal : !els.groupsModal.hidden ? els.groupsModal : !els.helpModal.hidden ? els.helpModal : !els.settingsModal.hidden ? els.settingsModal : !els.scheduleModal.hidden ? els.scheduleModal : null;
      if (event.key === "Tab" && groupModal) {
        const focusable = [...groupModal.querySelectorAll('button, input, textarea, select, summary, [tabindex="0"]')].filter(item => {
          const closed = item.closest("details:not([open])");
          return !item.disabled && !item.closest("[hidden]") && (!closed || closed.querySelector(":scope > summary") === item);
        });
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
      if (event.key !== "Escape") return;
      const exportMenu = [els.exportFieldOptions, els.personExportFieldOptions, els.personQuickExportFields].find(menu => menu.open && !menu.closest("[hidden]"));
      if (exportMenu) { event.preventDefault(); exportMenu.open = false; exportMenu.querySelector("summary").focus(); return; }
      if (state.codeConflict) { event.preventDefault(); finishCodeConflict("old"); return; }
      if (state.pendingPersonHold) {
        window.clearTimeout(state.pendingPersonHold.timer); state.pendingPersonHold = null;
      }
      if (state.activeReorder) { event.preventDefault(); finishPersonReorder(true); return; }
      const openMenu = els.peopleList.querySelector(".group-options[open]");
      if (openMenu) { event.preventDefault(); openMenu.open = false; openMenu.querySelector("summary").focus(); return; }
      if (state.duplicatePicture) { event.preventDefault(); dismissDuplicatePicture(true); return; }
      if (!els.scheduleModal.hidden && els.advancedScheduleOptions.open) {
        event.preventDefault();
        els.advancedScheduleOptions.open = false;
        els.advancedScheduleOptions.querySelector("summary").focus({ preventScroll: true });
        return;
      }
      if (!els.personQuickShareModal.hidden) closePersonQuickShare();
      else if (!els.personGroupModal.hidden) closePersonGroup();
      else if (!els.personWeekModal.hidden) closePersonWeek();
      else if (!els.groupWeekModal.hidden) closeGroupWeek();
      else if (!els.groupsModal.hidden) closeGroupsModal();
      else if (!els.helpModal.hidden) closeHelp();
      else if (!els.settingsModal.hidden) closeSettingsModal();
      else if (!els.scheduleModal.hidden) closeScheduleModal();
    });

    els.liveToggle.addEventListener("change", () => {
      state.useLiveTime = els.liveToggle.checked;
      if (state.useLiveTime) setLiveValues();
      syncLiveControls();
      refresh();
    });

    const previewSelectedMoment = () => {
      state.useLiveTime = false;
      syncLiveControls();
      state.selectedDay = els.daySelect.value;
      state.selectedTime = els.timeInput.value;
      state.selectedPerson = null;
      refresh();
    };
    els.daySelect.addEventListener("change", previewSelectedMoment);
    els.timeInput.addEventListener("input", previewSelectedMoment);
    els.timeInput.addEventListener("change", previewSelectedMoment);

    els.viewToggleButton.addEventListener("click", () => {
      state.showEveryone = !state.showEveryone;
      try { localStorage.setItem(VIEW_PREFERENCE_KEY, state.showEveryone ? "all" : "free"); }
      catch { /* Keep the filter usable when browser storage is unavailable. */ }
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

    navigator.serviceWorker.register("./service-worker.js?v=76", { updateViaCache: "none" })
      .then(registration => registration.update())
      .catch(() => {
        // The app works normally even if PWA caching isn't available.
      });
  }

  function init() {
    try { state.showEveryone = localStorage.getItem(VIEW_PREFERENCE_KEY) === "all"; }
    catch { state.showEveryone = false; }
    const savedNotificationSettings = loadNotificationSettings();
    state.notificationsEnabled = savedNotificationSettings.enabled;
    state.mutedPeople = new Set(savedNotificationSettings.mutedPeople);

    const savedPeoplePreferences = loadPeoplePreferences();
    state.nicknames = { ...savedPeoplePreferences.nicknames };
    state.pinnedPeople = new Set(savedPeoplePreferences.pinnedPeople);
    Object.assign(state, loadGroupPreferences());
    loadPersonOrders();
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
    watchToolbarLayout();
    updateScheduleModal();
    updateSettingsModal();
    registerServiceWorker();
    requestAnimationFrame(animateAppEntrance);
    openSharedLink();

    loadSchedulesFromDevice().then(() => {
      cleanPeoplePreferences();
      if (state.hasData) cleanGroupPreferences();
      refresh({ preserveScroll: true });
      updateSettingsModal();
      checkBreakNotifications();
      state.deviceReady = true;
      if (state.sharedLinkStartup && !location.hash.startsWith("#import=")) endImportProgress();
      state.sharedLinkStartup = false;
      openSharedLink();
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

