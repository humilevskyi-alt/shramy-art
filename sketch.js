// === sketch.js (Версія "Каталізатор" + Виправлені КАБи + Виправлений ПІВДЕНЬ) ===

// --- НАЛАШТУВАННЯ API ТА КАТАЛІЗАТОРА ---
const LOCAL_SERVER_URL = '/get-alerts'; // (Ми на одному сайті)
const CATALYST_CHANCE = 6; // Шанс 6% на запуск симуляції

// Карта UID з PDF (UID - це індекс у рядку)
const REGION_UIDS = {
  kyiv: [31], // м. Київ
  southern: [17, 18], // Миколаївська, Одеська
  western: [27, 13, 21], // Львівська, Івано-Франківська, Тернопільська
  central: [36, 15, 24, 10] // Вінницька, Кіровоградська, Черкаська, Житомирська
};
// Зберігаємо ПОПЕРЕДНІЙ стан ("H" - тихо, "A" - тривога)
let previousAlertStates = {};

// === НОВІ НАЛАШТУВАННЯ СИМУЛЯЦІЇ КАБів ===
const KAB_TIMER_AVG_INTERVAL = 3600000; // 1 година (60*60*1000 мс)
let nextKabSalvoTime = 0; // Час наступного залпу

// --- ГЛОБАЛЬНІ ЗМІННІ СИМУЛЯЦІЇ ---
let citiesData;
let historicalScars = []; 
let launchPoints = {}; 
let allCities = []; 
let targetNodes = { frontline: [], kyiv: [], southern: [], central: [], western: [] };

let staticMapBuffer; 
let liveAttacks = []; 
let scarColors = []; 

const majorCityNames = [
  "Харків", "Дніпро", "Запоріжжя", "Миколаїв", "Київ", "Одеса",
  "Умань", "Кропивницький", "Вінниця", "Черкаси", "Житомир",
  "Львів", "Тернопіль", "Івано-Франківськ", "Старокостянтинів"
];

const TOTAL_SCARS = 107000; 
let dnaCounter = TOTAL_SCARS; 
const bounds = { minLon: 22.1, maxLon: 40.2, minLat: 44.4, maxLat: 52.4 };
const PADDING_PERCENT = 0.15;
let w, h; 

// --- ГОДИННИК ТА СТАТУС ---
let currentAlertStatus = { isActive: false, type: "ОЧІКУВАННЯ", error: null };


// --- ЗАВАНТАЖЕННЯ ---
function preload() {
  console.log('Завантажуємо cities.json...');
  citiesData = loadJSON('cities.json'); 
}

// --- SETUP ---
function setup() {
  console.log('Розраховуємо полотно за розміром вікна...');
w = windowWidth;
h = windowHeight;
createCanvas(w, h);

  staticMapBuffer = createGraphics(w, h);

  // 1. "Запікаємо" нашу історію (DNA)
  buildStaticDNA();
  
  // 2. Запускаємо "живе серце" (слухаємо наш server.js)
  checkRealTimeAlerts(); 
  setInterval(checkRealTimeAlerts, 10000); // Перевіряємо кожні 10 сек
  
  // 3. Встановлюємо перший час для КАБів
  // (випадково, від 0 до 15 хв з моменту старту)
  nextKabSalvoTime = millis() + random(900000);
}

