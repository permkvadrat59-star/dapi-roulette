// ---------- Config: edit this list to reskin the roulette for any client ----------
const PRIZES = [
  { id: 'discount10', title: 'Скидка 10%',     desc: 'Действует на следующий визит',        icon: '🏷️', rarity: 'common', weight: 28, ttlHours: 72 },
  { id: 'snack',       title: 'Снек в подарок', desc: 'Любой снек на кассе',                 icon: '🍪', rarity: 'common', weight: 24, ttlHours: 48 },
  { id: 'discount20',  title: 'Скидка 20%',     desc: 'Действует на следующий визит',        icon: '💸', rarity: 'rare',   weight: 14, ttlHours: 72 },
  { id: 'freehour',    title: '+2 часа',        desc: 'Бесплатно в следующий визит',         icon: '⏱️', rarity: 'rare',   weight: 12, ttlHours: 96 },
  { id: 'nightpack',   title: 'Ночной пакет',   desc: 'Бесплатный ночной пакет',             icon: '🌙', rarity: 'epic',   weight: 6,  ttlHours: 120 },
  { id: 'merch',       title: 'Мерч DAPI',      desc: 'Стикерпак команды',                   icon: '◆',  rarity: 'epic',   weight: 4,  ttlHours: 168 },
  { id: 'again',       title: 'Не повезло',     desc: 'Отсканируй QR в следующий визит',     icon: '🔁', rarity: 'common', weight: 30, ttlHours: 0 },
];

// QR at the venue should link to  <site-url>/?activate=<VENUE_CODE>  — change per client.
const VENUE_CODE = 'DAPI-DEMO';

const LS_USER = 'dapi_roulette_user';
const LS_INVENTORY = 'dapi_roulette_inventory';

const CARD_W = 92 + 8; // width + gap, must match .reel-card / .reel-track gap in CSS
const CYCLES = 12;
const REST_INDEX = PRIZES.length * 2; // resting position: leaves cards on both sides, not just the track start
const SPIN_DURATION_MS = 3200;

// ---------- Elements ----------
const authScreen = document.getElementById('authScreen');
const appShell = document.getElementById('appShell');
const authForm = document.getElementById('authForm');

const gateLocked = document.getElementById('gateLocked');
const gateOccupied = document.getElementById('gateOccupied');
const gateReady = document.getElementById('gateReady');
const occupiedItem = document.getElementById('occupiedItem');
const demoScanBtn = document.getElementById('demoScanBtn');

const reel = document.getElementById('reel');
const reelTrack = document.getElementById('reelTrack');
const spinBtn = document.getElementById('spinBtn');
const invBadge = document.getElementById('invBadge');
const inventoryList = document.getElementById('inventoryList');
const emptyState = document.getElementById('emptyState');

const winOverlay = document.getElementById('winOverlay');
const winRarity = document.getElementById('winRarity');
const winTitle = document.getElementById('winTitle');
const winDesc = document.getElementById('winDesc');
const winCodeBlock = document.getElementById('winCodeBlock');
const winCode = document.getElementById('winCode');
const winExpiry = document.getElementById('winExpiry');
const winClose = document.getElementById('winClose');

const giftOverlay = document.getElementById('giftOverlay');
const giftRarity = document.getElementById('giftRarity');
const giftTitle = document.getElementById('giftTitle');
const giftDesc = document.getElementById('giftDesc');
const giftFrom = document.getElementById('giftFrom');
const giftExpiry = document.getElementById('giftExpiry');
const giftAccept = document.getElementById('giftAccept');
const giftDecline = document.getElementById('giftDecline');

const profileAvatar = document.getElementById('profileAvatar');
const profileName = document.getElementById('profileName');
const profileId = document.getElementById('profileId');
const profileSince = document.getElementById('profileSince');
const logoutBtn = document.getElementById('logoutBtn');

let track = [];
let qrActivated = false;
let pendingGift = null;

