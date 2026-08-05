// ---------- Config: edit this list to reskin the roulette for any client ----------
const PRIZES = [
  { id: 'discount10', title: 'Скидка 10%',     desc: 'Действует на следующий визит',        icon: '🏷️', rarity: 'common', weight: 28, ttlHours: 72 },
  { id: 'snack',       title: 'Снек в подарок', desc: 'Любой снек на кассе',                 icon: '🍪', rarity: 'common', weight: 24, ttlHours: 48 },
  { id: 'discount20',  title: 'Скидка 20%',     desc: 'Действует на следующий визит',        icon: '💸', rarity: 'rare',   weight: 14, ttlHours: 72 },
  { id: 'freehour',    title: '+2 часа',        desc: 'Бесплатно в следующий визит',         icon: '⏱️', rarity: 'rare',   weight: 12, ttlHours: 96 },
  { id: 'nightpack',   title: 'Ночной пакет',   desc: 'Бесплатный ночной пакет',             icon: '🌙', rarity: 'epic',   weight: 6,  ttlHours: 120 },
  { id: 'merch',       title: 'Мерч DAPI',      desc: 'Стикерпак команды',                   icon: '◆',  rarity: 'epic',   weight: 4,  ttlHours: 168 },
  { id: 'again',       title: 'Ещё раз завтра', desc: 'В этот раз не повезло',                icon: '🔁', rarity: 'common', weight: 30, ttlHours: 0 },
];

const COOLDOWN_MS = 24 * 60 * 60 * 1000;
const LS_LAST_SPIN = 'dapi_roulette_last_spin';
const LS_INVENTORY = 'dapi_roulette_inventory';

const CARD_W = 92 + 8; // width + gap, must match .reel-card / .reel-track gap in CSS
const CYCLES = 12;
const REST_INDEX = PRIZES.length * 2; // resting position: leaves cards on both sides, not just the track start
const SPIN_DURATION_MS = 3200;

const reel = document.getElementById('reel');
const reelTrack = document.getElementById('reelTrack');
const spinBtn = document.getElementById('spinBtn');
const spinHint = document.getElementById('spinHint');
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

let countdownTimer = null;
let track = [];

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

function getInventory() {
  try { return JSON.parse(localStorage.getItem(LS_INVENTORY)) || []; }
  catch { return []; }
}
function saveInventory(list) {
  localStorage.setItem(LS_INVENTORY, JSON.stringify(list));
}

function getLastSpin() {
  return Number(localStorage.getItem(LS_LAST_SPIN) || 0);
}
function setLastSpin(ts) {
  localStorage.setItem(LS_LAST_SPIN, String(ts));
}

function formatRemaining(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = String(Math.floor(total / 3600)).padStart(2, '0');
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
  const s = String(total % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function updateSpinAvailability() {
  const last = getLastSpin();
  const remaining = COOLDOWN_MS - (Date.now() - last);

  if (countdownTimer) clearInterval(countdownTimer);

  if (remaining > 0) {
    spinBtn.disabled = true;
    spinBtn.textContent = 'Крутить';
    spinHint.textContent = `Следующий прокрут через ${formatRemaining(remaining)}`;
    countdownTimer = setInterval(() => {
      const left = COOLDOWN_MS - (Date.now() - getLastSpin());
      if (left <= 0) {
        clearInterval(countdownTimer);
        updateSpinAvailability();
      } else {
        spinHint.textContent = `Следующий прокрут через ${formatRemaining(left)}`;
      }
    }, 1000);
  } else {
    spinBtn.disabled = false;
    spinBtn.textContent = 'Крутить';
    spinHint.textContent = '1 бесплатный прокрут каждые 24 часа';
  }
}

function rarityLabel(r) {
  return r === 'epic' ? 'EPIC' : r === 'rare' ? 'RARE' : 'COMMON';
}

function spin() {
  if (spinBtn.disabled) return;
  spinBtn.disabled = true;
  spinBtn.textContent = 'Крутим...';

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
  const now = Date.now();
  setLastSpin(now);

  if (prize.id !== 'again') {
    const entry = {
      uid: `${now}-${Math.random().toString(36).slice(2, 8)}`,
      prizeId: prize.id,
      title: prize.title,
      desc: prize.desc,
      rarity: prize.rarity,
      code: genCode(),
      wonAt: now,
      expiresAt: now + prize.ttlHours * 3600 * 1000,
      used: false,
    };
    const inv = getInventory();
    inv.unshift(entry);
    saveInventory(inv);
    renderInventory();
    showWin(prize, entry);
  } else {
    showWin(prize, null);
  }

  updateSpinAvailability();
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

function renderInventory() {
  const inv = getInventory();
  const now = Date.now();
  invBadge.hidden = inv.filter(i => !i.used && i.expiresAt > now).length === 0;
  invBadge.textContent = inv.filter(i => !i.used && i.expiresAt > now).length;

  emptyState.classList.toggle('is-hidden', inv.length > 0);

  inventoryList.innerHTML = inv.map(item => {
    const expired = !item.used && item.expiresAt <= now;
    const statusClass = item.used ? '' : expired ? 'status-expired' : 'status-active';
    const statusText = item.used ? 'Использовано' : expired ? 'Истёк' : 'Активен';
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
        ${!item.used && !expired ? `<button class="inv-redeem-btn" data-uid="${item.uid}">Отметить использованным</button>` : ''}
      </div>
    `;
  }).join('');
}

function redeem(uid) {
  const inv = getInventory();
  const item = inv.find(i => i.uid === uid);
  if (item) item.used = true;
  saveInventory(inv);
  renderInventory();
}

// ---------- Tabs ----------
document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const target = btn.dataset.tab;
    document.getElementById('panel-wheel').classList.toggle('is-hidden', target !== 'wheel');
    document.getElementById('panel-inventory').classList.toggle('is-hidden', target !== 'inventory');
  });
});

inventoryList.addEventListener('click', (e) => {
  const btn = e.target.closest('.inv-redeem-btn');
  if (btn) redeem(btn.dataset.uid);
});

spinBtn.addEventListener('click', spin);
winClose.addEventListener('click', closeWin);
winOverlay.addEventListener('click', (e) => { if (e.target === winOverlay) closeWin(); });

// ---------- Init ----------
buildTrack();
centerTrackAt(REST_INDEX, false);
renderInventory();
updateSpinAvailability();
