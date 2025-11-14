// === worker.js (v5.6 - "Виправлені КАБи") ===

import axios from 'axios'; 
import pg from 'pg'; 

// --- СЕКРЕТИ З RENDER ---
const API_TOKEN = process.env.API_TOKEN;
const DATABASE_URL = process.env.DATABASE_URL;

// --- НАЛАШТУВАННЯ БАЗИ NEON ---
const dbClient = new pg.Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});
dbClient.on('error', (err) => {
  console.error('❌ (Worker/Pool) Помилка "басейну" Neon!', err.message);
});
async function queryDatabase(queryText, values) {
  try {
    const result = await dbClient.query(queryText, values);
    return result;
  } catch (err) {
    console.error('❌ (Worker/Query) Помилка запиту до бази:', err.message);
    throw err; 
  }
}
// --- КІНЕЦЬ НАЛАШТУВАННЯ БАЗИ ---

// === ЛОГІКА СИМУЛЯЦІЇ (без змін) ===
const KAB_TIMER_AVG_INTERVAL = 3600000; // 1 година
const CATALYST_CHANCE = 6; // 6% шанс
const REGION_UIDS_TO_WATCH = [
  31, 8, 36, 44, 10, 11, 12, 14, 15, 27, 17, 18, 19, 5, 20, 
  21, 22, 23, 3, 24, 26, 25, 13, 6, 9, 4, 7
];
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
// === КІНЕЦЬ ЛОГІКИ СИМУЛЯЦІЇ ===

