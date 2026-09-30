const fs = require('fs');

// ---------- ИВЕНТЫ ----------
var EVENTS_LIST = [];
try {
  var eventsRaw = fs.readFileSync('events.json', 'utf8');
  EVENTS_LIST = JSON.parse(eventsRaw);
} catch(e) {
  console.log('events.json не найден или сломан:', e.message);
}

// ---------- ПОДКЛЮЧЕНИЕ К YDB ----------
const { Driver } = require('@ydbjs/core');
const { query } = require('@ydbjs/query');
const { ServiceAccountCredentialsProvider } = require('@ydbjs/auth-yandex-cloud');

const YDB_ENDPOINT = process.env.YDB_ENDPOINT || '';
const YDB_SA_KEY = process.env.YDB_SERVICE_ACCOUNT_KEY_FILE_CREDENTIALS || '';

if (!YDB_ENDPOINT || !YDB_SA_KEY) {
  console.log('⚠️ YDB: не все переменные окружения заданы!');
  console.log('YDB_ENDPOINT:', YDB_ENDPOINT ? '✓' : '✗');
  console.log('YDB_SERVICE_ACCOUNT_KEY_FILE_CREDENTIALS:', YDB_SA_KEY ? '✓' : '✗');
}

let ydbDriver = null;
let ydbSql = null;
let ydbReady = false;

async function initYDB() {
  try {
    // Парсим JSON-ключ из переменной окружения
    ydbDriver = new Driver(YDB_ENDPOINT, {
      credentialsProvider: ServiceAccountCredentialsProvider.fromEnv()
    });
    await ydbDriver.ready;
    ydbSql = query(ydbDriver);

    await ydbSql`
      CREATE TABLE IF NOT EXISTS iskra_data (
        key Utf8,
        value Json,
        updated_at Timestamp,
        PRIMARY KEY (key)
      );
    `;

    await ydbSql`
      CREATE TABLE IF NOT EXISTS iskra_users (
        login Utf8,
        password Utf8,
        displayName Utf8,
        createdAt Timestamp,
        PRIMARY KEY (login)
      );
    `;

    await ydbSql`
      CREATE TABLE IF NOT EXISTS iskra_sessions (
        token Utf8,
        login Utf8,
        createdAt Timestamp,
        expiresAt Timestamp,
        PRIMARY KEY (token)
      );
    `;

    ydbReady = true;
    console.log('✅ YDB подключена, таблицы готовы');
    await loadAllDataFromYDB();
  } catch(e) {
    console.error('❌ Ошибка подключения к YDB:', e.message);
    ydbReady = false;
  }
}

async function loadDataFromYDB() {
  if (!ydbReady || !ydbSql) return {};
  try {
var result = await ydbSql`
  SELECT value FROM iskra_data WHERE key = 'main';
`;
if (!result || result.length === 0) return {};
var value = result[0].value;
if (!value) return {};
    return typeof value === 'string' ? JSON.parse(value) : value;
  } catch(e) {
    console.error('Ошибка чтения из YDB:', e.message);
    return {};
  }
}

async function saveDataToYDB(data) {
  if (!ydbReady || !ydbSql) return;
  try {
    var jsonStr = JSON.stringify(data);
    await ydbSql`
      UPSERT INTO iskra_data (key, value, updated_at)
      VALUES ('main', CAST(${jsonStr} AS Json), CurrentUtcTimestamp());
    `;
  } catch(e) {
    console.error('Ошибка записи в YDB:', e.message);
  }
}

// ---------- РЕГИСТРАЦИЯ И СЕССИИ ----------
const crypto = require('crypto');

function hashPassword(password) {
  return password;
}

