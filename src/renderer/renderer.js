const form = {
  calendarUrl: document.getElementById("calendarUrl"),
  refreshMinutes: document.getElementById("refreshMinutes"),
  maxItems: document.getElementById("maxItems")
};

const setupView = document.getElementById("setupView");
const taskView = document.getElementById("taskView");
const settingsPanel = document.getElementById("settingsPanel");
const statusText = document.getElementById("statusText");
const currentTimeNode = document.getElementById("currentTime");
const assignmentsNode = document.getElementById("assignments");
const emptyStateNode = document.getElementById("emptyState");
const errorStateNode = document.getElementById("errorState");

const refreshButton = document.getElementById("refreshButton");
const settingsButton = document.getElementById("settingsButton");
const saveButton = document.getElementById("saveButton");
const authButton = document.getElementById("authButton");
const reauthButton = document.getElementById("reauthButton");
const saveSettingsButton = document.getElementById("saveSettingsButton");
const settingsAuthButton = document.getElementById("settingsAuthButton");
const closeSettingsButton = document.getElementById("closeSettingsButton");
const minimizeButton = document.getElementById("minimizeButton");
const closeButton = document.getElementById("closeButton");

const settingsForm = {
  calendarUrl: document.getElementById("settingsCalendarUrl"),
  refreshMinutes: document.getElementById("settingsRefreshMinutes"),
  maxItems: document.getElementById("settingsMaxItems")
};

let refreshTimer = null;
let clockTimer = null;
let liveRenderTimer = null;
let latestItems = [];
let currentDoneTaskIds = new Set();
let currentConfigSnapshot = null;
const expandedTaskIds = new Set();

function setStatus(message) {
  statusText.textContent = message;
}

function setMode(mode) {
  const isSetup = mode === "setup";
  setupView.classList.toggle("hidden", !isSetup);
  taskView.classList.toggle("hidden", isSetup);
  refreshButton.classList.toggle("hidden", isSetup);
}

function applyConfig(config) {
  currentConfigSnapshot = config;
  form.calendarUrl.value = config.calendarUrl || "";
  form.refreshMinutes.value = String(config.refreshMinutes || 15);
  form.maxItems.value = String(config.maxItems || 30);
  settingsForm.calendarUrl.value = config.calendarUrl || "";
  settingsForm.refreshMinutes.value = String(config.refreshMinutes || 15);
  settingsForm.maxItems.value = String(config.maxItems || 30);
  currentDoneTaskIds = new Set(Array.isArray(config.doneTaskIds) ? config.doneTaskIds : []);
}

function collectConfigFromForm() {
  return {
    calendarUrl: form.calendarUrl.value.trim(),
    refreshMinutes: Number(form.refreshMinutes.value),
    maxItems: Number(form.maxItems.value)
  };
}

function collectConfigFromSettings() {
  return {
    calendarUrl: settingsForm.calendarUrl.value.trim(),
    refreshMinutes: Number(settingsForm.refreshMinutes.value),
    maxItems: Number(settingsForm.maxItems.value)
  };
}

function toggleSettings(forceOpen) {
  const shouldOpen = typeof forceOpen === "boolean"
    ? forceOpen
    : settingsPanel.classList.contains("hidden");
  settingsPanel.classList.toggle("hidden", !shouldOpen);
}

function scheduleAutoRefresh() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
  }

  const minutes = Math.max(1, Number(form.refreshMinutes.value) || 15);
  refreshTimer = setInterval(() => {
    refreshAssignments().catch((error) => {
      handleRefreshError(error);
    });
  }, minutes * 60 * 1000);
}

