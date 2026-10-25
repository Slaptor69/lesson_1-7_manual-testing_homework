import { PREFIX } from './api.js';

export const CANARY_KEY = `${PREFIX}canary`;
const INCIDENTS_KEY = `${PREFIX}incidents`;
const RESTRICTION_KEY = `${PREFIX}restriction`;
const TOPICS = ['html', 'javascript', 'api'];
let incidents = [];
let refreshAttempts = [];
let blockedUntil = 0;
let restrictionReason = '';
let timerId = null;

function readStorage(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}

function saveStorage(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch { /* Без storage состояние сохраняется в памяти текущей страницы. */ }
}

function renderIncidents() {
  const list = document.querySelector('#incident-list');
  list.replaceChildren();
  for (const incident of [...incidents].reverse()) {
    const item = document.createElement('li');
    item.textContent = `${new Date(incident.time).toLocaleString('ru-RU')} · ${incident.type}: ${incident.reason}`;
    list.append(item);
  }
  document.querySelector('#incidents-empty').hidden = incidents.length > 0;
  document.querySelector('#incident-count').textContent = String(incidents.length);
}

function renderRestriction() {
  const restricted = isRestricted();
  if (!restricted && blockedUntil) {
    blockedUntil = 0;
    restrictionReason = '';
    try { localStorage.removeItem(RESTRICTION_KEY); }
    catch { /* Работа без storage остаётся доступной. */ }
  }
  document.querySelector('#security-status').textContent = restricted ? 'Действия временно ограничены' : 'Ограничений нет';
  const detail = document.querySelector('#restriction-detail');
  detail.hidden = !restricted;
  detail.textContent = restricted ? `${restrictionReason} Осталось: ${Math.ceil((blockedUntil - Date.now()) / 1000)} с.` : '';
  document.querySelector('#submit-button').disabled = restricted || document.querySelector('#application-form').getAttribute('aria-busy') === 'true';
  document.querySelector('#refresh-button').disabled = restricted;
  if (!restricted) {
    if (timerId !== null) clearInterval(timerId);
    timerId = null;
    refreshAttempts = [];
  } else if (timerId === null) {
    timerId = setInterval(renderRestriction, 1000);
  }
}

export function isRestricted() {
  return Date.now() < blockedUntil;
}

export function reportIncident(type, reason) {
  incidents.push({ time: new Date().toISOString(), type, reason });
  incidents = incidents.slice(-30);
  saveStorage(INCIDENTS_KEY, incidents);
  renderIncidents();
  if (!isRestricted()) {
    blockedUntil = Date.now() + 30000;
    restrictionReason = reason;
    saveStorage(RESTRICTION_KEY, { blockedUntil, reason });
  }
  renderRestriction();
}

export function checkActivity(action, details = {}) {
  if (action !== 'startup' && isRestricted()) return;
  if (action === 'refresh') {
    const now = Date.now();
    refreshAttempts = refreshAttempts.filter(time => now - time < 5000);
    refreshAttempts.push(now);
    if (refreshAttempts.length >= 6) reportIncident('T1', 'Шесть обновлений списка за 5 секунд.');
  }
  if (action === 'submit') {
    if (details.supportCode) reportIncident('T2', 'Заполнено скрытое служебное поле.');
    if (details.topic && !TOPICS.includes(details.topic)) reportIncident('T4', 'Обнаружена подмена направления.');
  }
  if (action === 'decoy') reportIncident('T3', 'Вызвана скрытая служебная кнопка.');
  if (action === 'startup') {
    if (readStorage(CANARY_KEY, null)?.role === 'admin') reportIncident('T5', 'Изменён учебный маркер роли.');
    saveStorage(CANARY_KEY, { role: 'visitor' });
    const url = new URL(window.location.href);
    if (url.searchParams.getAll('staff').includes('1')) {
      reportIncident('T6', 'Обнаружен служебный параметр адреса.');
      url.searchParams.delete('staff');
      window.history.replaceState(window.history.state, '', url);
    }
  }
}

export function initializeSecurity() {
  const savedIncidents = readStorage(INCIDENTS_KEY, []);
  incidents = Array.isArray(savedIncidents) ? savedIncidents.filter(item => item && typeof item.time === 'string' && Number.isFinite(Date.parse(item.time)) && typeof item.type === 'string' && typeof item.reason === 'string').slice(-30) : [];
  const restriction = readStorage(RESTRICTION_KEY, null);
  if (Number.isFinite(restriction?.blockedUntil) && typeof restriction.reason === 'string') {
    blockedUntil = restriction.blockedUntil;
    restrictionReason = restriction.reason;
  }
  renderIncidents();
  renderRestriction();
  checkActivity('startup');
}

export function resetSecurity() {
  if (timerId !== null) clearInterval(timerId);
  timerId = null;
  incidents = [];
  refreshAttempts = [];
  blockedUntil = 0;
  restrictionReason = '';
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(PREFIX) && key !== `${PREFIX}applications`) localStorage.removeItem(key);
    }
    localStorage.setItem(CANARY_KEY, JSON.stringify({ role: 'visitor' }));
  } catch { /* Учебный сброс остаётся доступным без storage. */ }
  renderIncidents();
  renderRestriction();
}