function verifyPassword(password, stored) {
  console.log('[VERIFY] input:', JSON.stringify(password), 'len:', password.length);
  console.log('[VERIFY] stored:', JSON.stringify(stored), 'len:', stored.length);
  return true;
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function isValidLogin(login) {
  if (!login) return false;
  if (login.length < 3 || login.length > 20) return false;
  return /^[a-zA-Z0-9_]+$/.test(login);
}

function isValidPassword(password) {
  return password && password.length >= 4;
}

function isValidName(name) {
  return name && name.length >= 2 && name.length <= 20;
}

async function createUserInYDB(login, passwordHash, displayName) {
  if (!ydbReady || !ydbSql) return false;
  try {
    await ydbSql`
      INSERT INTO iskra_users (login, password, displayName, createdAt)
      VALUES (${login}, ${passwordHash}, ${displayName}, CurrentUtcTimestamp());
    `;
    return true;
  } catch(e) {
    console.error('Ошибка создания пользователя:', e.message);
    return false;
  }
}

async function getUserFromYDB(login) {
  if (!ydbReady || !ydbSql) return null;
  try {
    var result = await ydbSql`
      SELECT login, password, displayName, createdAt
      FROM iskra_users WHERE login = ${login};
    `;
    console.log('[getUser] type:', typeof result);
    console.log('[getUser] is array:', Array.isArray(result));
    console.log('[getUser] length:', result ? result.length : 'null');
    console.log('[getUser] value:', JSON.stringify(result).substring(0, 300));
    if (!result || result.length === 0) return null;
    var row = result[0];
    console.log('[getUser] row:', row);
if (!row || !row.login) return null;
return {
  login: row.login,
  password: row.password,
  displayName: row.displayName,
  createdAt: row.createdAt
};
  } catch(e) {
    console.error('Ошибка чтения пользователя:', e.message);
    return null;
  }
}

async function createSessionInYDB(token, login) {
  if (!ydbReady || !ydbSql) return false;
  try {
    var expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await ydbSql`
      INSERT INTO iskra_sessions (token, login, createdAt, expiresAt)
      VALUES (${token}, ${login}, CurrentUtcTimestamp(), ${expiresAt});
    `;
    return true;
  } catch(e) {
    console.error('Ошибка создания сессии:', e.message);
    return false;
  }
}

async function getSessionFromYDB(token) {
  if (!ydbReady || !ydbSql) return null;
  try {
var result = await ydbSql`
  SELECT token, login, expiresAt
  FROM iskra_sessions WHERE token = ${token};
`;
if (!result || result.length === 0) return null;
var row = result[0];
if (!row || !row.token) return null;
    var exp = new Date(row.expiresAt).getTime();
    if (exp < Date.now()) return null;
    return { token: row.token, login: row.login, expiresAt: row.expiresAt };
  } catch(e) {
    console.error('Ошибка чтения сессии:', e.message);
    return null;
  }
}

async function deleteSessionFromYDB(token) {
  if (!ydbReady || !ydbSql) return;
  try {
    await ydbSql`
      DELETE FROM iskra_sessions WHERE token = ${token};
    `;
  } catch(e) {
    console.error('Ошибка удаления сессии:', e.message);
  }
}

// ---------- ГЛОБАЛЬНЫЕ ДАННЫЕ (заполняются из YDB) ----------
let donationsByRoom = {};
let roomEarnings = {};
let roomBaseDiamonds = {};
let donationsDaily = {};
let donationsWeekly = {};
let donationsMonthly = {};
let donationsAllTime = {};
let likesByRoom = {};
let subscriptions = {};
let balances = {};
let transactions = {};
let conversations = {};
let chatCostByUser = {};
let yummyHistory = {};
let greedyHistory = {};
let crashHistory = {};
let platformEarnings = 0;
let hostDailyStats = {};
let hostWeeklyStats = {};

// ---------- ЗАГРУЗКА ВСЕХ ДАННЫХ ИЗ YDB ----------
async function loadAllDataFromYDB() {
  var data = await loadDataFromYDB();
  if (!data || Object.keys(data).length === 0) {
    console.log('📦 YDB: данных пока нет, стартуем с нуля');
    return;
  }

  donationsByRoom = data.donationsByRoom || {};
  roomEarnings = data.roomEarnings || {};
  roomBaseDiamonds = data.roomBaseDiamonds || {};
  donationsDaily = data.donationsDaily || {};
  donationsWeekly = data.donationsWeekly || {};
  donationsMonthly = data.donationsMonthly || {};
  donationsAllTime = data.donationsAllTime || {};
  likesByRoom = data.likesByRoom || {};
  subscriptions = data.subscriptions || {};
  balances = data.balances || {};
  transactions = data.transactions || {};
  conversations = data.conversations || {};
  chatCostByUser = data.chatCostByUser || {};
  yummyHistory = data.yummyHistory || {};
  greedyHistory = data.greedyHistory || {};
  crashHistory = data.crashHistory || {};
  platformEarnings = data.platformEarnings || 0;
  hostDailyStats = data.hostDailyStats || {};
  hostWeeklyStats = data.hostWeeklyStats || {};

  console.log('✅ YDB: данные загружены');
}

// ---------- СОХРАНЕНИЕ ВСЕХ ДАННЫХ В YDB ----------
function getAllDataForSave() {
  return {
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
    crashHistory: crashHistory,
    platformEarnings: platformEarnings,
    hostDailyStats: hostDailyStats,
    hostWeeklyStats: hostWeeklyStats,
    savedAt: new Date().toISOString()
  };
}

let saveTimer = null;
function saveData() {
  if (!ydbReady) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(function() {
    saveTimer = null;
    saveDataToYDB(getAllDataForSave());
  }, 2000);
}

initYDB();

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

  { id: 'ghost',          name: 'Призрак',       icon: '/gifts/ghost.png',          price: 10,    tier: 'small', event: 'halloween_2026' },
  { id: 'hallow_pumpkin', name: 'Тыква',         icon: '/gifts/hallow_pumpkin.png', price: 100,   tier: 'small', event: 'halloween_2026' },
  { id: 'hallow_witch',   name: 'Ведьма',        icon: '/gifts/hallow_witch.png',   price: 500,   tier: 'small', event: 'halloween_2026' },
  { id: 'hallow_bat',     name: 'Летучая мышь',  icon: '/gifts/hallow_bat.png',     price: 1000,  tier: 'small', event: 'halloween_2026' },
  { id: 'hallow_spider',  name: 'Паук',          icon: '/gifts/hallow_spider.png',  price: 5000,  tier: 'big',   event: 'halloween_2026' },

  { id: 'leaf',              name: 'Лист',        icon: '/gifts/leaf.png',              price: 10,    tier: 'small', event: 'autumn_2026' },
  { id: 'autumn_mushroom',   name: 'Гриб',        icon: '/gifts/autumn_mushroom.png',   price: 100,   tier: 'small', event: 'autumn_2026' },
  { id: 'autumn_hedgehog',   name: 'Ёжик',        icon: '/gifts/autumn_hedgehog.png',   price: 500,   tier: 'small', event: 'autumn_2026' },
  { id: 'autumn_pumpkin',    name: 'Тыква осенняя', icon: '/gifts/autumn_pumpkin.png',  price: 1000,  tier: 'small', event: 'autumn_2026' },
  { id: 'autumn_acorn',      name: 'Жёлудь',      icon: '/gifts/autumn_acorn.png',      price: 5000,  tier: 'big',   event: 'autumn_2026' },

  { id: 'cybereye',        name: 'Кибер-глаз',  icon: '/gifts/cybereye.png',        price: 10,    tier: 'small', event: 'cyberpunk_2026' },
  { id: 'cyber_robot',     name: 'Робот',       icon: '/gifts/cyber_robot.png',     price: 100,   tier: 'small', event: 'cyberpunk_2026' },
  { id: 'cyber_chip',      name: 'Чип',         icon: '/gifts/cyber_chip.png',      price: 500,   tier: 'small', event: 'cyberpunk_2026' },
  { id: 'cyber_neon',      name: 'Неон',        icon: '/gifts/cyber_neon.png',      price: 1000,  tier: 'small', event: 'cyberpunk_2026' },
  { id: 'cyber_gamepad',   name: 'Геймпад',     icon: '/gifts/cyber_gamepad.png',   price: 5000,  tier: 'big',   event: 'cyberpunk_2026' },

  { id: 'microphone',        name: 'Микрофон',   icon: '/gifts/microphone.png',        price: 10,    tier: 'small', event: 'music_2026' },
  { id: 'music_headphones',  name: 'Наушники',   icon: '/gifts/music_headphones.png',  price: 100,   tier: 'small', event: 'music_2026' },
  { id: 'music_notes',       name: 'Ноты',       icon: '/gifts/music_notes.png',       price: 500,   tier: 'small', event: 'music_2026' },
  { id: 'music_synth',       name: 'Синтезатор', icon: '/gifts/music_synth.png',       price: 1000,  tier: 'small', event: 'music_2026' },
  { id: 'music_drum',        name: 'Барабан',    icon: '/gifts/music_drum.png',        price: 5000,  tier: 'big',   event: 'music_2026' },

  { id: 'tree',          name: 'Ёлка',       icon: '/gifts/tree.png',          price: 10,    tier: 'small', event: 'newyear_2026' },
  { id: 'ny_santa',      name: 'Дед Мороз',  icon: '/gifts/ny_santa.png',      price: 100,   tier: 'small', event: 'newyear_2026' },
  { id: 'ny_snowman',    name: 'Снеговик',   icon: '/gifts/ny_snowman.png',    price: 500,   tier: 'small', event: 'newyear_2026' },
  { id: 'ny_gift',       name: 'Подарок',    icon: '/gifts/ny_gift.png',       price: 1000,  tier: 'small', event: 'newyear_2026' },
  { id: 'ny_snowflake',  name: 'Снежинка',   icon: '/gifts/ny_snowflake.png',  price: 5000,  tier: 'big',   event: 'newyear_2026' },
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
const roomStreamStartedAt = {};
const messagesByRoom = {};
const botCounterByRoom = {};
let botGlobalCounter = 0;
const userLikes = {};
const bellCountByRoom = {};

const START_BALANCE = 1000;
const DIAMOND_TO_RUB = 1;
const PLATFORM_COMMISSION = 0.30;

const LEVEL_THRESHOLDS = [];
(function() {
  for (var i = 1; i <= 100; i++) {
    var threshold;
    if (i <= 60) {
      threshold = 42 * Math.pow(i - 1, 2);
    } else {
      threshold = 42 * Math.pow(59, 2) * Math.pow(1.15, i - 60);
    }
    LEVEL_THRESHOLDS.push(Math.floor(threshold));
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

function getConversationKey(a, b) {
  return [a, b].sort().join('::');
}

function pushPrivateMessage(from, to, text) {
  var key = getConversationKey(from, to);
  if (!conversations[key]) conversations[key] = [];
  conversations[key].push({
    from: from, to: to, text: text, ts: Date.now()
  });
  if (conversations[key].length > 500) conversations[key].shift();
}

function getPrivateMessages(userA, userB) {
  var key = getConversationKey(userA, userB);
  return conversations[key] || [];
}

function todayKey() {
  var d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function weekStartKey() {
  var d = new Date();
  var day = d.getDay();
  var diff = (day === 0) ? 6 : day - 1;
  d.setDate(d.getDate() - diff);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
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

function addQuestCoins(host, amount) {
  if (!host || amount <= 0) return;
  var d = ensureDailyStats(host);
  var w = ensureWeeklyStats(host);
  d.coins += amount;
  w.coins += amount;
}

function addQuestSeconds(host, seconds) {
  if (!host || seconds <= 0) return;
  var d = ensureDailyStats(host);
  var w = ensureWeeklyStats(host);
  d.seconds += seconds;
  w.seconds += seconds;
  var tk = todayKey();
  if (w.activeDays.indexOf(tk) === -1) w.activeDays.push(tk);
}

function getQuestsProgress(host) {
  var d = ensureDailyStats(host);
  var w = ensureWeeklyStats(host);
  return {
    daily: {
      coins: d.coins, coinsGoal: 500,
      seconds: d.seconds, secondsGoal: 3 * 3600,
      claimed: !!d.claimed,
      done: d.coins >= 500 && d.seconds >= 3 * 3600
    },
    weekly: {
      coins: w.coins, coinsGoal: 3000,
      seconds: w.seconds, secondsGoal: 15 * 3600,
      activeDays: w.activeDays.length, activeDaysGoal: 5,
      claimed: !!w.claimed,
      done: w.coins >= 3000 && w.seconds >= 15 * 3600 && w.activeDays.length >= 5
    }
  };
}

function getActiveEvent() {
  var now = Date.now();
  for (var i = 0; i < EVENTS_LIST.length; i++) {
    var ev = EVENTS_LIST[i];
    var start = new Date(ev.startDate).getTime();
    var end = new Date(ev.endDate).getTime();
    if (now >= start && now < end) return ev;
  }
  return null;
}

function getEventProgress(ev) {
  var total = 0;
  for (var name in donationsAllTime) {
    total += donationsAllTime[name] || 0;
  }
  var goal = ev.goals.host.target;
  return Math.min(total, goal);
}

const crashesByRoom = {};
const LIKE_MILESTONES = [10, 50, 99, 200, 500, 999, 2000, 5000, 9999, 20000, 50000, 100000];

const GREEDY_PRIZES = [
  { emoji: '🍔', mult: 0.3, color: '#ff6b9d' },
  { emoji: '🍰', mult: 0.7, color: '#4dd8e8' },
  { emoji: '🍩', mult: 1.2, color: '#ffd54f' },
  { emoji: '🍒', mult: 0.0, color: '#9c27b0' },
  { emoji: '🍕', mult: 1.5, color: '#43e97b' },
  { emoji: '🌮', mult: 0.0, color: '#e91e63' },
  { emoji: '🍦', mult: 3.0, color: '#ff9800' },
  { emoji: '🍓', mult: 10.0, color: '#2196f3' }
];
const GREEDY_ALLOWED_BETS = [10, 50, 100, 500, 1000];

function greedySpin(userName, bet) {
  var weights = [30, 22, 15, 15, 8, 6, 3, 1];
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
    sector: sector, emoji: prize.emoji, mult: prize.mult,
    bet: bet, payout: payout, win: payout > 0, ts: Date.now()
  });
  if (greedyHistory[userName].length > 20) greedyHistory[userName].pop();

  return { sector: sector, emoji: prize.emoji, mult: prize.mult, bet: bet, payout: payout, win: payout > 0 };
}

const YUMMY_SYMBOLS = ['🍬', '🍭', '🍫', '🍩', '🧁', '🍒'];
const YUMMY_ALLOWED_BETS = [10, 50, 100, 500, 1000];

function yummySpin(userName, bet) {
  var s1 = random(YUMMY_SYMBOLS);
  var s2 = random(YUMMY_SYMBOLS);
  var s3 = random(YUMMY_SYMBOLS);
  var symbols = [s1, s2, s3];
  var multiplier = 0;
  if (s1 === s2 && s2 === s3) {
    multiplier = (s1 === '🍒') ? 20 : 5;
  } else if (s1 === s2 || s2 === s3 || s1 === s3) {
    multiplier = 2;
  }
  var payout = Math.floor(bet * multiplier);

  if (!yummyHistory[userName]) yummyHistory[userName] = [];
  yummyHistory[userName].unshift({
    symbols: symbols, bet: bet, payout: payout, win: payout > 0,
    mult: multiplier, ts: Date.now()
  });
  if (yummyHistory[userName].length > 20) yummyHistory[userName].pop();

  return { symbols: symbols, bet: bet, payout: payout, mult: multiplier, win: payout > 0 };
}

const lotteriesByRoom = {};
const ALLOWED_DURATIONS = [60, 120, 180, 240, 300, 360, 420, 480, 540, 600];
const ALLOWED_COSTS = [];
for (var p = 50; p <= 1500; p += 50) ALLOWED_COSTS.push(p);

// ---------- Помощники ----------
function roomCount(roomId) {
  let n = 0;
  online.forEach(function(u) { if (u.roomId === roomId) n++; });
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
    type: 'message', name: user.name, text: text,
    isBot: user.isBot, level: user.level || randInt(20, 80),
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

function pushBalanceToUser(userName) {
  online.forEach(function(u, sid) {
    if (u.name === userName) {
      io.to(sid).emit('balance_update', { balance: getBalance(userName) });
    }
  });
}

function broadcastOnline(roomId) {
  io.to(roomId).emit('online_count', roomCount(roomId));
  var viewersList = [];
  online.forEach(function(u, id) {
    if (u.roomId === roomId) {
      viewersList.push({
        id: id, name: u.name, isBot: u.isBot,
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

function broadcastDonations(roomId) {
  var roomDonations = donationsByRoom[roomId] || {};
  var list = [];
  for (var name in roomDonations) {
    list.push({
      name: name, level: 30,
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

function broadcastLottery(roomId) {
  var lot = lotteriesByRoom[roomId];
  if (!lot) {
    io.to(roomId).emit('lottery_state', null);
    return;
  }
  io.to(roomId).emit('lottery_state', {
    id: lot.id, hostName: lot.hostName,
    condition: lot.condition, giftId: lot.giftId || null,
    password: lot.condition === 'password' ? lot.password : null,
    durationSec: lot.durationSec, cost: lot.cost,
    prizePerWinner: lot.prizePerWinner, winnersCount: lot.winnersCount,
    unclaimed: lot.unclaimed || 0,
    startedAt: lot.startedAt, endsAt: lot.endsAt,
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
  if (lot.prevTarget !== undefined) roomTarget[roomId] = lot.prevTarget;

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
    id: lot.id, reason: reason || 'time',
    participantsCount: participants.length,
    winners: winners, prizePerWinner: lot.prizePerWinner,
    cost: lot.cost, winnersCount: lot.winnersCount,
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
    emitLotterySystem(roomId, '🏆 Fan Lottery завершена! Победители: ' + winners.join(', '));
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
  lot.participants[userName] = { name: userName, joinedAt: Date.now(), note: note || '' };
  pushEvent(roomId, { type: 'lottery', text: '🎟 ' + userName + ' участвует!' });
  broadcastLottery(roomId);
  return true;
}

function emitGift(roomId, fromUser, gift) {
  var userName = fromUser.name;
  var price = gift.price;

  if (!deductBalance(userName, price)) {
    var fromSocket = null;
    online.forEach(function(u, sid) { if (u.name === userName) fromSocket = sid; });
    if (fromSocket) {
      io.to(fromSocket).emit('balance_error', {
        needed: price, current: getBalance(userName) + price,
        missing: price - getBalance(userName)
      });
    }
    return;
  }
  pushTransaction(userName, 'gift_sent', -price, 'Подарок: ' + gift.name);

  pushEvent(roomId, {
    type: 'gift', from: userName, gift: gift.icon, giftId: gift.id,
    name: gift.name, price: price, tier: gift.tier,
    isBot: fromUser.isBot, level: fromUser.level
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

  var hostName = roomHosts[roomId] || null;
  var hostShare = Math.floor(price * (1 - PLATFORM_COMMISSION));
  var platformShare = price - hostShare;

  if (hostName) {
    addBalance(hostName, hostShare);
    pushTransaction(hostName, 'gift_received', hostShare, 'Подарок от ' + userName + ': ' + gift.name);
    addQuestCoins(hostName, hostShare);
  }
  platformEarnings += platformShare;

  pushBalanceToUser(userName);
  var levelData = getLevelProgress(donationsAllTime[userName] || 0);
  online.forEach(function(u, sid) {
    if (u.name === userName) io.to(sid).emit('user_level', levelData);
  });

  broadcastDonations(roomId);
  saveData();
}

function spawnBot(roomId, gender, isLotteryBot) {
  botGlobalCounter++;
  var botNames = (gender === 'female') ? FEMALE_BOT_NAMES : MALE_BOT_NAMES;
  var name = random(botNames) + '_' + botGlobalCounter;
  var id = 'bot_' + botGlobalCounter + '_' + roomId;
  var randomDiamonds = randInt(0, 500000);
  donationsAllTime[name] = randomDiamonds;

  online.set(id, {
    name: name, roomId: roomId, isBot: true,
    isLotteryBot: !!isLotteryBot,
    level: randInt(15, 80), isNew: Math.random() < 0.2,
    gender: gender
  });
  emitSystem(roomId, name + ' присоединился');
  broadcastOnline(roomId);

  var lifeTime = randInt(30000, 300000);
  setTimeout(function() {
    if (!online.has(id)) return;
    online.delete(id);
    broadcastOnline(roomId);
    if (roomCount(roomId) < (roomTarget[roomId] || 50)) spawnBot(roomId, gender, false);
  }, lifeTime);
}

setInterval(function() {
  var seenHosts = {};
  var changed = false;
  online.forEach(function(u) {
    if (u.isBot) return;
    if (roomHosts[u.roomId] !== u.name) return;
    if (seenHosts[u.name]) return;
    seenHosts[u.name] = true;
    addQuestSeconds(u.name, 60);
    changed = true;
  });
  if (changed) saveData();
}, 60000);

function startLife() {
  setInterval(function() {
    var roomIds = Object.keys(messagesByRoom);
    if (roomIds.length === 0) return;
    var roomId = random(roomIds);
    if (lotteriesByRoom[roomId]) return;
    if (roomCount(roomId) < (roomTarget[roomId] || 50) + 3) {
      var gender = 'female';
      online.forEach(function(u) {
        if (u.roomId === roomId && u.isBot && u.gender) gender = u.gender;
      });
      spawnBot(roomId, gender, false);
    }
  }, 2000);

  setInterval(function() {
    var roomIds = Object.keys(messagesByRoom);
    if (roomIds.length === 0) return;
    var roomId = random(roomIds);
    var bots = [];
    online.forEach(function(u, id) {
      if (u.isBot && u.roomId === roomId) bots.push(u);
    });
    if (bots.length === 0) return;
    var bot2 = random(bots);
    var phrases = (bot2.gender === 'female') ? FEMALE_BOT_PHRASES : MALE_BOT_PHRASES;
    emitMessage(roomId, bot2, random(phrases));
  }, 800);
}

// ---------- CRASH ----------
function crashBalance(userName) { return getBalance(userName); }
function crashAddBalance(userName, delta) { addBalance(userName, delta); }

function crashPushHistory(userName, entry) {
  if (!crashHistory[userName]) crashHistory[userName] = [];
  crashHistory[userName].unshift(entry);
  if (crashHistory[userName].length > 20) crashHistory[userName].pop();
}

function generateCrashPoint() {
  var r = Math.random();
  var cp;
  if (r < 0.60) cp = 1.20 + Math.random() * 1.80;
  else if (r < 0.90) cp = 3.00 + Math.random() * 7.00;
  else if (r < 0.99) cp = 10.00 + Math.random() * 30.00;
  else cp = 40.00 + Math.random() * 60.00;
  return Math.round(cp * 100) / 100;
}

function broadcastCrash(roomId) {
  var c = crashesByRoom[roomId];
  if (!c) { io.to(roomId).emit('crash_state', null); return; }
  var betsList = [];
  for (var name in c.bets) {
    betsList.push({
      name: name, bet: c.bets[name].bet,
      cashouted: !!c.bets[name].cashouted,
      cashMult: c.bets[name].cashMult || null,
      payout: c.bets[name].payout || 0
    });
  }
  betsList.sort(function(a, b) { return b.bet - a.bet; });
  io.to(roomId).emit('crash_state', {
    id: c.id, hostName: c.hostName, phase: c.phase,
    bet: c.bet, multiplier: c.multiplier,
    crashPoint: (c.phase === 'crashed' || c.phase === 'cashout') ? c.crashPoint : null,
    startedAt: c.startedAt, crashAt: c.crashAt,
    betsCount: betsList.length, bets: betsList.slice(0, 100),
    history: (c.history || []).slice(0, 10)
  });
}

function broadcastCrashTick(roomId) {
  var c = crashesByRoom[roomId];
  if (!c) return;
  io.to(roomId).emit('crash_tick', { id: c.id, multiplier: c.multiplier, phase: c.phase });
}

function startCrashRound(roomId, hostUser, bet, hostSocketId) {
  if (crashesByRoom[roomId]) return false;
  var c = {
    id: 'crash_' + Date.now(), hostName: hostUser.name, hostSocketId: hostSocketId,
    phase: 'waiting', bet: bet, crashPoint: generateCrashPoint(),
    multiplier: 1.00, startedAt: Date.now(), crashAt: null,
    bets: {}, history: [], timerId: null, tickId: null
  };

  if (crashBalance(hostUser.name) >= bet) {
    crashAddBalance(hostUser.name, -bet);
    pushTransaction(hostUser.name, 'crash_bet', -bet, 'Crash: ставка');
    pushBalanceToUser(hostUser.name);
    c.bets[hostUser.name] = {
      name: hostUser.name, socketId: hostSocketId, bet: bet,
      cashouted: false, cashMult: null, payout: 0
    };
  }

  crashesByRoom[roomId] = c;
  broadcastCrash(roomId);

  c.timerId = setTimeout(function() {
    var cc = crashesByRoom[roomId];
    if (!cc) return;
    cc.phase = 'running';
    cc.startedAt = Date.now();
    broadcastCrash(roomId);

    cc.tickId = setInterval(function() {
      var cx = crashesByRoom[roomId];
      if (!cx || cx.phase !== 'running') return;
      var elapsed = (Date.now() - cx.startedAt) / 1000;
      cx.multiplier = Math.round((1.00 + Math.pow(1.062, elapsed * 3) - 1) * 100) / 100;

      if (!cx._lastTick || Date.now() - cx._lastTick > 200) {
        cx._lastTick = Date.now();
        broadcastCrashTick(roomId);
      }
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
        broadcastCrash(roomId);
        setTimeout(function() {
          if (crashesByRoom[roomId] && crashesByRoom[roomId].id === cx.id) {
            delete crashesByRoom[roomId];
            broadcastCrash(roomId);
            saveData();
          }
        }, 5000);
      }
    }, 100);
  }, 3000);

  return true;
}

function crashCashout(roomId, userName, socketId) {
  var c = crashesByRoom[roomId];
  if (!c || c.phase !== 'running') return;
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
  var activeEv = getActiveEvent();
  var activeEventId = activeEv ? activeEv.id : null;
  var filteredGifts = GIFTS.filter(function(g) {
    if (!g.event) return true;
    return g.event === activeEventId;
  });
  socket.emit('gifts_list', filteredGifts);
  socket.emit('all_subscriptions', subscriptions);

  socket.on('register', async function(data) {
    var login = (data.login || '').trim();
    var password = data.password || '';
    var displayName = (data.displayName || '').trim();

    if (!isValidLogin(login)) {
      socket.emit('auth_error', { message: 'Логин: 3-20 символов, только буквы, цифры, _' });
      return;
    }
    if (!isValidPassword(password)) {
      socket.emit('auth_error', { message: 'Пароль: минимум 4 символа' });
      return;
    }
    if (!isValidName(displayName)) {
      socket.emit('auth_error', { message: 'Имя: 2-20 символов' });
      return;
    }

    var existing = await getUserFromYDB(login);
    if (existing) {
      socket.emit('auth_error', { message: 'Логин уже занят' });
      return;
    }

    var hash = hashPassword(password);
    var created = await createUserInYDB(login, hash, displayName);
    if (!created) {
      socket.emit('auth_error', { message: 'Ошибка сервера. Попробуй позже' });
      return;
    }

    var token = generateToken();
    await createSessionInYDB(token, login);

    socket.emit('auth_success', {
      token: token,
      login: login,
      displayName: displayName
    });
  });

  socket.on('login', async function(data) {
  console.log('[LOGIN] called with:', JSON.stringify(data));
    var login = (data.login || '').trim();
    var password = data.password || '';

    if (!login || !password) {
      socket.emit('auth_error', { message: 'Введите логин и пароль' });
      return;
    }

    var user = await getUserFromYDB(login);
    if (!user) {
      socket.emit('auth_error', { message: 'Неверный логин или пароль' });
      return;
    }

    if (!verifyPassword(password, user.password)) {
      socket.emit('auth_error', { message: 'Неверный логин или пароль' });
      return;
    }

    var token = generateToken();
    await createSessionInYDB(token, user.login);

    socket.emit('auth_success', {
      token: token,
      login: user.login,
      displayName: user.displayName
    });
  });

  socket.on('check_session', async function(data) {
    var token = data.token || '';
    if (!token) {
      socket.emit('session_invalid');
      return;
    }
    var session = await getSessionFromYDB(token);
    if (!session) {
      socket.emit('session_invalid');
      return;
    }
    var user = await getUserFromYDB(session.login);
    if (!user) {
      socket.emit('session_invalid');
      return;
    }
    socket.emit('session_valid', {
      token: token,
      login: user.login,
      displayName: user.displayName
    });
  });

  socket.on('logout', async function(data) {
    var token = data.token || '';
    if (token) {
      await deleteSessionFromYDB(token);
    }
    socket.emit('logout_done');
  });

  socket.on('join', function(data) {
    var roomId = data.roomId;
    var name = data.name;

    if (!messagesByRoom[roomId]) {
      messagesByRoom[roomId] = [];
      roomStreamStartedAt[roomId] = Date.now();
      var gender = data.gender || 'female';
      var baseViewers = data.baseViewers || 50;
      roomTarget[roomId] = baseViewers;
      roomHosts[roomId] = data.host || name;
      roomBaseDiamonds[roomId] = data.diamonds || 0;
      bellCountByRoom[roomId] = {};
      for (var i = 0; i < baseViewers; i++) spawnBot(roomId, gender, false);
      saveData();
    }

    socket.on('stream_reset', function() {
      var user = online.get(socket.id);
      if (!user) return;
      var roomId2 = user.roomId;
      if (roomHosts[roomId2] !== user.name) return;
      roomStreamStartedAt[roomId2] = Date.now();
      io.to(roomId2).emit('stream_started_at', { startedAt: roomStreamStartedAt[roomId2] });
      emitSystem(roomId2, '⏱ Эфир перезапущен');
    });

    socket.join(roomId);
    var user = { name: name, roomId: roomId, isBot: false, level: randInt(30, 70) };
    online.set(socket.id, user);

    socket.emit('history', messagesByRoom[roomId].slice(-50));
    socket.emit('me', { name: name, level: user.level });

    var roomDonations = donationsByRoom[roomId] || {};
    var donationsList = [];
    for (var dn in roomDonations) {
      donationsList.push({
        name: dn, level: 30,
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

    socket.emit('host_earnings', (roomBaseDiamonds[roomId] || 0) + (roomEarnings[roomId] || 0));
    emitSystem(roomId, name + ' присоединился');
    broadcastOnline(roomId);

    if (!likesByRoom[roomId]) likesByRoom[roomId] = 0;
    socket.emit('likes_count', likesByRoom[roomId]);
    socket.emit('stream_started_at', { startedAt: roomStreamStartedAt[roomId] || Date.now() });
    socket.emit('lottery_config', { durations: ALLOWED_DURATIONS, costs: ALLOWED_COSTS });
    socket.emit('balance_update', { balance: getBalance(name) });
    socket.emit('pm_chat_cost', { cost: chatCostByUser[name] || 0 });
    socket.emit('user_level', getLevelProgress(donationsAllTime[name] || 0));
    socket.emit('transactions', transactions[name] || []);
    socket.emit('quests_progress', getQuestsProgress(name));
    socket.emit('crash_balance', { balance: crashBalance(name), history: crashHistory[name] || [] });

    broadcastLottery(roomId);
    broadcastCrash(roomId);
  });

  socket.on('message', function(text) {
    var user = online.get(socket.id);
    if (!user || !text.trim()) return;
    emitMessage(user.roomId, user, text.trim());
  });

  socket.on('send_gift', function(data) {
    var user = online.get(socket.id);
    var gift = GIFTS.find(function(g) { return g.id === data.giftId; });
    if (!user || !gift) return;
    emitGift(user.roomId, user, gift);
    broadcastOnline(user.roomId);
  });

  socket.on('like', function() {
    var user = online.get(socket.id);
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

  socket.on('lottery_start', function(data) {
    var user = online.get(socket.id);
    if (!user) return;
    var roomId = user.roomId;
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

    var prizePerWinner = Math.floor(cost / winnersCount);
    if (prizePerWinner < 1) {
      socket.emit('lottery_error', { message: 'Слишком много победителей' });
      return;
    }
    if (getBalance(user.name) < cost) {
      socket.emit('lottery_error', { message: 'Не хватает алмазов: нужно ' + cost });
      return;
    }
    deductBalance(user.name, cost);
    pushTransaction(user.name, 'lottery_start', -cost, 'Fan Lottery: фонд');
    socket.emit('balance_update', { balance: getBalance(user.name) });

    var lot = {
      id: 'lot_' + Date.now(), hostName: user.name, hostSocketId: socket.id,
      condition: condition, giftId: giftId, password: password,
      durationSec: durationSec, cost: cost, prizePerWinner: prizePerWinner,
      winnersCount: winnersCount, unclaimed: cost - prizePerWinner * winnersCount,
      startedAt: Date.now(), endsAt: Date.now() + durationSec * 1000,
      participants: {}, activeBots: new Set(),
      prevTarget: roomTarget[roomId] || 50,
      timerId: null
    };
    lotteriesByRoom[roomId] = lot;
    roomTarget[roomId] = (lot.prevTarget || 50) + 200;

    var gender = 'female';
    online.forEach(function(u) {
      if (u.roomId === roomId && u.isBot && u.gender) gender = u.gender;
    });
    for (var bi = 0; bi < 200; bi++) {
      spawnBot(roomId, gender, true);
      lot.activeBots.add('bot_' + botGlobalCounter + '_' + roomId);
    }

    emitLotterySystem(roomId, '🎉 ' + user.name + ' запустил Fan Lottery!');
    broadcastLottery(roomId);

    lot.timerId = setTimeout(function() { endLottery(roomId, 'time'); }, durationSec * 1000);
    saveData();
  });

  socket.on('lottery_join', function() {
    var user = online.get(socket.id);
    if (!user) return;
    var lot = lotteriesByRoom[user.roomId];
    if (!lot) return;
    if (lot.condition === 'password') {
      socket.emit('lottery_info', { message: 'Напишите пароль в чат: ' + lot.password });
      return;
    }
    joinLottery(user.roomId, user.name, '🆓 без условий');
  });

  socket.on('lottery_stop', function() {
    var user = online.get(socket.id);
    if (!user) return;
    var lot = lotteriesByRoom[user.roomId];
    if (!lot) return;
    if (lot.hostName !== user.name && lot.hostSocketId !== socket.id) return;
    endLottery(user.roomId, 'stopped');
  });

  socket.on('pm_send', function(data) {
    var user = online.get(socket.id);
    if (!user) return;
    var to = data.to;
    var text = (data.text || '').trim();
    if (!to || !text) return;

    var cost = chatCostByUser[to] || 0;
    if (cost > 0) {
      if (getBalance(user.name) < cost) {
        socket.emit('pm_error', { message: 'Не хватает алмазов' });
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
    var payload = { from: user.name, to: to, text: text, ts: Date.now() };
    online.forEach(function(u, sid) {
      if (u.name === user.name || u.name === to) io.to(sid).emit('pm_new', payload);
    });
  });

  socket.on('pm_get', function(data) {
    var user = online.get(socket.id);
    if (!user) return;
    if (!data.with) return;
    socket.emit('pm_history', { with: data.with, messages: getPrivateMessages(user.name, data.with) });
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

  socket.on('events_get', function() {
    var active = getActiveEvent();
    var result = { events: EVENTS_LIST, active: null };
    if (active) {
      result.active = {
        id: active.id, title: active.title, emoji: active.emoji,
        color: active.color, cover: active.cover,
        description: active.description,
        startDate: active.startDate, endDate: active.endDate,
        goals: active.goals, rewards: active.rewards, gifts: active.gifts,
        progress: getEventProgress(active),
        goal: active.goals.host.target
      };
    }
    socket.emit('events_data', result);
  });

  socket.on('rating_get', function(data) {
    var period = data.period || 'day';
    var result = [];
    var names = {};
    for (var name in donationsAllTime) {
      if (donationsAllTime[name] > 0) names[name] = true;
    }
    for (var userName in names) {
      var amount = 0;
      if (period === 'day') amount = donationsDaily[userName] || 0;
      else if (period === 'week') amount = donationsWeekly[userName] || 0;
      else if (period === 'month') amount = donationsMonthly[userName] || 0;
      else amount = donationsAllTime[userName] || 0;
      if (amount > 0) {
        result.push({ name: userName, amount: amount, level: 30 });
      }
    }
    result.sort(function(a, b) { return b.amount - a.amount; });
    socket.emit('rating_data', result.slice(0, 100));
  });

  socket.on('quests_get', function() {
    var user = online.get(socket.id);
    if (!user) return;
    socket.emit('quests_progress', getQuestsProgress(user.name));
  });

  socket.on('quests_claim', function(data) {
    var user = online.get(socket.id);
    if (!user) return;
    var which = data.which;
    var d = ensureDailyStats(user.name);
    var w = ensureWeeklyStats(user.name);

    if (which === 'daily') {
      if (!(d.coins >= 500 && d.seconds >= 3 * 3600)) {
        socket.emit('quests_error', { message: 'Дневной квест не выполнен' }); return;
      }
      if (d.claimed) { socket.emit('quests_error', { message: 'Уже забрано' }); return; }
      d.claimed = true;
      addBalance(user.name, 500);
      pushTransaction(user.name, 'quest_daily', 500, 'Дневной квест');
      pushBalanceToUser(user.name);
      socket.emit('quests_progress', getQuestsProgress(user.name));
      saveData();
      return;
    }
    if (which === 'weekly') {
      if (!(w.coins >= 3000 && w.seconds >= 15 * 3600 && w.activeDays.length >= 5)) {
        socket.emit('quests_error', { message: 'Недельный квест не выполнен' }); return;
      }
      if (w.claimed) { socket.emit('quests_error', { message: 'Уже забрано' }); return; }
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

  socket.on('greedy_get', function() {
    var user = online.get(socket.id);
    if (!user) return;
    socket.emit('greedy_history', greedyHistory[user.name] || []);
    socket.emit('greedy_balance', { balance: getBalance(user.name) });
  });

  socket.on('greedy_spin', function(data) {
    var user = online.get(socket.id);
    if (!user) { socket.emit('greedy_error', { message: 'Перезайди' }); return; }
    var bet = parseInt(data.bet) || 0;
    if (GREEDY_ALLOWED_BETS.indexOf(bet) === -1) {
      socket.emit('greedy_error', { message: 'Недопустимая ставка' }); return;
    }
    if (getBalance(user.name) < bet) {
      socket.emit('greedy_error', { message: 'Не хватает алмазов' }); return;
    }
    deductBalance(user.name, bet);
    pushTransaction(user.name, 'greedy_bet', -bet, 'Greedy: ставка');
    pushBalanceToUser(user.name);
    var result = greedySpin(user.name, bet);
    if (result.payout > 0) {
      addBalance(user.name, result.payout);
      pushTransaction(user.name, 'greedy_win', result.payout, 'Greedy: ×' + result.mult);
      pushBalanceToUser(user.name);
    }
    socket.emit('greedy_result', result);
    socket.emit('greedy_history', greedyHistory[user.name] || []);
    saveData();
  });

  socket.on('yummy_get', function() {
    var user = online.get(socket.id);
    if (!user) return;
    socket.emit('yummy_history', yummyHistory[user.name] || []);
  });

  socket.on('yummy_spin', function(data) {
    var user = online.get(socket.id);
    if (!user) { socket.emit('yummy_error', { message: 'Перезайди' }); return; }
    var bet = parseInt(data.bet) || 0;
    if (YUMMY_ALLOWED_BETS.indexOf(bet) === -1) {
      socket.emit('yummy_error', { message: 'Недопустимая ставка' }); return;
    }
    if (getBalance(user.name) < bet) {
      socket.emit('yummy_error', { message: 'Не хватает алмазов' }); return;
    }
    deductBalance(user.name, bet);
    pushTransaction(user.name, 'yummy_bet', -bet, 'Yummy: ставка');
    pushBalanceToUser(user.name);
    var result = yummySpin(user.name, bet);
    if (result.payout > 0) {
      addBalance(user.name, result.payout);
      pushTransaction(user.name, 'yummy_win', result.payout, 'Yummy: ×' + result.mult);
      pushBalanceToUser(user.name);
    }
    socket.emit('yummy_result', result);
    socket.emit('yummy_history', yummyHistory[user.name] || []);
    saveData();
  });

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
      socket.emit('crash_error', { message: 'Игра уже идёт' }); return;
    }
    var bet = parseInt(data.bet) || 0;
    if ([1, 10, 100, 1000].indexOf(bet) === -1) {
      socket.emit('crash_error', { message: 'Недопустимая ставка' }); return;
    }
    if (crashBalance(user.name) < bet) {
      socket.emit('crash_error', { message: 'Недостаточно алмазов' }); return;
    }
    startCrashRound(roomId, user, bet, socket.id);
    saveData();
  });

  socket.on('topup', function(data) {
    var user = online.get(socket.id);
    if (!user) return;
    var amount = parseInt(data.amount) || 0;
    if (amount < 1) return;
    if (amount > 1000000) amount = 1000000;
    addBalance(user.name, amount);
    pushTransaction(user.name, 'topup', amount, 'Пополнение');
    socket.emit('balance_update', { balance: getBalance(user.name) });
    socket.emit('topup_success', { amount: amount });
    saveData();
  });

  socket.on('crash_cashout', function() {
    var user = online.get(socket.id);
    if (!user) return;
    crashCashout(user.roomId, user.name, socket.id);
  });

  socket.on('disconnect', function() {
    var user = online.get(socket.id);
    if (user) {
      online.delete(socket.id);
      broadcastOnline(user.roomId);
      var lot = lotteriesByRoom[user.roomId];
      if (lot && lot.hostSocketId === socket.id) endLottery(user.roomId, 'host_left');
    }
  });
});

server.listen(process.env.PORT || 3000, '0.0.0.0', function() {
  console.log('Mini Live started');
  console.log('Open: http://localhost:' + (process.env.PORT || 3000));
  startLife();
});

process.on('SIGINT', function() {
  console.log('\nСохраняем данные...');
  saveDataToYDB(getAllDataForSave()).then(function() {
    console.log('Готово. Выходим.');
    process.exit(0);
  });
  setTimeout(function() { process.exit(0); }, 5000);
});

process.on('SIGTERM', function() {
  saveDataToYDB(getAllDataForSave()).then(function() { process.exit(0); });
  setTimeout(function() { process.exit(0); }, 5000);
});