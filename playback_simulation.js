// === playback_simulation.js (v23.0 - "Ручні Кліщі" + Фікси) ===

// --- ГЛОБАЛЬНІ ЗМІННІ ---
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

// === НОВА ЛОГІКА МАСШТАБУВАННЯ (v22) ===
const ETALON_WIDTH = 2214; 
let PROPORTIONAL_SCALE = 1.0; 
const BASE_DNA_WEIGHT = [0.5, 1.5];
const BASE_STAR_SIZE = 5.0;
const BASE_TRIANGLE_SIZE = 6.0;
const BASE_TRIANGLE_INNER_SIZE = 2.5;
const BASE_LIVE_WEIGHT = [1.5, 2.5]; 

// === НОВІ НАЛАШТУВАННЯ ПОЛОТНА (v22) ===
const MASTER_ASPECT_RATIO = 3 / 2; 
const PADDING_X_PERCENT = 0.05; 
const PADDING_Y_PERCENT = 0.05; 
const SCREEN_PADDING_PERCENT = 0.05;
const BORDER_WIDTH = 5; 
let w, h; 

// === СТАРА ЛОГІКА СИМУЛЯЦІЇ ===
const TOTAL_SCARS = 107000; 
const bounds = { minLon: 22.1, maxLon: 40.2, minLat: 44.4, maxLat: 52.4 };
const KAB_SALVO_CHANCE = 1; 
let simulationData = []; 
let simStartTime; 
let simCurrentTime; 
// 🔴 === ВИПРАВЛЕННЯ ШВИДКОСТІ ===
let simSpeed = 8000; // 💡 (Повертаємо 10,000x для ~2-хвилинного відео)
// 🔴 === КІНЕЦЬ ===
let nextAttackIndex = 0; 
let startTime; // Для анімації "проявлення"
let isAlertActive = false; // Глобальний статус тривоги


// --- ЗАВАНТАЖЕННЯ ---
function preload() {
  console.log('Завантажуємо cities.json...');
  citiesData = loadJSON('cities.json'); 
}

// --- 🔴 SETUP (Гібрид v23.0) ---
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
  
  // === 🔴 ВИПРАВЛЕННЯ ВІДСТУПУ ===
  document.body.style.backgroundColor = '#000000';
  document.body.style.display = 'flex';
  document.body.style.alignItems = 'flex-start'; // 🔴 Змінено на 'flex-start'
  document.body.style.justifyContent = 'center'; 
  document.body.style.margin = '0';
  document.body.style.overflow = 'hidden'; 
  document.body.style.paddingTop = '5vh'; // 💡 ТЕПЕР ЦЕЙ РЯДОК ПРАЦЮЄ
  // === КІНЕЦЬ ВИПРАВЛЕННЯ ===
  
  // === ОБЧИСЛЮЄМО КОЕФІЦІЄНТ ===
  PROPORTIONAL_SCALE = width / ETALON_WIDTH; 
  console.log(`(Адаптація) Еталон: ${ETALON_WIDTH}px. Поточна: ${width}px. Коефіцієнт: ${PROPORTIONAL_SCALE}`);
  
  staticMapBuffer = createGraphics(w, h);
  
  scarColors = [
    color(255, 255, 0, 30), color(0, 255, 0, 30), color(255, 0, 255, 30),
    color(0, 255, 255, 30), color(200, 255, 0, 30), color(255, 100, 0, 30),
    color(100, 0, 255, 30)
  ];

  // === ЗАПУСК СИМУЛЯЦІЇ (зі старого коду) ===
  loadDataForSimulation();
  simStartTime = new Date("2025-10-29T00:00:00Z");
  simCurrentTime = simStartTime;
  
  // === "Запікаємо" DNA (зі старого коду, але з новим масштабом) ===
  buildStaticDNA();
  
  // === ЗАПУСКАЄМО ТАЙМЕР "ПРОЯВЛЕННЯ" ===
  startTime = millis();
}
// === КІНЕЦЬ SETUP ===


