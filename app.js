const DEFAULT_API_URL = "https://begimot6-censor.com";

const settings = {
  apiUrl: localStorage.getItem("apiUrl") || DEFAULT_API_URL,
  semesterStart: localStorage.getItem("semesterStart") || "",
  manualParity: localStorage.getItem("manualParity") || null,
};

let scheduleData = null;
let selectedGroup = null;

const $ = (id) => document.getElementById(id);
const settingsBtn = $("settingsBtn");
const settingsPanel = $("settingsPanel");
const apiUrlInput = $("apiUrlInput");
const semesterStartInput = $("semesterStartInput");
const saveSettingsBtn = $("saveSettingsBtn");

const fileInput = $("fileInput");
const dropZone = $("dropZone");
const dzText = $("dzText");
const parseBtn = $("parseBtn");
const statusEl = $("status");

const resultSection = $("resultSection");
const groupTabs = $("groupTabs");
const tbGroup = $("tbGroup");
const tbWeek = $("tbWeek");
const tbFile = $("tbFile");
const weekToggleBtn = $("weekToggleBtn");
const agendaEl = $("agenda");
const exportBtn = $("exportBtn");
const exportIcsBtn = $("exportIcsBtn");

let currentFileName = "";

apiUrlInput.value = settings.apiUrl;
semesterStartInput.value = settings.semesterStart;

["dragenter", "dragover"].forEach((evt) =>
  dropZone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropZone.classList.add("drag");
  }),
);
["dragleave", "drop"].forEach((evt) =>
  dropZone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropZone.classList.remove("drag");
  }),
);
dropZone.addEventListener("drop", (e) => {
  const file = e.dataTransfer.files[0];
  if (file) {
    fileInput.files = e.dataTransfer.files;
    onFileChosen(file);
  }
});
fileInput.addEventListener("change", () => {
  if (fileInput.files[0]) onFileChosen(fileInput.files[0]);
});
function onFileChosen(file) {
  dzText.textContent = file.name;
  dropZone.classList.add("has-file");
  currentFileName = file.name;
}

function computeWeekParity() {
  if (settings.manualParity) return settings.manualParity;
  if (!settings.semesterStart) return "odd";
  const start = new Date(settings.semesterStart + "T00:00:00");
  const now = new Date();
  const days = Math.floor((now - start) / (1000 * 60 * 60 * 24));
  const weekNum = Math.floor(days / 7) + 1;
  return weekNum % 2 === 1 ? "odd" : "even";
}

function computeWeekNumber() {
  if (!settings.semesterStart) return null;
  const start = new Date(settings.semesterStart + "T00:00:00");
  const now = new Date();
  const days = Math.floor((now - start) / (1000 * 60 * 60 * 24));
  return Math.max(1, Math.floor(days / 7) + 1);
}

weekToggleBtn.addEventListener("click", () => {
  const current = computeWeekParity();
  settings.manualParity = current === "odd" ? "even" : "odd";
  localStorage.setItem("manualParity", settings.manualParity);
  renderAgenda();
});

parseBtn.addEventListener("click", async () => {
  const file = fileInput.files[0];
  if (!file) {
    setStatus("Сначала выбери PDF-файл.", "error");
    return;
  }
  setStatus("Разбираю файл…");
  parseBtn.disabled = true;
  try {
    const form = new FormData();
    form.append("file", file);
    const resp = await fetch(`${settings.apiUrl}/api/parse`, {
      method: "POST",
      body: form,
    });
    const data = await resp.json();
    if (!resp.ok)
      throw new Error(data.error || `Ошибка сервера (${resp.status})`);

    scheduleData = data;
    selectedGroup = data.groups[0] || null;
    setStatus(`Готово: найдено групп — ${data.groups.length}.`, "ok");
    buildGroupTabs();
    resultSection.classList.remove("hidden");
    renderAgenda();
  } catch (err) {
    console.error(err);
    setStatus(`Не удалось разобрать PDF файл :(`, "error");
  } finally {
    parseBtn.disabled = false;
  }
});

function setStatus(text, kind) {
  statusEl.textContent = text;
  statusEl.className = "status" + (kind ? " " + kind : "");
}

