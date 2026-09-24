const fs = require('fs');

// ---------- Сохранение данных ----------
const DATA_FILE = 'data.json';

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      return JSON.parse(raw);
    }
  } catch(e) {
    console.log('Ошибка загрузки data.json:', e.message);
  }
  return {};
}

function saveData() {
  try {
    const data = {
      donationsByRoom: donationsByRoom,
      roomEarnings: roomEarnings,
      roomBaseDiamonds: roomBaseDiamonds,
      donationsDaily: donationsDaily,
      donationsWeekly: donationsWeekly,
      donationsMonthly: donationsMonthly,
      donationsAllTime: donationsAllTime,
      likesByRoom: likesByRoom,
      subscriptions: subscriptions,
      balances: balances,
      transactions: transactions,
	  conversations: conversations,
      chatCostByUser: chatCostByUser,
      yummyHistory: yummyHistory,
      greedyHistory: greedyHistory,
      platformEarnings: platformEarnings,
      hostDailyStats: hostDailyStats,
      hostWeeklyStats: hostWeeklyStats,
	  savedAt: new Date().toISOString()
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch(e) {
    console.log('Ошибка сохранения data.json:', e.message);
  }
}

const SAVED_DATA = loadData();

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static('public'));

// ---------- Подарки ----------
const GIFTS = [
  { id: 'rose',     name: 'Роза',        icon: '/gifts/rose.png',     price: 1,     tier: 'small' },
  { id: 'heart',    name: 'Сердце',      icon: '/gifts/heart.png',    price: 5,     tier: 'small' },
  { id: 'lollipop', name: 'Леденец',     icon: '/gifts/lollipop.png', price: 10,    tier: 'small' },
  { id: 'bell',     name: 'Колокольчик', icon: '/gifts/bell.png',     price: 5,     tier: 'small' },
  { id: 'crown',    name: 'Корона',      icon: '/gifts/crown.png',    price: 50,    tier: 'small' },
  { id: 'guitar',   name: 'Гитара',      icon: '/gifts/guitar.png',   price: 77,    tier: 'small' },
  { id: 'rocket',   name: 'Ракета',      icon: '/gifts/rocket.png',   price: 150,   tier: 'small' },
  { id: 'car',      name: 'Машина',      icon: '/gifts/car.png',      price: 999,   tier: 'big'   },
  { id: 'yacht',    name: 'Яхта',        icon: '/gifts/yacht.png',    price: 5000,  tier: 'big'   },
  { id: 'castle',   name: 'Замок',       icon: '/gifts/castle.png',   price: 10000, tier: 'big'   },
  { id: 'dragon',   name: 'Дракон',      icon: '/gifts/dragon.png',   price: 39999, tier: 'big'   },
  { id: 'fountain', name: 'Фонтан',      icon: '/gifts/fountain.png', price: 20, tier: 'big', random: true },
];

// ---------- Боты ----------
var FEMALE_BOT_NAMES = ['Наталья', 'Мария', 'Катя', 'Оля', 'Аня', 'Лена', 'Ксюша', 'Вика', 'Мила', 'Женя', 'Таня', 'Даша', 'Юля', 'Соня', 'Алина'];
var MALE_BOT_NAMES = ['Влад', 'Севак', 'Алекс', 'Иван', 'Дима', 'Сергей', 'Макс', 'Рома', 'Паша', 'Никита', 'Артём', 'Кирилл', 'Егор', 'Илья', 'Женя'];

var FEMALE_BOT_PHRASES = [
  'Привет всем!', 'Как дела?', 'Классно тут', 'Обожаю этот эфир',
  'Красота!', 'Топчик!', 'Вау!', 'Какая музыка!',
  'Кто смотрит?', 'Подписался!', 'Класс', 'Респект',
  'Ты супер!', 'Очень красиво', 'Молодец!', 'Обожаю тебя',
  'Так мило!', 'Кайф', 'Всем привет', 'Хорошего дня!',
  'Лотерея 🔥', 'Участвую!', 'Уже поделился!', 'Подарок отправлен!', 'Я в деле!'
];

var MALE_BOT_PHRASES = [
  'Привет всем!', 'Как дела?', 'Классно тут', 'Обожаю этот эфир',
  'Огонь!', 'Топчик!', 'Вау!', 'Мужик, ты крут!',
  'Кто смотрит?', 'Подписался!', 'Класс', 'Респект',
  'Жёстко!', 'Сильно!', 'Молодец!', 'Уважение',
  'Норм', 'Реально топ', 'Всем привет', 'Хорошего дня!',
  'Лотерея 🔥', 'Участвую!', 'Уже поделился!', 'Подарок отправлен!', 'Я в деле!'
];

const random = (a) => a[Math.floor(Math.random() * a.length)];
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

// ---------- Состояние ----------
const online = new Map();
const roomTarget = {};
const roomHosts = {};
const roomStreamStartedAt = {}; // roomId -> timestamp
const messagesByRoom = {};
const botCounterByRoom = {};
let botGlobalCounter = 0;
const userLikes = {};
const bellCountByRoom = {};
let subscriptions = SAVED_DATA.subscriptions || {};

const likesByRoom = SAVED_DATA.likesByRoom || {};
const donationsByRoom = SAVED_DATA.donationsByRoom || {};
const roomEarnings = SAVED_DATA.roomEarnings || {};
const roomBaseDiamonds = SAVED_DATA.roomBaseDiamonds || {};
const donationsDaily = SAVED_DATA.donationsDaily || {};
const donationsWeekly = SAVED_DATA.donationsWeekly || {};
const donationsMonthly = SAVED_DATA.donationsMonthly || {};
const donationsAllTime = SAVED_DATA.donationsAllTime || {};

// ---------- CRASH BALANCE (виртуальный) ----------
// Храним отдельно от подарочных алмазов — это «игровой кошелёк» комнаты
// user -> баланс
const crashBalances = SAVED_DATA.crashBalances || {};
// ---------- КОШЕЛЁК ----------
// user -> сколько алмазов на балансе
const balances = SAVED_DATA.balances || {};
// ---------- ИСТОРИЯ ТРАНЗАКЦИЙ ----------
// user -> массив { ts, type, amount, note, balanceAfter }
const transactions = SAVED_DATA.transactions || {};
// ---------- ЛИЧНЫЕ СООБЩЕНИЯ ----------
// conversations[userA][userB] = [{ from, text, ts }]
// Храним в обе стороны для удобства поиска.
const conversations = SAVED_DATA.conversations || {};
const chatCostByUser = SAVED_DATA.chatCostByUser || {}; // user -> сколько алмазов стоит сообщение ему
// ---------- КВЕСТЫ ВЕДУЩИХ ----------
const hostDailyStats = SAVED_DATA.hostDailyStats || {};   // host -> { date, coins, seconds, claimed }
const hostWeeklyStats = SAVED_DATA.hostWeeklyStats || {}; // host -> { weekStart, coins, seconds, activeDays, claimed }

function getConversationKey(a, b) {
  // Сортируем имена, чтобы "Аня_Боря" и "Боря_Аня" были одним ключом
  return [a, b].sort().join('::');
}

function pushPrivateMessage(from, to, text) {
  var key = getConversationKey(from, to);
  if (!conversations[key]) conversations[key] = [];
  conversations[key].push({
    from: from,
    to: to,
    text: text,
    ts: Date.now()
  });
  if (conversations[key].length > 500) conversations[key].shift();
}

function getPrivateMessages(userA, userB) {
  var key = getConversationKey(userA, userB);
  return conversations[key] || [];
}

function pushTransaction(userName, type, amount, note) {
  if (!transactions[userName]) transactions[userName] = [];
  transactions[userName].unshift({
    ts: Date.now(),
    type: type,
    amount: amount,
    note: note || '',
    balanceAfter: getBalance(userName)
  });
  if (transactions[userName].length > 100) transactions[userName].pop();
}

// Фиксированный стартовый баланс
const START_BALANCE = 1000;

// Курс: 1 алмаз = 1 рубль (виртуально)
const DIAMOND_TO_RUB = 1;

// Комиссия платформы (30%)
const PLATFORM_COMMISSION = 0.30;

// Доход платформы (для отладки)
let platformEarnings = SAVED_DATA.platformEarnings || 0;

// ---------- УРОВНИ ----------
// Пороги: 42 * (N-1)^2 до 60, потом *1.15
const LEVEL_THRESHOLDS = [];
(function() {
  var acc = 0;
  for (var i = 1; i <= 100; i++) {
    var threshold;
    if (i <= 60) {
      threshold = 42 * Math.pow(i - 1, 2);
    } else {
      threshold = 42 * Math.pow(59, 2) * Math.pow(1.15, i - 60);
    }
    acc = threshold;
    LEVEL_THRESHOLDS.push(Math.floor(acc));
  }
})();

function getUserLevel(donatedTotal) {
  var level = 1;
  for (var i = 0; i < LEVEL_THRESHOLDS.length; i++) {
    if (donatedTotal >= LEVEL_THRESHOLDS[i]) level = i + 2;
    else break;
  }
  return Math.min(level, 100);
}

// ---------- ХЕЛПЕРЫ ДЛЯ КВЕСТОВ ----------
function todayKey() {
  var d = new Date();
  var y = d.getFullYear();
  var m = String(d.getMonth() + 1).padStart(2, '0');
  var dd = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + dd;
}

function weekStartKey() {
  // Понедельник текущей недели
  var d = new Date();
  var day = d.getDay(); // 0 = вс, 1 = пн, ...
  var diff = (day === 0) ? 6 : day - 1; // сколько дней до понедельника
  d.setDate(d.getDate() - diff);
  var y = d.getFullYear();
  var m = String(d.getMonth() + 1).padStart(2, '0');
  var dd = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + dd;
}

function ensureDailyStats(host) {
  if (!hostDailyStats[host]) {
    hostDailyStats[host] = { date: todayKey(), coins: 0, seconds: 0, claimed: false };
  }
  if (hostDailyStats[host].date !== todayKey()) {
    hostDailyStats[host] = { date: todayKey(), coins: 0, seconds: 0, claimed: false };
  }
  return hostDailyStats[host];
}

function ensureWeeklyStats(host) {
  if (!hostWeeklyStats[host]) {
    hostWeeklyStats[host] = { weekStart: weekStartKey(), coins: 0, seconds: 0, activeDays: [], claimed: false };
  }
  if (hostWeeklyStats[host].weekStart !== weekStartKey()) {
    hostWeeklyStats[host] = { weekStart: weekStartKey(), coins: 0, seconds: 0, activeDays: [], claimed: false };
  }
  return hostWeeklyStats[host];
}

// Начислить ведущему монеты (при получении подарка или платного сообщения в чате)
function addQuestCoins(host, amount) {
  if (!host || amount <= 0) return;
  var d = ensureDailyStats(host);
  var w = ensureWeeklyStats(host);
  d.coins += amount;
  w.coins += amount;
}

// Начислить ведущему секунды в эфире
function addQuestSeconds(host, seconds) {
  if (!host || seconds <= 0) return;
  var d = ensureDailyStats(host);
  var w = ensureWeeklyStats(host);
  d.seconds += seconds;
  w.seconds += seconds;
  var tk = todayKey();
  if (w.activeDays.indexOf(tk) === -1) w.activeDays.push(tk);
}

// Отдать прогресс по квестам
function getQuestsProgress(host) {
  var d = ensureDailyStats(host);
  var w = ensureWeeklyStats(host);
  return {
    daily: {
      coins: d.coins,
      coinsGoal: 500,
      seconds: d.seconds,
      secondsGoal: 3 * 3600,
      claimed: !!d.claimed,
      done: d.coins >= 500 && d.seconds >= 3 * 3600
    },
    weekly: {
      coins: w.coins,
      coinsGoal: 3000,
      seconds: w.seconds,
      secondsGoal: 15 * 3600,
      activeDays: w.activeDays.length,
      activeDaysGoal: 5,
      claimed: !!w.claimed,
      done: w.coins >= 3000 && w.seconds >= 15 * 3600 && w.activeDays.length >= 5
    }
  };
}
function getLevelProgress(donatedTotal) {
  var level = getUserLevel(donatedTotal);
  var prevThreshold = level === 1 ? 0 : LEVEL_THRESHOLDS[level - 2];
  var nextThreshold = LEVEL_THRESHOLDS[level - 1] || LEVEL_THRESHOLDS[99];
  var current = donatedTotal - prevThreshold;
  var need = nextThreshold - prevThreshold;
  return {
    level: level,
    current: current,
    need: need,
    percent: need > 0 ? Math.min(100, Math.round(current / need * 100)) : 100,
    remaining: Math.max(0, nextThreshold - donatedTotal),
    nextLevelAt: nextThreshold
  };
}

// ---------- ХЕЛПЕРЫ КОШЕЛЬКА ----------
function getBalance(userName) {
  if (typeof balances[userName] !== 'number') {
    balances[userName] = START_BALANCE;
  }
  return balances[userName];
}

function addBalance(userName, amount) {
  getBalance(userName);
  balances[userName] += amount;
  if (balances[userName] < 0) balances[userName] = 0;
  return balances[userName];
}

function deductBalance(userName, amount) {
  getBalance(userName);
  if (balances[userName] < amount) return false;
  balances[userName] -= amount;
  return true;
}
// user -> массив последних N игр { mult, win: bool }
const crashHistory = SAVED_DATA.crashHistory || {};

// ---------- CRASH активные игры ----------
// roomId -> {
//   id, hostName, hostSocketId,
//   phase: 'waiting'|'running'|'crashed'|'cashout',
//   bet, crashPoint, multiplier, startedAt, crashAt,
//   bets: { userName: { name, bet, cashouted, cashMult, payout } },
//   timerId, tickId, history: [ { user, mult, win, payout } ]
// }
const crashesByRoom = {};

const LIKE_MILESTONES = [10, 50, 99, 200, 500, 999, 2000, 5000, 9999, 20000, 50000, 100000];

// ---------- GREEDY (колесо) ----------
// 8 секторов, каждый со своим множителем и эмодзи
const GREEDY_PRIZES = [
  { emoji: '🍔', mult: 0.3, color: '#ff6b9d' },   // маленький приз
  { emoji: '🍰', mult: 0.7, color: '#4dd8e8' },   // чуть меньше ставки
  { emoji: '🍩', mult: 1.2, color: '#ffd54f' },   // почти окупил
  { emoji: '🍒', mult: 0.0, color: '#9c27b0' },   // пусто
  { emoji: '🍕', mult: 1.5, color: '#43e97b' },   // ×1.5
  { emoji: '🌮', mult: 0.0, color: '#e91e63' },   // пусто
  { emoji: '🍦', mult: 3.0, color: '#ff9800' },   // ×3
  { emoji: '🍓', mult: 10.0, color: '#2196f3' }   // джекпот ×10
];
const GREEDY_ALLOWED_BETS = [10, 50, 100, 500, 1000];
const greedyHistory = SAVED_DATA.greedyHistory || {};

function greedySpin(userName, bet) {
  // Выбираем сектор случайно, но с весами
  // (пустые сектора чаще, джекпот реже)
  var weights = [30, 22, 15, 15, 8, 6, 3, 1];  // сумма 100
  var r = Math.random() * 100;
  var acc = 0;
  var sector = 0;
  for (var i = 0; i < weights.length; i++) {
    acc += weights[i];
    if (r < acc) { sector = i; break; }
  }
  var prize = GREEDY_PRIZES[sector];
  var payout = Math.floor(bet * prize.mult);

  if (!greedyHistory[userName]) greedyHistory[userName] = [];
  greedyHistory[userName].unshift({
    sector: sector,
    emoji: prize.emoji,
    mult: prize.mult,
    bet: bet,
    payout: payout,
    win: payout > 0,
    ts: Date.now()
  });
  if (greedyHistory[userName].length > 20) greedyHistory[userName].pop();

  return {
    sector: sector,
    emoji: prize.emoji,
    mult: prize.mult,
    bet: bet,
    payout: payout,
    win: payout > 0
  };
}
// ---------- YUMMY (слоты) ----------
const YUMMY_SYMBOLS = ['🍬', '🍭', '🍫', '🍩', '🧁', '🍒'];
const YUMMY_ALLOWED_BETS = [10, 50, 100, 500, 1000];
const yummyHistory = SAVED_DATA.yummyHistory || {};  // user -> [{ symbols, bet, payout, win, ts }]

function yummySpin(userName, bet) {
  // Генерируем 3 символа
  var s1 = random(YUMMY_SYMBOLS);
  var s2 = random(YUMMY_SYMBOLS);
  var s3 = random(YUMMY_SYMBOLS);
  var symbols = [s1, s2, s3];

  // Считаем выигрыш
  var multiplier = 0;
  if (s1 === s2 && s2 === s3) {
    multiplier = (s1 === '🍒') ? 20 : 5;
  } else if (s1 === s2 || s2 === s3 || s1 === s3) {
    multiplier = 2;
  }

  var payout = Math.floor(bet * multiplier);

  // Запись в историю
  if (!yummyHistory[userName]) yummyHistory[userName] = [];
  yummyHistory[userName].unshift({
    symbols: symbols,
    bet: bet,
    payout: payout,
    win: payout > 0,
    mult: multiplier,
    ts: Date.now()
  });
  if (yummyHistory[userName].length > 20) yummyHistory[userName].pop();

  return {
    symbols: symbols,
    bet: bet,
    payout: payout,
    mult: multiplier,
    win: payout > 0
  };
}
// ---------- ЛОТЕРЕЯ ----------
const lotteriesByRoom = {};

const ALLOWED_DURATIONS = [60, 120, 180, 240, 300, 360, 420, 480, 540, 600];
const ALLOWED_COSTS = [];
for (var p = 50; p <= 1500; p += 50) ALLOWED_COSTS.push(p);

function broadcastLottery(roomId) {
  var lot = lotteriesByRoom[roomId];
  if (!lot) {
    io.to(roomId).emit('lottery_state', null);
    return;
  }
  io.to(roomId).emit('lottery_state', {
    id: lot.id,
    hostName: lot.hostName,
    condition: lot.condition,
    giftId: lot.giftId || null,
    password: lot.condition === 'password' ? lot.password : null,
    durationSec: lot.durationSec,
    cost: lot.cost,
    prizePerWinner: lot.prizePerWinner,
    winnersCount: lot.winnersCount,
    unclaimed: lot.unclaimed || 0,
    startedAt: lot.startedAt,
    endsAt: lot.endsAt,
    participantsCount: Object.keys(lot.participants).length,
    participants: Object.keys(lot.participants)
  });
}

function emitLotterySystem(roomId, text) {
  pushEvent(roomId, { type: 'lottery', text: text });
}

function getConditionLabel(condition, giftId, password) {
  if (condition === 'share') return '📤 Поделиться';
  if (condition === 'gift') {
    var g = GIFTS.find(function(x) { return x.id === giftId; });
    return '🎁 Подарок: ' + (g ? g.name : giftId);
  }
  if (condition === 'password') return '🔑 Пароль: ' + password;
  return '🆓 Без ограничений';
}

function endLottery(roomId, reason) {
  var lot = lotteriesByRoom[roomId];
  if (!lot) return;

  if (lot.timerId) clearTimeout(lot.timerId);
  if (lot.growthTimerId) clearInterval(lot.growthTimerId);

  if (lot.prevTarget !== undefined) {
    roomTarget[roomId] = lot.prevTarget;
  }

  if (lot.activeBots && lot.activeBots.size > 0) {
    var idsToRemove = [];
    lot.activeBots.forEach(function(botId) { idsToRemove.push(botId); });
    lot.activeBots.clear();

    var idx = 0;
    var chunk = 200;
    var fadeTimer = setInterval(function() {
      var removed = 0;
      while (idx < idsToRemove.length && removed < chunk) {
        online.delete(idsToRemove[idx]);
        idx++;
        removed++;
      }
      broadcastOnline(roomId);
      if (idx >= idsToRemove.length) {
        clearInterval(fadeTimer);
        broadcastOnline(roomId);
      }
    }, 60);
  }

  broadcastOnline(roomId);
  setTimeout(function() { broadcastOnline(roomId); }, 100);
  setTimeout(function() { broadcastOnline(roomId); }, 500);
  setTimeout(function() { broadcastOnline(roomId); }, 1500);
  setTimeout(function() { broadcastOnline(roomId); }, 3000);

  var participants = Object.keys(lot.participants);
  var winners = [];
  var pool = participants.slice();
  var needWinners = Math.min(lot.winnersCount, pool.length);
  for (var i = 0; i < needWinners; i++) {
    var idx2 = Math.floor(Math.random() * pool.length);
    winners.push(pool[idx2]);
    pool.splice(idx2, 1);
  }

  io.to(roomId).emit('lottery_ended', {
    id: lot.id,
    reason: reason || 'time',
    participantsCount: participants.length,
    winners: winners,
    prizePerWinner: lot.prizePerWinner,
    cost: lot.cost,
    winnersCount: lot.winnersCount,
    unclaimed: lot.unclaimed || 0
  });
    for (var wi = 0; wi < winners.length; wi++) {
    var winnerName = winners[wi];
    addBalance(winnerName, lot.prizePerWinner);
    pushTransaction(winnerName, 'lottery_win', lot.prizePerWinner, 'Fan Lottery: победа');
    pushBalanceToUser(winnerName);
  }

  var totalPaid = winners.length * lot.prizePerWinner;
  var leftover = lot.cost - totalPaid;
  if (leftover > 0 && lot.hostName) {
    addBalance(lot.hostName, leftover);
    pushTransaction(lot.hostName, 'lottery_refund', leftover, 'Fan Lottery: возврат остатка');
    pushBalanceToUser(lot.hostName);
  }


  if (winners.length > 0) {
    emitLotterySystem(roomId,
      '🏆 Fan Lottery завершена! Победители (' + winners.length + '): ' +
      winners.join(', ') + ' — по 💎 ' + lot.prizePerWinner + ' каждому'
    );
  } else {
    emitLotterySystem(roomId, '🏁 Fan Lottery завершена. Участников не было.');
  }

  delete lotteriesByRoom[roomId];
  broadcastLottery(roomId);
  broadcastOnline(roomId);
  saveData();
}

function joinLottery(roomId, userName, note) {
  var lot = lotteriesByRoom[roomId];
  if (!lot) return false;
  if (lot.participants[userName]) return false;
  lot.participants[userName] = {
    name: userName,
    joinedAt: Date.now(),
    note: note || ''
  };
  pushEvent(roomId, {
    type: 'lottery',
    text: '🎟 ' + userName + ' участвует в Fan Lottery! (' + note + ')'
  });
  broadcastLottery(roomId);
  return true;
}

// ---------- Помощники ----------
function roomCount(roomId) {
  let n = 0;
  online.forEach(function(u) {
    if (u.roomId === roomId) n++;
  });
  return n;
}

function pushEvent(roomId, ev) {
  if (!messagesByRoom[roomId]) messagesByRoom[roomId] = [];
  ev.ts = Date.now();
  messagesByRoom[roomId].push(ev);
  if (messagesByRoom[roomId].length > 200) messagesByRoom[roomId].shift();
  io.to(roomId).emit('event', ev);
}

function emitSystem(roomId, text) {
  pushEvent(roomId, { type: 'system', text: text });
}

function emitMessage(roomId, user, text) {
  pushEvent(roomId, {
    type: 'message',
    name: user.name,
    text: text,
    isBot: user.isBot,
    level: user.level || randInt(20, 80),
    isNew: user.isNew
  });
  if (user.isNew) user.isNew = false;

  var lot = lotteriesByRoom[roomId];
  if (lot && lot.condition === 'password' && lot.password) {
    var t = (text || '').trim().toLowerCase();
    if (t === String(lot.password).trim().toLowerCase()) {
      joinLottery(roomId, user.name, '🔑 пароль');
    }
  }
}

function emitGift(roomId, fromUser, gift) {
  var userName = fromUser.name;
    var price = gift.price;  // базовая цена подарка

  // Проверка баланса
  if (!deductBalance(userName, price)) {
    // Не хватает алмазов — сообщаем дарителю
    var fromSocket = null;
    online.forEach(function(u, sid) {
      if (u.name === userName) fromSocket = sid;
    });
    if (fromSocket) {
      io.to(fromSocket).emit('balance_error', {
        needed: price,
        current: getBalance(userName) + price,
        missing: price - getBalance(userName)
      });
    }
    return; // подарок не уходит
  }
  // Записываем транзакцию — подарок отправлен
  pushTransaction(userName, 'gift_sent', -price, 'Подарок: ' + gift.name);

  var trains = 0;
  var refund = 0;

  if (gift.random) {
    var luckyRoll = Math.random();
    if (luckyRoll < 0.95) trains = 0;
    else if (luckyRoll < 0.99) trains = 1;
    else if (luckyRoll < 0.998) trains = 2;
    else if (luckyRoll < 0.9995) trains = 3;
    else if (luckyRoll < 0.9999) trains = 5;
    else trains = 10;
    price = price + trains * 1000;

    var refundRoll = Math.random();
    if (refundRoll < 0.7) refund = 0;
    else if (refundRoll < 0.95) refund = 40;
    else refund = 100;
  }

  if (gift.id === 'bell') {
    if (!bellCountByRoom[roomId]) bellCountByRoom[roomId] = {};
    if (!bellCountByRoom[roomId][userName]) bellCountByRoom[roomId][userName] = 0;
    bellCountByRoom[roomId][userName]++;
    var bellCount = bellCountByRoom[roomId][userName];
    if (bellCount === 1) refund = 1;
    else {
      var bellRoll = Math.random();
      if (bellRoll < 0.70) refund = 5;
      else if (bellRoll < 0.82) refund = 10;
      else if (bellRoll < 0.90) refund = 15;
      else if (bellRoll < 0.95) refund = 20;
      else if (bellRoll < 0.98) refund = 25;
      else refund = 0;
    }
  }

  pushEvent(roomId, {
    type: 'gift',
    from: userName,
    gift: gift.icon,
    giftId: gift.id,
    name: gift.name,
    price: price,
    tier: gift.tier,
    isRandom: !!gift.random,
    trains: trains,
    refund: refund,
    isBot: fromUser.isBot,
    level: fromUser.level
  });

  if (!donationsByRoom[roomId]) donationsByRoom[roomId] = {};
  if (!donationsByRoom[roomId][userName]) donationsByRoom[roomId][userName] = 0;
  donationsByRoom[roomId][userName] += price;

  donationsDaily[userName] = (donationsDaily[userName] || 0) + price;
  donationsWeekly[userName] = (donationsWeekly[userName] || 0) + price;
  donationsMonthly[userName] = (donationsMonthly[userName] || 0) + price;
  donationsAllTime[userName] = (donationsAllTime[userName] || 0) + price;

  if (!roomEarnings[roomId]) roomEarnings[roomId] = 0;
  roomEarnings[roomId] += price;

  var base = roomBaseDiamonds[roomId] || 0;
  io.to(roomId).emit('host_earnings', base + roomEarnings[roomId]);
    // Начисление ведущему (70%) и комиссия платформы (30%)
  var hostName = roomHosts[roomId] || null;
  // Начисляем комиссии
  var hostShare = Math.floor(price * (1 - PLATFORM_COMMISSION));
  var platformShare = price - hostShare;

  if (hostName) {
    addBalance(hostName, hostShare);
    pushTransaction(hostName, 'gift_received', hostShare, 'Подарок от ' + userName + ': ' + gift.name);
    addQuestCoins(hostName, hostShare);
  }
  platformEarnings += platformShare;

  // Обновить баланс дарителя в UI
  var fromSocketId = null;
  online.forEach(function(u, sid) {
    if (u.name === userName) fromSocketId = sid;
  });
  if (fromSocketId) {
    io.to(fromSocketId).emit('balance_update', { balance: getBalance(userName) });
  }

  // Обновить уровень дарителя
  var levelData = getLevelProgress(donationsAllTime[userName] || 0);
  if (fromSocketId) {
    io.to(fromSocketId).emit('user_level', levelData);
  }

  if (refund > 0) {
    pushEvent(roomId, { type: 'refund', to: userName, amount: refund });
  }

  var lot = lotteriesByRoom[roomId];
  if (lot && lot.condition === 'gift' && lot.giftId === gift.id) {
    joinLottery(roomId, userName, '🎁 ' + gift.name);
  }

  broadcastDonations(roomId);
  saveData();
}

function broadcastDonations(roomId) {
  var roomDonations = donationsByRoom[roomId] || {};
  var list = [];
  for (var name in roomDonations) {
    var userLevel = null;
    online.forEach(function(u) {
      if (u.name === name) userLevel = u.level;
    });
    list.push({
      name: name,
      level: userLevel || 30,
      diamonds: roomDonations[name] || 0,
      daily: donationsDaily[name] || 0,
      weekly: donationsWeekly[name] || 0,
      monthly: donationsMonthly[name] || 0,
      allTime: donationsAllTime[name] || 0
    });
  }
  list.sort(function(a, b) { return b.diamonds - a.diamonds; });
  io.to(roomId).emit('donations_list', list);
  io.to(roomId).emit('top_donators', list.slice(0, 3));
}

function broadcastOnline(roomId) {
  var cnt = roomCount(roomId);
  io.to(roomId).emit('online_count', cnt);

  var viewersList = [];
  online.forEach(function(u, id) {
    if (u.roomId === roomId) {
      viewersList.push({
        id: id,
        name: u.name,
        isBot: u.isBot,
        level: u.level || randInt(20, 80),
        isVip: u.level > 70,
        diamonds: (donationsByRoom[roomId] && donationsByRoom[roomId][u.name]) || 0,
        hasDonated: !!(donationsByRoom[roomId] && donationsByRoom[roomId][u.name]),
        daily: donationsDaily[u.name] || 0,
        weekly: donationsWeekly[u.name] || 0,
        monthly: donationsMonthly[u.name] || 0,
        allTime: donationsAllTime[u.name] || 0,
        totalDiamonds: donationsAllTime[u.name] || 0,
        gender: u.gender || 'male'
      });
    }
  });
  io.to(roomId).emit('viewers_list', viewersList);
}

// ---------- Боты ----------
function spawnBotBatch(roomId, gender, count, isLotteryBot) {
  if (count <= 0) return;
  var lot = lotteriesByRoom[roomId];

  for (var i = 0; i < count; i++) {
    botGlobalCounter++;
    var botNames = (gender === 'female') ? FEMALE_BOT_NAMES : MALE_BOT_NAMES;
    var name = random(botNames) + '_' + botGlobalCounter;
    var id = 'bot_' + botGlobalCounter + '_' + roomId;

    var randomDiamonds = randInt(0, 500000);
    donationsAllTime[name] = randomDiamonds;

    online.set(id, {
      name: name,
      roomId: roomId,
      isBot: true,
      isLotteryBot: !!isLotteryBot,
      level: randInt(15, 80),
      isNew: Math.random() < 0.2,
      gender: gender
    });

    if (isLotteryBot && lot) {
      lot.activeBots.add(id);
      lot.addedBotsCount = (lot.addedBotsCount || 0) + 1;
    }
  }

  if (isLotteryBot) {
    emitSystem(roomId, '🎉 +' + count + ' зрителей влетели в эфир!');
  } else {
    emitSystem(roomId, '+' + count + ' зрителей присоединились');
  }

  broadcastOnline(roomId);
  if (isLotteryBot && lot) broadcastLottery(roomId);
}

function spawnBot(roomId, gender, isLotteryBot) {
  botGlobalCounter++;
  const botNames = (gender === 'female') ? FEMALE_BOT_NAMES : MALE_BOT_NAMES;
  const name = random(botNames) + '_' + botGlobalCounter;
  const id = 'bot_' + botGlobalCounter + '_' + roomId;

  const randomDiamonds = randInt(0, 500000);
  donationsAllTime[name] = randomDiamonds;

  online.set(id, {
    name: name,
    roomId: roomId,
    isBot: true,
    isLotteryBot: !!isLotteryBot,
    level: randInt(15, 80),
    isNew: Math.random() < 0.2,
    gender: gender
  });

  emitSystem(roomId, name + ' присоединился');
  broadcastOnline(roomId);

  var lifeTime = randInt(30000, 300000);
  setTimeout(function() {
    if (!online.has(id)) return;
    online.delete(id);
    broadcastOnline(roomId);

    var target = roomTarget[roomId] || 50;
    if (roomCount(roomId) < target) {
      spawnBot(roomId, gender, false);
    }
  }, lifeTime);
}

// ---------- УЧЁТ СЕКУНД В ЭФИРЕ ----------
setInterval(function() {
  // Проходим по всем онлайн и смотрим, кто является ведущим своей комнаты
  var seenHosts = {};
  var changed = false;
  online.forEach(function(u) {
    if (u.isBot) return;
    var roomId = u.roomId;
    if (roomHosts[roomId] !== u.name) return;   // не ведущий
    if (seenHosts[u.name]) return;              // уже учли
    seenHosts[u.name] = true;
    addQuestSeconds(u.name, 60);
    changed = true;
  });
  if (changed) saveData();
}, 60 * 1000);   // раз в минуту
// ---------- Жизнь в комнатах ----------
function startLife() {
  setInterval(function() {
    const roomIds = Object.keys(messagesByRoom);
    if (roomIds.length === 0) return;

    const roomId = random(roomIds);
    if (lotteriesByRoom[roomId]) return;
    const target = roomTarget[roomId] || 50;
    if (roomCount(roomId) < target + 3) {
      let gender = 'female';
      online.forEach(function(u) {
        if (u.roomId === roomId && u.isBot && u.gender) gender = u.gender;
      });
      spawnBot(roomId, gender, false);
    }
  }, 2000);

  setInterval(function() {
    const roomIds = Object.keys(messagesByRoom);
    if (roomIds.length === 0) return;

    const roomId = random(roomIds);
    const bots = [];
    online.forEach(function(u, id) {
      if (u.isBot && u.roomId === roomId) bots.push(u);
    });
    if (bots.length === 0) return;

    const lot = lotteriesByRoom[roomId];
    if (lot) {
      var actions = 3;
      for (var a = 0; a < actions; a++) {
        var bot = random(bots);
        if (lot.participants[bot.name]) continue;
        if (Math.random() > 0.85) continue;

        if (lot.condition === 'password' && lot.password) {
          emitMessage(roomId, bot, lot.password);
        } else if (lot.condition === 'share') {
          pushEvent(roomId, {
            type: 'message',
            name: bot.name,
            text: '📤 ' + bot.name + ' поделился трансляцией!',
            isBot: true,
            level: bot.level || randInt(20, 80),
            isNew: false
          });
          joinLottery(roomId, bot.name, '📤 поделился');
        } else if (lot.condition === 'gift' && lot.giftId) {
          var giftObj = GIFTS.find(function(g) { return g.id === lot.giftId; });
          if (giftObj) {
            emitGift(roomId, bot, giftObj);
          }
        } else if (lot.condition === 'none') {
          joinLottery(roomId, bot.name, '🆓 без условий');
        }
      }
      return;
    }

    const bot2 = random(bots);
    const phrases = (bot2.gender === 'female') ? FEMALE_BOT_PHRASES : MALE_BOT_PHRASES;
    emitMessage(roomId, bot2, random(phrases));
  }, 800);
}

// ---------- CRASH helpers ----------
function crashBalance(userName) {
  return getBalance(userName);       // тот же баланс, что и в подарках
}

function crashAddBalance(userName, delta) {
  addBalance(userName, delta);       // начисление/списание в основной кошелёк
}
function pushBalanceToUser(userName) {
  online.forEach(function(u, sid) {
    if (u.name === userName) {
      io.to(sid).emit('balance_update', { balance: getBalance(userName) });
    }
  });
}

function crashPushHistory(userName, entry) {
  if (!crashHistory[userName]) crashHistory[userName] = [];
  crashHistory[userName].unshift(entry);
  if (crashHistory[userName].length > 20) crashHistory[userName].pop();
}

// Краш-поинт: 90% игр — 1.0..2.5, 9% — 2.5..10, 1% — 10..100
function generateCrashPoint() {
  var r = Math.random();
  var cp;
  if (r < 0.60) {
    cp = 1.20 + Math.random() * 1.80;
  } else if (r < 0.90) {
    cp = 3.00 + Math.random() * 7.00;
  } else if (r < 0.99) {
    cp = 10.00 + Math.random() * 30.00;
  } else {
    cp = 40.00 + Math.random() * 60.00;
  }
  return Math.round(cp * 100) / 100;
}

function broadcastCrash(roomId) {
  var c = crashesByRoom[roomId];
  if (!c) {
    io.to(roomId).emit('crash_state', null);
    return;
  }
  var betsList = [];
  for (var name in c.bets) {
    betsList.push({
      name: name,
      bet: c.bets[name].bet,
      cashouted: !!c.bets[name].cashouted,
      cashMult: c.bets[name].cashMult || null,
      payout: c.bets[name].payout || 0
    });
  }
  // сортируем по ставке убыв.
  betsList.sort(function(a, b) { return b.bet - a.bet; });

  var baseState = {
    id: c.id,
    hostName: c.hostName,
    phase: c.phase,
    bet: c.bet,
    multiplier: c.multiplier,
    crashPoint: (c.phase === 'crashed' || c.phase === 'cashout') ? c.crashPoint : null,
    startedAt: c.startedAt,
    crashAt: c.crashAt,
    betsCount: betsList.length,
    bets: betsList.slice(0, 100),
    history: (c.history || []).slice(0, 10)
  };

  // Каждому игроку в комнате — свой state с его myBet
  online.forEach(function(u, socketId) {
    if (u.roomId !== roomId) return;
    var myBet = null;
    for (var bn in c.bets) {
      if (c.bets[bn].socketId === socketId) {
        myBet = {
          bet: c.bets[bn].bet,
          cashouted: !!c.bets[bn].cashouted,
          cashMult: c.bets[bn].cashMult || null,
          payout: c.bets[bn].payout || 0
        };
        break;
      }
    }
    var state = {
      id: baseState.id,
      hostName: baseState.hostName,
      phase: baseState.phase,
      bet: baseState.bet,
      multiplier: baseState.multiplier,
      crashPoint: baseState.crashPoint,
      startedAt: baseState.startedAt,
      crashAt: baseState.crashAt,
      betsCount: baseState.betsCount,
      bets: baseState.bets,
      history: baseState.history,
      myBet: myBet
    };
    io.to(socketId).emit('crash_state', state);
  });
}
// Только множитель — дёшево, шлём часто
function broadcastCrashTick(roomId) {
  var c = crashesByRoom[roomId];
  if (!c) return;
  io.to(roomId).emit('crash_tick', {
    id: c.id,
    multiplier: c.multiplier,
    phase: c.phase
  });
}

function startCrashRound(roomId, hostUser, bet, hostSocketId) {
  if (crashesByRoom[roomId]) return false;
  var id = 'crash_' + Date.now();

  var c = {
    id: id,
    hostName: hostUser.name,
    hostSocketId: hostSocketId,
    phase: 'waiting',
    bet: bet,
    crashPoint: generateCrashPoint(),
    multiplier: 1.00,
    startedAt: Date.now(),
    crashAt: null,
    bets: {},
    history: [],
    timerId: null,
    tickId: null
  };

  // Хост сразу входит со своей ставкой (привязка к socket.id)
  if (crashBalance(hostUser.name) >= bet) {
    crashAddBalance(hostUser.name, -bet);
    pushTransaction(hostUser.name, 'crash_bet', -bet, 'Crash: ставка');
    pushBalanceToUser(hostUser.name);
    c.bets[hostUser.name] = {
      name: hostUser.name,
      socketId: hostSocketId,
      bet: bet,
      cashouted: false,
      cashMult: null,
      payout: 0
    };
  }

  crashesByRoom[roomId] = c;
  broadcastCrash(roomId);

  // Фаза ожидания — 3 секунды, чтобы боты и игроки успели поставить
  var waitMs = 3000;

  // Боты быстро входят со ставками
  var bots = [];
  online.forEach(function(u, id) {
    if (u.isBot && u.roomId === roomId) bots.push(u);
  });
  var botBetsCount = randInt(3, Math.min(12, bots.length));

  for (var i = 0; i < botBetsCount; i++) {
    var b = bots[Math.floor(Math.random() * bots.length)];
    if (!b || c.bets[b.name]) continue;
    var bbet = [1, 10, 100, 1000][Math.floor(Math.random() * 4)];
    if (crashBalance(b.name) < bbet) {
      balances[b.name] = 1000 + randInt(0, 5000);
    }
    crashAddBalance(b.name, -bbet);
    c.bets[b.name] = { name: b.name, bet: bbet, cashouted: false, cashMult: null, payout: 0 };
  }
  broadcastCrash(roomId);

  c.timerId = setTimeout(function() {
    var cc = crashesByRoom[roomId];
    if (!cc) return;
    cc.phase = 'running';
    cc.startedAt = Date.now();

    broadcastCrash(roomId);

    // Тик каждые 100 мс — рост множителя
    cc.tickId = setInterval(function() {
      var cx = crashesByRoom[roomId];
      if (!cx || cx.phase !== 'running') return;

      // Экспоненциальный рост: 1.00 -> 2.00 за ~5 сек, дальше быстрее
      var elapsed = (Date.now() - cx.startedAt) / 1000;
      cx.multiplier = Math.round((1.00 + Math.pow(1.062, elapsed * 3) - 1) * 100) / 100;

      // Боты выходят по своим целям
      for (var n in cx.bets) {
        var b2 = cx.bets[n];
        if (b2.cashouted) continue;
        if (!b2.botTargetMult) {
          // цель бота — от 1.1 до crashPoint*0.9 (иногда жадные до краха)
          b2.botTargetMult = Math.round((1.10 + Math.random() * Math.max(0.1, cx.crashPoint * 0.95 - 1.10)) * 100) / 100;
        }
        if (cx.multiplier >= b2.botTargetMult && cx.multiplier < cx.crashPoint) {
          b2.cashouted = true;
          b2.cashMult = cx.multiplier;
          b2.payout = Math.round(b2.bet * b2.cashMult);
          crashAddBalance(n, b2.payout);
          crashPushHistory(n, { mult: b2.cashMult, win: true, payout: b2.payout, bet: b2.bet });
        }
      }

      // Каждые 200 мс — только множитель (дёшево)
      if (!cx._lastTick || Date.now() - cx._lastTick > 200) {
        cx._lastTick = Date.now();
        broadcastCrashTick(roomId);
      }

      // Полное состояние — раз в 500 мс
      if (!cx._lastFullBroadcast || Date.now() - cx._lastFullBroadcast > 500) {
        cx._lastFullBroadcast = Date.now();
        broadcastCrash(roomId);
      }

      if (cx.multiplier >= cx.crashPoint) {
        clearInterval(cx.tickId);
        cx.tickId = null;
        cx.phase = 'crashed';
        cx.crashAt = Date.now();
        cx.multiplier = cx.crashPoint;

        // Оставшиеся — проиграли
        for (var n2 in cx.bets) {
          var bb = cx.bets[n2];
          if (!bb.cashouted) {
            crashPushHistory(n2, { mult: cx.crashPoint, win: false, payout: 0, bet: bb.bet });
          }
        }

        broadcastCrash(roomId);

        // Через 5 сек — удалить игру, вернуть лобби
        setTimeout(function() {
          var fin = crashesByRoom[roomId];
          if (fin && fin.id === cx.id) {
            delete crashesByRoom[roomId];
            broadcastCrash(roomId);
            saveData();
          }
        }, 5000);
      }
    }, 100);
  }, waitMs);

  return true;
}

function crashCashout(roomId, userName, socketId) {
  var c = crashesByRoom[roomId];
  if (!c) return;
  if (c.phase !== 'running') return;

  // Ищем запись по socketId — надёжнее, чем по имени
  var betKey = null;
  if (socketId) {
    for (var bn in c.bets) {
      if (c.bets[bn].socketId === socketId) { betKey = bn; break; }
    }
  }
  if (!betKey) betKey = userName;
  var b = c.bets[betKey];
  if (!b || b.cashouted) return;

  b.cashouted = true;
  b.cashMult = c.multiplier;
  b.payout = Math.round(b.bet * c.multiplier);
  crashAddBalance(userName, b.payout);
  pushTransaction(userName, 'crash_win', b.payout, 'Crash: выигрыш ×' + b.cashMult.toFixed(2));
  pushBalanceToUser(userName);
  crashPushHistory(userName, { mult: b.cashMult, win: true, payout: b.payout, bet: b.bet });
  broadcastCrash(roomId);
  saveData();
}

// ---------- Socket.IO ----------
io.on('connection', function(socket) {
  socket.emit('gifts_list', GIFTS);
  socket.emit('all_subscriptions', subscriptions);

  socket.on('join', function(data) {
    const roomId = data.roomId;
    const name = data.name;

    if (!messagesByRoom[roomId]) {
      messagesByRoom[roomId] = [];
	  roomStreamStartedAt[roomId] = Date.now();
      const gender = data.gender || 'female';
      const baseViewers = data.baseViewers || 50;

      roomTarget[roomId] = baseViewers;
      roomHosts[roomId] = data.host || name;  // хост = ведущий из URL
      roomBaseDiamonds[roomId] = data.diamonds || 0;
      bellCountByRoom[roomId] = {};
      for (let i = 0; i < baseViewers; i++) spawnBot(roomId, gender, false);
      saveData();
    }

	  socket.on('stream_reset', function() {
    var user = online.get(socket.id);
    if (!user) return;
    var roomId = user.roomId;
    // Только ведущий может сбросить
    if (roomHosts[roomId] !== user.name) return;
    roomStreamStartedAt[roomId] = Date.now();
    io.to(roomId).emit('stream_started_at', { startedAt: roomStreamStartedAt[roomId] });
    emitSystem(roomId, '⏱ Эфир перезапущен');
  });

    socket.join(roomId);

    const user = {
      name: name,
      roomId: roomId,
      isBot: false,
      level: randInt(30, 70)
    };
    online.set(socket.id, user);

    socket.emit('history', messagesByRoom[roomId].slice(-50));
    socket.emit('me', { name: name, level: user.level });

    var roomDonations = donationsByRoom[roomId] || {};
    var donationsList = [];
    for (var dn in roomDonations) {
      var userLevel = null;
      online.forEach(function(u) {
        if (u.name === dn) userLevel = u.level;
      });
      donationsList.push({
        name: dn,
        level: userLevel || 30,
        diamonds: roomDonations[dn] || 0,
        daily: donationsDaily[dn] || 0,
        weekly: donationsWeekly[dn] || 0,
        monthly: donationsMonthly[dn] || 0,
        allTime: donationsAllTime[dn] || 0
      });
    }
    donationsList.sort(function(a, b) { return b.diamonds - a.diamonds; });
    socket.emit('donations_list', donationsList);
    socket.emit('top_donators', donationsList.slice(0, 3));

    var currentEarnings = roomEarnings[roomId] || 0;
    var base = roomBaseDiamonds[roomId] || 0;
    socket.emit('host_earnings', base + currentEarnings);
    emitSystem(roomId, name + ' присоединился');
    broadcastOnline(roomId);

    if (!likesByRoom[roomId]) likesByRoom[roomId] = 0;
    socket.emit('likes_count', likesByRoom[roomId]);
	socket.emit('stream_started_at', { startedAt: roomStreamStartedAt[roomId] || Date.now() });

    socket.emit('lottery_config', {

      durations: ALLOWED_DURATIONS,
      costs: ALLOWED_COSTS
    });
	    // Кошелёк: отправить баланс и уровень
    socket.emit('balance_update', { balance: getBalance(name) });
	socket.emit('pm_chat_cost', { cost: chatCostByUser[name] || 0 });
    socket.emit('user_level', getLevelProgress(donationsAllTime[name] || 0));
	socket.emit('transactions', transactions[name] || []);
    socket.emit('quests_progress', getQuestsProgress(name));
    // crash: прислать текущий баланс и историю
    socket.emit('crash_balance', { balance: crashBalance(name), history: crashHistory[name] || [] });

    broadcastLottery(roomId);
    broadcastCrash(roomId);
  });

  socket.on('message', function(text) {
    const user = online.get(socket.id);
    if (!user || !text.trim()) return;
    var roomId = user.roomId;
    emitMessage(roomId, user, text.trim());
  });

  socket.on('send_gift', function(data) {
    const user = online.get(socket.id);
    const gift = GIFTS.find(function(g) { return g.id === data.giftId; });
    if (!user || !gift) return;
    emitGift(user.roomId, user, gift);
    broadcastOnline(user.roomId);
  });

  socket.on('like', function() {
    const user = online.get(socket.id);
    if (!user) return;
    var roomId = user.roomId;
    if (!likesByRoom[roomId]) likesByRoom[roomId] = 0;
    likesByRoom[roomId]++;
    if (!userLikes[socket.id]) userLikes[socket.id] = 0;
    userLikes[socket.id]++;
    var userCount = userLikes[socket.id];
    if (LIKE_MILESTONES.indexOf(userCount) !== -1) {
      emitSystem(roomId, '❖ ' + user.name + ' поставил ' + userCount + ' лайков!');
    }
    io.to(roomId).emit('like', { total: likesByRoom[roomId], from: socket.id });
  });

  socket.on('subscribe', function(data) {
    var from = data.from, to = data.to, action = data.action;
    if (!from || !to || from === to) return;
    if (!subscriptions[from]) subscriptions[from] = [];
    var idx = subscriptions[from].indexOf(to);
    if (action === 'subscribe' && idx === -1) subscriptions[from].push(to);
    else if (action === 'unsubscribe' && idx !== -1) subscriptions[from].splice(idx, 1);
    socket.emit('my_subscriptions', subscriptions[from]);
    saveData();
  });

  // ---------- ЛОТЕРЕЯ ----------
  socket.on('lottery_start', function(data) {
    const user = online.get(socket.id);
    if (!user) return;
    const roomId = user.roomId;

    if (lotteriesByRoom[roomId]) {
      socket.emit('lottery_error', { message: 'В комнате уже идёт лотерея' });
      return;
    }

    var condition = data.condition || 'none';
    var giftId = data.giftId || null;
    var password = data.password || '';
    var durationSec = parseInt(data.durationSec) || 60;
    var cost = parseInt(data.cost) || 50;
    var winnersCount = parseInt(data.winnersCount) || 1;

    if (ALLOWED_DURATIONS.indexOf(durationSec) === -1) {
      socket.emit('lottery_error', { message: 'Недопустимая длительность' });
      return;
    }
    if (ALLOWED_COSTS.indexOf(cost) === -1) {
      socket.emit('lottery_error', { message: 'Недопустимый фонд' });
      return;
    }
    if (winnersCount < 1 || winnersCount > 1000) {
      socket.emit('lottery_error', { message: 'Победителей: от 1 до 1000' });
      return;
    }
    if (condition === 'gift' && !giftId) {
      socket.emit('lottery_error', { message: 'Выберите подарок для условия' });
      return;
    }
    if (condition === 'password') {
      password = String(password).trim();
      if (password.length < 2) {
        socket.emit('lottery_error', { message: 'Пароль слишком короткий' });
        return;
      }
      if (password.length > 30) password = password.substring(0, 30);
    }

    var prizePerWinner = Math.floor(cost / winnersCount);
    var unclaimed = cost - prizePerWinner * winnersCount;

    if (prizePerWinner < 1) {
      socket.emit('lottery_error', { message: 'Слишком много победителей для фонда ' + cost + '. Максимум: ' + cost });
      return;
    }
	    if (getBalance(user.name) < cost) {
      socket.emit('lottery_error', {
        message: 'Не хватает алмазов: нужно 💎 ' + cost + ', у тебя 💎 ' + getBalance(user.name)
      });
      return;
    }
    deductBalance(user.name, cost);
    pushTransaction(user.name, 'lottery_start', -cost, 'Fan Lottery: фонд на ' + winnersCount + ' победителей');
    socket.emit('balance_update', { balance: getBalance(user.name) });

    var peakTarget    = 3000;
    var initialBoost  = 200;
    var growthPerTick = 200;
    var boost = initialBoost;

    console.log('LOTTERY_START boost=' + boost + ' peak=' + peakTarget + ' grow=' + growthPerTick + ' before=' + roomCount(roomId));

    var lot = {
      id: 'lot_' + Date.now(),
      hostName: user.name,
      hostSocketId: socket.id,
      condition: condition,
      giftId: giftId,
      password: password,
      durationSec: durationSec,
      cost: cost,
      prizePerWinner: prizePerWinner,
      winnersCount: winnersCount,
      unclaimed: unclaimed,
      startedAt: Date.now(),
      endsAt: Date.now() + durationSec * 1000,
      participants: {},
      activeBots: new Set(),
      prevTarget: roomTarget[roomId] || 50,
      prevRoomCount: roomCount(roomId),
      addedBotsCount: 0,
      peakTarget: peakTarget,
      growthPerTick: growthPerTick,
      timerId: null
    };

    lotteriesByRoom[roomId] = lot;

    roomTarget[roomId] = (lot.prevTarget || 50) + boost;

    var gender = 'female';
    online.forEach(function(u) {
      if (u.roomId === roomId && u.isBot && u.gender) gender = u.gender;
    });
    spawnBotBatch(roomId, gender, boost, true);
    console.log('LOTTERY_AFTER count=' + roomCount(roomId));

    (function pushOnline() {
      var count = roomCount(roomId);
      io.to(roomId).emit('online_count', count);
    })();
    setTimeout(function() { io.to(roomId).emit('online_count', roomCount(roomId)); }, 200);
    setTimeout(function() { io.to(roomId).emit('online_count', roomCount(roomId)); }, 800);
    setTimeout(function() { io.to(roomId).emit('online_count', roomCount(roomId)); }, 2000);

    emitLotterySystem(roomId,
      '🎉 ' + user.name + ' запустил Fan Lottery! ' +
      getConditionLabel(condition, giftId, password) +
      ' · ' + Math.round(durationSec / 60) + ' мин · ' +
      'фонд 💎 ' + cost + ' / ' + winnersCount + ' = 💎 ' + prizePerWinner + ' каждому'
    );

    broadcastLottery(roomId);

    lot.timerId = setTimeout(function() {
      endLottery(roomId, 'time');
    }, durationSec * 1000);

    lot.growthTimerId = setInterval(function() {
      var l = lotteriesByRoom[roomId];
      if (!l) {
        clearInterval(lot.growthTimerId);
        return;
      }
      var current = roomCount(roomId);
      if (current >= l.peakTarget) return;

      var toAdd = Math.min(l.growthPerTick, l.peakTarget - current);
      var g = 'female';
      online.forEach(function(u) {
        if (u.roomId === roomId && u.isBot && u.gender) g = u.gender;
      });
      spawnBotBatch(roomId, g, toAdd, true);
    }, 2000);

    saveData();
  });

  socket.on('lottery_join', function() {
    var user = online.get(socket.id);
    if (!user) return;
    var roomId = user.roomId;
    var lot = lotteriesByRoom[roomId];
    if (!lot) return;

    if (lot.condition === 'password') {
      socket.emit('lottery_info', { message: 'Напишите пароль в чат: ' + lot.password });
      return;
    }
    if (lot.condition === 'share') {
      joinLottery(roomId, user.name, '📤 поделился');
      return;
    }
    if (lot.condition === 'gift') {
      var g = GIFTS.find(function(x) { return x.id === lot.giftId; });
      socket.emit('lottery_info', { message: 'Отправьте подарок: ' + (g ? g.name : lot.giftId) });
      return;
    }
    joinLottery(roomId, user.name, '🆓 без условий');
  });

  socket.on('lottery_stop', function() {
    var user = online.get(socket.id);
    if (!user) return;
    var roomId = user.roomId;
    var lot = lotteriesByRoom[roomId];
    if (!lot) return;
    if (lot.hostName !== user.name && lot.hostSocketId !== socket.id) return;
    endLottery(roomId, 'stopped');
  });

  // ---------- ЛИЧНЫЕ СООБЩЕНИЯ ----------
  socket.on('pm_send', function(data) {
    var user = online.get(socket.id);
    if (!user) return;
    var to = data.to;
    var text = (data.text || '').trim();
    if (!to || !text) return;

    // Платное сообщение?
    var cost = chatCostByUser[to] || 0;
    if (cost > 0) {
      if (getBalance(user.name) < cost) {
        socket.emit('pm_error', {
          message: 'Не хватает алмазов: нужно 💎 ' + cost + ', у тебя 💎 ' + getBalance(user.name)
        });
        return;
      }
      deductBalance(user.name, cost);
      pushTransaction(user.name, 'pm_sent', -cost, 'Сообщение для ' + to);
      pushBalanceToUser(user.name);

      var hostShare = Math.floor(cost * 0.70);
      if (hostShare > 0) {
        addBalance(to, hostShare);
        pushTransaction(to, 'pm_received', hostShare, 'Сообщение от ' + user.name);
        addQuestCoins(to, hostShare);
        pushBalanceToUser(to);
      }
    }

    pushPrivateMessage(user.name, to, text);
    saveData();

    // Отправляем обоим
    var payload = { from: user.name, to: to, text: text, ts: Date.now() };
    online.forEach(function(u, sid) {
      if (u.name === user.name || u.name === to) {
        io.to(sid).emit('pm_new', payload);
      }
    });
  });

  socket.on('pm_get', function(data) {
    var user = online.get(socket.id);
    if (!user) return;
    var withUser = data.with;
    if (!withUser) return;
    var msgs = getPrivateMessages(user.name, withUser);
    socket.emit('pm_history', { with: withUser, messages: msgs });
  });

  socket.on('pm_chat_cost_set', function(data) {
    var user = online.get(socket.id);
    if (!user) return;
    var cost = parseInt(data.cost) || 0;
    if ([0, 5, 10, 50, 100].indexOf(cost) === -1) cost = 0;
    chatCostByUser[user.name] = cost;
    socket.emit('pm_chat_cost', { cost: cost });
    saveData();
  });

  socket.on('pm_chat_cost_get', function() {
    var user = online.get(socket.id);
    if (!user) return;
    socket.emit('pm_chat_cost', { cost: chatCostByUser[user.name] || 0 });
  });

  socket.on('quests_get', function() {
    var user = online.get(socket.id);
    if (!user) return;
    socket.emit('quests_progress', getQuestsProgress(user.name));
  });

  socket.on('quests_claim', function(data) {
    var user = online.get(socket.id);
    if (!user) return;
    var which = data.which;  // 'daily' | 'weekly'
    var d = ensureDailyStats(user.name);
    var w = ensureWeeklyStats(user.name);

    if (which === 'daily') {
      var dDone = d.coins >= 500 && d.seconds >= 3 * 3600;
      if (!dDone) { socket.emit('quests_error', { message: 'Дневной квест не выполнен' }); return; }
      if (d.claimed) { socket.emit('quests_error', { message: 'Уже забрано сегодня' }); return; }
      d.claimed = true;
      addBalance(user.name, 500);
      pushTransaction(user.name, 'quest_daily', 500, 'Дневной квест');
      pushBalanceToUser(user.name);
      socket.emit('quests_progress', getQuestsProgress(user.name));
      saveData();
      return;
    }

    if (which === 'weekly') {
      var wDone = w.coins >= 3000 && w.seconds >= 15 * 3600 && w.activeDays.length >= 5;
      if (!wDone) { socket.emit('quests_error', { message: 'Недельный квест не выполнен' }); return; }
      if (w.claimed) { socket.emit('quests_error', { message: 'Уже забрано на этой неделе' }); return; }
      w.claimed = true;
      addBalance(user.name, 5000);
      pushTransaction(user.name, 'quest_weekly', 5000, 'Недельный квест');
      pushBalanceToUser(user.name);
      socket.emit('quests_progress', getQuestsProgress(user.name));
      saveData();
      return;
    }
  });
  socket.on('get_transactions', function() {
    var user = online.get(socket.id);
    if (!user) return;
    socket.emit('transactions', transactions[user.name] || []);
  });

  // ---------- GREEDY ----------
  socket.on('greedy_get', function() {
    var user = online.get(socket.id);
    if (!user) return;
    socket.emit('greedy_history', greedyHistory[user.name] || []);
    socket.emit('greedy_balance', { balance: getBalance(user.name) });
  });

  socket.on('greedy_spin', function(data) {
    var user = online.get(socket.id);
    if (!user) {
      socket.emit('greedy_error', { message: 'Сервер тебя не видит. Перезайди.' });
      return;
    }

    var bet = parseInt(data.bet) || 0;
    if (GREEDY_ALLOWED_BETS.indexOf(bet) === -1) {
      socket.emit('greedy_error', { message: 'Недопустимая ставка: ' + bet });
      return;
    }
    if (getBalance(user.name) < bet) {
      socket.emit('greedy_error', {
        message: 'Не хватает алмазов. Баланс: ' + getBalance(user.name)
      });
      return;
    }

    // Списываем
    deductBalance(user.name, bet);
    pushTransaction(user.name, 'greedy_bet', -bet, 'Greedy: ставка ' + bet);
    pushBalanceToUser(user.name);

    // Крутим
    var result = greedySpin(user.name, bet);

    // Начисляем
    if (result.payout > 0) {
      addBalance(user.name, result.payout);
      pushTransaction(user.name, 'greedy_win', result.payout, 'Greedy: ×' + result.mult + ' (' + result.emoji + ')');
      pushBalanceToUser(user.name);
    }

    socket.emit('greedy_result', result);
    socket.emit('greedy_history', greedyHistory[user.name] || []);
    saveData();
  });

  // ---------- YUMMY ----------
  socket.on('yummy_get', function() {
    var user = online.get(socket.id);
    if (!user) return;
    socket.emit('yummy_history', yummyHistory[user.name] || []);
  });

 socket.on('yummy_spin', function(data) {
  var user = online.get(socket.id);
  if (!user) {
    socket.emit('yummy_error', { message: 'Сервер тебя не видит. Перезайди в комнату.' });
    return;
  }

  var bet = parseInt(data.bet) || 0;
  if (YUMMY_ALLOWED_BETS.indexOf(bet) === -1) {
    socket.emit('yummy_error', { message: 'Недопустимая ставка: ' + bet });
    return;
  }
  if (getBalance(user.name) < bet) {
    socket.emit('yummy_error', {
      message: 'Не хватает алмазов. Баланс: ' + getBalance(user.name) + ', ставка: ' + bet
    });
    return;
  }

  deductBalance(user.name, bet);
  pushTransaction(user.name, 'yummy_bet', -bet, 'Yummy: ставка ' + bet);
  pushBalanceToUser(user.name);

  var result = yummySpin(user.name, bet);

  if (result.payout > 0) {
    addBalance(user.name, result.payout);
    pushTransaction(user.name, 'yummy_win', result.payout, 'Yummy: выигрыш ×' + result.mult);
    pushBalanceToUser(user.name);
  }

  socket.emit('yummy_result', result);
  socket.emit('yummy_history', yummyHistory[user.name] || []);
  saveData();
});

  // ---------- CRASH ----------
  socket.on('crash_get', function() {
    var user = online.get(socket.id);
    if (!user) return;
    socket.emit('crash_balance', { balance: crashBalance(user.name), history: crashHistory[user.name] || [] });
    broadcastCrash(user.roomId);
  });

  socket.on('crash_start', function(data) {
    var user = online.get(socket.id);
    if (!user) return;
    var roomId = user.roomId;
    if (crashesByRoom[roomId]) {
      socket.emit('crash_error', { message: 'Игра уже идёт' });
      return;
    }
    var bet = parseInt(data.bet) || 0;
    if ([1, 10, 100, 1000].indexOf(bet) === -1) {
      socket.emit('crash_error', { message: 'Недопустимая ставка' });
      return;
    }
    if (crashBalance(user.name) < bet) {
      socket.emit('crash_error', { message: 'Недостаточно алмазов (баланс: ' + crashBalance(user.name) + ')' });
      return;
    }
    startCrashRound(roomId, user, bet, socket.id);
    saveData();
  });

  // ---------- КОШЕЛЁК ----------
  socket.on('topup', function(data) {
    var user = online.get(socket.id);
    if (!user) return;

    var amount = parseInt(data.amount) || 0;
    if (amount < 1) return;
    if (amount > 1000000) amount = 1000000; // разумный лимит

    addBalance(user.name, amount);
    pushTransaction(user.name, 'topup', amount, 'Пополнение');
    socket.emit('balance_update', { balance: getBalance(user.name) });
    socket.emit('topup_success', { amount: amount });

    // Лог
    console.log('[TOPUP]', user.name, '+', amount, 'balance =', getBalance(user.name));
    saveData();
  });

  socket.on('crash_cashout', function() {
    var user = online.get(socket.id);
    if (!user) return;
    crashCashout(user.roomId, user.name, socket.id);
  });

  socket.on('disconnect', function() {
    const user = online.get(socket.id);
    if (user) {
      online.delete(socket.id);
      broadcastOnline(user.roomId);
      var lot = lotteriesByRoom[user.roomId];
      if (lot && lot.hostSocketId === socket.id) {
        endLottery(user.roomId, 'host_left');
      }
      var cr = crashesByRoom[user.roomId];
      if (cr && cr.hostSocketId === socket.id) {
        // не рушим игру — пусть доиграет
      }
    }
  });
});

server.listen(process.env.PORT || 3000, '0.0.0.0', function() {
  console.log('Mini Live started');
  console.log('Open: http://localhost:3000');
  console.log('Данные сохраняются в data.json');
  startLife();
});

process.on('SIGINT', function() {
  console.log('\nСохраняем данные...');
  saveData();
  console.log('Готово. Выходим.');
  process.exit(0);
});

process.on('SIGTERM', function() {
  saveData();
  process.exit(0);
});