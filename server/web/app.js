const TZ = "Asia/Shanghai";
const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];
const state = {
  view: localStorage.getItem("wudeng.view") || "month",
  cursor: todayInShanghai(), events: [], notes: [], unseen: new Set(), loading: false,
};

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const els = {
  calendar: $("#calendar"), status: $("#statusBar"), periodTitle: $("#periodTitle"),
  periodSubtitle: $("#periodSubtitle"), settings: $("#settingsDialog"), settingsForm: $("#settingsForm"),
  token: $("#tokenInput"), apiBase: $("#apiBaseInput"), eventDialog: $("#eventDialog"),
  eventForm: $("#eventForm"), noteDialog: $("#noteDialog"), noteForm: $("#noteForm"),
};

function config() {
  return {
    token: localStorage.getItem("wudeng.token") || "",
    base: (localStorage.getItem("wudeng.apiBase") || "/api/v1/calendar").replace(/\/$/, ""),
  };
}

function todayInShanghai() {
  const parts = new Intl.DateTimeFormat("en-CA", {timeZone: TZ, year:"numeric", month:"2-digit", day:"2-digit"}).formatToParts(new Date());
  const value = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function addDays(day, amount) {
  const date = new Date(`${day}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function monthStart(day) { return `${day.slice(0, 7)}-01`; }
function monthEnd(day) { return addDays(`${day.slice(0, 7)}-01`, daysInMonth(day.slice(0, 7)) - 1); }
function daysInMonth(ym) { const [y,m] = ym.split("-").map(Number); return new Date(Date.UTC(y,m,0)).getUTCDate(); }
function weekday(day) { const d = new Date(`${day}T00:00:00Z`).getUTCDay(); return d === 0 ? 7 : d; }
function weekStart(day) { return addDays(day, 1 - weekday(day)); }
function monthGridStart(day) { return weekStart(monthStart(day)); }
function sameMonth(a,b) { return a.slice(0,7) === b.slice(0,7); }
function escapeHtml(value) { const div = document.createElement("div"); div.textContent = value ?? ""; return div.innerHTML; }

function dateLabel(day, options={}) {
  return new Intl.DateTimeFormat("zh-CN", {timeZone:"UTC", ...options}).format(new Date(`${day}T12:00:00Z`));
}

function instantParts(value) {
  if (!value) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {timeZone:TZ, year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit", hourCycle:"h23"}).formatToParts(new Date(value));
  return Object.fromEntries(parts.map(p => [p.type, p.value]));
}

function instantDay(value) { const p = instantParts(value); return p ? `${p.year}-${p.month}-${p.day}` : ""; }
function inputValue(value) { const p = instantParts(value); return p ? `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}` : ""; }
function timeLabel(value) { const p = instantParts(value); return p ? `${p.hour}:${p.minute}` : ""; }
function offsetValue(localValue) { return localValue ? `${localValue}:00+08:00` : null; }

function spansDay(event, day) {
  const start = instantDay(event.starts_at);
  const exclusiveEnd = instantDay(event.ends_at || event.starts_at);
  const end = event.precision === "day" ? addDays(exclusiveEnd, -1) : exclusiveEnd;
  return day >= start && day <= (end || start);
}

function showStatus(message, error=false) {
  els.status.hidden = !message; els.status.textContent = message || "";
  els.status.classList.toggle("error", error);
}

async function api(path, options={}) {
  const {token, base} = config();
  const headers = new Headers(options.headers || {});
  if (token) headers.set("X-Calendar-Token", token);
  if (options.body && !(options.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const response = await fetch(`${base}${path}`, {...options, headers});
  if (!response.ok) {
    let detail = `${response.status}`;
    try { const data = await response.json(); detail = data.detail || detail; } catch (_) {}
    if (response.status === 401) detail = "密钥不对，去右上角重新填写";
    throw new Error(detail);
  }
  const type = response.headers.get("content-type") || "";
  return type.includes("json") ? response.json() : response;
}

function rangeForView() {
  if (state.view === "day") return [state.cursor, state.cursor];
  if (state.view === "week") { const start = weekStart(state.cursor); return [start, addDays(start, 6)]; }
  const start = monthGridStart(state.cursor); return [start, addDays(start, 41)];
}

async function load() {
  const {token} = config();
  updateHeader();
  if (!token) {
    renderDisconnected();
    if (!els.settings.open) openSettings();
    return;
  }
  state.loading = true; els.calendar.classList.add("loading"); showStatus("");
  const [from,to] = rangeForView();
  try {
    const [eventData, noteData, unseenData] = await Promise.all([
      api(`/events?from=${from}&to=${to}&limit=500`),
      api(`/notes?from=${from}&to=${to}&limit=500`),
      api("/unseen"),
    ]);
    state.events = eventData.events || []; state.notes = noteData.notes || [];
    state.unseen = new Set(unseenData.days || []); render();
    if (state.view === "day" && state.unseen.has(state.cursor)) markSeen(state.cursor);
  } catch (error) {
    showStatus(`没有连上手帐：${error.message}`, true); renderDisconnected(false);
  } finally { state.loading = false; els.calendar.classList.remove("loading"); }
}

function updateHeader() {
  if (state.view === "month") {
    els.periodTitle.textContent = dateLabel(monthStart(state.cursor), {year:"numeric", month:"long"});
    els.periodSubtitle.textContent = "我们的月历";
  } else if (state.view === "week") {
    const start = weekStart(state.cursor), end = addDays(start, 6);
    els.periodTitle.textContent = `${dateLabel(start,{month:"short",day:"numeric"})} – ${dateLabel(end,{month:"short",day:"numeric"})}`;
    els.periodSubtitle.textContent = "这一周";
  } else {
    els.periodTitle.textContent = dateLabel(state.cursor,{year:"numeric",month:"long",day:"numeric"});
    els.periodSubtitle.textContent = state.cursor === todayInShanghai() ? "今天" : `星期${WEEKDAYS[weekday(state.cursor)-1]}`;
  }
  $$(".view-tabs button").forEach(button => button.classList.toggle("active", button.dataset.view === state.view));
}

function render() {
  updateHeader();
  if (state.view === "month") renderMonth();
  else if (state.view === "week") renderWeek();
  else renderDay();
}

function renderDisconnected(showText=true) {
  els.calendar.innerHTML = `<div class="empty-state"><span>☾</span><p>${showText ? "先点右上角连上手帐" : "网页已经醒了，数据还没连上"}</p><small>${showText ? "密钥只需在这台设备填写一次" : "检查密钥或服务器状态后再试"}</small></div>`;
}

function eventsFor(day) { return state.events.filter(event => spansDay(event, day)); }
function notesFor(day) { return state.notes.filter(note => note.anchor_date === day); }

function renderMonth() {
  const start = monthGridStart(state.cursor), today = todayInShanghai();
  let html = `<div class="weekday-row">${WEEKDAYS.map(day => `<span>${day}</span>`).join("")}</div><div class="month-grid">`;
  for (let i=0; i<42; i++) {
    const day = addDays(start, i), events = eventsFor(day), notes = notesFor(day);
    html += `<button class="day-cell ${sameMonth(day,state.cursor)?"":"outside"} ${day===today?"today":""} ${day===state.cursor?"selected":""}" data-day="${day}">
      <span class="day-number">${Number(day.slice(-2))}</span>${state.unseen.has(day)?'<i class="unread-dot"></i>':''}
      ${events.slice(0,3).map(event => `<span class="mini-event ${event.event_type||""}">${escapeHtml(event.title)}</span>`).join("")}
      ${events.length>3?`<span class="mini-note">还有 ${events.length-3} 件</span>`:""}
      ${notes.length?`<span class="mini-note">${notes.length} 张便签${notes.some(n=>n.liked)?" · ♥":""}</span>`:""}
    </button>`;
  }
  els.calendar.innerHTML = `${html}</div>`;
  $$(".day-cell").forEach(cell => cell.addEventListener("click", () => openDay(cell.dataset.day)));
}

function renderWeek() {
  const start = weekStart(state.cursor), today = todayInShanghai();
  let html = `<div class="week-grid">`;
  for (let i=0; i<7; i++) {
    const day = addDays(start,i), events=eventsFor(day), notes=notesFor(day);
    html += `<article class="week-day ${day===today?"today":""}"><header data-day="${day}"><span>星期${WEEKDAYS[i]}</span><strong>${Number(day.slice(-2))}</strong>${state.unseen.has(day)?'<i class="unread-dot"></i>':''}</header>
      ${events.map(eventCard).join("")}${notes.map(noteCard).join("")}
      ${!events.length&&!notes.length?'<p class="hint">空白的一天</p>':''}</article>`;
  }
  els.calendar.innerHTML = `${html}</div>`; bindCards();
  $$(".week-day header").forEach(header => header.addEventListener("click",()=>openDay(header.dataset.day)));
}

function eventCard(event) {
  const allDay = event.precision === "day";
  const time = allDay ? "全天" : `${timeLabel(event.starts_at)}${event.ends_at?` – ${timeLabel(event.ends_at)}`:""}`;
  return `<article class="event-card ${event.event_type||""}" data-event-id="${event.id}"><time>${time}</time><strong>${escapeHtml(event.title)}</strong>${event.description?`<p>${escapeHtml(event.description)}</p>`:""}</article>`;
}

function noteCard(note) {
  return `<article class="note-card" data-note-id="${note.id}"><p>${escapeHtml(note.body)}</p><div class="note-meta"><span>${note.author === "master" || note.author === "assistant" ? "沈雾" : "惠惠"}</span><span>${note.liked?"♥ 已喜欢":"双击喜欢"}</span></div></article>`;
}

function renderDay() {
  const events=eventsFor(state.cursor), notes=notesFor(state.cursor);
  els.calendar.innerHTML = `<div class="day-view"><div class="day-hero"><span class="big-day">${Number(state.cursor.slice(-2))}</span><p>${dateLabel(state.cursor,{year:"numeric",month:"long"})}<br>星期${WEEKDAYS[weekday(state.cursor)-1]}${state.cursor===todayInShanghai()?" · 今天":""}</p></div>
    <div class="day-columns"><section><div class="section-title"><h3>日程</h3><span>${events.length} 件</span></div>${events.map(eventCard).join("")||'<p class="hint">今天还没有日程</p>'}</section>
    <section><div class="section-title"><h3>便签</h3><span>${notes.length} 张</span></div>${notes.map(noteCard).join("")||'<p class="hint">还没有贴便签</p>'}</section></div></div>`;
  bindCards();
}

function bindCards() {
  $$(".event-card").forEach(card => card.addEventListener("click",()=>openEvent(state.events.find(item=>item.id===card.dataset.eventId))));
  $$(".note-card").forEach(card => {
    card.addEventListener("click",()=>openNote(state.notes.find(item=>item.id===card.dataset.noteId)));
    card.addEventListener("dblclick",()=>likeNote(card.dataset.noteId));
  });
}

function openDay(day) { state.cursor=day; state.view="day"; localStorage.setItem("wudeng.view","day"); load(); }

async function markSeen(day) {
  try { await api("/unseen/seen",{method:"POST",body:JSON.stringify({date:day})}); state.unseen.delete(day); }
  catch (_) {}
}

function openSettings() {
  const {token,base}=config(); els.token.value=token; els.apiBase.value=base; els.settings.showModal();
}

function defaultTimes(day=state.cursor) {
  const now = new Date();
  const currentDay = todayInShanghai();
  let hour = day===currentDay ? Number(instantParts(now).hour)+1 : 10;
  if (hour>22) hour=22;
  const hh=String(hour).padStart(2,"0");
  return [`${day}T${hh}:00`, `${day}T${String(Math.min(hour+1,23)).padStart(2,"0")}:00`];
}

function openEvent(event=null) {
  const [start,end]=defaultTimes();
  const allDay=event?.precision==="day";
  $("#eventId").value=event?.id||""; $("#eventTitle").value=event?.title||"";
  $("#eventAllDay").checked=allDay;
  $("#eventStart").type=allDay?"date":"datetime-local"; $("#eventEnd").type=allDay?"date":"datetime-local";
  $("#eventStart").value=event?(allDay?instantDay(event.starts_at):inputValue(event.starts_at)):start;
  $("#eventEnd").value=event?(allDay?addDays(instantDay(event.ends_at),-1):inputValue(event.ends_at)):end;
  $("#eventType").value=event?.event_type||"";
  $("#eventDescription").value=event?.description||""; $("#eventDialogTitle").textContent=event?"修改日程":"新日程";
  $("#deleteEventButton").hidden=!event; els.eventDialog.showModal();
}

function openNote(note=null) {
  $("#noteId").value=note?.id||""; $("#noteDate").value=note?.anchor_date||state.cursor;
  $("#noteBody").value=note?.body||""; $("#noteDialogTitle").textContent=note?"修改便签":"贴一张便签";
  $("#deleteNoteButton").hidden=!note; els.noteDialog.showModal();
}

async function saveEvent() {
  const id=$("#eventId").value, allDay=$("#eventAllDay").checked;
  const start=$("#eventStart").value, end=$("#eventEnd").value;
  const payload={title:$("#eventTitle").value.trim(), description:$("#eventDescription").value.trim(), event_type:$("#eventType").value||null};
  if (allDay) { payload.precision="day"; payload.starts_at=start.slice(0,10); payload.ends_at=addDays(end.slice(0,10),1); }
  else { payload.precision="minute"; payload.starts_at=offsetValue(start); payload.ends_at=offsetValue(end); }
  await api(id?`/events/${id}`:"/events",{method:id?"PATCH":"POST",body:JSON.stringify(payload)});
}

async function saveNote() {
  const id=$("#noteId").value;
  const payload=id?{body:$("#noteBody").value.trim()}:{body:$("#noteBody").value.trim(),anchor_date:$("#noteDate").value};
  await api(id?`/notes/${id}`:"/notes",{method:id?"PATCH":"POST",body:JSON.stringify(payload)});
}

async function remove(kind,id) {
  if (!id || !confirm(kind==="event"?"删掉这条日程？":"撕掉这张便签？")) return false;
  await api(kind==="event"?`/events/${id}`:`/notes/${id}`,{method:"DELETE"}); return true;
}

async function likeNote(id) {
  const note=state.notes.find(item=>item.id===id); if(!note)return;
  try { await api(`/notes/${id}`,{method:"PATCH",body:JSON.stringify({liked:!note.liked})}); await load(); }
  catch(error){showStatus(`没点上：${error.message}`,true);}
}

function shift(amount) {
  if(state.view==="day") state.cursor=addDays(state.cursor,amount);
  else if(state.view==="week") state.cursor=addDays(state.cursor,amount*7);
  else { const [y,m]=state.cursor.split("-").map(Number); const target=new Date(Date.UTC(y,m-1+amount,1)); state.cursor=target.toISOString().slice(0,10); }
  load();
}

$("#settingsButton").addEventListener("click",openSettings);
$("#prevButton").addEventListener("click",()=>shift(-1)); $("#nextButton").addEventListener("click",()=>shift(1));
$("#periodButton").addEventListener("click",()=>{state.cursor=todayInShanghai();load();});
$("#newEventButton").addEventListener("click",()=>openEvent()); $("#newNoteButton").addEventListener("click",()=>openNote());
$$(".view-tabs button").forEach(button=>button.addEventListener("click",()=>{state.view=button.dataset.view;localStorage.setItem("wudeng.view",state.view);load();}));

els.settingsForm.addEventListener("submit",event=>{
  event.preventDefault(); localStorage.setItem("wudeng.token",els.token.value.trim());
  localStorage.setItem("wudeng.apiBase",els.apiBase.value.trim()||"/api/v1/calendar"); els.settings.close(); load();
});
$("#testButton").addEventListener("click",async()=>{
  localStorage.setItem("wudeng.token",els.token.value.trim()); localStorage.setItem("wudeng.apiBase",els.apiBase.value.trim()||"/api/v1/calendar");
  try { await api("/events?limit=1"); showStatus("连上了。我们的手帐醒了。"); }
  catch(error){showStatus(`还没连上：${error.message}`,true);}
});

els.eventForm.addEventListener("submit",async event=>{event.preventDefault();try{await saveEvent();els.eventDialog.close();await load();}catch(error){showStatus(`没保存：${error.message}`,true);}});
els.noteForm.addEventListener("submit",async event=>{event.preventDefault();try{await saveNote();els.noteDialog.close();await load();}catch(error){showStatus(`没贴上：${error.message}`,true);}});
$("#deleteEventButton").addEventListener("click",async()=>{try{if(await remove("event",$("#eventId").value)){els.eventDialog.close();await load();}}catch(error){showStatus(`没删掉：${error.message}`,true);}});
$("#deleteNoteButton").addEventListener("click",async()=>{try{if(await remove("note",$("#noteId").value)){els.noteDialog.close();await load();}}catch(error){showStatus(`没撕掉：${error.message}`,true);}});
$("#eventAllDay").addEventListener("change",event=>{$("#eventStart").type=event.target.checked?"date":"datetime-local";$("#eventEnd").type=event.target.checked?"date":"datetime-local";});

if("serviceWorker" in navigator) window.addEventListener("load",()=>navigator.serviceWorker.register("/sw.js").catch(()=>{}));
load();
