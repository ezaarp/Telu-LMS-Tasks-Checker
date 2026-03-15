const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");

const DEFAULT_CONFIG = {
  calendarUrl: "",
  refreshMinutes: 15,
  maxItems: 30,
  doneTaskIds: [],
  setupComplete: false,
  lastSuccessfulSync: ""
};

let widgetWindow;
let authWindow;
let sessionWindow;
let authCheckTimer;
let currentConfig = { ...DEFAULT_CONFIG };

function getCalendarOrigin(url) {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

function getConfigPath() {
  return path.join(app.getPath("userData"), "config.json");
}

async function ensureConfigLoaded() {
  try {
    const raw = await fs.readFile(getConfigPath(), "utf8");
    currentConfig = { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error("Failed to read config:", error);
    }
    await saveConfig(DEFAULT_CONFIG);
  }
}

async function saveConfig(nextConfig) {
  currentConfig = {
    ...DEFAULT_CONFIG,
    ...currentConfig,
    ...nextConfig,
    doneTaskIds: normalizeDoneTaskIds(nextConfig.doneTaskIds ?? currentConfig.doneTaskIds),
    refreshMinutes: clampNumber(nextConfig.refreshMinutes ?? currentConfig.refreshMinutes, 1, 240, DEFAULT_CONFIG.refreshMinutes),
    maxItems: clampNumber(nextConfig.maxItems ?? currentConfig.maxItems, 1, 50, DEFAULT_CONFIG.maxItems)
  };

  await fs.mkdir(path.dirname(getConfigPath()), { recursive: true });
  await fs.writeFile(getConfigPath(), JSON.stringify(currentConfig, null, 2), "utf8");
  return currentConfig;
}

function normalizeDoneTaskIds(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(value.filter((item) => typeof item === "string" && item.trim()))];
}

function clampNumber(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function createWidgetWindow() {
  widgetWindow = new BrowserWindow({
    width: 1220,
    height: 720,
    minWidth: 960,
    minHeight: 560,
    frame: false,
    transparent: false,
    backgroundColor: "#eef3f8",
    resizable: true,
    alwaysOnTop: false,
    skipTaskbar: false,
    title: "TelU LMS Widget",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: false
    }
  });

  widgetWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
}

function createAuthWindow() {
  if (authWindow && !authWindow.isDestroyed()) {
    authWindow.focus();
    return authWindow;
  }

  authWindow = new BrowserWindow({
    width: 1100,
    height: 800,
    title: "TelU LMS Authentication",
    autoHideMenuBar: true,
    backgroundColor: "#f3f7fb",
    webPreferences: {
      contextIsolation: true,
      sandbox: true
    }
  });

  const queueAuthCheck = () => {
    clearTimeout(authCheckTimer);
    authCheckTimer = setTimeout(() => {
      maybeFinalizeAuthentication().catch((error) => {
        console.error("Auth verification failed:", error);
      });
    }, 900);
  };

  authWindow.webContents.on("did-stop-loading", queueAuthCheck);
  authWindow.webContents.on("did-navigate", queueAuthCheck);
  authWindow.webContents.on("did-navigate-in-page", queueAuthCheck);
  authWindow.on("closed", () => {
    authWindow = null;
    clearTimeout(authCheckTimer);
  });

  return authWindow;
}

function createSessionWindow() {
  if (sessionWindow && !sessionWindow.isDestroyed()) {
    return sessionWindow;
  }

  sessionWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: true,
      sandbox: true
    }
  });

  sessionWindow.on("closed", () => {
    sessionWindow = null;
  });

  return sessionWindow;
}

