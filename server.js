// === server.js (Фінальна Стійка Версія v5.2 - "Галерея") ===
// (🔴 ВИПРАВЛЕННЯ: Тепер "Галерея" ТАКОЖ створює 'system_state')

import express from 'express'; 
import cors from 'cors'; 
import pg from 'pg'; 

// --- НАЛАШТУВАННЯ ---
const app = express();
const PORT = 3001; 

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

// --- ГОЛОВНА ФУНКЦІЯ ЗАПУСКУ ---
async function startGallery() {
  // 1. ПІДКЛЮЧАЄМОСЬ ДО БАЗИ ДАНИХ
  try {
    await queryDatabase('SELECT NOW()'); 
    console.log('✅ (Галерея) Успішно підключено до "Пам\'яті"');

    // 🔴 === ОСЬ ВИПРАВЛЕННЯ ===
    //    Тепер "Галерея" теж створює ОБИДВІ таблиці,
    //    щоб "Художник" (Cron Job) не обігнав її.
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
    await queryDatabase(`
      CREATE TABLE IF NOT EXISTS system_state (
        key TEXT PRIMARY KEY,
        value TEXT
      );
    `);
    console.log('✅ (Галерея) Таблиці "scars" та "system_state" готові.');
    // === КІНЕЦЬ ВИПРАВЛЕННЯ ===

  } catch (err) {
    console.error('❌ ПОМИЛКА ПІДКЛЮЧЕННЯ (Галерея/Neon):', err.message);
  }

  // --- НАЛАШТУВАННЯ СЕРВЕРА (Express) ---
  app.use(cors()); 
  app.use(express.static('.')); // Віддаємо index.html та sketch.js

  // --- API МАРШРУТИ ДЛЯ "ХУДОЖНИКА" ---
  
  // 1. Віддає статус тривоги (читає з бази, що зберіг "Художник")
  app.get('/get-alert-status', async (req, res) => {
    try {
      const result = await queryDatabase("SELECT value FROM system_state WHERE key = 'current_alert_string'");
      if (result.rows.length > 0) {
        res.header('Content-Type', 'text/plain');
        res.send(result.rows[0].value);
      } else {
        res.header('Content-Type', 'text/plain');
        res.send(""); // Віддаємо порожній рядок, якщо "Художник" ще нічого не зберіг
      }
    } catch(err) {
      res.status(500).send("ПОМИЛКА БАЗИ ДАНИХ");
    }
  });

  // 2. Віддає ВСІ шрами з "Пам'яті" (Neon)
  app.get('/get-all-scars', async (req, res) => {
    try {
      // Одночасно запитуємо і шрами, і лічильник
      const scarsResult = await queryDatabase('SELECT id, start_lon, start_lat, end_lon, end_lat, created_at FROM scars ORDER BY id ASC');
      const countResult = await queryDatabase('SELECT COUNT(*) FROM scars');
      const dnaCounter = 107000 + parseInt(countResult.rows[0].count);
      
      res.json({
        dnaCounter: dnaCounter,
        scars: scarsResult.rows 
      });
    } catch (err) {
      res.status(500).json({ error: 'Помилка "Пам\'яті"' });
    }
  });

  // 3. Віддає ТІЛЬКИ НОВІ шрами
  app.get('/get-new-scars', async (req, res) => {
    const lastId = parseInt(req.query.lastId) || 0; 
    try {
      const scarsResult = await queryDatabase(
        'SELECT id, start_lon, start_lat, end_lon, end_lat, created_at FROM scars WHERE id > $1 ORDER BY id ASC',
        [lastId]
      );
      const countResult = await queryDatabase('SELECT COUNT(*) FROM scars');
      const dnaCounter = 107000 + parseInt(countResult.rows[0].count);
      
      res.json({
        dnaCounter: dnaCounter, 
        newScars: scarsResult.rows 
      });
    } catch (err) {
      res.status(500).json({ error: 'Помилка "Пам\'яті"' });
    }
  });

  // --- ЗАПУСК СЕРВЕРА "ГАЛЕРЕЇ" ---
  app.listen(PORT, () => {
    console.log(`=================================================`);
    console.log(`Проєкт "Шрами" (v5.2 "Галерея") запущено на http://localhost:${PORT}`);
    console.log(`=================================================`);
  });
}

// === ЗАПУСКАЄМО "ГАЛЕРЕЮ" ===
startGallery();