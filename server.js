// === server.js (Фінальна Версія v4.0 - Повний "Каталізатор") ===

import express from 'express'; 
import axios from 'axios'; 
import cors from 'cors'; 
import pg from 'pg'; 

// --- НАЛАШТУВАННЯ ---
const app = express();
const PORT = 3001; 
const POLLING_INTERVAL = 15000; 

// --- СЕКРЕТИ З RENDER ---
const API_TOKEN = process.env.API_TOKEN;
const DATABASE_URL = process.env.DATABASE_URL;

// --- НАЛАШТУВАННЯ БАЗИ NEON ---
const dbClient = new pg.Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});
dbClient.on('error', (err) => {
  console.error('❌ (Neon) ВТРАЧЕНО ЗВ\'ЯЗОК ІЗ "ПАМ\'ЯТТЮ"!', err.message);
});
async function queryDatabase(queryText, values) {
  try {
    const result = await dbClient.query(queryText, values);
    return result;
  } catch (err) {
    console.error('❌ (Neon) Помилка запиту до бази:', err.message);
    throw err; 
  }
}
// --- КІНЕЦЬ НАЛАШТУВАННЯ БАЗИ ---

// --- СХОВИЩЕ ДАНИХ (в оперативній пам'яті) ---
let cachedAlertString = ""; 
let previousAlertStates = {}; // Стан "до цього"
let dnaCounter = 107000; 
let lastError = null; 

// === ЛОГІКА СИМУЛЯЦІЇ (ТЕПЕР ЖИВЕ У "МОЗКУ") ===
const KAB_TIMER_AVG_INTERVAL = 3600000; // 1 година
let nextKabSalvoTime = 0; 
const CATALYST_CHANCE = 100; // 6% шанс

// 🔴 === НОВА ЛОГІКА "КАТАЛІЗАТОРА" ===

// 1. Всі 24 "чисті" області, які ми відстежуємо
// (всі, окрім 16(Луг), 28(Дон), 29(Крим), 30(Севаст))
const REGION_UIDS_TO_WATCH = [
  31, 8, 36, 44, 10, 11, 12, 14, 15, 27, 17, 18, 19, 5, 20, 
  21, 22, 23, 3, 24, 26, 25, 13, 6, 9, 4, 7
];

// 2. Координати запуску
const launchPoints = {
  'Belgorod_Bryansk': { lon: 36.5, lat: 50.5, r: 0.5 },
  'Primorsko_Akhtarsk': { lon: 38.1, lat: 46.0, r: 0.5 },
  'Crimea': { lon: 34.4, lat: 45.5, r: 0.5 },
  'Black_Sea': { lon: 32.0, lat: 46.0, r: 0.5 },
  'Caspian_Sea': { lon: 48.0, lat: 46.0, r: 0.5 }
};

// 3. Координати цілей
const targetNodes = {
  frontline: [{ lon: 37.5, lat: 49.8 }, { lon: 37.8, lat: 48.5 }, { lon: 35.8, lat: 47.5 }, { lon: 33.0, lat: 46.7 }],
  kyiv: [{ lon: 30.52, lat: 50.45 }],
  southern: [{ lon: 30.72, lat: 46.48 }, { lon: 31.99, lat: 46.97 }],
  central: [{ lon: 28.68, lat: 48.29 }, { lon: 32.26, lat: 48.45 }, { lon: 28.46, lat: 49.23 }],
  western: [{ lon: 24.02, lat: 49.83 }, { lon: 25.59, lat: 49.55 }, { lon: 24.71, lat: 48.92 }]
};
// === КІНЕЦЬ ЛОГІКИ СИМУЛЯЦІЇ ===


