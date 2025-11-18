// === server.js (Фінальна Версія v6.1 - "Кешована Галерея" + Playback) ===
// (Цей код ТІЛЬКИ показує сайт і віддає дані з кешу)

import express from 'express'; 
import cors from 'cors'; 
import pg from 'pg'; 

// --- НАЛАШТУВАННЯ ---
const app = express();
const PORT = 3001; 
const CACHE_REFRESH_INTERVAL = 15000; // 15 секунд

// --- СЕКРЕТИ З RENDER ---
const DATABASE_URL = process.env.DATABASE_URL;

// --- НАЛАШТУВАННЯ БАЗИ NEON ---
const dbClient = new pg.Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});
dbClient.on('error', (err) => {
  console.error('❌ (Галерея/Neon) ВТРАЧЕНО ЗВ\'ЯЗОК ІЗ "ПАМ\'ЯТТЮ"!', err.message);
});
async function queryDatabase(queryText, values) {
  try {
    const result = await dbClient.query(queryText, values);
    return result;
  } catch (err) {
    console.error('❌ (Галерея/Neon) Помилка запиту до бази:', err.message);
    throw err; 
  }
}
// --- КІНЕЦЬ НАЛАШТУВАННЯ БАЗИ ---

// 🔴 === НАШ "СТІЛ" (КЕШ) ===
let cachedAlertString = "";
let cachedDnaCounter = 107000;
let allCachedScars = []; // Тут "живуть" всі 100,000+ шрамів
// === КІНЕЦЬ КЕШУ ===

// --- ГОЛОВНА ФУНКЦІЯ ЗАПУСКУ ---
async function startGallery() {
  // 1. ПІДКЛЮЧАЄМОСЬ ДО БАЗИ ДАНИХ
  try {
    await queryDatabase('SELECT NOW()'); 
    console.log('✅ (Галерея) Успішно підключено до "Пам\'яті"');

    // Створюємо таблиці (про всяк випадок, якщо "Галерея" запуститься раніше "Мозку")
    await queryDatabase(`CREATE TABLE IF NOT EXISTS scars (id SERIAL PRIMARY KEY, start_lon FLOAT, start_lat FLOAT, end_lon FLOAT, end_lat FLOAT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`);
    await queryDatabase(`CREATE TABLE IF NOT EXISTS system_state (key TEXT PRIMARY KEY, value TEXT);`);
    console.log('✅ (Галерея) Таблиці "scars" та "system_state" готові.');

    // 2. 🔴 ЗАПОВНЮЄМО КЕШ ПЕРШИЙ РАЗ
    await refreshCache();
    
    // 3. 🔴 ЗАПУСКАЄМО ТАЙМЕР ОНОВЛЕННЯ КЕШУ
    setInterval(refreshCache, CACHE_REFRESH_INTERVAL);

  } catch (err) {
    console.error('❌ ПОМИЛКА ПІДКЛЮЧЕННЯ (Галерея/Neon):', err.message);
  }

  // --- НАЛАШТУВАННЯ СЕРВЕРА (Express) ---
  
  // 🔴 === ВИПРАВЛЕННЯ ДЛЯ PLAYBACK.HTML ===
  // 💡 ВАЖЛИВО: Спочатку віддаємо файли (index.html, playback.html, sketch.js)
  // Цей рядок має бути ПЕРЕД 'cors()'
  app.use(express.static('.')); 
  
  app.use(cors()); 
  // === КІНЕЦЬ ВИПРАВЛЕННЯ ===


  // --- 🔴 API МАРШРУТИ ДЛЯ "ХУДОЖНИКА" (Тепер читають з КЕШУ) ---
  
  // 1. Віддає статус тривоги (з кешу)
  app.get('/get-alert-status', (req, res) => {
    res.header('Content-Type', 'text/plain');
    res.send(cachedAlertString);
  });

  // 2. Віддає ВСІ шрами з "Пам'яті" (з кешу)
  app.get('/get-all-scars', (req, res) => {
    // 🔴 МИТТЄВО віддаємо те, що в кеші
    res.json({
      dnaCounter: cachedDnaCounter,
      scars: allCachedScars 
    });
  });

  // 3. Віддає ТІЛЬКИ НОВІ шрами (фільтрує кеш)
  app.get('/get-new-scars', (req, res) => {
    const lastId = parseInt(req.query.lastId) || 0; 
    
    // 🔴 Фільтруємо наш кеш, А НЕ базу даних
    const newScars = allCachedScars.filter(scar => scar.id > lastId);
    
    res.json({
      dnaCounter: cachedDnaCounter, 
      newScars: newScars 
    });
  });

  // 🔴 === НОВИЙ МАРШРУТ ДЛЯ "ПРОГРАВАЧА" ===
  app.get('/get-playback-data', async (req, res) => {
    console.log("(Playback) Отримано запит на 14-денну історію...");
    try {
      // Встановлюємо дату "14 днів тому"
      const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
      
      // Робимо запит до Neon: дай всі шрами, новіші за цю дату,
      // і СОРТУЄМО їх за часом, від старого до нового.
      const result = await queryDatabase(
        "SELECT start_lon, start_lat, end_lon, end_lat, created_at FROM scars WHERE created_at >= $1 ORDER BY created_at ASC",
        [fourteenDaysAgo]
      );
      
      res.json(result.rows); // Відправляємо всі знайдені шрами (це може бути великий файл)
      console.log(`(Playback) Відправлено ${result.rows.length} шрамів.`);
      
    } catch (err) {
      console.error('❌ (Playback) Помилка запиту до бази:', err.message);
      res.status(500).json({ error: 'Помилка сервера' });
    }
  });
  // === КІНЕЦЬ НОВОГО МАРШРУТУ ===

  // --- ЗАПУСК СЕРВЕРА "ГАЛЕРЕЇ" ---
  app.listen(PORT, () => {
    console.log(`=================================================`);
    console.log(`Проєкт "Шрами" (v6.1 "Кешована Галерея") запущено на http://localhost:${PORT}`);
    console.log(`=================================================`);
  });
}

// 🔴 === НОВА ФУНКЦІЯ ОНОВЛЕННЯ КЕШУ ===
async function refreshCache() {
  // console.log('(Cache) Оновлюємо кеш...');
  try {
    // 1. Оновлюємо рядок тривоги
    const alertResult = await queryDatabase("SELECT value FROM system_state WHERE key = 'current_alert_string'");
    if (alertResult.rows.length > 0) {
      cachedAlertString = alertResult.rows[0].value;
    }

    // 2. Оновлюємо ВСІ шрами
    const scarsResult = await queryDatabase('SELECT id, start_lon, start_lat, end_lon, end_lat, created_at FROM scars ORDER BY id ASC');
    allCachedScars = scarsResult.rows;
    
    // 3. Оновлюємо лічильник
    cachedDnaCounter = 107000 + allCachedScars.length;
    
    // console.log(`(Cache) Кеш оновлено. Шрамів: ${cachedDnaCounter}`);
  } catch (err) {
    console.error('❌ (Cache) Помилка оновлення кешу:', err.message);
  }
}

// === ЗАПУСКАЄМО "ГАЛЕРЕЮ" ===
startGallery();