// === server.js (Фінальна Версія з "Пам'яттю" - Render + Neon) ===

import express from 'express'; 
import axios from 'axios'; 
import cors from 'cors'; 
import pg from 'pg'; // 1. ІМПОРТУЄМО "ДРАЙВЕР" БАЗИ ДАНИХ

// --- НАЛАШТУВАННЯ ---
const app = express();
const PORT = 3001; 
const POLLING_INTERVAL = 15000; // 15 секунд (ми виправили ліміт)

// 2. БЕРЕМО СЕКРЕТИ З RENDER (з Environment)
const API_TOKEN = process.env.API_TOKEN;
const DATABASE_URL = process.env.DATABASE_URL;

// Налаштування "Блокнота" (Neon DB)
const dbClient = new pg.Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false } // Потрібно для Neon
});

// --- СХОВИЩЕ ДАНИХ (в оперативній пам'яті) ---
let cachedAlertString = ""; 
let previousAlertStates = {}; // Стан "до цього"
let dnaCounter = 107000; // Базовий лічильник
let lastError = null; // 🔴 <-- ДОДАЙ ЦЕЙ РЯДОК

// === ЛОГІКА СИМУЛЯЦІЇ (ТЕПЕР ЖИВЕ У "МОЗКУ") ===
const KAB_TIMER_AVG_INTERVAL = 3600000; // 1 година
let nextKabSalvoTime = 0; 
const CATALYST_CHANCE = 6; // 6% шанс

// Координати (ми маємо їх дублювати тут)
const launchPoints = {
  'Belgorod_Bryansk': { lon: 36.5, lat: 50.5, r: 0.5 },
  'Primorsko_Akhtarsk': { lon: 38.1, lat: 46.0, r: 0.5 },
  'Crimea': { lon: 34.4, lat: 45.5, r: 0.5 },
  'Black_Sea': { lon: 32.0, lat: 46.0, r: 0.5 },
  'Caspian_Sea': { lon: 48.0, lat: 46.0, r: 0.5 }
  // Білорусь виключена з Каталізатора
};
const targetNodes = {
  frontline: [{ lon: 37.5, lat: 49.8 }, { lon: 37.8, lat: 48.5 }, { lon: 35.8, lat: 47.5 }, { lon: 33.0, lat: 46.7 }],
  kyiv: [{ lon: 30.52, lat: 50.45 }],
  southern: [{ lon: 30.72, lat: 46.48 }, { lon: 31.99, lat: 46.97 }],
  central: [{ lon: 28.68, lat: 48.29 }, { lon: 32.26, lat: 48.45 }, { lon: 28.46, lat: 49.23 }],
  western: [{ lon: 24.02, lat: 49.83 }, { lon: 25.59, lat: 49.55 }, { lon: 24.71, lat: 48.92 }]
};
const REGION_UIDS = {
  kyiv: [31], southern: [17, 18], western: [27, 13, 21], central: [36, 15, 24, 10]
};
// === КІНЕЦЬ ЛОГІКИ СИМУЛЯЦІЇ ===