// --- ГОЛОВНА ФУНКЦІЯ ЗАПУСКУ ---
async function startServer() {
  try {
    await queryDatabase('SELECT NOW()'); 
    console.log('✅ (Neon) Успішно підключено до "Пам\'яті"');
    await queryDatabase(`
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
    const result = await queryDatabase('SELECT COUNT(*) FROM scars');
    dnaCounter = 107000 + parseInt(result.rows[0].count);
    console.log(`✅ (Logic) Початковий лічильник шрамів: ${dnaCounter}`);
    
    // Ініціалізуємо "попередній стан" для всіх 24 областей
    const apiResponse = await axios.get('https://api.alerts.in.ua/v1/iot/active_air_raid_alerts.json', { headers: { 'Authorization': 'Bearer ' + API_TOKEN }});
    cachedAlertString = apiResponse.data;
    for (const uid of REGION_UIDS_TO_WATCH) {
      previousAlertStates[uid] = (cachedAlertString.charAt(uid) === 'A');
    }
    console.log('✅ (Logic) "Каталізатор" ініціалізовано. Відстежуємо 24 області.');

  } catch (err) {
    console.error('❌ ПОМИЛКА ПІДКЛЮЧЕННЯ (API або NEON):', err.message);
    lastError = "ПОМИЛКА БАЗИ ДАНИХ АБО API";
  }

  // --- НАЛАШТУВАННЯ СЕРВЕРА (Express) ---
  app.use(cors()); 
  app.use(express.static('.')); 

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
      const result = await queryDatabase('SELECT id, start_lon, start_lat, end_lon, end_lat, created_at FROM scars ORDER BY id ASC');
      res.json({
        dnaCounter: dnaCounter,
        scars: result.rows 
      });
    } catch (err) {
      res.status(500).json({ error: 'Помилка "Пам\'яті"' });
    }
  });

  // 3. Віддає ТІЛЬКИ НОВІ шрами
  app.get('/get-new-scars', async (req, res) => {
    const lastId = parseInt(req.query.lastId) || 0; 
    try {
      const result = await queryDatabase(
        'SELECT id, start_lon, start_lat, end_lon, end_lat, created_at FROM scars WHERE id > $1 ORDER BY id ASC',
        [lastId]
      );
      res.json({
        dnaCounter: dnaCounter, 
        newScars: result.rows 
      });
    } catch (err) {
      res.status(500).json({ error: 'Помилка "Пам\'яті"' });
    }
  });

  // --- ЗАПУСК ФОНОВИХ ПРОЦЕСІВ (КАБи ТА API) ---
  setInterval(pollExternalApi, POLLING_INTERVAL); // Перевіряємо API
  
  nextKabSalvoTime = Date.now() + Math.random() * 900000; // 0-15 хв
  simulateKabs(); // Запускаємо симуляцію КАБів

  // --- ЗАПУСК СЕРВЕРА ---
  app.listen(PORT, () => {
    console.log(`=================================================`);
    console.log(`Проєкт "Шрами" (v4.0 Фінальна) запущено на http://localhost:${PORT}`);
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
    
    // 🔴 ОБРОБЛЯЄМО ТРИГЕРИ (НОВА ЛОГІКА)
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
    console.log(`--- (Двигун А) СИМУЛЯЦІЯ КАБ: Запускаємо залп на лінію фронту ---`);
    let salvoSize = Math.floor(Math.random() * (10 - 4) + 4); // 4-9
    await generateAndStoreScars('Belgorod_Bryansk', 'frontline', salvoSize);
    let nextInterval = KAB_TIMER_AVG_INTERVAL + (Math.random() - 0.5) * 3600000; // +/- 30 хв
    nextKabSalvoTime = now + nextInterval;
  }
  setTimeout(simulateKabs, 60000); 
}

// 3. 🔴 ОБРОБКА ТРИВОГ (НОВА ЛОГІКА: 24 області)
function processAlertString(alertString) {
  if (!alertString || alertString.length < 50) return; 

  // Перебираємо КОЖНУ з 24 "чистих" областей
  for (const uid of REGION_UIDS_TO_WATCH) {
    let isRegionCurrentlyActive = (alertString.charAt(uid) === 'A');
    let wasRegionActive = previousAlertStates[uid] || false; // (H=false, A=true)

    // Якщо H -> A, це "подія"
    if (isRegionCurrentlyActive && !wasRegionActive) {
      console.log(`!!! (Двигун Б) КАТАЛІЗАТОР: НОВА ТРИВОГА в UID: ${uid}`);
      triggerCatalystRolls(); // Кидаємо кубик
    }
    
    // Оновлюємо "попередній" стан
    previousAlertStates[uid] = isRegionCurrentlyActive;
  }
}

// 4. 🔴 КИДОК КУБИКА №1 (6% шанс)
async function triggerCatalystRolls() {
  if (Math.random() * 100 < CATALYST_CHANCE) {
    // УСПІХ! Це "бойова" подія.
    
    // Кидаємо кубик №2 (Розподіл)
    const r = Math.random() * 100;
    let targetKey;

    // (5/5/8.5/1.5) -> (25 / 25 / 42.5 / 7.5)
    if (r < 25.0) { // 25%
      targetKey = 'kyiv';
    } else if (r < 50.0) { // 25%
      targetKey = 'southern';
    } else if (r < 92.5) { // 42.5%
      targetKey = 'central';
    } else { // 7.5%
      targetKey = 'western';
    }

    console.log(`!!! (Двигун Б) УСПІХ (6%): Кидок №2 -> Ціль: ${targetKey.toUpperCase()}`);
    let salvoSize = Math.floor(Math.random() * (140 - 100) + 100); // 100-140
    let startKey = ['Belgorod_Bryansk', 'Primorsko_Akhtarsk', 'Crimea', 'Black_Sea', 'Caspian_Sea'][Math.floor(Math.random() * 5)];
    
    // Генеруємо та ЗБЕРІГАЄМО шрами
    await generateAndStoreScars(startKey, targetKey, salvoSize);

  } else {
    console.log(`--- (Двигун Б) (94%): "Кубик" не випав (хибна тривога).`);
  }
}

// 5. ФУНКЦІЯ ЗБЕРЕЖЕННЯ В "ПАМ'ЯТЬ" (Neon)
async function generateAndStoreScars(startKey, regionKey, amount) {
  const startCluster = launchPoints[startKey];
  const targetGroup = targetNodes[regionKey];
  if (!startCluster || !targetGroup) return;

  let newScars = [];
  for (let i = 0; i < amount; i++) {
    // Генеруємо координати
    let start = { lon: startCluster.lon + (Math.random() - 0.5) * startCluster.r * 2, lat: startCluster.lat + (Math.random() - 0.5) * startCluster.r * 2 };
    let endTarget = targetGroup[Math.floor(Math.random() * targetGroup.length)];
    let end = { lon: endTarget.lon + (Math.random() - 0.5) * 0.2, lat: endTarget.lat + (Math.random() - 0.5) * 0.2 }; 
    newScars.push(start.lon, start.lat, end.lon, end.lat);
  }

  const queryText = `INSERT INTO scars (start_lon, start_lat, end_lon, end_lat) VALUES ${
    new Array(amount).fill(0).map((_, i) => 
      `($${i*4+1}, $${i*4+2}, $${i*4+3}, $${i*4+4})`
    ).join(',')
  }`;

  try {
    await queryDatabase(queryText, newScars);
    dnaCounter += amount; // Збільшуємо лічильник
    console.log(`✅ (Neon) Успішно збережено ${amount} нових шрамів. Лічильник: ${dnaCounter}`);
  } catch (err) {
    console.error('❌ Помилка запису в Neon (шрами не збережено!):', err.message);
  }
}

// === ЗАПУСКАЄМО ВСЕ ===
startServer();