// ---------- Storage helpers ----------
function uid() {
  return (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
}
function getUser() {
  try { return JSON.parse(localStorage.getItem(LS_USER)); }
  catch { return null; }
}
function saveUser(user) { localStorage.setItem(LS_USER, JSON.stringify(user)); }

function getInventory() {
  try { return JSON.parse(localStorage.getItem(LS_INVENTORY)) || []; }
  catch { return []; }
}
function saveInventory(list) { localStorage.setItem(LS_INVENTORY, JSON.stringify(list)); }

function getActiveItem() {
  const now = Date.now();
  return getInventory().find(i => !i.used && i.expiresAt > now) || null;
}

// ---------- Reel ----------
function shuffled(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildTrack() {
  track = [];
  for (let c = 0; c < CYCLES; c++) track.push(...shuffled(PRIZES));
  reelTrack.innerHTML = track.map(p => `
    <div class="reel-card">
      <div class="rc-icon">${p.icon}</div>
      <div class="rc-title">${p.title}</div>
    </div>
  `).join('');
}

// .reel-track is CSS-centered (left: 50%), so translateX only needs to cancel
// out the distance from the track's start to the middle of the target card.
function centerTrackAt(index, animated) {
  const cardCenter = index * CARD_W + CARD_W / 2;
  reelTrack.style.transition = animated ? `transform ${SPIN_DURATION_MS}ms cubic-bezier(0.12, 0.75, 0.15, 1)` : 'none';
  reelTrack.style.transform = `translateX(${-cardCenter}px)`;
}

function pickWeighted() {
  const total = PRIZES.reduce((s, p) => s + p.weight, 0);
  let r = Math.random() * total;
  for (const p of PRIZES) {
    if (r < p.weight) return p;
    r -= p.weight;
  }
  return PRIZES[PRIZES.length - 1];
}

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = 'DAPI-';
  for (let i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function rarityLabel(r) {
  return r === 'epic' ? 'EPIC' : r === 'rare' ? 'RARE' : 'COMMON';
}

function vibrate(pattern) {
  if (navigator.vibrate) navigator.vibrate(pattern); // no-op on iOS Safari, fine
}

function spin() {
  if (spinBtn.disabled) return;
  spinBtn.disabled = true;
  spinBtn.textContent = 'Крутим...';
  vibrate(15);

  const prize = pickWeighted();

  // fresh shuffle each spin, resting card becomes the previous prize (that's fine, about to move)
  buildTrack();
  centerTrackAt(REST_INDEX, false);
  void reelTrack.offsetWidth; // force reflow so the instant reset applies before the animated transition

  // land in one of the last few cycles so the reel travels a satisfying distance
  const cycleChoices = [CYCLES - 3, CYCLES - 2];
  const cycle = cycleChoices[Math.floor(Math.random() * cycleChoices.length)];
  const cycleStart = cycle * PRIZES.length;
  const candidates = [];
  for (let i = cycleStart; i < cycleStart + PRIZES.length; i++) {
    if (track[i].id === prize.id) candidates.push(i);
  }
  const targetIndex = candidates[Math.floor(Math.random() * candidates.length)];

  centerTrackAt(targetIndex, true);

  // transitionend can fail to fire if the tab is backgrounded mid-animation (common on
  // mobile when a user briefly switches apps), so a timer backs it up as the source of truth.
  let settled = false;
  const settle = () => {
    if (settled) return;
    settled = true;
    reelTrack.removeEventListener('transitionend', settle);
    handleResult(prize);
  };
  reelTrack.addEventListener('transitionend', settle);
  setTimeout(settle, SPIN_DURATION_MS + 300);
}

function handleResult(prize) {
  qrActivated = false; // the QR scan is consumed by this one spin attempt, win or miss

  if (prize.id !== 'again') {
    const now = Date.now();
    const entry = {
      uid: uid(),
      prizeId: prize.id,
      title: prize.title,
      desc: prize.desc,
      rarity: prize.rarity,
      code: genCode(),
      wonAt: now,
      expiresAt: now + prize.ttlHours * 3600 * 1000,
      used: false,
      gifted: false,
    };
    const inv = getInventory();
    inv.unshift(entry);
    saveInventory(inv);
    renderInventory();
    vibrate(prize.rarity === 'epic' ? [30, 60, 30, 60, 60] : [30, 60, 30]);
    showWin(prize, entry);
  } else {
    vibrate(20);
    showWin(prize, null);
  }

  updateGateState();
}

function showWin(prize, entry) {
  winRarity.textContent = rarityLabel(prize.rarity);
  winRarity.className = `win-rarity rarity-${prize.rarity}`;
  winTitle.textContent = prize.title;
  winDesc.textContent = prize.desc;

  if (entry) {
    winCodeBlock.classList.remove('is-hidden');
    winCode.textContent = entry.code;
    const hrs = prize.ttlHours;
    const days = Math.floor(hrs / 24);
    const restH = hrs % 24;
    winExpiry.textContent = days > 0
      ? `Сгорит через ${days} дн. ${restH} ч.`
      : `Сгорит через ${hrs} ч.`;
    winClose.textContent = 'В инвентарь';
  } else {
    winCodeBlock.classList.add('is-hidden');
    winClose.textContent = 'Понятно';
  }

  winOverlay.classList.add('open');
}

function closeWin() {
  winOverlay.classList.remove('open');
}

// ---------- Inventory ----------
function formatExpiry(expiresAt, now) {
  const msLeft = expiresAt - now;
  if (msLeft <= 0) return null;
  const hrs = Math.ceil(msLeft / 3600000);
  const days = Math.floor(hrs / 24);
  const restH = hrs % 24;
  return days > 0 ? `${days} дн. ${restH} ч.` : `${hrs} ч.`;
}

function invItemHTML(item, now) {
  const expired = !item.used && item.expiresAt <= now;
  const active = !item.used && !expired;
  const statusClass = item.used ? '' : expired ? 'status-expired' : 'status-active';
  const statusText = item.used ? (item.gifted ? 'Подарено' : 'Использовано') : expired ? 'Истёк' : 'Активен';
  const expiryLine = active ? `<p class="inv-item-desc">Сгорит через ${formatExpiry(item.expiresAt, now)}</p>` : '';

  return `
    <div class="inv-item" data-uid="${item.uid}">
      <div class="inv-item-top">
        <span class="inv-item-title">${item.title}</span>
        <span class="inv-rarity rarity-${item.rarity}">${rarityLabel(item.rarity)}</span>
      </div>
      <p class="inv-item-desc">${item.desc}</p>
      <div class="inv-code-row">
        <span class="inv-code">${item.code}</span>
        <span class="inv-status ${statusClass}">${statusText}</span>
      </div>
      ${expiryLine}
      ${active ? `
        <div class="inv-actions">
          <button class="inv-redeem-btn" data-uid="${item.uid}">Отметить использованным</button>
          <button class="inv-share-btn" data-uid="${item.uid}">Подарить</button>
        </div>
      ` : ''}
    </div>
  `;
}

function renderInventory() {
  const inv = getInventory();
  const now = Date.now();
  const activeCount = inv.filter(i => !i.used && i.expiresAt > now).length;
  invBadge.hidden = activeCount === 0;
  invBadge.textContent = activeCount;

  emptyState.classList.toggle('is-hidden', inv.length > 0);
  inventoryList.innerHTML = inv.map(item => invItemHTML(item, now)).join('');
}

function redeem(itemUid) {
  const inv = getInventory();
  const item = inv.find(i => i.uid === itemUid);
  if (item) item.used = true;
  saveInventory(inv);
  renderInventory();
  updateGateState();
}

// ---------- Gifting ----------
function buildGiftLink(item) {
  const payload = {
    t: item.title, d: item.desc, r: item.rarity, c: item.code,
    e: item.expiresAt, p: item.prizeId, n: (getUser() || {}).firstName || '',
  };
  const encoded = btoa(encodeURIComponent(JSON.stringify(payload)));
  return `${location.origin}${location.pathname}?gift=${encoded}`;
}

function markGifted(itemUid) {
  const inv = getInventory();
  const item = inv.find(i => i.uid === itemUid);
  if (item) { item.used = true; item.gifted = true; }
  saveInventory(inv);
  renderInventory();
  updateGateState();
}

async function shareItem(itemUid) {
  const inv = getInventory();
  const item = inv.find(i => i.uid === itemUid);
  if (!item) return;

  const url = buildGiftLink(item);
  const text = `Дарю тебе приз из DAPI Roulette: ${item.title}. Открой ссылку и прими подарок 🎁`;

  if (navigator.share) {
    try {
      await navigator.share({ title: 'DAPI Roulette — подарок', text, url });
      markGifted(itemUid);
    } catch {
      // user cancelled the share sheet — keep the prize, nothing was sent
    }
    return;
  }

  try {
    await navigator.clipboard.writeText(url);
    alert('Ссылка на подарок скопирована — отправь её другу.');
    markGifted(itemUid);
  } catch {
    window.prompt('Скопируй ссылку вручную и отправь другу:', url);
    markGifted(itemUid);
  }
}

function decodeGift(param) {
  try {
    const payload = JSON.parse(decodeURIComponent(atob(param)));
    if (!payload || !payload.t || !payload.c || !payload.e) return null;
    if (payload.e <= Date.now()) return null; // already expired
    return payload;
  } catch {
    return null;
  }
}

function showGift(payload) {
  pendingGift = payload;
  giftRarity.textContent = rarityLabel(payload.r);
  giftRarity.className = `win-rarity rarity-${payload.r}`;
  giftTitle.textContent = payload.t;
  giftDesc.textContent = payload.d;
  giftFrom.textContent = payload.n ? `Подарок от ${payload.n}` : 'Тебе подарили приз';
  const left = formatExpiry(payload.e, Date.now());
  giftExpiry.textContent = left ? `Сгорит через ${left}` : 'Срок годности истекает';
  giftOverlay.classList.add('open');
}

function closeGift() {
  giftOverlay.classList.remove('open');
  pendingGift = null;
  const clean = new URL(location.href);
  clean.searchParams.delete('gift');
  history.replaceState({}, '', clean.toString());
}

function acceptGift() {
  if (!pendingGift) return;
  if (getActiveItem()) {
    alert('У тебя уже есть активный приз — сначала используй или подари его, потом принимай новый.');
    return;
  }
  const now = Date.now();
  const entry = {
    uid: uid(),
    prizeId: pendingGift.p || '',
    title: pendingGift.t,
    desc: pendingGift.d,
    rarity: pendingGift.r,
    code: pendingGift.c,
    wonAt: now,
    expiresAt: pendingGift.e,
    used: false,
    gifted: false,
  };
  const inv = getInventory();
  inv.unshift(entry);
  saveInventory(inv);
  renderInventory();
  updateGateState();
  closeGift();
}

// ---------- Gate (locked / occupied / ready) ----------
function updateGateState() {
  const active = getActiveItem();

  gateLocked.classList.add('is-hidden');
  gateOccupied.classList.add('is-hidden');
  gateReady.classList.add('is-hidden');

  if (active) {
    occupiedItem.innerHTML = invItemHTML(active, Date.now());
    gateOccupied.classList.remove('is-hidden');
  } else if (qrActivated) {
    gateReady.classList.remove('is-hidden');
    spinBtn.disabled = false;
    spinBtn.textContent = 'Крутить';
  } else {
    gateLocked.classList.remove('is-hidden');
  }
}

function tryActivateFromUrl() {
  const params = new URLSearchParams(location.search);
  const code = params.get('activate');
  if (code && code.trim().toUpperCase() === VENUE_CODE.toUpperCase()) {
    qrActivated = true;
  }
  if (params.has('activate')) {
    const clean = new URL(location.href);
    clean.searchParams.delete('activate');
    history.replaceState({}, '', clean.toString());
  }

  const gift = params.get('gift');
  if (gift) {
    const payload = decodeGift(gift);
    if (payload) showGift(payload);
    else {
      const clean = new URL(location.href);
      clean.searchParams.delete('gift');
      history.replaceState({}, '', clean.toString());
    }
  }
}

// ---------- Profile ----------
function renderProfile() {
  const user = getUser();
  if (!user) return;
  const initials = `${(user.firstName || '?')[0] || ''}${(user.lastName || '')[0] || ''}`.toUpperCase();
  profileAvatar.textContent = initials || '?';
  profileName.textContent = `${user.firstName} ${user.lastName}`.trim();
  profileId.textContent = `ID: ${user.id.slice(0, 8)}`;
  profileSince.textContent = new Date(user.createdAt).toLocaleDateString('ru-RU', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

// ---------- Tabs ----------
function switchTab(name) {
  document.querySelectorAll('.bnav-item').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  document.getElementById('panel-wheel').classList.toggle('is-hidden', name !== 'wheel');
  document.getElementById('panel-inventory').classList.toggle('is-hidden', name !== 'inventory');
  document.getElementById('panel-profile').classList.toggle('is-hidden', name !== 'profile');
}

document.querySelectorAll('.bnav-item').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});
document.querySelectorAll('[data-goto]').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.goto));
});