async function loadAuthHelperPage(window, calendarUrl) {
  const origin = getCalendarOrigin(calendarUrl);
  if (!origin) {
    throw new Error("URL kalender tidak valid.");
  }

  const helperHtml = `
    <!DOCTYPE html>
    <html lang="id">
      <head>
        <meta charset="UTF-8" />
        <title>Autentikasi TelU LMS</title>
        <style>
          :root {
            color-scheme: light;
            --bg: #f3f7fb;
            --panel: #ffffff;
            --text: #10243f;
            --muted: #66768e;
            --accent: #0f766e;
            --line: #d8e1ea;
          }
          * { box-sizing: border-box; }
          body {
            margin: 0;
            font-family: "Segoe UI", sans-serif;
            background:
              radial-gradient(circle at top right, rgba(15, 118, 110, 0.1), transparent 28%),
              linear-gradient(180deg, #f8fbfd, var(--bg));
            color: var(--text);
            min-height: 100vh;
            display: grid;
            place-items: center;
            padding: 28px;
          }
          .panel {
            width: min(680px, 100%);
            padding: 32px;
            border-radius: 28px;
            background: var(--panel);
            border: 1px solid var(--line);
            box-shadow: 0 28px 70px rgba(16, 36, 63, 0.12);
          }
          .eyebrow {
            margin: 0 0 8px;
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 0.18em;
            color: var(--muted);
          }
          h1 {
            margin: 0;
            font-size: 34px;
            line-height: 1.05;
          }
          p, li {
            color: var(--muted);
            line-height: 1.6;
            font-size: 15px;
          }
          ol {
            padding-left: 20px;
            margin: 18px 0;
          }
          a {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            margin-top: 8px;
            min-width: 220px;
            padding: 14px 18px;
            border-radius: 999px;
            background: var(--accent);
            color: white;
            text-decoration: none;
            font-weight: 700;
          }
        </style>
      </head>
      <body>
        <div class="panel">
          <p class="eyebrow">Telkom University</p>
          <h1>Selesaikan login sekali saja.</h1>
          <p>Begitu sesi LMS sudah valid, jendela ini akan tertutup otomatis dan widget akan langsung menampilkan task Anda.</p>
          <ol>
            <li>Buka LMS dari tombol di bawah.</li>
            <li>Login atau selesaikan Cloudflare sampai halaman LMS tampil normal.</li>
            <li>Biarkan aplikasi memeriksa sesi dan menutup jendela ini otomatis.</li>
          </ol>
          <a href="${origin}" target="_self" rel="noreferrer">Buka LMS TelU</a>
        </div>
      </body>
    </html>
  `;

  await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(helperHtml)}`);
}

async function fetchCalendarThroughWindow(targetWindow, url) {
  if (!targetWindow || targetWindow.isDestroyed()) {
    throw new Error("Window aplikasi belum siap.");
  }

  const response = await targetWindow.webContents.executeJavaScript(
    `fetch(${JSON.stringify(url)}, {
      credentials: "include",
      headers: {
        "Accept": "text/calendar,text/plain,text/html;q=0.9,*/*;q=0.8"
      }
    }).then(async (resp) => ({
      ok: resp.ok,
      status: resp.status,
      contentType: resp.headers.get("content-type") || "",
      text: await resp.text()
    }))`,
    true
  );

  return response;
}

async function ensureSessionWindowReady(url) {
  const window = createSessionWindow();
  const origin = getCalendarOrigin(url);
  if (!origin) {
    throw new Error("URL kalender tidak valid.");
  }

  const currentUrl = window.webContents.getURL();
  if (!currentUrl || !currentUrl.startsWith(origin)) {
    await window.loadURL(origin);
  }

  return window;
}

async function fetchCalendarText(url) {
  if (!url) {
    throw new Error("Calendar URL belum diisi.");
  }

  const response = await fetchCalendarThroughWindow(await ensureSessionWindowReady(url), url);

  if (!response.ok) {
    throw new Error(`Fetch kalender gagal dengan status ${response.status}.`);
  }

  if (!response.text.includes("BEGIN:VCALENDAR")) {
    if (response.text.includes("Just a moment") || response.text.includes("Enable JavaScript and cookies")) {
      throw new Error("Autentikasi LMS dibutuhkan. Buka autentikasi lalu selesaikan verifikasi.");
    }
    throw new Error("Respons bukan file kalender ICS. Pastikan URL export TelU benar dan masih aktif.");
  }

  return response.text;
}

function unfoldIcsLines(icsText) {
  return icsText.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "");
}

function decodeIcsValue(value) {
  return value
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

function parseIcsDate(raw) {
  if (!raw) {
    return null;
  }

  const cleaned = raw.trim();
  const utcMatch = cleaned.match(/^(\d{8})T(\d{6})Z$/);
  if (utcMatch) {
    const [year, month, day] = splitDateParts(utcMatch[1]);
    const [hour, minute, second] = splitTimeParts(utcMatch[2]);
    return new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  }

  const localMatch = cleaned.match(/^(\d{8})T(\d{6})$/);
  if (localMatch) {
    const [year, month, day] = splitDateParts(localMatch[1]);
    const [hour, minute, second] = splitTimeParts(localMatch[2]);
    return new Date(year, month - 1, day, hour, minute, second);
  }

  const dateOnlyMatch = cleaned.match(/^(\d{8})$/);
  if (dateOnlyMatch) {
    const [year, month, day] = splitDateParts(dateOnlyMatch[1]);
    return new Date(year, month - 1, day, 23, 59, 59);
  }

  return null;
}

function splitDateParts(raw) {
  return [Number(raw.slice(0, 4)), Number(raw.slice(4, 6)), Number(raw.slice(6, 8))];
}

function splitTimeParts(raw) {
  return [Number(raw.slice(0, 2)), Number(raw.slice(2, 4)), Number(raw.slice(4, 6))];
}

function parseIcsEvents(icsText) {
  const unfolded = unfoldIcsLines(icsText);
  const lines = unfolded.split(/\r?\n/);
  const events = [];
  let currentEvent = null;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      currentEvent = {};
      continue;
    }

    if (line === "END:VEVENT") {
      if (currentEvent) {
        events.push(currentEvent);
      }
      currentEvent = null;
      continue;
    }

    if (!currentEvent) {
      continue;
    }

    const separatorIndex = line.indexOf(":");
    if (separatorIndex < 0) {
      continue;
    }

    const keyPart = line.slice(0, separatorIndex);
    const value = decodeIcsValue(line.slice(separatorIndex + 1));
    const [key] = keyPart.split(";");

    if (key === "SUMMARY") {
      currentEvent.summary = value;
    } else if (key === "DESCRIPTION") {
      currentEvent.description = value;
    } else if (key === "CATEGORIES") {
      currentEvent.categories = value;
    } else if (key === "LOCATION") {
      currentEvent.location = value;
    } else if (key === "UID") {
      currentEvent.uid = value;
    } else if (key === "URL") {
      currentEvent.url = value;
    } else if (key === "DTSTART") {
      currentEvent.start = parseIcsDate(value);
    } else if (key === "DTEND") {
      currentEvent.end = parseIcsDate(value);
    } else if (key === "DUE") {
      currentEvent.due = parseIcsDate(value);
    }
  }

  return events;
}

function normalizeEvent(event) {
  const dueDate = event.due || event.end || event.start;
  const openUrl = extractEventUrl(event);
  const course = extractCourseName(event);
  return {
    id: event.uid || `${event.summary}-${dueDate?.toISOString?.() || "unknown"}`,
    title: event.summary || "Tanpa judul",
    course,
    description: event.description || "",
    location: event.location || "",
    url: openUrl,
    dueAt: dueDate ? dueDate.toISOString() : null
  };
}

function extractCourseName(event) {
  const category = cleanCourseLabel(event.categories);
  if (category) {
    return category;
  }

  const descriptionPatterns = [
    /course\s*:\s*(.+)/i,
    /mata\s*kuliah\s*:\s*(.+)/i,
    /course name\s*:\s*(.+)/i
  ];

  for (const pattern of descriptionPatterns) {
    const match = typeof event.description === "string" ? event.description.match(pattern) : null;
    if (match) {
      const course = cleanCourseLabel(match[1].split(/\r?\n/)[0]);
      if (course) {
        return course;
      }
    }
  }

  const summary = typeof event.summary === "string" ? event.summary : "";
  const summaryMatch = summary.match(/\[(.+?)\]/);
  if (summaryMatch) {
    const course = cleanCourseLabel(summaryMatch[1]);
    if (course) {
      return course;
    }
  }

  return "";
}

function cleanCourseLabel(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .replace(/\s+/g, " ")
    .replace(/^course\s*:\s*/i, "")
    .replace(/^mata\s*kuliah\s*:\s*/i, "")
    .trim();
}

function extractEventUrl(event) {
  const directUrl = typeof event.url === "string" ? event.url.trim() : "";
  if (isHttpUrl(directUrl)) {
    return directUrl;
  }

  const haystacks = [event.description, event.location];
  for (const value of haystacks) {
    const match = typeof value === "string" ? value.match(/https?:\/\/[^\s)<>"]+/i) : null;
    if (match && isHttpUrl(match[0])) {
      return match[0];
    }
  }

  return "";
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

async function markSetupComplete() {
  if (currentConfig.setupComplete) {
    return currentConfig;
  }

  return saveConfig({
    setupComplete: true,
    lastSuccessfulSync: new Date().toISOString()
  });
}

async function loadUpcomingAssignments() {
  const icsText = await fetchCalendarText(currentConfig.calendarUrl);
  const now = new Date();
  const items = prioritizeItems(
    parseIcsEvents(icsText)
    .map(normalizeEvent)
    .filter((event) => event.dueAt)
    .filter((event) => new Date(event.dueAt).getTime() >= now.getTime() - 14 * 86400000)
  , now, currentConfig.maxItems);

  await saveConfig({
    setupComplete: true,
    lastSuccessfulSync: new Date().toISOString()
  });

  return {
    fetchedAt: new Date().toISOString(),
    items
  };
}

function prioritizeItems(items, now, limit) {
  const dueToday = [];
  const todo = [];
  const passedDeadline = [];

  for (const item of items) {
    const due = new Date(item.dueAt);
    if (due.getTime() < now.getTime()) {
      passedDeadline.push(item);
    } else if (isSameLocalDay(due, now)) {
      dueToday.push(item);
    } else {
      todo.push(item);
    }
  }

  dueToday.sort((left, right) => new Date(left.dueAt) - new Date(right.dueAt));
  todo.sort((left, right) => new Date(left.dueAt) - new Date(right.dueAt));
  passedDeadline.sort((left, right) => new Date(right.dueAt) - new Date(left.dueAt));

  return [...dueToday, ...todo, ...passedDeadline].slice(0, limit);
}

function isSameLocalDay(left, right) {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
}

async function maybeFinalizeAuthentication() {
  if (!authWindow || authWindow.isDestroyed() || !currentConfig.calendarUrl) {
    return false;
  }

  const response = await fetchCalendarThroughWindow(authWindow, currentConfig.calendarUrl);
  if (!response.ok || !response.text.includes("BEGIN:VCALENDAR")) {
    return false;
  }

  await markSetupComplete();

  if (widgetWindow && !widgetWindow.isDestroyed()) {
    widgetWindow.webContents.send("auth:verified");
  }

  if (authWindow && !authWindow.isDestroyed()) {
    authWindow.close();
  }

  return true;
}

ipcMain.handle("config:get", async () => currentConfig);

ipcMain.handle("config:set", async (_event, nextConfig) => {
  const saved = await saveConfig(nextConfig);
  return saved;
});

ipcMain.handle("task:setDone", async (_event, payload) => {
  const taskId = typeof payload?.taskId === "string" ? payload.taskId.trim() : "";
  const done = Boolean(payload?.done);

  if (!taskId) {
    throw new Error("Task ID tidak valid.");
  }

  const doneTaskIds = new Set(normalizeDoneTaskIds(currentConfig.doneTaskIds));
  if (done) {
    doneTaskIds.add(taskId);
  } else {
    doneTaskIds.delete(taskId);
  }

  const saved = await saveConfig({ doneTaskIds: [...doneTaskIds] });
  return saved;
});

ipcMain.handle("calendar:refresh", async () => loadUpcomingAssignments());

ipcMain.handle("auth:open", async () => {
  if (!currentConfig.calendarUrl) {
    await dialog.showMessageBox({
      type: "info",
      message: "Isi URL kalender dulu sebelum membuka autentikasi."
    });
    return { opened: false };
  }

  const window = createAuthWindow();
  await loadAuthHelperPage(window, currentConfig.calendarUrl);
  return { opened: true };
});

ipcMain.handle("window:minimize", async () => {
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    widgetWindow.minimize();
  }
});

ipcMain.handle("window:close", async () => {
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    widgetWindow.close();
  }
});

ipcMain.handle("link:openExternal", async (_event, url) => {
  if (!isHttpUrl(url)) {
    throw new Error("Link tugas tidak valid.");
  }

  await shell.openExternal(url);
  return { opened: true };
});

app.whenReady().then(async () => {
  await ensureConfigLoaded();
  createWidgetWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWidgetWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
