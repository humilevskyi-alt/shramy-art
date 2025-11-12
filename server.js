// === server.js (Версія "Каталізатор" - працює з /v1/iot/) ===

import express from 'express'; 
import axios from 'axios'; // Використовуємо axios, він вже встановлений
import cors from 'cors'; 

// --- НАЛАШТУВАННЯ ---
const app = express();
const PORT = 3001; 
const API_TOKEN = '75425d14cbb6082d33e8c96afa556c2f107cee82ab2203'; // 🔴 ВАЖЛИВО!

// 1. ПРАВИЛЬНИЙ API ЕНДПОІНТ (з твого скріншоту Node.js)
const ALERTS_API_URL = 'https://api.alerts.in.ua/v1/iot/active_air_raid_alerts.json'; 
const POLLING_INTERVAL = 15000; // 10 секунд (як в документації)

// --- СХОВИЩЕ ДАНИХ ---
let cachedAlertString = ""; // Тепер ми зберігаємо простий РЯДОК
let lastError = null;

// --- НАЛАШТУВАННЯ СЕРВЕРА ---
app.use(cors()); 
app.use(express.static('.')); // Віддаємо index.html та sketch.js

// --- НАШІ API МАРШРУТИ ---
app.get('/get-alerts', (req, res) => {
  // console.log('!!! API: /get-alerts спрацював!'); 
  if (lastError) {
    res.status(500).send(lastError); // Надсилаємо помилку як текст
  } else {
    // 2. ВІДДАЄМО РЯДОК ЯК "plain/text"
    res.header('Content-Type', 'text/plain');
    res.send(cachedAlertString);
  }
});

// --- "ПУЛЬС" СЕРВERA (Працює з /v1/iot/) ---
async function pollExternalApi() {
  // console.log('Пульс (IoT): Опитуємо .../v1/iot/...');
  try {
    const response = await axios.get(ALERTS_API_URL, {
      headers: { 
        'Authorization': 'Bearer ' + API_TOKEN
        // Для /v1/iot/ User-Agent не потрібен, він для Node.js
      }
    });

    // 3. ПРАВИЛЬНА ЛОГІКА:
    // API повертає один довгий рядок. Ми його просто зберігаємо.
    cachedAlertString = response.data; 
    lastError = null; 
    console.log(`Успіх (IoT). Отримано рядок статусу, довжина: ${cachedAlertString.length}`);

  } catch (error) {
    if (error.response) {
      console.error('Помилка API (IoT):', error.response.status, error.response.data);
      lastError = `Помилка API: ${error.response.status}`;
    } else {
      console.error('Помилка (IoT):', error.message);
      lastError = error.message;
    }
  }
}

// --- ЗАПУСК СЕРВERA ---
app.listen(PORT, () => {
  console.log(`=================================================`);
  console.log(`Проксі-сервер "Шрами" (Каталізатор) запущено на http://localhost:${PORT}`);
  console.log(`=================================================`);
  
  pollExternalApi(); 
  setInterval(pollExternalApi, POLLING_INTERVAL);
});