// --- 🔴 ГОЛОВНИЙ ЦИКЛ DRAW (Гібрид v23.0) ---
function draw() {
  
  let elapsedTime = millis() - startTime;

  // === ЛОГІКА "ПРОЯВЛЕННЯ" ===
  const STATE_1_END = 3000; // 3 сек
  const STATE_2_END = 6000; // 6 сек
  const STATE_3_END = 8000; // 8 сек (2 сек на cross-fade)

  // 🔴 СТАН 4: Нормальна робота (після 8 секунд)
  if (elapsedTime > STATE_3_END) {
    
    // 1. Малюємо "запечену" DNA
    image(staticMapBuffer, 0, 0); 

    // 2. ОНОВЛЮЄМО СИМУЛЯЦІЮ (зі старого коду)
    let elapsedRealTime = millis() - startTime - STATE_3_END; 
    let elapsedSimTime = elapsedRealTime * simSpeed;
    simCurrentTime = new Date(simStartTime.getTime() + elapsedSimTime);
    
    // Скидаємо прапор тривоги
    isAlertActive = false; 

    // === РІВЕНЬ 1: ПОСТІЙНИЙ ПОТІК КАБів ===
    if (random(100) < KAB_SALVO_CHANCE) {
      let salvoSize = floor(random(4, 10)); 
      let startCluster = launchPoints['Belgorod_Bryansk'];
      let targetGroup = targetNodes.frontline;
      if (startCluster && targetGroup && targetGroup.length > 0) {
        let startPoint = random(startCluster);
        for (let i = 0; i < salvoSize; i++) {
          let endPoint = random(targetGroup);
          liveAttacks.push(new LiveFlight(startPoint, endPoint, simCurrentTime));
        }
      }
    }

    // === РІВЕНЬ 2 & 3: ЛОГІКА "ТРИВОГ" (ФАЛЬШИВІ ТА БОЙОВІ) ===
    for (let alert of simulationData) {
      let startTime = alert.time; 
      let durationInMs = alert.durationHours * 60 * 60 * 1000;
      let endTime = new Date(startTime.getTime() + durationInMs);

      if (simCurrentTime >= startTime && simCurrentTime < endTime) {
        isAlertActive = true; // 🔴 Вмикаємо рамку
        
        // 🔴 === НОВА ЛОГІКА "КЛІЩІВ" (v23.0) ===
        // Перевіряємо, чи є у тривоги новий масив "attacks"
        if (alert.kinetic && alert.attacks) {
          let timeElapsedInAlert = simCurrentTime.getTime() - startTime.getTime();
          let alertProgress = timeElapsedInAlert / durationInMs; 
          
          // Проходимо по КОЖНІЙ групі запуску (напр. "Crimea", "Belgorod")
          for (let group of alert.attacks) {
            
            // Розраховуємо, скільки ракет/дронів "має" бути запущено з ЦІЄЇ ГРУПИ
            let expectedGroupLaunches = floor(group.count * alertProgress);

            // Запускаємо всі "пропущені" ракети з ЦІЄЇ ГРУПИ
            while (group.launchedCount < expectedGroupLaunches && group.launchedCount < group.count) {
              
              let startCluster = launchPoints[group.key]; // Беремо ключ з групи
              let targetKey = random(alert.targetRegions); // Ціль - спільна
              let targetGroup = targetNodes[targetKey];
              
              if (startCluster && targetGroup && targetGroup.length > 0) {
                let startPoint = random(startCluster);
                let endPoint = random(targetGroup);
                liveAttacks.push(new LiveFlight(startPoint, endPoint, simCurrentTime));
                group.launchedCount++; // Збільшуємо лічильник ЦІЄЇ ГРУПИ
              } else {
                break;
              }
            }
          }
        } // === КІНЕЦЬ НОВОЇ ЛОГІКИ "КЛІЩІВ" ===
      }
    }

    // 4. ОНОВЛЮЄМО ТА МАЛЮЄМО "ЖИВІ" АТАКИ
    for (let i = liveAttacks.length - 1; i >= 0; i--) {
      let attack = liveAttacks[i];
      if (attack.isExpired(simCurrentTime)) {
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
  } 
  // 🔴 СТАН 3: Cross-fade (6-8 секунд)
  else if (elapsedTime > STATE_2_END) {
    background(10, 10, 20);
    let fadeOutAlpha = map(elapsedTime, STATE_2_END, STATE_3_END, 255, 0);
    push(); 
    tint(255, fadeOutAlpha); 
    drawStarsOnly();
    drawTrianglesOnly();
    pop(); 
    
    let fadeInAlpha = map(elapsedTime, STATE_2_END, STATE_3_END, 0, 255);
    push();
    tint(255, fadeInAlpha);
    image(staticMapBuffer, 0, 0);
    pop();
  }
  // 🔴 СТАН 2: Зірки + Трикутники (3-6 секунд)
  else if (elapsedTime > STATE_1_END) {
    background(10, 10, 20); 
    drawStarsOnly();       
    drawTrianglesOnly();   
  } 
  // 🔴 СТАН 1: Тільки Зірки (0-3 секунди)
  else {
    background(10, 10, 20); 
    drawStarsOnly();       
  }
  
  // === КІНЕЦЬ ЛОГІКИ "ПРОЯВЛЕННЯ" ===
  

  // === 🔴 ЛОГІКА РАМКИ (v22) ===
  // (Працює завжди, незалежно від стану "проявлення")
  if (isAlertActive) {
    // --- 1. Є ТРИВОГА ---
    let alphaValueBorder = map(sin(millis() * 0.005), -1, 1, 0.4, 1.0); 
    canvas.style.border = `${BORDER_WIDTH}px solid rgba(255, 0, 0, ${alphaValueBorder})`;
  } else {
    // --- 2. НЕМАЄ ТРИВОГИ ---
    canvas.style.border = `${BORDER_WIDTH}px solid rgba(255, 255, 255, 1.0)`;
  }
  // === КІНЕЦЬ ===
}

// === 🔴 ФУНКЦІЯ: Заповнює даними (v23.0 - "Ручні Кліщі" + Більше атак) ===
function loadDataForSimulation() { 
  simulationData = [
  // === 29.10 ===
  {"time":"2025-10-29T09:15:00Z", "type":"ЗЛІТ МіГ-31К", "durationHours":1.5, "kinetic":false, "targetRegions":["all"]},
  {"time":"2025-10-29T14:30:00Z", "type":"БАЛІСТИЧНА ЗАГРОЗА", "durationHours":0.5, "kinetic":true, "targetRegions":["frontline"], "attacks": [
    {"key": "Belgorod_Bryansk", "count": 15}
  ]},
  {"time":"2025-10-29T18:00:00Z", "type":"ЗЛІТ МіГ-31К", "durationHours":1.0, "kinetic":false, "targetRegions":["all"]},
  
  // === 30.10 ===
  {"time":"2025-10-30T02:00:00Z", "type":"АТАКА БпЛА", "durationHours":4.0, "kinetic":true, "targetRegions":["central", "kyiv"], "attacks": [
    {"key": "Primorsko_Akhtarsk", "count": 100},
    {"key": "Crimea", "count": 50}
  ]},
  {"time":"2025-10-30T11:00:00Z", "type":"ЗЛІТ МіГ-31К", "durationHours":2.0, "kinetic":false, "targetRegions":["all"]},
  {"time":"2025-10-30T16:00:00Z", "type":"БАЛІСТИЧНА ЗАГРОЗА", "durationHours":0.5, "kinetic":true, "targetRegions":["frontline"], "attacks": [
    {"key": "Belgorod_Bryansk", "count": 15}
  ]},
  
  // === 31.10 ===
  {"time":"2025-10-31T03:00:00Z", "type":"АТАКА БпЛА", "durationHours":3.5, "kinetic":true, "targetRegions":["southern"], "attacks": [
    {"key": "Crimea", "count": 100},
    {"key": "Black_Sea", "count": 50}
  ]},
  {"time":"2025-10-31T09:00:00Z", "type":"ЗЛІТ МіГ-31К", "durationHours":1.0, "kinetic":false, "targetRegions":["all"]},
  {"time":"2025-10-31T15:10:00Z", "type":"БАЛІСТИЧНА ЗАГРОЗА", "durationHours":0.5, "kinetic":true, "targetRegions":["frontline"], "attacks": [
    {"key": "Belgorod_Bryansk", "count": 15}
  ]},
  
  // === 01.11 (Масована Атака 1) ===
  {"time":"2025-11-01T01:00:00Z", "type":"АТАКА БпЛА (Хвиля 1)", "durationHours":5.0, "kinetic":true, "targetRegions":["kyiv", "central", "southern"], "attacks": [
    {"key": "Primorsko_Akhtarsk", "count": 150},
    {"key": "Crimea", "count": 100},
    {"key": "Black_Sea", "count": 50}
  ]},
  {"time":"2025-11-01T04:00:00Z", "type":"МАСОВАНА АТАКА (Хвиля 2)", "durationHours":2.0, "kinetic":true, "targetRegions":["kyiv", "western", "central"], "attacks": [
    {"key": "Caspian_Sea", "count": 100},
    {"key": "Black_Sea", "count": 50},
    {"key": "Belgorod_Bryansk", "count": 30}
  ]},
  {"time":"2025-11-01T11:00:00Z", "type":"ЗЛІТ МіГ-31К", "durationHours":1.5, "kinetic":false, "targetRegions":["all"]},
  
  // === 02.11 ===
  {"time":"2025-11-02T10:00:00Z", "type":"ЗЛІТ МіГ-31К", "durationHours":1.0, "kinetic":false, "targetRegions":["all"]},
  {"time":"2025-11-02T16:00:00Z", "type":"ЗЛІТ МіГ-31К", "durationHours":1.5, "kinetic":false, "targetRegions":["all"]},
  {"time":"2025-11-02T19:00:00Z", "type":"БАЛІСТИЧНА ЗАГРОЗА", "durationHours":0.5, "kinetic":true, "targetRegions":["frontline"], "attacks": [
    {"key": "Belgorod_Bryansk", "count": 15}
  ]},
  
  // === 03.11 ===
  {"time":"2025-11-03T02:30:00Z", "type":"АТАКА БпЛА", "durationHours":3.0, "kinetic":true, "targetRegions":["southern"], "attacks": [
    {"key": "Crimea", "count": 150}
  ]},
  {"time":"2025-11-03T13:00:00Z", "type":"ЗЛІТ МіГ-31К", "durationHours":1.5, "kinetic":false, "targetRegions":["all"]},
  {"time":"2025-11-03T18:00:00Z", "type":"БАЛІСТИЧНА ЗАГРОЗА", "durationHours":0.5, "kinetic":true, "targetRegions":["frontline"], "attacks": [
    {"key": "Belgorod_Bryansk", "count": 15}
  ]},
  
  // === 04.11 ===
  {"time":"2025-11-04T10:00:00Z", "type":"ЗЛІТ МіГ-31К", "durationHours":1.0, "kinetic":false, "targetRegions":["all"]},
  {"time":"2025-11-04T15:10:00Z", "type":"БАЛІСТИЧНА ЗАГРОЗА", "durationHours":0.5, "kinetic":true, "targetRegions":["frontline"], "attacks": [
    {"key": "Belgorod_Bryansk", "count": 15}
  ]},
  {"time":"2025-11-04T18:00:00Z", "type":"БАЛІСТИЧНА ЗАГРОЗА", "durationHours":0.5, "kinetic":true, "targetRegions":["frontline"], "attacks": [
    {"key": "Belgorod_Bryansk", "count": 15}
  ]},
  
  // === 05.11 (Ракетна атака БЕЗ Білорусі) ===
  {"time":"2025-11-05T03:00:00Z", "type":"РАКЕТНА АТАКА", "durationHours":1.0, "kinetic":true, "targetRegions":["kyiv", "western"], "attacks": [
    {"key": "Belgorod_Bryansk", "count": 50},
    {"key": "Caspian_Sea", "count": 40}
  ]},
  {"time":"2025-11-05T09:00:00Z", "type":"ЗЛІТ МіГ-31К", "durationHours":1.0, "kinetic":false, "targetRegions":["all"]},
  {"time":"2025-11-05T17:00:00Z", "type":"ЗЛІТ МіГ-31К", "durationHours":1.5, "kinetic":false, "targetRegions":["all"]},
  
  // === 06.11 ===
  {"time":"2025-11-06T02:00:00Z", "type":"АТАКА БпЛА", "durationHours":4.0, "kinetic":true, "targetRegions":["central", "kyiv"], "attacks": [
    {"key": "Primorsko_Akhtarsk", "count": 100},
    {"key": "Crimea", "count": 50}
  ]},
  {"time":"2025-11-06T11:00:00Z", "type":"ЗЛІТ МіГ-31К", "durationHours":1.5, "kinetic":false, "targetRegions":["all"]},
  {"time":"2025-11-06T14:20:00Z", "type":"БАЛІСТИЧНА ЗАГРОЗА", "durationHours":0.5, "kinetic":true, "targetRegions":["frontline"], "attacks": [
    {"key": "Belgorod_Bryansk", "count": 15}
  ]},
  {"time":"2025-11-06T18:00:00Z", "type":"БАЛІСТИЧНА ЗАГРОЗА", "durationHours":0.5, "kinetic":true, "targetRegions":["frontline"], "attacks": [
    {"key": "Belgorod_Bryansk", "count": 15}
  ]},
  
  // === 07.11 ===
  {"time":"2025-11-07T09:00:00Z", "type":"ЗЛІТ МіГ-31К", "durationHours":1.0, "kinetic":false, "targetRegions":["all"]},
  {"time":"2025-11-07T15:00:00Z", "type":"ЗЛІТ МіГ-31К", "durationHours":1.5, "kinetic":false, "targetRegions":["all"]},
  
  // === 08.11 (Масована Атака 2) ===
  {"time":"2025-11-08T01:00:00Z", "type":"АТАКА БпЛА (Хвиля 1)", "durationHours":5.0, "kinetic":true, "targetRegions":["southern", "central", "western"], "attacks": [
    {"key": "Crimea", "count": 150},
    {"key": "Primorsko_Akhtarsk", "count": 100},
    {"key": "Black_Sea", "count": 50}
  ]},
  {"time":"2025-11-08T03:30:00Z", "type":"МАСОВАНА АТАКА (Хвиля 2)", "durationHours":3.0, "kinetic":true, "targetRegions":["western", "central"], "attacks": [
    {"key": "Caspian_Sea", "count": 100},
    {"key": "Black_Sea", "count": 80}
  ]},
  {"time":"2025-11-08T10:00:00Z", "type":"ЗЛІТ МіГ-31К", "durationHours":1.0, "kinetic":false, "targetRegions":["all"]},
  
  // === 09.11 ===
  {"time":"2025-11-09T11:30:00Z", "type":"БАЛІСТИЧНА ЗАГРОЗА", "durationHours":0.5, "kinetic":true, "targetRegions":["frontline"], "attacks": [
    {"key": "Belgorod_Bryansk", "count": 15}
  ]},
  {"time":"2025-11-09T16:00:00Z", "type":"ЗЛІТ МіГ-31К", "durationHours":1.5, "kinetic":false, "targetRegions":["all"]},
  {"time":"2025-11-09T18:00:00Z", "type":"БАЛІСТИЧНА ЗАГРОЗА", "durationHours":0.5, "kinetic":true, "targetRegions":["frontline"], "attacks": [
    {"key": "Belgorod_Bryansk", "count": 15}
  ]},
  
  // === 10.11 ===
  {"time":"2025-11-10T02:00:00Z", "type":"АТАКА БпЛА", "durationHours":4.0, "kinetic":true, "targetRegions":["central", "kyiv"], "attacks": [
    {"key": "Primorsko_Akhtarsk", "count": 150}
  ]},
  {"time":"2025-11-10T10:00:00Z", "type":"ЗЛІТ МіГ-31К", "durationHours":1.5, "kinetic":false, "targetRegions":["all"]},
  {"time":"2025-11-10T15:10:00Z", "type":"БАЛІСТИЧНА ЗАГРОЗА", "durationHours":0.5, "kinetic":true, "targetRegions":["frontline"], "attacks": [
    {"key": "Belgorod_Bryansk", "count": 15}
  ]},
  
  // === 11.11 (ВАШ ПРИКЛАД) ===
  {"time":"2025-11-11T09:00:00Z", "type":"ЗЛІТ МіГ-31К", "durationHours":1.0, "kinetic":false, "targetRegions":["all"]},
  {"time":"2025-11-11T14:00:00Z", "type":"ЗЛІТ МіГ-31К", "durationHours":1.5, "kinetic":false, "targetRegions":["all"]},
  {"time":"2025-11-11T18:00:00Z", "type":"АТАКА БпЛА", "durationHours":3.0, "kinetic":true, "targetRegions":["southern"], "attacks": [
    {"key": "Crimea", "count": 40},
    {"key": "Belgorod_Bryansk", "count": 50},
    {"key": "Caspian_Sea", "count": 30}
  ]},
  
  // === 12.11 ===
  {"time":"2025-11-12T10:00:00Z", "type":"ЗЛІТ МіГ-31К", "durationHours":1.5, "kinetic":false, "targetRegions":["all"]},
  {"time":"2025-11-12T17:00:00Z", "type":"ЗЛІТ МіГ-31К", "durationHours":1.0, "kinetic":false, "targetRegions":["all"]},
  {"time":"2025-11-12T18:00:00Z", "type":"БАЛІСТИЧНА ЗАГРОЗА", "durationHours":0.5, "kinetic":true, "targetRegions":["frontline"], "attacks": [
    {"key": "Belgorod_Bryansk", "count": 15}
  ]},
  {"time":"2025-11-12T23:00:00Z", "type":"АТАКА БпЛА", "durationHours":4.0, "kinetic":true, "targetRegions":["central", "kyiv"], "attacks": [
    {"key": "Primorsko_Akhtarsk", "count": 100},
    {"key": "Belarus", "count": 50}
  ]}
];


  // 🔴 === НОВИЙ ЦИКЛ ІНІЦІАЛІЗАЦІЇ ===
  // Сортуємо дані та ініціалізуємо
  simulationData.sort((a, b) => new Date(a.time) - new Date(b.time));
  for (let alert of simulationData) {
    alert.time = new Date(alert.time);
    // Ініціалізуємо лічильники для КОЖНОЇ групи запуску
    if (alert.kinetic && alert.attacks) {
      for (let group of alert.attacks) {
        group.launchedCount = 0; // 0 для "Crimea", 0 для "Belgorod" і т.д.
      }
    }
  }
}

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
      allCities.push({
        name: city.name,
        pos: mapWithAspectRatio(lon, lat),
        lon: lon, lat: lat
      });
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
  targetNodes.kyiv = [mapWithAspectRatio(30.52, 50.45)];
  targetNodes.southern = [mapWithAspectRatio(30.72, 46.48)];
  targetNodes.central = [mapWithAspectRatio(28.68, 48.29), mapWithAspectRatio(32.26, 48.45), mapWithAspectRatio(28.46, 49.23), mapWithAspectRatio(32.05, 49.44), mapWithAspectRatio(28.65, 50.26)];
  targetNodes.western = [mapWithAspectRatio(24.02, 49.83), mapWithAspectRatio(25.59, 49.55), mapWithAspectRatio(24.71, 48.92), mapWithAspectRatio(28.93, 49.61)];

  for (let i = 0; i < TOTAL_SCARS; i++) {
    let targetNode = selectTargetNode();
    let startCluster = selectStartCluster();
    let startPoint = random(startCluster);
    historicalScars.push({
      start: startPoint, end: targetNode,
      color: random(scarColors), 
      // 🔴 Адаптуємо товщину
      weight: random(BASE_DNA_WEIGHT[0], BASE_DNA_WEIGHT[1]) * PROPORTIONAL_SCALE
    });
  }

  drawStaticMapToBuffer(); // Малюємо на буфер
  randomSeed(null); 
}

// --- Функції-помічники ---

function mapWithAspectRatio(lon, lat) {
  // (Використовуємо PADDING_PERCENT з налаштувань)
  let mapRatio = (bounds.maxLon - bounds.minLon) / (bounds.maxLat - bounds.minLat);
  let canvasRatio = width / height;
  let w_map, h_map, offsetX, offsetY;
  
  // 🔴 Використовуємо PADDING_X_PERCENT та PADDING_Y_PERCENT, які ми визначили глобально
  let paddingX = width * PADDING_X_PERCENT;
  let paddingY = height * PADDING_Y_PERCENT;

  if (canvasRatio > mapRatio) {
    h_map = height - (paddingY * 2); 
    w_map = h_map * mapRatio;
    offsetX = (width - w_map) / 2; 
    offsetY = paddingY;
  } else {
    w_map = width - (paddingX * 2); 
    h_map = w_map / mapRatio;
    offsetX = paddingX;
    offsetY = (height - h_map) / 2; 
  }
  
  let x = map(lon, bounds.minLon, bounds.maxLon, offsetX, offsetX + w_map);
  let y = map(lat, bounds.minLat, bounds.maxLat, offsetY + h_map, offsetY); 
  return createVector(x, y);
}

function generateFrontlinePoints(numPoints) {
  let frontlineNodes = [];
  const waypoints = [
    mapWithAspectRatio(37.5, 49.8), 
    mapWithAspectRatio(37.8, 48.5), 
    mapWithAspectRatio(35.8, 47.5), 
    mapWithAspectRatio(33.0, 46.7) 
  ];
  for (let i = 0; i < waypoints.length - 1; i++) {
    let start = waypoints[i];
    let end = waypoints[i + 1];
    for (let j = 0; j < numPoints / (waypoints.length - 1); j++) {
      let t = random(1); 
      let pos = p5.Vector.lerp(start, end, t);
      pos.x += random(-15, 15);
      pos.y += random(-15, 15);
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


// === ФУНКЦІЯ МАЛЮВАННЯ (на БУФЕР) ===
function drawStaticMapToBuffer() {
  staticMapBuffer.background(10, 10, 20);
  staticMapBuffer.noFill();
  for (let scar of historicalScars) {
    staticMapBuffer.stroke(scar.color);
    staticMapBuffer.strokeWeight(scar.weight); // 'weight' вже має PROPORTIONAL_SCALE
    drawComplexCurveToBuffer(scar.start, scar.end); 
  }
  
  // 🔴 Малюємо ЗІРКИ (з v22 логікою)
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
  
  // 🔴 Малюємо ТРИКУТНИКИ (з v22 логікою)
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
  // 🔴 Адаптуємо товщину
  staticMapBuffer.strokeWeight(random(BASE_DNA_WEIGHT[0], BASE_DNA_WEIGHT[1]) * PROPORTIONAL_SCALE); 
  staticMapBuffer.beginShape();
  staticMapBuffer.vertex(attack.start.x, attack.start.y);
  staticMapBuffer.bezierVertex(attack.cp1_x, attack.cp1_y, attack.cp2_x, attack.cp2_y, attack.end.x, attack.end.y);
  staticMapBuffer.endShape();
}

// === КЛАС ДЛЯ "ЖИВОГО ПОЛЬОТУ" (Адаптовано) ===
class LiveFlight {
  constructor(startVector, endVector, simulationStartTime) {
    this.start = startVector;
    this.end = endVector;
    this.simulationStartTime = simulationStartTime; 
    this.isBaked = false; 
    this.speed = 0.005; 
    // 🔴 Адаптуємо товщину
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
    if (this.progressHead < 1.0) {
      this.progressHead += this.speed;
    } else {
      this.progressHead = 1.0;
    }
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

  hasArrived() {
    return this.progressHead >= 1.0;
  }
  
  isExpired(currentSimTime) {
    const hours24 = 24 * 60 * 60 * 1000; // 24 години в мс
    let expiryTime = new Date(this.simulationStartTime.getTime() + hours24);
    return currentSimTime >= expiryTime;
  }
}

// 🔴 === НОВІ ФУНКЦІЇ ДЛЯ "ПРОЯВЛЕННЯ" (v21.1 з пульсацією) ===
// (Вони малюють на головне полотно, НЕ на буфер)
function drawStarsOnly() {
  let starSize = BASE_STAR_SIZE * PROPORTIONAL_SCALE;
  noStroke();
  let alphaValue = map(sin(millis() * 0.005), -1, 1, 100, 255); 

  for (let city of allCities) {
    if (majorCityNames.includes(city.name)) continue;
    fill(255, alphaValue); 
    circle(city.pos.x, city.pos.y, starSize);
  }
  noStroke();
  for (let city of allCities) {
    if (majorCityNames.includes(city.name)) {
      fill(255, 255, 200, alphaValue); 
      circle(city.pos.x, city.pos.y, starSize);
      fill(255, 255, 255, alphaValue); 
      circle(city.pos.x, city.pos.y, starSize);
    }
  }
}

function drawTrianglesOnly() {
  noStroke();
  let alphaValue = map(sin(millis() * 0.006), -1, 1, 100, 255);
  let alphaValueDim = map(sin(millis() * 0.006), -1, 1, 80, 200); 

  for (let clusterName in launchPoints) {
    let cluster = launchPoints[clusterName];
    for (let launchPos of cluster) {
      let s = BASE_TRIANGLE_SIZE * PROPORTIONAL_SCALE;
      fill(255, 0, 0, alphaValueDim); 
      triangle(launchPos.x, launchPos.y - s, launchPos.x - s, launchPos.y + s, launchPos.x + s, launchPos.y + s);
      fill(255, 100, 100, alphaValue); 
      s = BASE_TRIANGLE_INNER_SIZE * PROPORTIONAL_SCALE;
      triangle(launchPos.x, launchPos.y - s, launchPos.x - s, launchPos.y + s, launchPos.x + s, launchPos.y + s);
    }
  }
}