inventoryList.addEventListener('click', (e) => {
  const redeemBtn = e.target.closest('.inv-redeem-btn');
  const shareBtn = e.target.closest('.inv-share-btn');
  if (redeemBtn) redeem(redeemBtn.dataset.uid);
  if (shareBtn) shareItem(shareBtn.dataset.uid);
});
occupiedItem.addEventListener('click', (e) => {
  const redeemBtn = e.target.closest('.inv-redeem-btn');
  const shareBtn = e.target.closest('.inv-share-btn');
  if (redeemBtn) redeem(redeemBtn.dataset.uid);
  if (shareBtn) shareItem(shareBtn.dataset.uid);
});

spinBtn.addEventListener('click', spin);
winClose.addEventListener('click', closeWin);
winOverlay.addEventListener('click', (e) => { if (e.target === winOverlay) closeWin(); });

demoScanBtn.addEventListener('click', () => {
  qrActivated = true;
  updateGateState();
});

giftAccept.addEventListener('click', acceptGift);
giftDecline.addEventListener('click', closeGift);
giftOverlay.addEventListener('click', (e) => { if (e.target === giftOverlay) closeGift(); });

logoutBtn.addEventListener('click', () => {
  if (!confirm('Выйти и очистить профиль на этом устройстве?')) return;
  localStorage.removeItem(LS_USER);
  localStorage.removeItem(LS_INVENTORY);
  location.reload();
});

authForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const firstName = document.getElementById('authFirstName').value.trim();
  const lastName = document.getElementById('authLastName').value.trim();
  if (!firstName || !lastName) return;
  saveUser({ id: uid(), firstName, lastName, createdAt: Date.now() });
  boot();
});

// ---------- Init ----------
function boot() {
  const user = getUser();
  if (!user) {
    authScreen.hidden = false;
    appShell.hidden = true;
    return;
  }

  authScreen.hidden = true;
  appShell.hidden = false;

  buildTrack();
  centerTrackAt(REST_INDEX, false);
  renderProfile();
  renderInventory();
  tryActivateFromUrl();
  updateGateState();
}

boot();