// --- ГОЛОВНА ФУНКЦІЯ "ХУДОЖНИКА" ---
async function runWorker() {
  console.log('--- (Worker) "Художник" прокинувся. Починаємо роботу... ---');
  let dbConnection;
  try {
    // 0. Підключаємось до "Пам'яті"
    dbConnection = await dbClient.connect();
    
    dbConnection.on('error', (err) => {
      console.error('❌ (Worker/Client) Клієнт Neon "заснув", але ми це зловили:', err.message);
    });
    
    console.log('✅ (Worker) Підключено до Neon.');

    // 1. Створюємо таблиці, якщо їх немає
    await dbConnection.query(`
      CREATE TABLE IF NOT EXISTS system_state (
        key TEXT PRIMARY KEY,
        value TEXT
      );
    `);
    await dbConnection.query(`
      CREATE TABLE IF NOT EXISTS scars (
        id SERIAL PRIMARY KEY,
        start_lon FLOAT,
        start_lat FLOAT,
        end_lon FLOAT,
        end_lat FLOAT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // 2. Запускаємо обидва "двигуни"
    await pollExternalApi(dbConnection); // Двигун Б (Каталізатор)
    await simulateKabs(dbConnection);    // Двигун А (КАБи)

  } catch (err) {
    console.error('❌ (Worker) КРИТИЧНА ПОМИЛКА:', err.message);
  } finally {
    if (dbConnection) {
      dbConnection.release(); // 3. Завжди закриваємо з'єднання
      console.log('✅ (Worker) З\'єднання з Neon закрито. "Художник" засинає.');
    }
  }
}

// === ДВИГУН Б: ПУЛЬС API (Перевіряє тривоги) ===
async function pollExternalApi(db) {
  let previousAlertStates = {};
  let isFirstRun = false; 

  // 1. Отримуємо "попередній" стан з бази даних
  try {
    const stateResult = await db.query("SELECT value FROM system_state WHERE key = 'alert_states'");
    if (stateResult.rows.length > 0) {
      previousAlertStates = JSON.parse(stateResult.rows[0].value);
    } else {
      console.log('(Logic) "Попередній" стан тривог не знайдено. Це ПЕРШИЙ ЗАПУСК.');
      isFirstRun = true; 
    }
  } catch (err) { console.error('! (Worker) Не вдалося прочитати "попередній" стан:', err.message); }

  // 2. Отримуємо "поточний" стан з API
  let cachedAlertString = "";
  try {
    const response = await axios.get('https://api.alerts.in.ua/v1/iot/active_air_raid_alerts.json', {
      headers: { 'Authorization': 'Bearer ' + API_TOKEN }
    });
    cachedAlertString = response.data; 
    console.log(`Пульс (IoT): Отримано рядок статусу, довжина: ${cachedAlertString.length}`);
    
    // 3. ЗБЕРІГАЄМО "поточний" стан у базу для "Галереї"
    await db.query(
      `INSERT INTO system_state (key, value) VALUES ('current_alert_string', $1)
       ON CONFLICT (key) DO UPDATE SET value = $1;`,
      [cachedAlertString]
    );

    // 4. ОБРОБЛЯЄМО ТРИГЕРИ (H -> A)
    let newPreviousStates = { ...previousAlertStates };
    if (cachedAlertString.length > 50) {
      for (const uid of REGION_UIDS_TO_WATCH) {
        let isRegionCurrentlyActive = (cachedAlertString.charAt(uid) === 'A');
        let wasRegionActive = previousAlertStates[uid] || false; 

        if (isRegionCurrentlyActive && !wasRegionActive && !isFirstRun) {
          console.log(`!!! (Двигун Б) КАТАЛІЗАТОР: НОВА ТРИВОГА в UID: ${uid}`);
          await triggerCatalystRolls(db); // Кидаємо кубик
        }
        
        newPreviousStates[uid] = isRegionCurrentlyActive;
      }
    }
    
    // 5. ЗБЕРІГАЄМО "новий попередній" стан назад у базу
    await db.query(
      `INSERT INTO system_state (key, value) VALUES ('alert_states', $1)
       ON CONFLICT (key) DO UPDATE SET value = $1;`,
      [JSON.stringify(newPreviousStates)]
    );

  } catch (error) {
    if (error.response) console.error('Помилка API (IoT):', error.response.status);
    else console.error('Помилка (IoT):', error.message);
  }
}

// === 🔴 ДВИГУН А: СИМУЛЯЦІЯ КАБІВ (ВИПРАВЛЕНО) ===
async function simulateKabs(db) {
  let nextKabSalvoTime = 0;
  let isFirstRun = false; 
  let now = Date.now();
  
  // 1. Отримуємо час НАСТУПНОГО залпу з бази
  try {
    const timeResult = await db.query("SELECT value FROM system_state WHERE key = 'next_kab_time'");
    if (timeResult.rows.length > 0) {
      nextKabSalvoTime = parseInt(timeResult.rows[0].value);
    } else {
      console.log('(Logic) Таймер КАБів не знайдено, створюємо новий...');
      isFirstRun = true;
      nextKabSalvoTime = now + Math.random() * 900000; // 0-15 хв
      
      // 🔴 === ОСЬ ВИПРАВЛЕННЯ: ===
      //    Негайно зберігаємо таймер, якщо це перший запуск
      await db.query(
        `INSERT INTO system_state (key, value) VALUES ('next_kab_time', $1)
         ON CONFLICT (key) DO UPDATE SET value = $1;`,
        [nextKabSalvoTime.toString()]
      );
      console.log(`(Двигун А) Перший запуск. Таймер встановлено. КАБи не запускаємо.`);
      // === КІНЕЦЬ ВИПРАВЛЕННЯ ===
    }
  } catch (err) { console.error('! (Worker) Не вдалося прочитати таймер КАБів:', err.message); }

  // 2. Перевіряємо, чи настав час
  if (now > nextKabSalvoTime) {
    // 🔴 ВИПРАВЛЕННЯ: Ми більше не перевіряємо isFirstRun, бо ми вже зберегли таймер
    console.log(`--- (Двигун А) СИМУЛЯЦІЯ КАБ: Запускаємо залп на лінію фронту ---`);
    let salvoSize = Math.floor(Math.random() * (10 - 4) + 4); // 4-9
    await generateAndStoreScars(db, 'Belgorod_Bryansk', 'frontline', salvoSize);
    
    // 3. Встановлюємо НОВИЙ час
    let nextInterval = KAB_TIMER_AVG_INTERVAL + (Math.random() - 0.5) * 3600000; // +/- 30 хв
    nextKabSalvoTime = now + nextInterval;
    
    // 4. ЗБЕРІГАЄМО НОВИЙ час назад у базу
    await db.query(
      `INSERT INTO system_state (key, value) VALUES ('next_kab_time', $1)
       ON CONFLICT (key) DO UPDATE SET value = $1;`,
      [nextKabSalvoTime.toString()]
    );
  } else {
    console.log(`(Двигун А) Ще не час для КАБів. Чекаємо...`);
  }
}

// --- ЛОГІКА КИДКІВ КУБИКА (Двигун Б) ---
async function triggerCatalystRolls(db) {
  if (Math.random() * 100 < CATALYST_CHANCE) {
    const r = Math.random() * 100;
    let targetKey;
    if (r < 25.0) { targetKey = 'kyiv'; }
    else if (r < 50.0) { targetKey = 'southern'; }
    else if (r < 92.5) { targetKey = 'central'; }
    else { targetKey = 'western'; }

    console.log(`!!! (Двигун Б) УСПІХ (6%): Кидок №2 -> Ціль: ${targetKey.toUpperCase()}`);
    let salvoSize = Math.floor(Math.random() * (140 - 100) + 100); // 100-140
    let startKey = ['Belgorod_Bryansk', 'Primorsko_Akhtarsk', 'Crimea', 'Black_Sea', 'Caspian_Sea'][Math.floor(Math.random() * 5)];
    await generateAndStoreScars(db, startKey, targetKey, salvoSize);
  } else {
    console.log(`--- (Двигун Б) (94%): "Кубик" не випав (хибна тривога).`);
  }
}

// --- ФУНКЦІЯ ЗБЕРЕЖЕННЯ В "ПАМ'ЯТЬ" (Neon) ---
async function generateAndStoreScars(db, startKey, regionKey, amount) {
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
    await db.query(queryText, newScars);
    console.log(`✅ (Neon) Успішно збережено ${amount} нових шрамів.`);
  } catch (err) {
    console.error('❌ Помилка запису в Neon (шрами не збережено!):', err.message);
  }
}

// === ЗАПУСКАЄМО "ХУДОЖНИКА" ===
runWorker();