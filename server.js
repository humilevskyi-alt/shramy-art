// === server.js (Фінальна Стійка Версія v3.2 - з "Живим" оновленням) ===

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
let previousAlertStates = {}; 
let dnaCounter = 107000; 
let lastError = null; 

// === ЛОГІКА СИМУЛЯЦІЇ (без змін) ===
const KAB_TIMER_AVG_INTERVAL = 3600000; // 1 година
let nextKabSalvoTime = 0; 
const CATALYST_CHANCE = 6; // 6% шанс
const launchPoints = {
  'Belgorod_Bryansk': { lon: 36.5, lat: 50.5, r: 0.5 },
  'Primorsko_Akhtarsk': { lon: 38.1, lat: 46.0, r: 0.5 },
  'Crimea': { lon: 34.4, lat: 45.5, r: 0.5 },
  'Black_Sea': { lon: 32.0, lat: 46.0, r: 0.5 },
  'Caspian_Sea': { lon: 48.0, lat: 46.0, r: 0.5 }
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
  } catch (err) {
    console.error('❌ ПОМИЛКА ПІДКЛЮЧЕННЯ ДО БАЗИ NEON:', err.message);
    lastError = "ПОМИЛКА БАЗИ ДАНИХ";
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
      // 🔴 ВАЖЛИВО: Тепер ми також надсилаємо ID
      const result = await queryDatabase('SELECT id, start_lon, start_lat, end_lon, end_lat, created_at FROM scars ORDER BY id ASC');
      res.json({
        dnaCounter: dnaCounter,
        scars: result.rows 
      });
    } catch (err) {
      res.status(500).json({ error: 'Помилка "Пам\'яті"' });
    }
  });

  // 3. 🔴 === НОВИЙ МАРШРУТ ===
  //    Віддає ТІЛЬКИ НОВІ шрами (новіші за той ID, що надіслав "Художник")
  app.get('/get-new-scars', async (req, res) => {
    // "Художник" питає: /get-new-scars?lastId=12
    const lastId = parseInt(req.query.lastId) || 0; 
    
    try {
      const result = await queryDatabase(
        'SELECT id, start_lon, start_lat, end_lon, end_lat, created_at FROM scars WHERE id > $1 ORDER BY id ASC',
        [lastId]
      );
      res.json({
        dnaCounter: dnaCounter, // Надсилаємо оновлений лічильник
        newScars: result.rows // Надсилаємо ТІЛЬКИ нові
      });
    } catch (err) {
      res.status(500).json({ error: 'Помилка "Пам\'яті"' });
    }
  });
  // === КІНЕЦЬ НОВОГО МАРШРУТУ ===


  // --- ЗАПУСК ФОНОВИХ ПРОЦЕСІВ (КАБи ТА API) ---
  pollExternalApi(); 
  setInterval(pollExternalApi, POLLING_INTERVAL);
  
  nextKabSalvoTime = Date.now() + Math.random() * 900000; // 0-15 хв
  simulateKabs(); 

  // --- ЗАПУСК СЕРВЕРА ---
  app.listen(PORT, () => {
    console.log(`=================================================`);
    console.log(`Проєкт "Шрами" (v3.2 "Живий") запущено на http://localhost:${PORT}`);
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
    await generateAndStoreScars('Belgorod_Bryansk', 'frontline', salvoSize);
    let nextInterval = KAB_TIMER_AVG_INTERVAL + (Math.random() - 0.5) * 3600000; // +/- 30 хв
    nextKabSalvoTime = now + nextInterval;
  }
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