// --- ГОЛОВНИЙ ЦИКЛ DRAW (ТВОЯ ЛОГІКА) ---
function draw() {
  // 1. Малюємо наш готовий буфер "DNA"
  image(staticMapBuffer, 0, 0);

  // === РІВЕНЬ 1: ТВОЯ СИМУЛЯЦІЯ КАБів (НОВА ЛОГІКА ТАЙМЕРА) ===
      
  let now = millis(); // Поточний час (в мілісекундах)

  // Перевіряємо, чи настав час для наступного залпу
  if (now > nextKabSalvoTime) {
    
    // === Запускаємо залп ===
    let salvoSize = floor(random(4, 10)); // Від 4 до 9 КАБів
    let startCluster = launchPoints['Belgorod_Bryansk'];
    let targetGroup = targetNodes.frontline;

    if (startCluster && targetGroup && targetGroup.length > 0) {
      console.log(`--- СИМУЛЯЦІЯ КАБ: Запускаємо залп з ${salvoSize} шрамів на лінію фронту ---`);
      let startPoint = random(startCluster);
      for (let i = 0; i < salvoSize; i++) {
        let endPoint = random(targetGroup);
        liveAttacks.push(new LiveFlight(startPoint, endPoint, new Date()));
      }
    }
    
    // --- Встановлюємо час НАСТУПНОГО залпу ---
    // (В середньому через 1 годину, але з розкидом +/- 30 хв)
    let nextInterval = KAB_TIMER_AVG_INTERVAL + random(-1800000, 1800000);
    nextKabSalvoTime = now + nextInterval; 
  }
  // === КІНЕЦЬ СИМУЛЯЦІЇ КАБів ===


  // 2. Оновлюємо та малюємо "живі" атаки (і КАБи, і ті, що з API)
  let realCurrentTime = new Date();
  for (let i = liveAttacks.length - 1; i >= 0; i--) {
    let attack = liveAttacks[i];

    if (attack.isExpired(realCurrentTime)) {
      liveAttacks.splice(i, 1); 
      continue; 
    }
    attack.update();
    attack.display();

    if (attack.hasArrived() && !attack.isBaked) {
      drawStaticScarToBuffer(attack); 
      attack.isBaked = true; 
    }
  }

  // 3. Малюємо годинник та фільтр
  drawUpdatedClock(realCurrentTime);
}

// === НОВИЙ "МОЗОК" (Працює з рядком) ===

// 1. ПЕРЕВІРКА ТРИВОГ (питає НАШ server.js)
function checkRealTimeAlerts() {
  // Додаємо "пробивання кешу", про всяк випадок
  fetch(LOCAL_SERVER_URL + '?t=' + new Date().getTime())
  .then(response => {
    if (!response.ok) { throw new Error(`Помилка: ${response.status}`); }
    return response.text(); // <--- ОЧІКУЄМО ТЕКСТ
  })
  .then(alertString => {
    // УСПІХ! Ми отримали рядок (напр. "HHAHHA...")
    processAlertString(alertString);
    updateAlertStatus(alertString, null); // Оновлюємо годинник
  })
  .catch(error => {
    console.error('Не можу підключитися до server.js:', error);
    updateAlertStatus(null, 'ПОМИЛКА ЗВ\'ЯЗКУ');
  });
}

// 2. ОБРОБКА РЯДКА ТРИВОГ (Головна логіка каталізатора)
function processAlertString(alertString) {
  if (!alertString || alertString.length < 50) return; // Рядок не завантажився

  let isAnyAlertActive = false; // Для годинника

  // Перебираємо НАШІ регіони (kyiv, southern, ...)
  for (const regionKey in REGION_UIDS) {
    const uids = REGION_UIDS[regionKey]; // (напр. [17, 18] для 'southern')
    
    // Перевіряємо, чи ХОЧА Б ОДИН UID з нашого списку має тривогу
    let isRegionCurrentlyActive = uids.some(uid => alertString.charAt(uid) === 'A');
    
    if (isRegionCurrentlyActive) {
      isAnyAlertActive = true;
    }

    // Отримуємо ПОПЕРЕДНІЙ стан для цього регіону
    let wasRegionActive = previousAlertStates[regionKey] || false;

    // === ЛОГІКА "КАТАЛІЗАТОРА" ===
    // Якщо зараз тривога (isRegionCurrentlyActive = true)
    // А до цього її не було (wasRegionActive = false)
    if (isRegionCurrentlyActive && !wasRegionActive) {
      console.log(`!!! КАТАЛІЗАТОР: НОВА ТРИВОГА в ${regionKey.toUpperCase()}`);
      // Кидаємо кубик!
      triggerCatalystSalvo(regionKey);
    }
    
    // Зберігаємо поточний стан як "попередній" для наступної перевірки
    previousAlertStates[regionKey] = isRegionCurrentlyActive;
  }
  
  return isAnyAlertActive;
}

