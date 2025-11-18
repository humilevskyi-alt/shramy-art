// === sketch.js (Фінальна Версія v22.0 - "Cross-fade") ===

// --- ГЛОБАЛЬНІ ЗМІННІ ---
let citiesData;
let launchPoints = {}; 
let allCities = []; 
let staticMapBuffer; 
let scarColors = []; 
let dnaCounter = 107000; 
let liveAttacks = []; 
let lastKnownScarId = 0; 

let startTime; 

const ETALON_WIDTH = 2214; 
let PROPORTIONAL_SCALE = 1.0; 

// Базові розміри
const BASE_DNA_WEIGHT = [0.5, 1.5];
const BASE_STAR_SIZE = 5.0;
const BASE_TRIANGLE_SIZE = 6.0;
const BASE_TRIANGLE_INNER_SIZE = 2.5;
const BASE_LIVE_WEIGHT = [1.5, 2.5]; 

const majorCityNames = [
  "Харків", "Дніпро", "Запоріжжя", "Миколаїв", "Київ", "Одеса",
  "Умань", "Кропивницький", "Вінниця", "Черкаси", "Житомир",
  "Львів", "Тернопіль", "Івано-Франківськ", "Старокостянтинів"
];
const TOTAL_SCARS = 107000; 
const bounds = { minLon: 22.1, maxLon: 40.2, minLat: 44.4, maxLat: 52.4 };
const MASTER_ASPECT_RATIO = 3 / 2; 
const PADDING_X_PERCENT = 0.05; 
const PADDING_Y_PERCENT = 0.05; 
const SCREEN_PADDING_PERCENT = 0.05;
const BORDER_WIDTH = 5; 

let w, h; 

// --- ГОДИННИК ТА СТАТУС ---
let currentAlertStatus = { isActive: false, type: "ОЧІКУВАННЯ", error: null };
const REGION_UIDS_TO_WATCH = [
  31, 8, 36, 44, 10, 11, 12, 14, 15, 27, 17, 18, 19, 5, 20, 
  21, 22, 23, 3, 24, 26, 25, 13, 6, 9, 4, 7
];

// --- ЗАВАНТАЖЕННЯ ---
function preload() {
  console.log('Завантажуємо cities.json...');
  citiesData = loadJSON('cities.json'); 
}

// --- 🔴 SETUP (v22.0) ---
function setup() {
  console.log('Розраховуємо полотно 3:2 з відступом...');

  // === ЛОГІКА ФІКСОВАНИХ ПРОПОРЦІЙ (3:2) + ВІДСТУП ВІД ЕКРАНУ ===
  let screenW = windowWidth;
  let screenH = windowHeight;
  let availableW = screenW * (1.0 - (SCREEN_PADDING_PERCENT * 2));
  let availableH = screenH * (1.0 - (SCREEN_PADDING_PERCENT * 2));
  let availableRatio = availableW / availableH;

  if (availableRatio > MASTER_ASPECT_RATIO) {
    h = availableH;
    w = h * MASTER_ASPECT_RATIO;
  } else {
    w = availableW;
    h = w / MASTER_ASPECT_RATIO;
  }
  
  createCanvas(w, h); 
  canvas.style.boxSizing = "border-box"; 
  
  // === 🔴 Центрування полотна + чорні смуги ===
  document.body.style.backgroundColor = '#000000';
  document.body.style.display = 'flex';
  document.body.style.alignItems = 'center';
  document.body.style.justifyContent = 'center';
  document.body.style.margin = '0';
  document.body.style.overflow = 'hidden'; 
  // === КІНЕЦЬ ===

  // === 🔴 ОБЧИСЛЮЄМО НОВИЙ КОЕФІЦІЄНТ ===
  PROPORTIONAL_SCALE = width / ETALON_WIDTH; // width - це 'w', ширина нашого полотна
  console.log(`(Адаптація) Еталон: ${ETALON_WIDTH}px. Поточна: ${width}px. Коефіцієнт: ${PROPORTIONAL_SCALE}`);
  
  staticMapBuffer = createGraphics(w, h);
  
  scarColors = [
    color(255, 255, 0, 30), color(0, 255, 0, 30), color(255, 0, 255, 30),
    color(0, 255, 255, 30), color(200, 255, 0, 30), color(255, 100, 0, 30),
    color(100, 0, 255, 30)
  ];

  // 1. "Запікаємо" нашу ІСТОРІЮ
  buildStaticDNA();
  
  // 2. Завантажуємо "ПАМ'ЯТЬ"
  loadAllScarsFromServer(3);
  
  // 3. Запускаємо "пульс" годинника
  checkAlertStatus(); 
  setInterval(checkAlertStatus, 10000); 
  
  // 4. Запускаємо "пульс" шрамів
  setInterval(checkForNewScars, 30000);
  
  // 🔴 === ЗАПУСКАЄМО ТАЙМЕР ===
  startTime = millis();
}
// === КІНЕЦЬ SETUP ===