function startLiveClock() {
  if (clockTimer) {
    clearInterval(clockTimer);
  }

  const update = () => {
    currentTimeNode.textContent = new Intl.DateTimeFormat("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    }).format(new Date());
  };

  update();
  clockTimer = setInterval(update, 1000);
}

function startLiveTaskRefresh() {
  if (liveRenderTimer) {
    clearInterval(liveRenderTimer);
  }

  liveRenderTimer = setInterval(() => {
    if (!taskView.classList.contains("hidden")) {
      renderAssignments(latestItems);
    }
  }, 30000);
}

function toLocalString(isoDate) {
  return new Intl.DateTimeFormat("id-ID", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(isoDate));
}

function isSameLocalDay(left, right) {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
}

function getTaskTone(isoDate) {
  const diffMs = new Date(isoDate).getTime() - Date.now();
  if (diffMs < 0) {
    return "overdue";
  }
  if (diffMs <= 24 * 3600000) {
    return "near";
  }
  return "safe";
}

function toRelativeDeadline(isoDate) {
  const due = new Date(isoDate);
  const diffMs = due.getTime() - Date.now();
  const absMs = Math.abs(diffMs);
  const totalMinutes = Math.floor(absMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const padded = `${hours}h ${String(minutes).padStart(2, "0")}m`;

  if (diffMs < 0) {
    return `Passed ${padded}`;
  }
  return `${padded} left`;
}

function toRemainingLine(isoDate) {
  const due = new Date(isoDate);
  const diffMs = due.getTime() - Date.now();
  const absMs = Math.abs(diffMs);
  const totalMinutes = Math.floor(absMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (diffMs < 0) {
    return `Passed by ${hours}h ${String(minutes).padStart(2, "0")}m`;
  }

  return `Remaining ${hours}h ${String(minutes).padStart(2, "0")}m`;
}

function describeSection(items) {
  if (items.length === 0) {
    return "0";
  }
  return `${items.length} task${items.length > 1 ? "s" : ""}`;
}

function groupAssignments(items) {
  const now = new Date();
  const groups = {
    todo: [],
    dueToday: [],
    done: []
  };

  for (const item of items) {
    if (currentDoneTaskIds.has(item.id)) {
      groups.done.push(item);
      continue;
    }

    const due = new Date(item.dueAt);
    if (due.getTime() >= now.getTime() && isSameLocalDay(due, now)) {
      groups.dueToday.push(item);
    } else {
      groups.todo.push(item);
    }
  }

  groups.todo.sort((left, right) => new Date(left.dueAt) - new Date(right.dueAt));
  groups.dueToday.sort((left, right) => new Date(left.dueAt) - new Date(right.dueAt));
  groups.done.sort((left, right) => new Date(right.dueAt) - new Date(left.dueAt));

  return groups;
}

function createDetailNode(item) {
  const details = document.createElement("div");
  details.className = "task-details";

  const hasDescription = Boolean(item.description && item.description.trim());

  if (hasDescription) {
    const descriptionBox = document.createElement("div");
    descriptionBox.className = "description-scroll";

    const description = document.createElement("p");
    description.className = "description";
    description.textContent = item.description;
    descriptionBox.appendChild(description);
    details.appendChild(descriptionBox);
  }

  if (!hasDescription) {
    const empty = document.createElement("p");
    empty.className = "description subtle";
    empty.textContent = "No extra details available.";
    details.appendChild(empty);
  }

  return details;
}

function createOpenButton(item, compact = false) {
  if (!item.url) {
    return null;
  }

  const openButton = document.createElement("button");
  openButton.className = compact ? "ghost-button open-button compact" : "ghost-button open-button";
  openButton.textContent = compact ? "Go to link" : "Go to assignment";
  openButton.addEventListener("click", (event) => {
    event.stopPropagation();
    window.teluWidget.openExternalLink(item.url).catch((error) => {
      setStatus(error.message);
    });
  });

  return openButton;
}

function createTaskCard(item) {
  const tone = currentDoneTaskIds.has(item.id) ? "done" : getTaskTone(item.dueAt);
  const article = document.createElement("article");
  article.className = `task-card tone-${tone}`;
  article.tabIndex = 0;
  article.draggable = true;
  article.dataset.taskId = item.id;

  if (expandedTaskIds.has(item.id)) {
    article.classList.add("expanded");
  }

  const header = document.createElement("div");
  header.className = "task-summary";

  const topRow = document.createElement("div");
  topRow.className = "task-top-row";

  const badge = document.createElement("span");
  badge.className = `badge tone-${tone}`;
  badge.textContent = currentDoneTaskIds.has(item.id) ? "Completed" : toRelativeDeadline(item.dueAt);
  topRow.appendChild(badge);

  const quickOpenButton = createOpenButton(item, true);
  if (quickOpenButton) {
    topRow.appendChild(quickOpenButton);
  }

  const title = document.createElement("h3");
  title.textContent = item.title;

  const courseMeta = document.createElement("p");
  courseMeta.className = "course-meta";
  courseMeta.textContent = item.course || "Course not detected";

  const deadlineMeta = document.createElement("p");
  deadlineMeta.className = "meta";
  deadlineMeta.textContent = `Deadline: ${toLocalString(item.dueAt)}`;

  const caret = document.createElement("span");
  caret.className = "caret";
  caret.textContent = article.classList.contains("expanded") ? "-" : "+";

  header.appendChild(topRow);
  header.appendChild(title);
  header.appendChild(courseMeta);
  header.appendChild(deadlineMeta);
  if (item.location) {
    const location = document.createElement("p");
    location.className = "meta";
    location.textContent = item.location;
    header.appendChild(location);
  }

  const details = createDetailNode(item);
  const detailsOpenButton = createOpenButton(item, false);
  if (detailsOpenButton) {
    const actions = document.createElement("div");
    actions.className = "task-actions";
    actions.appendChild(detailsOpenButton);
    details.appendChild(actions);
  }

  article.appendChild(header);
  article.appendChild(caret);
  article.appendChild(details);

  const toggleExpanded = () => {
    const expanded = article.classList.toggle("expanded");
    caret.textContent = expanded ? "-" : "+";

    if (expanded) {
      expandedTaskIds.add(item.id);
    } else {
      expandedTaskIds.delete(item.id);
    }
  };

  article.addEventListener("click", () => {
    toggleExpanded();
  });

  article.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggleExpanded();
    }
  });

  article.addEventListener("dragstart", (event) => {
    event.dataTransfer?.setData("text/plain", item.id);
    event.dataTransfer.effectAllowed = "move";
    article.classList.add("dragging");
  });

  article.addEventListener("dragend", () => {
    article.classList.remove("dragging");
  });

  return article;
}