function buildGroupTabs() {
  groupTabs.innerHTML = "";
  scheduleData.groups.forEach((code) => {
    const btn = document.createElement("button");
    btn.className = "tab" + (code === selectedGroup ? " active" : "");
    btn.textContent = code;
    btn.addEventListener("click", () => {
      selectedGroup = code;
      [...groupTabs.children].forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      renderAgenda();
    });
    groupTabs.appendChild(btn);
  });
}

function weekNoteMatches(note, weekNum) {
  if (!note || weekNum === null) return true; // нет даты семестра — не фильтруем строго
  const untilMatch = note.match(/до\s*(\d+)\s*нед/);
  if (untilMatch) return weekNum <= parseInt(untilMatch[1], 10);
  const fromMatch = note.match(/^с\s*(\d+)\s*нед/);
  if (fromMatch) return weekNum >= parseInt(fromMatch[1], 10);
  const listMatch = note.match(/(\d+(?:,\d+)+)\s*нед/);
  if (listMatch) {
    const nums = listMatch[1].split(",").map((n) => parseInt(n, 10));
    return nums.includes(weekNum);
  }
  return true;
}

function getVisibleDays() {
  const parity = computeWeekParity();
  const weekNum = computeWeekNumber();
  const groupSchedule = scheduleData.schedule[selectedGroup] || {};
  return scheduleData.days.map((day) => {
    const dayCell = groupSchedule[day] || {};
    const items = [];
    scheduleData.pair_times.forEach((time) => {
      const cell = dayCell[time];
      if (!cell) return;
      const entry = cell[parity];
      if (!entry) return;
      if (!weekNoteMatches(entry.weeks_note, weekNum)) return;
      items.push({ time, ...entry, parity });
    });
    return { day, items };
  });
}

function renderAgenda() {
  const parity = computeWeekParity();
  const weekNum = computeWeekNumber();

  tbGroup.textContent = selectedGroup || "—";
  tbWeek.textContent =
    (weekNum ? `№${weekNum} · ` : "") +
    (parity === "odd" ? "нечётная" : "чётная");
  tbFile.textContent = currentFileName || "—";

  const days = getVisibleDays();
  agendaEl.innerHTML = "";
  days.forEach(({ day, items }) => {
    const dayBlock = document.createElement("div");
    dayBlock.className = "day";
    dayBlock.innerHTML = `
      <div class="dim-line">
        <span class="tick"></span><span class="rule"></span>
        <span class="label">${day}</span>
        <span class="rule"></span><span class="tick"></span>
      </div>`;

    if (items.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty-day";
      empty.textContent = "— пар нет —";
      dayBlock.appendChild(empty);
    } else {
      items.forEach((it) => {
        const row = document.createElement("div");
        row.className = "lesson" + (it.parity === "even" ? " even" : "");
        row.innerHTML = `
          <div class="lesson-time">${it.time}</div>
          <div class="lesson-body">
            <div class="lesson-subject">${escapeHtml(it.subject)}</div>
            ${it.teacher_line ? `<div class="lesson-meta">${escapeHtml(it.teacher_line)}</div>` : ""}
            ${it.weeks_note ? `<span class="lesson-note">${escapeHtml(it.weeks_note)}</span>` : ""}
          </div>`;
        dayBlock.appendChild(row);
      });
    }
    agendaEl.appendChild(dayBlock);
  });
}

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

