// === sketch.js (Фінальна Версія v6.0 - "HD Rendering") ===

// --- ГЛОБАЛЬНІ ЗМІННІ ---
let citiesData;
let launchPoints = {}; 
let allCities = []; 
let staticMapBuffer; 
let scarColors = []; 
let dnaCounter = 107000; 
let liveAttacks = []; 
let lastKnownScarId = 0; 

// 🔴 ВІРТУАЛЬНИЙ РОЗМІР (Завжди висока якість)
const VIRTUAL_WIDTH = 2000; 
let virtualHeight; // Розрахуємо в setup
let scaleFactor = 1; // Коефіцієнт зменшення для екрану

const majorCityNames = [
  "Харків", "Дніпро", "Запоріжжя", "Миколаїв", "Київ", "Одеса",
  "Умань", "Кропивницький", "Вінниця", "Черкаси", "Житомир",
  "Львів", "Тернопіль", "Івано-Франківськ", "Старокостянтинів"
];
const TOTAL_SCARS = 107000; 
// Межі карти (Україна)
const bounds = { minLon: 22.1, maxLon: 40.2, minLat: 44.4, maxLat: 52.4 };
const PADDING_PERCENT = 0.15;

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

// --- SETUP ---
function setup() {
  console.log('Розраховуємо HD полотно...');
  
  // 1. Створюємо полотно на ВЕСЬ екран телефону/компу
  createCanvas(windowWidth, windowHeight);
  
  // 2. Розраховуємо ВІРТУАЛЬНІ розміри (HD якість)
  // Пропорції карти на основі координат
  let mapRatio = (bounds.maxLon - bounds.minLon) / (bounds.maxLat - bounds.minLat);
  
  // Встановлюємо ширину 2000, висоту підганяємо під карту
  // (але враховуємо відступи PADDING, тому реальна висота трохи інша, 
  // спростимо: зробимо віртуальне полотно пропорційним екрану, але з базою 2000px)
  
  // Щоб карта влізла і виглядала як на ПК, ми фіксуємо ширину 2000
  // А висоту беремо таку, щоб вмістити Україну з відступами
  // Але простіше зафіксувати пропорції самого вікна, якщо ми хочемо "на весь екран"
  // ТУТ ХИТРІСТЬ: Ми робимо віртуальне полотно ЗАВЖДИ 2000px по ширині.
  
  virtualHeight = VIRTUAL_WIDTH / (windowWidth / windowHeight);
  
  // Якщо віртуальна висота замала для карти, збільшимо її
  if (virtualHeight < VIRTUAL_WIDTH / mapRatio) {
      virtualHeight = VIRTUAL_WIDTH / mapRatio;
  }

  // 3. Створюємо ГІГАНТСЬКИЙ буфер (де все буде малюватися)
  staticMapBuffer = createGraphics(VIRTUAL_WIDTH, virtualHeight);
  
  // Повертаємо згладжування для красивого зменшення
  smooth(); 
  staticMapBuffer.smooth();

  scarColors = [
    color(255, 255, 0, 30), color(0, 255, 0, 30), color(255, 0, 255, 30),
    color(0, 255, 255, 30), color(200, 255, 0, 30), color(255, 100, 0, 30),
    color(100, 0, 255, 30)
  ];

  // 1. "Запікаємо" ІСТОРІЮ на ГІГАНТСЬКОМУ буфері
  buildStaticDNA();
  
  // 2. Завантажуємо "ПАМ'ЯТЬ"
  loadAllScarsFromServer(3); 
  
  // 3. Таймери
  checkAlertStatus(); 
  setInterval(checkAlertStatus, 10000); 
  setInterval(checkForNewScars, 30000); 
}