// --- ГОЛОВНИЙ ЦИКЛ DRAW ---
function draw() {
  
  let elapsedTime = millis() - startTime;

  // === 🔴 ЛОГІКА "ПРОЯВЛЕННЯ" (v22.0 з Cross-fade) ===
  
  // 💡 Час у мілісекундах
  const STATE_1_END = 3000; // 3 сек
  const STATE_2_END = 6000; // 6 сек
  const STATE_3_END = 8000; // 8 сек (2 сек на cross-fade)

  // СТАН 4: Нормальна робота (після 8 секунд)
  if (elapsedTime > STATE_3_END) {
    image(staticMapBuffer, 0, 0); // Показуємо готову, "запечену" картину
    
    // І малюємо "живі" атаки
    let realCurrentTime = new Date();
    for (let i = liveAttacks.length - 1; i >= 0; i--) {
      let attack = liveAttacks[i];
      if (attack.isExpired(realCurrentTime)) {
        drawScarToBuffer(attack.start, attack.end); 
        liveAttacks.splice(i, 1); 
        continue; 
      }
      attack.update(); 
      attack.display(); 
    }
  } 
  // 🔴 СТАН 3: Cross-fade (6-8 секунд)
  else if (elapsedTime > STATE_2_END) {
    background(10, 10, 20); // Чистимо фон
    
    // 1. Шар, що зникає (Пульсуючі елементи)
    // map(час, старт_час, кінець_час, старт_проз, кінець_проз)
    let fadeOutAlpha = map(elapsedTime, STATE_2_END, STATE_3_END, 255, 0);
    push(); // Почати тимчасові налаштування
    tint(255, fadeOutAlpha); // Застосувати прозорість
    drawStarsOnly();
    drawTrianglesOnly();
    pop(); // Завершити тимчасові налаштування
    
    // 2. Шар, що з'являється (Готова картина)
    let fadeInAlpha = map(elapsedTime, STATE_2_END, STATE_3_END, 0, 255);
    push();
    tint(255, fadeInAlpha);
    image(staticMapBuffer, 0, 0);
    pop();
  }
  // СТАН 2: Зірки + Трикутники (3-6 секунд)
  else if (elapsedTime > STATE_1_END) {
    background(10, 10, 20); // Чистимо фон
    drawStarsOnly();       // Малюємо зірки
    drawTrianglesOnly();   // Малюємо трикутники
  } 
  // СТАН 1: Тільки Зірки (0-3 секунди)
  else {
    background(10, 10, 20); // Чистимо фон
    drawStarsOnly();       // Малюємо тільки зірки
  }
  
  // === КІНЕЦЬ ЛОГІКИ "ПРОЯВЛЕННЯ" ===
  

  // === 🔴 ЛОГІКА РАМКИ ===
  // (Працює завжди, незалежно від стану "проявлення")
  if (currentAlertStatus.isActive) {
    // --- 1. Є ТРИВОГА ---
    let alphaValueBorder = map(sin(millis() * 0.005), -1, 1, 0.4, 1.0); 
    canvas.style.border = `${BORDER_WIDTH}px solid rgba(255, 0, 0, ${alphaValueBorder})`;
  
  } else {
    // --- 2. НЕМАЄ ТРИВОГИ ---
    canvas.style.border = `${BORDER_WIDTH}px solid rgba(255, 255, 255, 1.0)`;
  }
  // === КІНЕЦЬ ===
}

// === "ХУДОЖНИК" ЗАПИТУЄ ДАНІ ===