exportBtn.addEventListener("click", async () => {
  if (!scheduleData || !selectedGroup) return;
  const parity = computeWeekParity();
  const weekNum = computeWeekNumber();
  const weekLabel =
    (weekNum ? `${weekNum}-я неделя · ` : "") +
    (parity === "odd" ? "нечётная неделя" : "чётная неделя");

  const days = getVisibleDays().map(({ day, items }) => ({
    day,
    items: items.map((it) => ({
      time: it.time,
      subject: it.subject,
      teacher_line: it.teacher_line || "",
    })),
  }));

  exportBtn.disabled = true;
  exportBtn.textContent = "Готовлю PDF…";
  try {
    const resp = await fetch(`${settings.apiUrl}/api/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        group: selectedGroup,
        week_label: weekLabel,
        days,
      }),
    });
    if (!resp.ok) throw new Error(`Ошибка сервера (${resp.status})`);
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `raspisanie_${selectedGroup}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    alert("Не получилось скачать PDF: " + err.message);
  } finally {
    exportBtn.disabled = false;
    exportBtn.textContent = "Скачать PDF";
  }
});

const ICS_DAY_OFFSET = {
  Понедельник: 0,
  Вторник: 1,
  Среда: 2,
  Четверг: 3,
  Пятница: 4,
  Суббота: 5,
  Воскресенье: 6,
};

function getMondayOfCurrentWeek() {
  const now = new Date();
  const dow = now.getDay();
  const diffToMonday = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + diffToMonday,
  );
  return monday;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function icsDateTime(date, hours, minutes) {
  return (
    date.getFullYear().toString() +
    pad2(date.getMonth() + 1) +
    pad2(date.getDate()) +
    "T" +
    pad2(hours) +
    pad2(minutes) +
    "00"
  );
}

function parseTimeRange(timeStr) {
  const parts = timeStr.split(/[–-]/).map((s) => s.trim());
  if (parts.length < 2) return null;
  const parseHM = (s) => {
    const m = s.match(/(\d{1,2}):(\d{2})/);
    if (!m) return null;
    return [parseInt(m[1], 10), parseInt(m[2], 10)];
  };
  const start = parseHM(parts[0]);
  const end = parseHM(parts[1]);
  if (!start || !end) return null;
  return { start, end };
}

function escapeIcsText(s) {
  return String(s || "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

function foldIcsLine(line) {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  let result = "";
  let chunk = "";
  let chunkBytes = 0;
  for (const ch of line) {
    const chLen = new TextEncoder().encode(ch).length;
    if (chunkBytes + chLen > 74) {
      result += (result ? "\r\n " : "") + chunk;
      chunk = "";
      chunkBytes = 0;
    }
    chunk += ch;
    chunkBytes += chLen;
  }
  if (chunk) result += (result ? "\r\n " : "") + chunk;
  return result;
}

function buildIcsCalendar() {
  const monday = getMondayOfCurrentWeek();
  const days = getVisibleDays();
  const now = new Date();
  const dtstamp = icsDateTime(now, now.getHours(), now.getMinutes());

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ScheduleApp//RU",
    "CALSCALE:GREGORIAN",
  ];

  let uidCounter = 0;
  days.forEach(({ day, items }) => {
    const offset = ICS_DAY_OFFSET[day];
    if (offset === undefined || items.length === 0) return;
    const eventDate = new Date(
      monday.getFullYear(),
      monday.getMonth(),
      monday.getDate() + offset,
    );

    items.forEach((it) => {
      const range = parseTimeRange(it.time);
      if (!range) return;
      uidCounter += 1;
      const uid = `${eventDate.getFullYear()}${pad2(eventDate.getMonth() + 1)}${pad2(eventDate.getDate())}-${uidCounter}-${selectedGroup}@schedule-app`;
      const descriptionParts = [];
      if (it.teacher_line) descriptionParts.push(it.teacher_line);
      if (it.weeks_note) descriptionParts.push(it.weeks_note);

      lines.push("BEGIN:VEVENT");
      lines.push(foldIcsLine(`UID:${uid}`));
      lines.push(`DTSTAMP:${dtstamp}`);
      lines.push(
        `DTSTART:${icsDateTime(eventDate, range.start[0], range.start[1])}`,
      );
      lines.push(`DTEND:${icsDateTime(eventDate, range.end[0], range.end[1])}`);
      lines.push(foldIcsLine(`SUMMARY:${escapeIcsText(it.subject)}`));
      if (descriptionParts.length) {
        lines.push(
          foldIcsLine(
            `DESCRIPTION:${escapeIcsText(descriptionParts.join(" · "))}`,
          ),
        );
      }
      lines.push("END:VEVENT");
    });
  });

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

exportIcsBtn.addEventListener("click", () => {
  if (!scheduleData || !selectedGroup) return;
  const totalItems = getVisibleDays().reduce(
    (sum, d) => sum + d.items.length,
    0,
  );
  if (totalItems === 0) {
    alert("На текущую неделю пар нет — экспортировать нечего.");
    return;
  }
  const ics = buildIcsCalendar();
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `raspisanie_${selectedGroup}.ics`;
  a.click();
  URL.revokeObjectURL(url);
});