function attachDropBehavior(section, dropZone, targetColumn) {
  const setActive = (active) => {
    dropZone.classList.toggle("drop-active", active);
  };

  section.dataset.column = targetColumn;

  section.addEventListener("dragover", (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setActive(true);
  });

  section.addEventListener("dragleave", (event) => {
    if (!section.contains(event.relatedTarget)) {
      setActive(false);
    }
  });

  section.addEventListener("drop", async (event) => {
    event.preventDefault();
    setActive(false);

    const taskId = event.dataTransfer?.getData("text/plain")?.trim();
    if (!taskId) {
      return;
    }

    const done = targetColumn === "done";
    try {
      const config = await window.teluWidget.setTaskDoneState(taskId, done);
      applyConfig(config);
      renderAssignments(latestItems);
    } catch (error) {
      setStatus(error.message);
    }
  });
}

function createSection(title, helperText, items, columnKey) {
  const section = document.createElement("section");
  section.className = "task-section";

  const header = document.createElement("div");
  header.className = "section-header";

  const headerText = document.createElement("div");

  const heading = document.createElement("h2");
  heading.textContent = title;

  const subheading = document.createElement("p");
  subheading.className = "section-meta";
  subheading.textContent = helperText;

  headerText.appendChild(heading);
  headerText.appendChild(subheading);

  const count = document.createElement("span");
  count.className = "count-pill";
  count.textContent = describeSection(items);

  header.appendChild(headerText);
  header.appendChild(count);
  section.appendChild(header);

  const list = document.createElement("div");
  list.className = "section-list";
  attachDropBehavior(section, list, columnKey);

  if (items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "section-empty";
    empty.textContent = columnKey === "done" ? "Drag a card here to mark it done." : "No tasks here.";
    list.appendChild(empty);
    section.appendChild(list);
    return section;
  }

  for (const item of items) {
    list.appendChild(createTaskCard(item));
  }

  section.appendChild(list);
  return section;
}