// 3. ХУДОЖНЯ ІНТЕРПРЕТАЦІЯ (ТВІЙ "КИДОК КУБИКА" 6%)
function triggerCatalystSalvo(regionKey) {
  // Кидаємо кубик (0-99). Якщо менше 6 -> успіх (6% шанс)
  if (random(100) < CATALYST_CHANCE) {
    console.log(`!!! УСПІХ (6%): Запускаємо симуляцію для ${regionKey.toUpperCase()}`);
    
    let salvoSize = floor(random(100, 140)); // Більший залп
    
    // Вибираємо точку запуску (БЕЗ БІЛОРУСІ, як ти просив)
    let startKey = random(['Belgorod_Bryansk', 'Primorsko_Akhtarsk', 'Crimea', 'Black_Sea', 'Caspian_Sea']);
    let startCluster = launchPoints[startKey];
    
    // Беремо групу цілей для цього регіону (kyiv, southern, ...)
    let targetGroup = targetNodes[regionKey];

    if (!startCluster || !targetGroup || !targetGroup.length) {
      console.error(`Немає цілей для ${regionKey}`);
      return;
    }

    // Запускаємо залп
    for (let i = 0; i < salvoSize; i++) {
      let startPoint = random(startCluster);
      let endPoint = random(targetGroup);
      liveAttacks.push(new LiveFlight(startPoint, endPoint, new Date())); 
    }
  } else {
    console.log(`--- (94%): "Кубик" не випав для ${regionKey.toUpperCase()}`);
  }
}

// === УСІ СТАРІ ФУНКЦІЇ (без змін) ===
// (buildStaticDNA, mapWithAspectRatio, generateFrontlinePoints,
// selectTargetNode, selectStartCluster, drawStaticMapToBuffer,
// drawComplexCurveToBuffer, drawStaticScarToBuffer, і клас LiveFlight)

// === ГОЛОВНА ФУНКЦІЯ (малює "DNA") ===
function buildStaticDNA() {
  randomSeed(99);
  historicalScars = [];
  launchPoints = {};
  allCities = [];
  targetNodes = { frontline: [], kyiv: [], southern: [], central: [], western: [] };
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
  
  targetNodes.frontline = generateFrontlinePoints(300);
  targetNodes.kyiv = [mapWithAspectRatio(30.52, 50.45)]; // Київ
  
  // === 🔴 ОСЬ ВИПРАВЛЕННЯ: ===
  targetNodes.southern = [mapWithAspectRatio(30.72, 46.48), mapWithAspectRatio(31.99, 46.97)]; // Одеса та Миколаїв
  // === 🔴 КІНЕЦЬ ВИПРАВЛЕННЯ ===
  
  targetNodes.central = [mapWithAspectRatio(28.68, 48.29), mapWithAspectRatio(32.26, 48.45), mapWithAspectRatio(28.46, 49.23)];
  targetNodes.western = [mapWithAspectRatio(24.02, 49.83), mapWithAspectRatio(25.59, 49.55), mapWithAspectRatio(24.71, 48.92)];
  
  scarColors = [
    color(255, 255, 0, 30), color(0, 255, 0, 30), color(255, 0, 255, 30),
    color(0, 255, 255, 30), color(200, 255, 0, 30), color(255, 100, 0, 30),
    color(100, 0, 255, 30)
  ];
  for (let i = 0; i < TOTAL_SCARS; i++) {
    let targetNode = selectTargetNode();
    let startCluster = selectStartCluster();
    let startPoint = random(startCluster);
    historicalScars.push({ start: startPoint, end: targetNode, color: random(scarColors), weight: random(0.5, 1.5) });
  }
  console.log('Генерація "DNA" завершена. Малюємо на буфер...');
  drawStaticMapToBuffer(); 
  console.log('Буфер "DNA" готовий.');
  randomSeed(null);
}