// --- ГОЛОВНА ФУНКЦІЯ ЗАПУСКУ ---
async function startServer() {
  // 1. ПІДКЛЮЧАЄМОСЬ ДО БАЗИ ДАНИХ
  try {
    await dbClient.connect();
    console.log('✅ (Neon) Успішно підключено до "Пам\'яті"');
    
    // 2. СТВОРЮЄМО ТАБЛИЦЮ (якщо її немає)
    await dbClient.query(`
      CREATE TABLE IF NOT EXISTS scars (
        id SERIAL PRIMARY KEY,
        start_lon FLOAT,
        start_lat FLOAT,
        end_lon FLOAT,
        end_lat FLOAT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ (Neon) Таблиця "scars" готова.');

    // 3. РАХУЄМО, СКІЛЬКИ ШРАМІВ ВЖЕ Є В ПАМ'ЯТІ
    const result = await dbClient.query('SELECT COUNT(*) FROM scars');
    dnaCounter = 107000 + parseInt(result.rows[0].count);
    console.log(`✅ (Logic) Початковий лічильник шрамів: ${dnaCounter}`);

  } catch (err) {
    console.error('❌ ПОМИЛКА ПІДКЛЮЧЕННЯ ДО БАЗИ NEON:', err.message);
    return; // Не запускаємо сервер, якщо "пам'ять" не працює
  }

  // --- НАЛАШТУВАННЯ СЕРВЕРА (Express) ---
  app.use(cors()); 
  app.use(express.static('.')); // Віддаємо index.html та sketch.js

  // --- API МАРШРУТИ ДЛЯ "ХУДОЖНИКА" ---
  
  // 1. Віддає статус тривоги (для годинника)
  app.get('/get-alert-status', (req, res) => {
    if (lastError) res.status(500).send(lastError);
    else {
      res.header('Content-Type', 'text/plain');
      res.send(cachedAlertString);
    }
  });

  // 2. Віддає ВСІ шрами з "Пам'яті" (Neon)
  app.get('/get-all-scars', async (req, res) => {
    try {
      const result = await dbClient.query('SELECT start_lon, start_lat, end_lon, end_lat FROM scars ORDER BY id ASC');
      // Віддаємо лічильник ТА масив шрамів
      res.json({
        dnaCounter: dnaCounter,
        scars: result.rows 
      });
    } catch (err) {
      console.error('❌ Помилка читання з Neon:', err.message);
      res.status(500).json({ error: 'Помилка "Пам\'яті"' });
    }
  });

  // --- ЗАПУСК ФОНОВИХ ПРОЦЕСІВ (КАБи ТА API) ---
  pollExternalApi(); // Перевіряємо API
  setInterval(pollExternalApi, POLLING_INTERVAL);
  
nextKabSalvoTime = Date.now() + Math.random() * 900000; // 0-15 хв
simulateKabs(); // Запускаємо симуляцію КАБів

  // --- ЗАПУСК СЕРВЕРА ---
  app.listen(PORT, () => {
    console.log(`=================================================`);
    console.log(`Проєкт "Шрами" (v3.0 з Пам'яттю) запущено на http://localhost:${PORT}`);
    console.log(`=================================================`);
  });
}

// === ЛОГІКА "МОЗКУ" (Працює 24/7) ===

// 1. ПУЛЬС API (Перевіряє тривоги)
async function pollExternalApi() {
  try {
    const response = await axios.get('https://api.alerts.in.ua/v1/iot/active_air_raid_alerts.json', {
      headers: { 'Authorization': 'Bearer ' + API_TOKEN }
    });
    cachedAlertString = response.data; 
    lastError = null; 
    console.log(`Пульс (IoT): Отримано рядок статусу, довжина: ${cachedAlertString.length}`);
    
    // ОБРОБЛЯЄМО ТРИГЕРИ ПРЯМО ТУТ
    processAlertString(cachedAlertString);

  } catch (error) {
    if (error.response) console.error('Помилка API (IoT):', error.response.status);
    else console.error('Помилка (IoT):', error.message);
    lastError = "Помилка API";
  }
}

// 2. СИМУЛЯЦІЯ КАБІВ (Таймер)
async function simulateKabs() {
  let now = Date.now();
  if (now > nextKabSalvoTime) {
    console.log(`--- СИМУЛЯЦІЯ КАБ: Запускаємо залп на лінію фронту ---`);
    let salvoSize = Math.floor(Math.random() * (10 - 4) + 4); // 4-9
    
    // Генеруємо та ЗБЕРІГАЄМО шрами
    await generateAndStoreScars('Belgorod_Bryansk', 'frontline', salvoSize);

    // Встановлюємо новий час
    let nextInterval = KAB_TIMER_AVG_INTERVAL + (Math.random() - 0.5) * 3600000; // +/- 30 хв
    nextKabSalvoTime = now + nextInterval;
  }
  
  // Перевіряємо знову через хвилину
  setTimeout(simulateKabs, 60000); 
}

// 3. ОБРОБКА ТРИВОГ (Каталізатор)
function processAlertString(alertString) {
  if (!alertString || alertString.length < 50) return; 

  for (const regionKey in REGION_UIDS) {
    const uids = REGION_UIDS[regionKey]; 
    let isRegionCurrentlyActive = uids.some(uid => alertString.charAt(uid) === 'A');
    let wasRegionActive = previousAlertStates[regionKey] || false;

    if (isRegionCurrentlyActive && !wasRegionActive) {
      console.log(`!!! КАТАЛІЗАТОР: НОВА ТРИВОГА в ${regionKey.toUpperCase()}`);
      triggerCatalystSalvo(regionKey); // Кидаємо кубик
    }
    previousAlertStates[regionKey] = isRegionCurrentlyActive;
  }
}

// 4. КИДОК КУБИКА (6% шанс)
async function triggerCatalystSalvo(regionKey) {
  if (Math.random() * 100 < CATALYST_CHANCE) {
    console.log(`!!! УСПІХ (6%): Запускаємо симуляцію для ${regionKey.toUpperCase()}`);
    let salvoSize = Math.floor(Math.random() * (140 - 100) + 100); // 100-140
    let startKey = ['Belgorod_Bryansk', 'Primorsko_Akhtarsk', 'Crimea', 'Black_Sea', 'Caspian_Sea'][Math.floor(Math.random() * 5)];
    
    // Генеруємо та ЗБЕРІГАЄМО шрами
    await generateAndStoreScars(startKey, regionKey, salvoSize);

  } else {
    console.log(`--- (94%): "Кубик" не випав для ${regionKey.toUpperCase()}`);
  }
}

// 5. ФУНКЦІЯ ЗБЕРЕЖЕННЯ В "ПАМ'ЯТЬ" (Neon)
async function generateAndStoreScars(startKey, regionKey, amount) {
  const startCluster = launchPoints[startKey];
  const targetGroup = targetNodes[regionKey];
  if (!startCluster || !targetGroup) return;

  let newScars = [];
  for (let i = 0; i < amount; i++) {
    // Генеруємо координати (чиста математика, без p5.js)
    let start = { lon: startCluster.lon + (Math.random() - 0.5) * startCluster.r * 2, lat: startCluster.lat + (Math.random() - 0.5) * startCluster.r * 2 };
    let endTarget = targetGroup[Math.floor(Math.random() * targetGroup.length)];
    let end = { lon: endTarget.lon + (Math.random() - 0.5) * 0.2, lat: endTarget.lat + (Math.random() - 0.5) * 0.2 }; // Маленький розкид
    
    newScars.push(start.lon, start.lat, end.lon, end.lat);
  }

  // Створюємо ОДИН великий запит до бази даних
  const queryText = `INSERT INTO scars (start_lon, start_lat, end_lon, end_lat) VALUES ${
    new Array(amount).fill(0).map((_, i) => 
      `($${i*4+1}, $${i*4+2}, $${i*4+3}, $${i*4+4})`
    ).join(',')
  }`;

  try {
    await dbClient.query(queryText, newScars);
    dnaCounter += amount; // Збільшуємо лічильник
    console.log(`✅ (Neon) Успішно збережено ${amount} нових шрамів. Лічильник: ${dnaCounter}`);
  } catch (err) {
    console.error('❌ Помилка запису в Neon:', err.message);
  }
}

// === ЗАПУСКАЄМО ВСЕ ===
startServer();