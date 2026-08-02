// 明晰夢アンケート(使用記録と翌朝の質問)のクライアント側処理。
//
// - 端末ごとの匿名IDだけを使い、個人を特定する情報は送らない
// - 参加は任意(同意した端末だけが記録される)
// - 就寝中は圏外・機内モードのことがあるため、使用記録はキューに貯めて後で送る

const API_BASE = `${process.env.PUBLIC_URL}/api`;
const DEVICE_KEY = 'lucid_dream_device_id_v1';
const CONSENT_KEY = 'lucid_dream_survey_consent_v1';
const OUTBOX_KEY = 'lucid_dream_survey_outbox_v1';

export const CHOICES = [
  { id: 'lucid', label: '明晰夢を見た' },
  { id: 'normal', label: '普通の夢' },
  { id: 'none', label: '夢を見なかった' },
  { id: 'other', label: 'その他(自由回答)' }
];

export const NOTE_MAX = 200;

// APIはエックスサーバー配信時のみ存在する(GitHub Pages版は静的配信のため機能を出さない)
export const isSurveySupported = () => {
  const host = window.location.hostname;
  return host === 'bttp.info' || host === 'localhost' || host === '127.0.0.1';
};

export const getDeviceId = () => {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = (window.crypto && window.crypto.randomUUID)
      ? window.crypto.randomUUID().replace(/-/g, '')
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
};

// 'yes' | 'no' | null(未選択)
export const getConsent = () => localStorage.getItem(CONSENT_KEY);
export const setConsent = (value) => localStorage.setItem(CONSENT_KEY, value);

// 対象の朝。午前7時より前に始めた場合は当日、それ以降は翌日の朝。
export const targetMorningFor = (date = new Date()) => {
  const d = new Date(date.getTime());
  if (d.getHours() >= 7) d.setDate(d.getDate() + 1);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const readOutbox = () => {
  try {
    const raw = localStorage.getItem(OUTBOX_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch (_) {
    return [];
  }
};

const writeOutbox = (list) => {
  // 溜まりすぎを防ぐ(直近30件で十分)
  localStorage.setItem(OUTBOX_KEY, JSON.stringify(list.slice(-30)));
};

const postJson = async (path, payload) => {
  const res = await fetch(`${API_BASE}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

// 使用記録をキューに積み、その場で送信を試みる(失敗しても後で再送する)
export const queueSession = async (session) => {
  const outbox = readOutbox();
  outbox.push({ ...session, deviceId: getDeviceId() });
  writeOutbox(outbox);
  await flushOutbox();
};

export const flushOutbox = async () => {
  let outbox = readOutbox();
  if (outbox.length === 0) return;

  const remaining = [];
  for (const item of outbox) {
    try {
      await postJson('session.php', item);
    } catch (error) {
      // 通信できないだけなら次回に回す。不正データ(4xx)は捨てる
      if (!/HTTP 4\d\d/.test(String(error.message))) remaining.push(item);
    }
  }
  writeOutbox(remaining);
};

export const fetchPending = async () => {
  const url = `${API_BASE}/pending.php?deviceId=${encodeURIComponent(getDeviceId())}`;
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.pending || null;
};

export const submitAnswer = async ({ targetMorning, choice, note }) =>
  postJson('answer.php', {
    deviceId: getDeviceId(),
    targetMorning,
    choice,
    note: choice === 'other' ? (note || '').slice(0, NOTE_MAX) : ''
  });