// 1. Функція "fetch" з повторними спробами
async function fetchWithRetry(url, retries = 3, delay = 1000) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Помилка: ${response.status}`);
    return response;
  } catch (err) {
    if (retries > 0) {
      console.warn(`(Fetch) Помилка, "холодний старт"? Залишилось ${retries} спроб...`);
      await new Promise(res => setTimeout(res, delay));
      return fetchWithRetry(url, retries - 1, delay * 2); 
    } else {
      console.error('(Fetch) Не вдалося підключитися після всіх спроб.');
      throw err; 
    }
  }
}

// 2. Запитує ВСІ шрами (з повтором)
async function loadAllScarsFromServer(retries) {
  try {
    const response = await fetchWithRetry('/get-all-scars', retries);
    const data = await response.json();
    if (data.error) throw new Error(data.error);

    const now = new Date().getTime();
    const expiryTime = 12 * 60 * 60 * 1000; // 💡 Ваша зміна на 6 годин
    let bakedCount = 0;
    let liveCount = 0;

    for (const scar of data.scars) {
      let startVec = mapWithAspectRatio(scar.start_lon, scar.start_lat);
      let endVec = mapWithAspectRatio(scar.end_lon, scar.end_lat);
      const scarTime = new Date(scar.created_at).getTime();
      if ((now - scarTime) > expiryTime) { // 💡 Використовуємо expiryTime
        drawScarToBuffer(startVec, endVec);
        bakedCount++;
      } else {
        liveAttacks.push(new LiveFlight(startVec, endVec, new Date(scarTime)));
        liveCount++;
      }
      if (scar.id > lastKnownScarId) {
        lastKnownScarId = scar.id;
      }
    }
    dnaCounter = data.dnaCounter;
    console.log(`✅ (Neon) Завантажено ${data.scars.length} шрамів. ${bakedCount} "запечено", ${liveCount} "в ефірі". Останній ID: ${lastKnownScarId}`);
    updateAlertStatus(null, null); 
  } catch (err) {
    console.error('Помилка завантаження шрамів з /get-all-scars:', err.message);
    updateAlertStatus(null, 'ПОМИЛКА ЗВ\'ЯЗКУ');
  }
}

// 3. ПЕРЕВІРКА СТАТУСУ (для годинника)
async function checkAlertStatus() {
  try {
    const response = await fetchWithRetry('/get-alert-status?t=' + new Date().getTime(), 1); 
    const alertString = await response.text();
    updateAlertStatus(alertString, null);
  } catch (error) {
    console.error('Не можу отримати статус:', error);
    updateAlertStatus(null, 'ПОМИЛКА ЗВ\'ЯЗКУ');
  }
}

// 4. Перевірка НОВИХ шрамів (кожні 30 сек)
async function checkForNewScars() {
  try {
    const response = await fetch(`/get-new-scars?lastId=${lastKnownScarId}`);
    const data = await response.json();
    if (data.error) throw new Error(data.error);

    if (data.newScars.length > 0) {
      console.log(`✅ (Live) Отримано ${data.newScars.length} НОВИХ шрамів!`);
      for (const scar of data.newScars) {
        let startVec = mapWithAspectRatio(scar.start_lon, scar.start_lat);
        let endVec = mapWithAspectRatio(scar.end_lon, scar.end_lat);
        liveAttacks.push(new LiveFlight(startVec, endVec, new Date(scar.created_at)));
        if (scar.id > lastKnownScarId) {
          lastKnownScarId = scar.id;
        }
      }
    }
    dnaCounter = data.dnaCounter;
  } catch (err) {
    console.error('Помилка завантаження НОВИХ шрамів (пропускаємо):', err.message);
  }
}
// === КІНЕЦЬ ЗАПИТІВ ===


// === ФУНКЦІЇ МАЛЮВАННЯ ===
function drawScarToBuffer(start, end) {
  staticMapBuffer.noFill();
  staticMapBuffer.stroke(random(scarColors)); 
  // 🔴 Використовуємо новий коефіцієнт
  staticMapBuffer.strokeWeight(random(BASE_DNA_WEIGHT[0], BASE_DNA_WEIGHT[1]) * PROPORTIONAL_SCALE); 
  staticMapBuffer.beginShape();
  staticMapBuffer.vertex(start.x, start.y);
  let dist = p5.Vector.dist(start, end);
  let bendFactor = dist * 0.5;
  let cp1_x = lerp(start.x, end.x, 0.1) + random(-bendFactor, bendFactor);
  let cp1_y = lerp(start.y, end.y, 0.1) + random(-bendFactor, bendFactor);
  let cp2_x = lerp(start.x, end.x, 0.7) + random(-bendFactor, bendFactor);
  let cp2_y = lerp(start.y, end.y, 0.7) + random(-bendFactor, bendFactor);
  staticMapBuffer.bezierVertex(cp1_x, cp1_y, cp2_x, cp2_y, end.x, end.y);
  staticMapBuffer.endShape();
}
function buildStaticDNA() {
  randomSeed(99);
  staticMapBuffer.background(10, 10, 20); 
  if (!citiesData) { console.error('ПОМИЛКА: cities.json!'); return; }
  let regions = citiesData[0].regions;
  for (let region of regions) {
    for (let city of region.cities) {
      let lon = parseFloat(city.lng);
      let lat = parseFloat(city.lat);
      if (isNaN(lon) || isNaN(lat)) continue;
      allCities.push({ name: city.name, pos: mapWithAspectRatio(lon, lat), lon: lon, lat: lat });
    }
  }
  let createLaunchCluster = (lon, lat, count, radius) => {
    let cluster = [];
    for (let i = 0; i < count; i++) {
      cluster.push(mapWithAspectRatio(lon + random(-radius, radius), lat + random(-radius, radius)));
    }
    return cluster;
  };
  launchPoints['Belgorod_Bryansk'] = createLaunchCluster(36.5, 50.5, 10, 0.5); 
  launchPoints['Primorsko_Akhtarsk'] = createLaunchCluster(38.1, 46.0, 10, 0.5); 
  launchPoints['Crimea'] = createLaunchCluster(34.4, 45.5, 10, 0.5); 
  launchPoints['Black_Sea'] = createLaunchCluster(32.0, 46.0, 10, 0.5); 
  launchPoints['Caspian_Sea'] = createLaunchCluster(48.0, 46.0, 10, 0.5); 
  launchPoints['Belarus'] = createLaunchCluster(28.0, 52.2, 5, 0.5); 
  console.log('Генерація "DNA" (107,000 шрамів)...');
  
  let tempTargetNodes = { 
    frontline: generateFrontlinePoints(300),
    kyiv: [mapWithAspectRatio(30.52, 50.45)],
    southern: [mapWithAspectRatio(30.72, 46.48), mapWithAspectRatio(31.99, 46.97)],
    central: [mapWithAspectRatio(28.68, 48.29), mapWithAspectRatio(32.26, 48.45), mapWithAspectRatio(28.46, 49.23)],
    western: [mapWithAspectRatio(24.02, 49.83), mapWithAspectRatio(25.59, 49.55), mapWithAspectRatio(24.71, 48.92)]
  };
  
  for (let i = 0; i < TOTAL_SCARS; i++) {
    let r = random(1); 
    let targetNode;
    if (r < 0.80) { targetNode = random(tempTargetNodes.frontline); }
    else if (r < 0.85) { targetNode = random(tempTargetNodes.kyiv); }
    else if (r < 0.90) { targetNode = random(tempTargetNodes.southern); }
    else if (r < 0.985) { targetNode = random(tempTargetNodes.central); }
    else { targetNode = random(tempTargetNodes.western); }
    r = random(1);
    let startCluster;
    if (r < 0.47) { startCluster = launchPoints['Belgorod_Bryansk']; }
    else if (r < 0.79) { startCluster = launchPoints['Primorsko_Akhtarsk']; }
    else if (r < 0.95) { startCluster = launchPoints['Crimea']; }
    else if (r < 0.96) { startCluster = launchPoints['Belarus']; }
    else if (r < 0.98) { startCluster = launchPoints['Caspian_Sea']; }
    else { startCluster = launchPoints['Black_Sea']; }
    let startPoint = random(startCluster);
    drawScarToBuffer(startPoint, targetNode);
  }
  console.log('Буфер "DNA" (107,000) намальовано.');
  randomSeed(null);
  
  // 🔴 Адаптуємо ЗІРКИ (Малюємо їх у буфер)
  let starSize = BASE_STAR_SIZE * PROPORTIONAL_SCALE;
  staticMapBuffer.noStroke();
  for (let city of allCities) {
    if (majorCityNames.includes(city.name)) continue;
    staticMapBuffer.fill(255, 255);
    staticMapBuffer.circle(city.pos.x, city.pos.y, starSize);
  }
  staticMapBuffer.noStroke();
  for (let city of allCities) {
    if (majorCityNames.includes(city.name)) {
      staticMapBuffer.fill(255, 255, 200, 255);
      staticMapBuffer.circle(city.pos.x, city.pos.y, starSize);
      staticMapBuffer.fill(255, 255, 255, 255);
      staticMapBuffer.circle(city.pos.x, city.pos.y, starSize);
    }
  }
  
  // 🔴 Адаптуємо ТРИКУТНИКИ (Малюємо їх у буфер)
  staticMapBuffer.noStroke();
  for (let clusterName in launchPoints) {
    let cluster = launchPoints[clusterName];
    for (let launchPos of cluster) {
      let s = BASE_TRIANGLE_SIZE * PROPORTIONAL_SCALE;
      staticMapBuffer.fill(255, 0, 0, 200);
      staticMapBuffer.triangle(launchPos.x, launchPos.y - s, launchPos.x - s, launchPos.y + s, launchPos.x + s, launchPos.y + s);
      staticMapBuffer.fill(255, 100, 100, 255);
      s = BASE_TRIANGLE_INNER_SIZE * PROPORTIONAL_SCALE;
      staticMapBuffer.triangle(launchPos.x, launchPos.y - s, launchPos.x - s, launchPos.y + s, launchPos.x + s, launchPos.y + s);
    }
  }
  console.log('Буфер "DNA" (Міста та Трикутники) готовий.');
}

// 🔴 === ОНОВЛЕНА ФУНКЦІЯ (з окремими відступами) ===
function mapWithAspectRatio(lon, lat) {
  let mapRatio = (bounds.maxLon - bounds.minLon) / (bounds.maxLat - bounds.minLat);
  let canvasRatio = width / height;
  let w, h, offsetX, offsetY;
  
  let paddingX = width * PADDING_X_PERCENT;
  let paddingY = height * PADDING_Y_PERCENT;

  if (canvasRatio > mapRatio) {
    h = height - (paddingY * 2); 
    w = h * mapRatio;
    offsetX = (width - w) / 2; 
    offsetY = paddingY;
  } else {
    w = width - (paddingX * 2); 
    h = w / mapRatio;
    offsetX = paddingX;
    offsetY = (height - h) / 2; 
  }
  
  let x = map(lon, bounds.minLon, bounds.maxLon, offsetX, offsetX + w);
  let y = map(lat, bounds.minLat, bounds.maxLat, offsetY + h, offsetY); 
  return createVector(x, y);
}

function generateFrontlinePoints(numPoints) {
  let frontlineNodes = [];
  const waypoints = [
    mapWithAspectRatio(37.5, 49.8), mapWithAspectRatio(37.8, 48.5),
    mapWithAspectRatio(35.8, 47.5), mapWithAspectRatio(33.0, 46.7)
  ];
  for (let i = 0; i < waypoints.length - 1; i++) {
    let start = waypoints[i];
    let end = waypoints[i + 1];
    for (let j = 0; j < numPoints / (waypoints.length - 1); j++) {
      let t = random(1); 
      let pos = p5.Vector.lerp(start, end, t);
      pos.x += random(-15, 15); pos.y += random(-15, 15);
      frontlineNodes.push(pos);
    }
  }
  return frontlineNodes;
}

// === ГОДИННИК (Виправлено "Вічну Тривогу") ===
function updateAlertStatus(alertString, errorMsg) {
  currentAlertStatus.error = errorMsg; 
  if (errorMsg) {
    currentAlertStatus.isActive = true; 
    currentAlertStatus.type = errorMsg;
    return;
  }
  
  let isAnyCleanAlertActive = false;
  if (alertString) {
    for (const uid of REGION_UIDS_TO_WATCH) {
      if (alertString.charAt(uid) === 'A') {
        isAnyCleanAlertActive = true;
        break; 
      }
    }
  }

  if (isAnyCleanAlertActive) {
    currentAlertStatus.isActive = true;
    currentAlertStatus.type = "АКТИВНА ФАЗА"; 
  } else {
    currentAlertStatus.isActive = false;
    currentAlertStatus.type = "НЕМАЄ ЗАГРОЗ";
  }
}

// === ФУНКЦІЯ, ЯКУ МИ ВИМКНУЛИ ===
function drawUpdatedClock(realTime) {
  // ЦЯ ФУНКЦІЯ БІЛЬШЕ НЕ ВИКЛИКАЄТЬСЯ
}

// === КЛАС LIVEFLIGHT (Повертаємо товщину) ===
class LiveFlight {
  constructor(startVector, endVector, simulationStartTime) {
    this.start = startVector;
    this.end = endVector;
    this.simulationStartTime = simulationStartTime; 
    
    this.speed = 0.0025;
    // 🔴 Використовуємо новий коефіцієнт
    this.weight = random(BASE_LIVE_WEIGHT[0], BASE_LIVE_WEIGHT[1]) * PROPORTIONAL_SCALE; 
    
    this.color = color(255, 0, 0, 220); 
    this.progressHead = 0; 
    this.progressTail = 0; 
    this.tailLength = 1; 
    let dist = p5.Vector.dist(this.start, this.end);
    let bendFactor = dist * 0.5;
    this.cp1_x = lerp(this.start.x, this.end.x, 0.1) + random(-bendFactor, bendFactor);
    this.cp1_y = lerp(this.start.y, this.end.y, 0.1) + random(-bendFactor, bendFactor);
    this.cp2_x = lerp(this.start.x, this.end.x, 0.7) + random(-bendFactor, bendFactor);
    this.cp2_y = lerp(this.start.y, this.end.y, 0.7) + random(-bendFactor, bendFactor);
  }
  update() {
    if (this.progressHead < 1.0) { this.progressHead += this.speed; }
    else { this.progressHead = 1.0; }
    this.progressTail = max(0, this.progressHead - this.tailLength);
    if (this.progressHead >= 1.0) {
      this.progressTail += this.speed; 
      this.progressTail = min(this.progressTail, 1.0); 
    }
  }
  display() {
    stroke(this.color);
    strokeWeight(this.weight);
    noFill();
    beginShape();
    for (let t = this.progressTail; t < this.progressHead; t += 0.01) { 
      let x = bezierPoint(this.start.x, this.cp1_x, this.cp2_x, this.end.x, t);
      let y = bezierPoint(this.start.y, this.cp1_y, this.cp2_y, this.end.y, t);
      vertex(x, y);
    }
    let headX = bezierPoint(this.start.x, this.cp1_x, this.cp2_x, this.end.x, this.progressHead);
    let headY = bezierPoint(this.start.y, this.cp1_y, this.cp2_y, this.end.y, this.progressHead);
    vertex(headX, headY);
    endShape();
  }
  isExpired(currentSimTime) {
    const expiryTime = 24 * 60 * 60 * 1000; // 💡 Ваша зміна на 6 годин
    let expiryDate = new Date(this.simulationStartTime.getTime() + expiryTime);
    return currentSimTime >= expiryDate;
  }
}

// 🔴 === НОВІ ФУНКЦІЇ ДЛЯ "ПРОЯВЛЕННЯ" (v21.1 з пульсацією) ===

// (Цей код - копія з buildStaticDNA, але він малює на головне полотно)
function drawStarsOnly() {
  let starSize = BASE_STAR_SIZE * PROPORTIONAL_SCALE;
  noStroke();
  
  // 🔴 Логіка пульсації (від 40% до 100% прозорості)
  let alphaValue = map(sin(millis() * 0.005), -1, 1, 100, 255); 

  for (let city of allCities) {
    if (majorCityNames.includes(city.name)) continue;
    fill(255, alphaValue); // 🔴 Застосовуємо пульсацію
    circle(city.pos.x, city.pos.y, starSize);
  }
  noStroke();
  for (let city of allCities) {
    if (majorCityNames.includes(city.name)) {
      fill(255, 255, 200, alphaValue); // 🔴 Застосовуємо пульсацію
      circle(city.pos.x, city.pos.y, starSize);
      fill(255, 255, 255, alphaValue); // 🔴 Застосовуємо пульсацію
      circle(city.pos.x, city.pos.y, starSize);
    }
  }
}

function drawTrianglesOnly() {
  noStroke();
  
  // 🔴 Логіка пульсації (від 40% до 100% прозорості)
  // Використовуємо трохи іншу швидкість (0.006), щоб вона не "зливалася" з зірками
  let alphaValue = map(sin(millis() * 0.006), -1, 1, 100, 255);
  let alphaValueDim = map(sin(millis() * 0.006), -1, 1, 80, 200); // Для темнішого кольору

  for (let clusterName in launchPoints) {
    let cluster = launchPoints[clusterName];
    for (let launchPos of cluster) {
      let s = BASE_TRIANGLE_SIZE * PROPORTIONAL_SCALE;
      fill(255, 0, 0, alphaValueDim); // 🔴 Застосовуємо пульсацію
      triangle(launchPos.x, launchPos.y - s, launchPos.x - s, launchPos.y + s, launchPos.x + s, launchPos.y + s);
      fill(255, 100, 100, alphaValue); // 🔴 Застосовуємо пульсацію
      s = BASE_TRIANGLE_INNER_SIZE * PROPORTIONAL_SCALE;
      triangle(launchPos.x, launchPos.y - s, launchPos.x - s, launchPos.y + s, launchPos.x + s, launchPos.y + s);
    }
  }
}