function renderAssignments(items) {
  latestItems = items;
  assignmentsNode.innerHTML = "";
  errorStateNode.classList.add("hidden");
  emptyStateNode.classList.toggle("hidden", items.length > 0);

  if (items.length === 0) {
    return;
  }

  const groups = groupAssignments(items);

  assignmentsNode.appendChild(createSection("Due Today", "Tasks that need attention before midnight.", groups.dueToday, "dueToday"));
  assignmentsNode.appendChild(createSection("To Do", "Upcoming tasks after today.", groups.todo, "todo"));
  assignmentsNode.appendChild(createSection("Done", "Drag tasks here after you finish them.", groups.done, "done"));
}

function showAuthError(message) {
  assignmentsNode.innerHTML = "";
  emptyStateNode.classList.add("hidden");
  errorStateNode.classList.remove("hidden");
  setStatus(message);
  setMode("tasks");
}

function handleRefreshError(error) {
  if (error.message.includes("Autentikasi LMS dibutuhkan")) {
    showAuthError("Sesi LMS belum aktif. Buka autentikasi untuk melanjutkan.");
    return;
  }

  setStatus(error.message);
}

async function saveSetup({ openAuthAfterSave = false } = {}) {
  const saved = await window.teluWidget.saveConfig(collectConfigFromForm());
  applyConfig(saved);
  scheduleAutoRefresh();

  if (openAuthAfterSave) {
    setStatus("Membuka jendela autentikasi...");
    await window.teluWidget.openAuthWindow();
    return;
  }

  setStatus("URL kalender tersimpan.");
}

async function saveSettings({ reauthenticate = false } = {}) {
  const saved = await window.teluWidget.saveConfig({
    ...currentConfigSnapshot,
    ...collectConfigFromSettings()
  });

  applyConfig(saved);
  scheduleAutoRefresh();
  toggleSettings(false);

  if (reauthenticate) {
    setStatus("Membuka jendela autentikasi...");
    await window.teluWidget.openAuthWindow();
    return;
  }

  setStatus("Settings updated.");
}

async function refreshAssignments() {
  setStatus("Mengambil task terbaru dari LMS...");
  const result = await window.teluWidget.refreshCalendar();
  renderAssignments(result.items);
  setMode("tasks");

  const fetchedAt = new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(result.fetchedAt));

  setStatus(`Showing ${result.items.length} tasks. Updated ${fetchedAt}.`);
}

async function bootstrap() {
  const config = await window.teluWidget.getConfig();
  applyConfig(config);
  scheduleAutoRefresh();
  startLiveClock();
  startLiveTaskRefresh();

  if (!config.calendarUrl || !config.setupComplete) {
    setMode("setup");
    setStatus("Masukkan URL kalender lalu autentikasi sekali.");
    return;
  }

  setMode("tasks");

  try {
    await refreshAssignments();
  } catch (error) {
    handleRefreshError(error);
  }
}

refreshButton.addEventListener("click", () => {
  refreshAssignments().catch((error) => {
    handleRefreshError(error);
  });
});

settingsButton.addEventListener("click", () => {
  toggleSettings();
});

saveButton.addEventListener("click", () => {
  saveSetup({ openAuthAfterSave: true }).catch((error) => {
    setStatus(error.message);
  });
});

authButton.addEventListener("click", () => {
  saveSetup({ openAuthAfterSave: true }).catch((error) => {
    setStatus(error.message);
  });
});

reauthButton.addEventListener("click", () => {
  window.teluWidget.openAuthWindow().catch((error) => {
    setStatus(error.message);
  });
});

saveSettingsButton.addEventListener("click", () => {
  saveSettings().catch((error) => {
    setStatus(error.message);
  });
});

settingsAuthButton.addEventListener("click", () => {
  saveSettings({ reauthenticate: true }).catch((error) => {
    setStatus(error.message);
  });
});

closeSettingsButton.addEventListener("click", () => {
  toggleSettings(false);
});

minimizeButton.addEventListener("click", () => {
  window.teluWidget.minimizeWindow();
});

closeButton.addEventListener("click", () => {
  window.teluWidget.closeWindow();
});

window.teluWidget.onAuthVerified(() => {
  setStatus("Autentikasi berhasil. Menyinkronkan task...");
  refreshAssignments().catch((error) => {
    handleRefreshError(error);
  });
});

bootstrap().catch((error) => {
  setStatus(error.message);
});