// --- ГОЛОВНИЙ ЦИКЛ DRAW ---
function draw() {
  background(10, 10, 20); // Фон малюємо на головному екрані

  // 🔴 МАГІЯ МАСШТАБУВАННЯ
  // Ми розраховуємо, як сильно треба зменшити 2000px, щоб влізти в екран телефону
  scaleFactor = windowWidth / VIRTUAL_WIDTH;
  
  // Застосовуємо масштаб до ВСЬОГО, що малюється нижче
  push(); 
  scale(scaleFactor);

  // 1. Малюємо наш ГІГАНТСЬКИЙ буфер (він зменшиться автоматично)
  image(staticMapBuffer, 0, 0);

  // 2. Малюємо "Живі" лінії (вони теж зменшаться і стануть тонкими!)
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
  
  pop(); // Повертаємо масштаб назад для Годинника (щоб текст був чіткий)

  // 3. Малюємо годинник (поверх усього, в оригінальному розмірі екрану)
  // drawUpdatedClock(realCurrentTime);
}

// ... (РЕШТА КОДУ: loadAllScarsFromServer, checkAlertStatus, checkForNewScars - БЕЗ ЗМІН) ...
// 1. Функція "fetch" з повторними спробами
async function fetchWithRetry(url, retries = 3, delay = 1000) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Помилка: ${response.status}`);
    return response;
  } catch (err) {
    if (retries > 0) {
      await new Promise(res => setTimeout(res, delay));
      return fetchWithRetry(url, retries - 1, delay * 2); 
    } else {
      console.error('(Fetch) Не вдалося підключитися.');
      throw err; 
    }
  }
}

async function loadAllScarsFromServer(retries) {
  try {
    const response = await fetchWithRetry('/get-all-scars', retries);
    const data = await response.json();
    if (data.error) throw new Error(data.error);

    const now = new Date().getTime();
    const hours24 = 24 * 60 * 60 * 1000; 
    let bakedCount = 0;
    let liveCount = 0;

    for (const scar of data.scars) {
      let startVec = mapWithAspectRatio(scar.start_lon, scar.start_lat);
      let endVec = mapWithAspectRatio(scar.end_lon, scar.end_lat);
      const scarTime = new Date(scar.created_at).getTime();
      if ((now - scarTime) > hours24) {
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
    updateAlertStatus(null, null); 
  } catch (err) {
    updateAlertStatus(null, 'ПОМИЛКА ЗВ\'ЯЗКУ');
  }
}

async function checkAlertStatus() {
  try {
    const response = await fetchWithRetry('/get-alert-status?t=' + new Date().getTime(), 1); 
    const alertString = await response.text();
    updateAlertStatus(alertString, null); 
  } catch (error) {
    updateAlertStatus(null, 'ПОМИЛКА ЗВ\'ЯЗКУ');
  }
}

async function checkForNewScars() {
  try {
    const response = await fetch(`/get-new-scars?lastId=${lastKnownScarId}`);
    const data = await response.json();
    if (data.error) throw new Error(data.error);
    if (data.newScars.length > 0) {
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
    console.error('Помилка завантаження НОВИХ шрамів:', err.message);
  }
}

// === ФУНКЦІЇ МАЛЮВАННЯ ===
function drawScarToBuffer(start, end) {
  staticMapBuffer.noFill();
  staticMapBuffer.stroke(random(scarColors)); 
  staticMapBuffer.strokeWeight(random(0.5, 1.5)); // Стандартна товщина (вона зменшиться scaleFactor-ом)
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
  // Прозорий фон для буфера, щоб накладати на темний фон
  staticMapBuffer.clear(); 
  
  if (!citiesData) return;
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
  
  staticMapBuffer.noStroke();
  for (let city of allCities) {
    if (majorCityNames.includes(city.name)) continue;
    staticMapBuffer.fill(255, 255);
    staticMapBuffer.circle(city.pos.x, city.pos.y, 3); // Стандартний розмір
  }
  for (let city of allCities) {
    if (majorCityNames.includes(city.name)) {
      staticMapBuffer.fill(255, 255, 200, 255);
      staticMapBuffer.circle(city.pos.x, city.pos.y, 3);
      staticMapBuffer.fill(255, 255, 255, 255);
      staticMapBuffer.circle(city.pos.x, city.pos.y, 3);
    }
  }
  
  for (let clusterName in launchPoints) {
    let cluster = launchPoints[clusterName];
    for (let launchPos of cluster) {
      let s = 6; // Стандартний розмір
      staticMapBuffer.fill(255, 0, 0, 200);
      staticMapBuffer.triangle(launchPos.x, launchPos.y - s, launchPos.x - s, launchPos.y + s, launchPos.x + s, launchPos.y + s);
      staticMapBuffer.fill(255, 100, 100, 255);
      s = 2.5;
      staticMapBuffer.triangle(launchPos.x, launchPos.y - s, launchPos.x - s, launchPos.y + s, launchPos.x + s, launchPos.y + s);
    }
  }
}

// 🔴 ВАЖЛИВО: Ця функція тепер працює у ВІРТУАЛЬНИХ координатах (2000px)
function mapWithAspectRatio(lon, lat) {
  let mapRatio = (bounds.maxLon - bounds.minLon) / (bounds.maxLat - bounds.minLat);
  
  // Використовуємо VIRTUAL_WIDTH (2000) замість width
  let canvasRatio = VIRTUAL_WIDTH / virtualHeight;
  
  let mapW, mapH, offsetX, offsetY;
  let paddingX = VIRTUAL_WIDTH * PADDING_PERCENT;
  let paddingY = virtualHeight * PADDING_PERCENT;
  
  if (canvasRatio > mapRatio) {
    mapH = virtualHeight - (paddingY * 2); 
    mapW = mapH * mapRatio;
    offsetX = (VIRTUAL_WIDTH - mapW) / 2; 
    offsetY = paddingY;
  } else {
    mapW = VIRTUAL_WIDTH - (paddingX * 2); 
    mapH = mapW / mapRatio;
    offsetX = paddingX; 
    offsetY = (virtualHeight - mapH) / 2;
  }
  
  let x = map(lon, bounds.minLon, bounds.maxLon, offsetX, offsetX + mapW);
  let y = map(lat, bounds.minLat, bounds.maxLat, offsetY + mapH, offsetY); 
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

function drawUpdatedClock(realTime) {
  let timeString = realTime.toLocaleString('uk-UA', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
  let status, statusColor;
  let typeText = currentAlertStatus.type;
  if (currentAlertStatus.isActive) {
    status = `АКТИВНА ФАЗА`;
    statusColor = color(255, 0, 0);
  } else {
    status = "ОЧІКУВАННЯ";
    statusColor = color(0, 255, 0); 
  }
  if (currentAlertStatus.isActive) {
    fill(255, 0, 0, 30); 
    noStroke();
    rect(0, 0, width, height);
  }
  
  // Годинник малюємо БЕЗ масштабування (pop() був викликаний)
  fill(0, 150);
  noStroke();
  
  // Адаптація розміру плашки під екран
  let boxScale = width < 768 ? 0.7 : 1.0;
  
  push();
  scale(boxScale);
  rect(0, 0, 450, 130); 
  fill(255);
  textSize(16);
  textAlign(LEFT, TOP);
  text(`РЕАЛЬНИЙ ЧАС: ${timeString}`, 10, 10);
  fill(statusColor);
  text(`СТАТУС: ${status}`, 10, 40);
  let errorMsg = currentAlertStatus.error;
  if (errorMsg) {
    fill(255, 100, 100); 
    text(`ПОМИЛКА: ${typeText}`, 10, 70);
  } else {
    fill(255); 
    text(`СТАН: ${typeText}`, 10, 70); 
  }
  fill(255); 
  text(`"ШРАМІВ" У DNA: ${dnaCounter}`, 10, 100);
  pop();
}

// === КЛАС LIVEFLIGHT ===
class LiveFlight {
  constructor(startVector, endVector, simulationStartTime) {
    this.start = startVector;
    this.end = endVector;
    this.simulationStartTime = simulationStartTime; 
    this.speed = 0.005; 
    this.weight = random(0.5, 1.0); // Стандартна товщина (зменшиться scaleFactor-ом)
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
    const hours24 = 24 * 60 * 60 * 1000; 
    let expiryTime = new Date(this.simulationStartTime.getTime() + hours24);
    return currentSimTime >= expiryTime;
  }
}