function mapWithAspectRatio(lon, lat) {
  let mapRatio = (bounds.maxLon - bounds.minLon) / (bounds.maxLat - bounds.minLat);
  let canvasRatio = width / height;
  let w, h, offsetX, offsetY;
  let paddingX = width * PADDING_PERCENT;
  let paddingY = height * PADDING_PERCENT;
  if (canvasRatio > mapRatio) {
    h = height - (paddingY * 2); w = h * mapRatio;
    offsetX = (width - w) / 2; offsetY = paddingY;
  } else {
    w = width - (paddingX * 2); h = w / mapRatio;
    offsetX = paddingX; offsetY = (height - h) / 2;
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
function selectTargetNode() {
  let r = random(1); 
  if (r < 0.80) { return random(targetNodes.frontline); }
  else if (r < 0.85) { return random(targetNodes.kyiv); }
  else if (r < 0.90) { return random(targetNodes.southern); }
  else if (r < 0.985) { return random(targetNodes.central); }
  else { return random(targetNodes.western); }
}
function selectStartCluster() {
  let r = random(1); 
  if (r < 0.47) { return launchPoints['Belgorod_Bryansk']; }
  else if (r < 0.79) { return launchPoints['Primorsko_Akhtarsk']; }
  else if (r < 0.95) { return launchPoints['Crimea']; }
  else if (r < 0.96) { return launchPoints['Belarus']; }
  else if (r < 0.98) { return launchPoints['Caspian_Sea']; }
  else { return launchPoints['Black_Sea']; }
}
function drawStaticMapToBuffer() {
  staticMapBuffer.background(10, 10, 20);
  staticMapBuffer.noFill();
  for (let scar of historicalScars) {
    staticMapBuffer.stroke(scar.color);
    staticMapBuffer.strokeWeight(scar.weight);
    drawComplexCurveToBuffer(scar.start, scar.end); 
  }
  staticMapBuffer.noStroke();
  for (let city of allCities) {
    if (majorCityNames.includes(city.name)) continue;
    staticMapBuffer.fill(255, 255);
    staticMapBuffer.circle(city.pos.x, city.pos.y, 3);
  }
  staticMapBuffer.noStroke();
  for (let city of allCities) {
    if (majorCityNames.includes(city.name)) {
      staticMapBuffer.fill(255, 255, 200, 255);
      staticMapBuffer.circle(city.pos.x, city.pos.y, 3);
      staticMapBuffer.fill(255, 255, 255, 255);
      staticMapBuffer.circle(city.pos.x, city.pos.y, 3);
    }
  }
  staticMapBuffer.noStroke();
  for (let clusterName in launchPoints) {
    let cluster = launchPoints[clusterName];
    for (let launchPos of cluster) {
      let s = 6;
      staticMapBuffer.fill(255, 0, 0, 200);
      staticMapBuffer.triangle(launchPos.x, launchPos.y - s, launchPos.x - s, launchPos.y + s, launchPos.x + s, launchPos.y + s);
      staticMapBuffer.fill(255, 100, 100, 255);
      s = 2.5;
      staticMapBuffer.triangle(launchPos.x, launchPos.y - s, launchPos.x - s, launchPos.y + s, launchPos.x + s, launchPos.y + s);
    }
  }
}
function drawComplexCurveToBuffer(start, end) {
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
function drawStaticScarToBuffer(attack) {
  staticMapBuffer.noFill();
  staticMapBuffer.stroke(random(scarColors)); 
  staticMapBuffer.strokeWeight(random(0.5, 1.5)); 
  staticMapBuffer.beginShape();
  staticMapBuffer.vertex(attack.start.x, attack.start.y);
  staticMapBuffer.bezierVertex(attack.cp1_x, attack.cp1_y, attack.cp2_x, attack.cp2_y, attack.end.x, attack.end.y);
  staticMapBuffer.endShape();
  dnaCounter++; 
}

// === КЛАС ДЛЯ "ЖИВОГО ПОЛЬОТУ" (Без змін) ===
class LiveFlight {
  constructor(startVector, endVector, simulationStartTime) {
    this.start = startVector;
    this.end = endVector;
    this.simulationStartTime = simulationStartTime; 
    this.isBaked = false; 
    this.speed = 0.005; 
    this.weight = random(1.5, 1.5); 
    this.color = color(255, 0, 0, 220); 
    this.progressHead = 0; 
    this.progressTail = 0; 
    this.tailLength = 1; 
    let dist = p5.Vector.dist(this.start, this.end);
    let bendFactor = dist * 0.5;
    this.cp1_x = lerp(this.start.x, this.end.x, 0.1) + random(-bendFactor, bendFactor);
    this.cp1_y = lerp(this.start.y, end.y, 0.1) + random(-bendFactor, bendFactor);
    this.cp2_x = lerp(this.start.x, this.end.x, 0.7) + random(-bendFactor, bendFactor);
    this.cp2_y = lerp(this.start.y, end.y, 0.7) + random(-bendFactor, bendFactor);
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
  hasArrived() { return this.progressHead >= 1.0; }
  isExpired(currentSimTime) {
    const hours24 = 24 * 60 * 60 * 1000; 
    let expiryTime = new Date(this.simulationStartTime.getTime() + hours24);
    return currentSimTime >= expiryTime;
  }
}

// 5. НОВИЙ ГОДИННИК (оновлює статус на екрані)
function updateAlertStatus(alertString, errorMsg) {
  currentAlertStatus.error = errorMsg; 

  if (errorMsg) {
    currentAlertStatus.isActive = true; // Показуємо червоний екран при помилці
    currentAlertStatus.type = errorMsg;
    return;
  }
  
  // Перевіряємо, чи є 'A' (Тривога) у всьому рядку
  if (alertString && alertString.includes('A')) {
    currentAlertStatus.isActive = true;
    currentAlertStatus.type = "АКТИВНА ФАЗА"; 
  } else {
    currentAlertStatus.isActive = false;
    currentAlertStatus.type = "НЕМАЄ ЗАГРОЗ";
  }
}

// 6. НОВА ФУНКЦІЯ МАЛЮВАННЯ ГОДИННИКА
function drawUpdatedClock(realTime) {
  let timeString = realTime.toLocaleString('uk-UA', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
  
  let status, statusColor;
  let typeText = currentAlertStatus.type;

  if (currentAlertStatus.isActive) {
    status = `АКТИВНА ФАЗА`;
    statusColor = color(255, 0, 0); // Червоний
  } else {
    status = "ОЧІКУВАННЯ";
    statusColor = color(0, 255, 0); // Зелений
  }

  // Червоний фільтр, якщо тривога АКТИВНА
  if (currentAlertStatus.isActive) {
    fill(255, 0, 0, 30); 
    noStroke();
    rect(0, 0, width, height);
  }

  // Тінь
  fill(0, 150);
  noStroke();
  rect(0, 0, 450, 130); 

  // Текст Часу (тепер реальний)
  fill(255);
  textSize(16);
  textAlign(LEFT, TOP);
  text(`РЕАЛЬНИЙ ЧАС: ${timeString}`, 10, 10);

  // Текст Статусу
  fill(statusColor);
  text(`СТАТУС: ${status}`, 10, 40);
  
  // Тип тривоги або Помилка
  let errorMsg = currentAlertStatus.error;
  if (errorMsg) {
    fill(255, 100, 100); // Червоний текст помилки
    text(`ПОМИЛКА: ${typeText}`, 10, 70);
  } else {
    fill(255); 
    text(`СТАН: ${typeText}`, 10, 70); // Просто "Активна" або "Немає"
  }
  
  // Лічильник (працює як і раніше)
  fill(255); 
  text(`"ШРАМІВ" У DNA: ${dnaCounter}`, 10, 100);
}