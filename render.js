let gameLoopId;
let isPaused = false;
let lastPlayerAttackTime = performance.now(); 
let lastTime = performance.now();
let quadtree;
// Объявляем переменные виртуального мира заранее
let worldWidth, worldHeight;
// Инициализация Canvas и контекста
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
// Объект камеры и функции преобразования координат
const camera = {
  offsetX: 0,
  offsetY: 0,
  scale: 0.5  // Начальный масштаб – можно регулировать
};

function worldToScreen(x, y) {
  return { x: x * camera.scale + camera.offsetX, y: y * camera.scale + camera.offsetY };
}

function screenToWorld(x, y) {
  return { x: (x - camera.offsetX) / camera.scale, y: (y - camera.offsetY) / camera.scale };
}

// Глобальный счетчик для уникальных идентификаторов зданий
let buildingIdCounter = 0;
function generateUniqueBuildingId() {
  return 'building_' + buildingIdCounter++;
}
// Классы игровых объектов
class Building {
  constructor(type, owner, x, y) {
	  this.id = generateUniqueBuildingId(); // уникальный идентификатор для каждой казармы и другого здания
    this.type = type;
    this.owner = owner;
    this.x = x;
    this.y = y;
    if (type === "warehouse") {
      this.width = 10; this.height = 10;
      this.workers = 0; this.health = 250; this.maxHealth = 250;
    } 
	  else if (type === "barracks") {
      this.width = 15; this.height = 15;
      this.fighters = 0; this.health = 400; this.maxHealth = 400;
		  this.productionQueue = []; this.productionLimit = 5; //массив и очередь на заказ юнитов
    } 
	  else if (type === "barracks2") {
      this.width = 25; this.height = 15;
      // Для казармы2 будем использовать её для найма штурмовиков
      this.fighters = 0; this.health = 550; this.maxHealth = 550;
		this.productionQueue = []; this.productionLimit = 5; //массив и очередь на заказ юнитов
    } 
	  else if (type === "base") {
      this.width = 20; this.height = 20;
      this.health = 1000; this.maxHealth = 1000;
		this.productionQueue = []; this.productionLimit = 5; //массив и очередь на заказ юнитов
    } 
	  else if (type === "base2") {
      this.width = 25; this.height = 30;
      this.health = 1200; this.maxHealth = 1200;
    } 
	  else if (type === "turret") {
      this.width = 12; this.height = 12;
      this.health = 250; this.maxHealth = 250;
      this.range = 190; this.fireRate = 170;
      this.lastFireTime = 0; this.angle = 0;
      this.target = null;
    } 
	  else if (type === "turret2") {
      this.width = 15; this.height = 17;
      this.health = 350; this.maxHealth = 350;
      this.range = 500; this.fireRate = 3000;
      this.lastFireTime = 0; this.angle = 0;
      this.target = null;
    } 
	  else if (type === "beacon") {
      this.width = 4; this.height = 17;
      this.health = 250; this.maxHealth = 250;
      this.buildZoneMultiplier = 2;
    } 
	  else if (type === "repairWorkshop") {
      this.width = 10; this.height = 10;
      this.health = 300; this.maxHealth = 300;
      this.capacity = 5;
      this.repairman = 0;
      this.controlRadius = 400;
    }
    // Новые типы зданий:
    else if (type === "base3") {
      this.width = 30; this.height = 30;
      this.health = 1500; this.maxHealth = 1500;
    } 
	  else if (type === "barracks3") {
      this.width = 20; this.height = 15;
      this.fighters = 0; this.health = 80; this.maxHealth = 80;
		this.productionQueue = []; this.productionLimit = 5; //массив и очередь на заказ юнитов
    }
	  else if (type === "wall") {
      this.width = 3; this.height = 5;
      this.health = 400; this.maxHealth = 400;
		this.productionQueue = []; this.productionLimit = 5; //массив и очередь на заказ юнитов
    }
	  // Добавляем стоимость здания:
    switch (type) {
      case "warehouse":
        this.buildCost = { ...WAREHOUSE_COST };
        break;
      case "repairWorkshop":
        this.buildCost = { ...REPAIR_WORKSHOP_COST };
        break;
      case "barracks":
        this.buildCost = { ...BARRACKS_COST };
        break;
      case "turret":
        this.buildCost = { ...TURRET_COST };
        break;
      case "beacon":
        this.buildCost = { ...BEACON_COST };
        break;
      case "base":
        this.buildCost = { ...BASE_COST };
        break;
      case "base2":
        this.buildCost = { ...BASE2_COST };
        break;
      // Добавьте остальные типы по необходимости
      default:
        this.buildCost = { gold: 0, silicon: 0, plasma: 0 };
    }
  }
}
class Unit {
  constructor(type, owner, x, y) {
    this.type = type;
    this.owner = owner;
    this.x = x; this.y = y;
    this.target = null;
    this.commandQueue = [];
    this.idleTimer = 0;
    this.currentMovementAnimation = null;
    this.angle = 0;
    this.scale = 1;
    this.hidden = false;
    this.hiding = false;
    this.inWorkshop = null;
    this.maneuvering = false;
    if (type === "worker") {
	  this.vx = 0; // инициализация скорости по x
      this.vy = 0; // инициализация скорости по y
      this.health = 50;
      this.maxHealth = 50;
    } else if (type === "fighter") {
		this.vx = 0; // инициализация скорости по x
      this.vy = 0; // инициализация скорости по y
      this.health = 100;
      this.maxHealth = 100;
      this.range = 150;
      this.fireRate = 350;
      this.lastFireTime = 0;
      this.orbitRadius = undefined;
      this.orbitAngle = undefined;
      this.engagementRadius = 500;
    } else if (type === "repairman") {
		this.vx = 0; // инициализация скорости по x
      this.vy = 0; // инициализация скорости по y
      this.health = 50;
      this.maxHealth = 50;
      this.engagementRadius = 500;
      this.scale = 0.4;
    }
    else if (type === "assault") {
		this.vx = 0; // инициализация скорости по x
      this.vy = 0; // инициализация скорости по y
  this.health = 200;
  this.maxHealth = 200;
  // Пулемётный режим:
  this.machineGunRange = 200;          // Радиус действия пулемёта
  this.machineGunFireRate = 250;         // Интервал стрельбы пулемётом (мс)
  this.lastMachineGunFireTime = 0;
  // Ракетный режим (аналог турели2):
  this.rocketRange = 280;               // Радиус для ракетного выстрела
  this.rocketCooldown = 3000;           // Кулдаун ракетного выстрела (мс)
  this.lastRocketFireTime = performance.now();
  this.engagementRadius = 500;
  this.range = 280; // <-- Добавляем общее свойство range для определения дистанции атаки
}

    // Новый тип: элитный (лингкор)
    else if (type === "elite") {
		this.vx = 0; // инициализация скорости по x
      this.vy = 0; // инициализация скорости по y
      this.health = 350;
      this.maxHealth = 350;
      this.range = 500;
      this.meleeRange = 200;   // Если враг ближе 100 единиц – использовать шрапнель
      this.artilleryRange = 500;  // Если враг между 100 и 150 – использовать ракетный залп
      this.laserRange = 300;   // Если враг дальше 150 – использовать лазерный выстрел
      
      this.lastMeleeAttack = 0;
      this.lastArtilleryAttack = 0;
      this.lastLaserAttack = 0;
      this.meleeCooldown = 1000;
      this.artilleryCooldown = 10000;
      this.laserCooldown = 5000;
    }

  }
}
class Resource {
  constructor(type, x, y, amount, max) {
    this.type = type;
    this.x = x;
    this.y = y;
    this.amount = amount;
    this.max = max;
    this.depleted = false;
    if (this.type === "gold") {
      const shape = createGoldShape();
      this.points = shape.points;
      this.baseRadius = shape.baseRadius;
      this.rotation = 0;
      this.rotationSpeed = 0.2;
    }
  }
}
class Bullet {
  constructor(x, y, angle, speed, shooter, target) {
    this.x = x; this.y = y;
    this.angle = angle; this.speed = speed;
    this.shooter = shooter; this.target = target;
    this.alive = true; this.damage = 10; this.lifetime = 1.5;
    // Свойство color будет задаваться при создании, если нужно
  }
}
// Обработчик загрузки страницы:
window.addEventListener("load", () => {
  resizeCanvas();

  // Обработчик кнопки "Старт"
  const startButton = document.getElementById("startButton");
  startButton.addEventListener("click", () => {
    // Скрываем загрузочный экран
    const loadingScreen = document.getElementById("loadingScreen");
    if (loadingScreen) loadingScreen.style.display = "none";
    
	   gameStarted = true; // Игра запущена
    // Запускаем игровой цикл и ИИ
    isPaused = false;
    lastTime = performance.now();
    gameLoopId = requestAnimationFrame(gameLoop);
	  initAILogic();
    aiLogicInterval = setInterval(aiLogic, 25000);
  });
});
// ========================
// Бургер-меню с кнопками
// ========================
// Создаем бургер-кнопку (иконка слева вверху)
const burgerButton = document.createElement("div");
burgerButton.id = "burgerButton";
burgerButton.innerHTML = "&#9776;"; // символ «бургер» (три линии)
burgerButton.style.position = "fixed";
burgerButton.style.top = "5px";
burgerButton.style.left = "5px";
burgerButton.style.fontSize = "15px";
burgerButton.style.cursor = "pointer";
burgerButton.style.zIndex = "1000";
burgerButton.style.padding = "3px 6px";
burgerButton.style.backgroundColor = "rgba(0,0,0,0.7)";
burgerButton.style.color = "#fff";
burgerButton.style.borderRadius = "3px";
document.body.appendChild(burgerButton);
// Создаем панель меню – скрытую по умолчанию
const gameMenu = document.createElement("div");
gameMenu.id = "gameMenu";
gameMenu.style.position = "fixed";
gameMenu.style.top = "30px";
gameMenu.style.left = "5px";
gameMenu.style.backgroundColor = "rgba(0,0,0,0.8)";
gameMenu.style.padding = "10px";
gameMenu.style.borderRadius = "5px";
gameMenu.style.zIndex = "1000";
gameMenu.style.display = "none"; // по умолчанию меню скрыто
document.body.appendChild(gameMenu);
// Создаем кнопки меню
const btnPause = document.createElement("button");
btnPause.innerText = "Пауза";
btnPause.style.marginRight = "5px";
gameMenu.appendChild(btnPause);

const btnSave = document.createElement("button");
btnSave.innerText = "Сохранить";
btnSave.style.marginRight = "5px";
gameMenu.appendChild(btnSave);

const btnLoad = document.createElement("button");
btnLoad.innerText = "Загрузить";
btnLoad.style.marginRight = "5px";
gameMenu.appendChild(btnLoad);

const btnExit = document.createElement("button");
btnExit.innerText = "Выйти";
gameMenu.appendChild(btnExit);

// Переключение видимости меню по клику на бургер-кнопку
burgerButton.addEventListener("click", () => {
  gameMenu.style.display = (gameMenu.style.display === "none") ? "block" : "none";
});

// Обработчик кнопки "Выйти" – перезагружаем страницу
btnExit.addEventListener("click", () => {
  if (confirm("Пауза")) {
    //location.reload();
  }
});

btnPause.addEventListener("click", () => {
  alert("Пауза"); // Блокирующее окно
});


// Обработчик кнопки "Сохранить" – сохраняем gameState в localStorage
btnSave.addEventListener("click", () => {
  try {
    const state = JSON.stringify(gameState);
    localStorage.setItem("savedGameState", state);
    alert("Игра сохранена!");
  } catch (e) {
    console.error("Ошибка сохранения:", e);
    alert("Ошибка сохранения!");
  }
});

// Обработчик кнопки "Загрузить" – загружаем gameState из localStorage
btnLoad.addEventListener("click", () => {
  try {
    // Загружаем сохранённое состояние игры
    const state = localStorage.getItem("savedGameState");
    if (state) {
      let loadedState = JSON.parse(state);
      // Убираем данные тумана, если они есть
      delete loadedState.fogMap;
      delete loadedState.persistentFogMap;
      
      // Восстанавливаем основное состояние игры
      Object.assign(gameState, loadedState);
      
      // Загружаем отдельно сохранённый счёт игрока
      const savedScore = localStorage.getItem("playerScore");
      if (savedScore !== null) {
        gameState.playerScore = parseInt(savedScore, 10);
        updateScoreUI();
      }
      
      // Переинициализируем туман, если необходимо
      fogMap = [];
      persistentFogMap = [];
      initFogOfWar();
      updateFogOfWar();
      
      alert("Игра загружена!");
    } else {
      alert("Нет сохранённых данных!");
    }
  } catch (e) {
    console.error("Ошибка загрузки:", e);
    alert("Ошибка загрузки!");
  }
});



// Обработчик кнопки "Выйти" – перезагружаем страницу
btnExit.addEventListener("click", () => {
  if (confirm("Вы действительно хотите выйти?")) {
    location.reload();
  }
});
// Функция создания звёздного слоя
function createStarLayer(width, height, starCount, minSize, maxSize) {
  const offscreen = document.createElement("canvas");
  offscreen.width = width;
  offscreen.height = height;
  const ctxOff = offscreen.getContext("2d");
  for (let i = 0; i < starCount; i++) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    const size = minSize + Math.random() * (maxSize - minSize);
    const alpha = 0.5 + Math.random() * 0.5;
    ctxOff.fillStyle = `rgba(255,255,255,${alpha})`;
    ctxOff.beginPath();
    ctxOff.arc(x, y, size, 0, Math.PI * 2);
    ctxOff.fill();
  }
  return offscreen;
}

// Объект звездного поля
const starField = {
  layers: [],
  init: function() {
    const canvasW = canvas.width;
    const canvasH = canvas.height;
    this.layers = [];
    this.layers.push({ canvas: createStarLayer(canvasW, canvasH, 300, 0.5, 1.2), speed: 0.1 });
    this.layers.push({ canvas: createStarLayer(canvasW, canvasH, 200, 1, 2), speed: 0.3 });
    this.layers.push({ canvas: createStarLayer(canvasW, canvasH, 100, 0.5, 1), speed: 0.5 });
  },
  draw: function() {
    ctx.save();
    this.layers.forEach(layer => {
      const offsetX = - (camera.offsetX * layer.speed) % canvas.width;
      const offsetY = - (camera.offsetY * layer.speed) % canvas.height;
      for (let i = -1; i <= 1; i++) {
        for (let j = -1; j <= 1; j++) {
          ctx.drawImage(layer.canvas, offsetX + i * canvas.width, offsetY + j * canvas.height, canvas.width, canvas.height);
        }
      }
    });
    ctx.restore();
  }
};
starField.init();
// Функция обновления поведения скоплений (swarm behavior)
// Определяем её в глобальной области видимости render.js
function updateSwarmBehavior(deltaTime) {
  const neighborRadius = 15;         // Радиус для поиска соседей
  const cohesionFactor = 0.05;         // Влияние стремления к центру масс
  const alignmentFactor = 0.05;        // Влияние выравнивания направления
  const separationDistance = 20;       // Минимальное расстояние между юнитами
  const separationSmoothing = 1;       // Коэффициент сглаживания отделения
  
  // Обновляем поведение для idle‑юнитов
  gameState.units.forEach(unit => {
    // Если юнит занят командами, не применяем эффект ожидания
    if (unit.commandQueue && unit.commandQueue.length > 0) return;
    
    // Добавляем базовое покачивание, изменяя положение и масштаб
    // Используем текущее время и уникальный фазовый сдвиг для каждого юнита (если его нет, генерируем)
    if (unit.idlePhase === undefined) {
      unit.idlePhase = Math.random() * Math.PI * 2;
    }
    const t = performance.now() / 1000; // время в секундах
    // Настройки амплитуды перемещения и изменения масштаба (подберите значения по вкусу)
    const posAmplitude = 2; // пикселей
    const scaleAmplitude = 0.1; // +-5% изменения масштаба
    
    // Обновляем положение: добавляем колебание по x и y
    unit.x += Math.sin(t + unit.idlePhase) * posAmplitude * deltaTime;
    unit.y += Math.cos(t + unit.idlePhase) * posAmplitude * deltaTime;
    
    // Обновляем масштаб: например, плавное изменение от 0.95 до 1.05
    unit.scale = 1 + Math.sin(t + unit.idlePhase) * scaleAmplitude;
    
    // Дополнительно можно применить базовую логику когезии/выравнивания, если нужно
    const neighbors = getObjectsInRange({ x: unit.x, y: unit.y }, neighborRadius)
      .filter(other => other !== unit && other.owner === unit.owner && other instanceof Unit);
    const count = neighbors.length;
    if (count > 0) {
      let sumX = 0, sumY = 0, sumAngle = 0;
      neighbors.forEach(other => {
        sumX += other.x;
        sumY += other.y;
        sumAngle += other.angle;
      });
      const centerX = sumX / count;
      const centerY = sumY / count;
      const avgAngle = sumAngle / count;
      const desiredAngle = Math.atan2(centerY - unit.y, centerX - unit.x);
      unit.angle = lerpAngle(unit.angle, desiredAngle, cohesionFactor * deltaTime);
      unit.angle = lerpAngle(unit.angle, avgAngle, alignmentFactor * deltaTime);
    }
  });
  
  // Этап отделения – предотвращаем чрезмерное сближение юнитов
  gameState.units.forEach(unit => {
    const closeNeighbors = getObjectsInRange({ x: unit.x, y: unit.y }, separationDistance)
      .filter(other => other !== unit && other.owner === unit.owner && other instanceof Unit);
    closeNeighbors.forEach(other => {
      const dx = unit.x - other.x;
      const dy = unit.y - other.y;
      const dist = Math.hypot(dx, dy);
      if (dist < separationDistance && dist > 0) {
        const overlap = separationDistance - dist;
        const adjustment = (overlap * separationSmoothing * deltaTime) / 2;
        const adjustX = (dx / dist) * adjustment;
        const adjustY = (dy / dist) * adjustment;
        unit.x += adjustX;
        unit.y += adjustY;
        other.x -= adjustX;
        other.y -= adjustY;
      }
    });
  });
}

function updateSaleIndicator() {
  const indicator = document.getElementById("saleIndicator");
  if (saleBuilding && indicator) {
    const elapsed = performance.now() - saleStartTime;
    const progress = Math.min(elapsed / saleDuration, 1);

    // Получаем экранные координаты здания
    const screenPos = worldToScreen(saleBuilding.x, saleBuilding.y);
    // Позиционируем индикатор над зданием (сдвиг по Y, например, на 10 пикселей)
    indicator.style.left = (screenPos.x - (saleBuilding.width * camera.scale) / 2) + "px";
    indicator.style.top = (screenPos.y - (saleBuilding.height * camera.scale) / 2 - 10) + "px";
    // Ширина индикатора пропорциональна progress
    indicator.style.width = (saleBuilding.width * camera.scale * progress) + "px";
    indicator.style.opacity = progress;
  }
}
// Функция обновления юнитов


function updateTurret(building) {
  let ROTATION_SPEED = 0.01; // базовая скорость вращения (сканирование)
  let AIM_SPEED = 0.1;       // скорость наведения на цель

  // Если здание turret2, можно задать отдельные параметры (при необходимости)
  if (building.type === "turret2") {
    ROTATION_SPEED = 0.01;
    AIM_SPEED = 0.1;
  }

  if (building.target) {
    // Вычисляем угол до цели
    const targetAngle = Math.atan2(building.target.y - building.y, building.target.x - building.x);
    let angleDiff = targetAngle - building.angle;
    // Нормализуем разницу углов
    angleDiff = Math.atan2(Math.sin(angleDiff), Math.cos(angleDiff));
    // Плавное приближение угла
    building.angle += angleDiff * AIM_SPEED;

  

    
    // Если цель ушла за пределы радиуса, сбрасываем ее
    const dist = Math.hypot(building.target.x - building.x, building.target.y - building.y);
    if (dist > building.range) {
      building.target = null;
    }
  } else {
    // Нет цели – просто поворачиваем турель для сканирования
    building.angle += ROTATION_SPEED;
    // Здесь можно добавить поиск цели, например:
    // building.target = findNearestEnemy(building);
  }
}

// Функция отрисовки ресурсов с эффектами вращения и пульсации
function renderResource(resource) {
  ctx.save();
  ctx.translate(resource.x, resource.y);
  const pulse = (Math.sin(performance.now() / 300) + 1) / 2;
  const pulseRadius = resource.baseRadius ? resource.baseRadius * 1.5 + pulse * 5 : 15;
  
  if (resource.type === "gold") {
    ctx.rotate(resource.rotation);
    const grad = ctx.createRadialGradient(0, 0, resource.baseRadius * 0.3, 0, 0, resource.baseRadius);
    grad.addColorStop(0, "#ffd700");
    grad.addColorStop(0.7, "#ffc107");
    grad.addColorStop(1, "#b8860b");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(resource.points[0].x, resource.points[0].y);
    for (let i = 1; i < resource.points.length; i++) {
      ctx.lineTo(resource.points[i].x, resource.points[i].y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(218,165,32,0.8)";
    ctx.stroke();
    
    const pulseGrad = ctx.createRadialGradient(0, 0, resource.baseRadius, 0, 0, pulseRadius);
    pulseGrad.addColorStop(0, "rgba(255,215,0,0.0)");
    pulseGrad.addColorStop(1, "rgba(255,215,0,0.5)");
    ctx.fillStyle = pulseGrad;
    ctx.beginPath();
    ctx.arc(0, 0, pulseRadius, 0, Math.PI * 2);
    ctx.fill();
    
  } else if (resource.type === "silicon") {
    ctx.rotate(performance.now() / 1000);
    const size = 10;
    ctx.fillStyle = "rgba(135,206,235,0.8)";
    ctx.strokeStyle = "rgba(70,130,180,0.9)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    const sides = 6;
    for (let i = 0; i < sides; i++) {
      const angle = i * (Math.PI * 2) / sides;
      const x = size * Math.cos(angle);
      const y = size * Math.sin(angle);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    
    const pulseGrad = ctx.createRadialGradient(0, 0, size, 0, 0, pulseRadius);
    pulseGrad.addColorStop(0, "rgba(128,128,128,0.0)");
    pulseGrad.addColorStop(1, "rgba(128,128,128,0.5)");
    ctx.fillStyle = pulseGrad;
    ctx.beginPath();
    ctx.arc(0, 0, pulseRadius, 0, Math.PI * 2);
    ctx.fill();
    
  } else if (resource.type === "plasma") {
    ctx.rotate(performance.now() / 1000);
    const baseRadius = 8;
    const pulseLocal = (Math.sin(performance.now() / 200) + 1) / 4 + 0.75;
    const radius = baseRadius * pulseLocal;
    const grad = ctx.createRadialGradient(0, 0, radius * 0.1, 0, 0, radius);
    grad.addColorStop(0, "rgba(138,43,226,1)");
    grad.addColorStop(0.5, "rgba(75,0,130,0.7)");
    grad.addColorStop(1, "rgba(75,0,130,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
    
    const pulseGrad = ctx.createRadialGradient(0, 0, radius, 0, 0, pulseRadius);
    pulseGrad.addColorStop(0, "rgba(148,0,211,0.0)");
    pulseGrad.addColorStop(1, "rgba(148,0,211,0.5)");
    ctx.fillStyle = pulseGrad;
    ctx.beginPath();
    ctx.arc(0, 0, pulseRadius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}


function updateUnits(deltaTime) {
  gameState.units.forEach(unit => {
    // Если элитный юнит уже имеет цель, выполняем динамическую атаку независимо от наличия команд
    if (unit.type === "elite" && unit.target && unit.health > 0) {
      dynamicAttackElite(unit, unit.target, deltaTime);
    }
	  if (unit.type === "assault" && unit.target && unit.health > 0) {
      dynamicAttackAssault(unit, unit.target, deltaTime);
    }
	  if (unit.type === "fighter" && unit.target && unit.health > 0) {
      dynamicAttack(unit, unit.target, deltaTime);
    }
    // Если не элита в боевом режиме, обрабатываем команды, если они есть
//    else if (unit.commandQueue.length > 0) {
//      processCommandQueue(unit);
//    }
    // Если команда пуста, выполняем idle-логику (для рабочих, ремонтников и пр.)
    else {
      unit.idleTimer += deltaTime;
      if (unit.type === "worker" && unit.idleTimer >= 20) {
        const base = unit.owner === "player" ? playerBase : aiBase;
        startWorkerCycle(unit, base);
        unit.idleTimer = 0;
      }
      if (unit.type === "repairman" && unit.idleTimer >= 20 && !unit.hiding) {
        if (selectedUnits.includes(unit) || unit.manualOverride) {
          unit.idleTimer = 0;
        } else {
          let workshops = gameState.buildings.filter(b => b.owner === unit.owner && b.type === "repairWorkshop");
          if (workshops.length > 0) {
            workshops.sort((a, b) =>
              Math.hypot(unit.x - a.x, unit.y - a.y) - Math.hypot(unit.x - b.x, unit.y - b.y)
            );
            let nearestWorkshop = workshops[0];
            const distance = Math.hypot(unit.x - nearestWorkshop.x, unit.y - nearestWorkshop.y);
            const threshold = 50; // пороговое расстояние
            if (distance > threshold) {
              moveUnit(unit, nearestWorkshop.x, nearestWorkshop.y, () => {
                unit.hiding = true;
                animateMoveAndScale(unit, nearestWorkshop.x, nearestWorkshop.y, 0, 1000, () => {
                  unit.hidden = true;
                  unit.hiding = false;
                  unit.inWorkshop = nearestWorkshop;
                  unit.idleTimer = 0;
                });
              });
            } else {
              unit.hiding = true;
              animateMoveAndScale(unit, nearestWorkshop.x, nearestWorkshop.y, 0, 1000, () => {
                unit.hidden = true;
                unit.hiding = false;
                unit.inWorkshop = nearestWorkshop;
                unit.idleTimer = 0;
              });
            }
          }
        }
      }
    }
  });
  
  // Удаляем юниты с нулевым или отрицательным здоровьем и запускаем эффекты смерти
  gameState.units = gameState.units.filter(unit => {
    if (unit.health <= 0) {
      removeUnit(unit);
      return false;
    }
    return true;
  });
  
  updateSwarmBehavior(deltaTime);
}

function findNearestResource(x, y, preferredType) {
  const pos = { x, y };
  // Ищем ресурсы в фиксированном радиусе (например, 200 единиц)
  let candidates = getObjectsInRange(pos, 1000)
    .filter(r => r.amount > 0 && r.type === preferredType);
  if (candidates.length === 0) {
    candidates = getObjectsInRange(pos, 1000)
      .filter(r => r.amount > 0);
  }
  let nearest = null, minDist = Infinity;
  candidates.forEach(r => {
    const d = Math.hypot(r.x - x, r.y - y);
    if (d < minDist) { minDist = d; nearest = r; }
  });
  return nearest;
}

function updateWorkerResourceToken(worker) {
    if (worker.carriedResourceToken) {
        const token = worker.carriedResourceToken;
        token.x = worker.x + token.offsetX;
        token.y = worker.y + token.offsetY;
    }
}

function getPreferredResourceType(owner) {
  const res = owner === "player" ? gameState.playerResources : gameState.aiResources;
  const min = Math.min(res.gold, res.silicon, res.plasma);
  if (min === res.gold) return "gold";
  if (min === res.silicon) return "silicon";
  return "plasma";
}

function spawnResourceToken(worker, resourceType) {
  // Создаем объект токена – с фиксированным смещением от рабочего
  const token = {
    type: "resourceToken",
    resourceType: resourceType,
    offsetX: 1, // смещение вправо от рабочего (можно настроить)
    offsetY: -2, // смещение вверх от рабочего
    // Эти поля будут обновляться каждый кадр
    x: worker.x + 10,
    y: worker.y - 5
  };
  worker.carriedResourceToken = token;
}

function renderWorkerResourceToken(ctx, token) {
  // Определяем базовые цвета в зависимости от типа ресурса
  var baseColor, topColor, leftColor, rightColor;
  if (token.resourceType === "gold") {
    baseColor  = "#ffd700"; // золотой
    topColor   = "#fffacd"; // светлее
    leftColor  = "#ffd700"; // базовый
    rightColor = "#b8860b"; // темнее
  } else if (token.resourceType === "silicon") {
    baseColor  = "silver";
    topColor   = "#d3d3d3";
    leftColor  = "silver";
    rightColor = "#a9a9a9";
  } else if (token.resourceType === "plasma") {
    baseColor  = "cyan";
    topColor   = "#e0ffff";
    leftColor  = "cyan";
    rightColor = "#008b8b";
  } else {
    baseColor  = "white";
    topColor   = "#ffffff";
    leftColor  = "#cccccc";
    rightColor = "#999999";
  }
  
  // Размер кубика (например, 8 пикселей) и смещение для эффекта 3D
  var size = 6;
  var half = size / 3;
  var offset = 1; // задает "глубину" кубика

  // Рисуем верхнюю грань (параллелограмм)
  ctx.beginPath();
  ctx.moveTo(token.x, token.y - half - offset);
  ctx.lineTo(token.x + half, token.y - offset);
  ctx.lineTo(token.x, token.y + half - offset);
  ctx.lineTo(token.x - half, token.y - offset);
  ctx.closePath();
  ctx.fillStyle = topColor;
  ctx.fill();
  
  // Рисуем левую грань
  ctx.beginPath();
  ctx.moveTo(token.x - half, token.y - offset);
  ctx.lineTo(token.x, token.y + half - offset);
  ctx.lineTo(token.x, token.y + half + offset);
  ctx.lineTo(token.x - half, token.y + offset);
  ctx.closePath();
  ctx.fillStyle = leftColor;
  ctx.fill();
  
  // Рисуем правую грань
  ctx.beginPath();
  ctx.moveTo(token.x + half, token.y - offset);
  ctx.lineTo(token.x, token.y + half - offset);
  ctx.lineTo(token.x, token.y + half + offset);
  ctx.lineTo(token.x + half, token.y + offset);
  ctx.closePath();
  ctx.fillStyle = rightColor;
  ctx.fill();
}


function renderResourceTokens() {
  ctx.save();
  ctx.fillStyle = "gold"; // Можно менять цвет под разные ресурсы
  gameState.resourceTokens.forEach(token => {
    const screenPos = worldToScreen(token.x, token.y);
    ctx.beginPath();
    //ctx.arc(screenPos.x, screenPos.y, 3, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}

function startWorkerCycle(worker, warehouse) {
  // Если рабочий уже несёт ресурс, сначала инициируем доставку
  if (worker.carrying > 0) {
    if (!worker.delivering) {
      worker.delivering = true;
      const deliveryBuilding = findNearestDeliveryBuilding(worker.x, worker.y, worker.owner);
      if (deliveryBuilding) {
        moveUnit(worker, deliveryBuilding.x, deliveryBuilding.y, function() {
          // Прибыв на склад/базу – сбрасываем ресурс
          if (worker.owner === "player") {
            gameState.playerResources[getPreferredResourceType(worker.owner)] += worker.carrying;
          } else {
            gameState.aiResources[getPreferredResourceType(worker.owner)] += worker.carrying;
          }
          worker.carrying = 0;
          delete worker.carriedResourceToken;
          worker.delivering = false;
          // После успешной доставки запускаем новый цикл
          setTimeout(() => startWorkerCycle(worker, warehouse), 500);
        });
      } else {
        // Если здания для доставки не найдено, сбрасываем флаг доставки
        worker.delivering = false;
      }
    }
    return;
  }
  
  // Если рабочий пустой, выдаем задание на сбор нужного ресурса
  const resourceType = getPreferredResourceType(worker.owner);
  const resource = findNearestResource(worker.x, worker.y, resourceType);
  if (!resource || resource.amount <= 0) {
    setTimeout(() => startWorkerCycle(worker, warehouse), 1000);
    return;
  }
  
  // Двигаем рабочего к ресурсу
  moveUnit(worker, resource.x, resource.y, function() {
    setTimeout(function() {
      // Если рабочий оказался слишком далеко от ресурса – перезапускаем цикл
      if (Math.hypot(worker.x - resource.x, worker.y - resource.y) > 30) {
        setTimeout(() => startWorkerCycle(worker, warehouse), 500);
        return;
      }
      
      // Собираем ресурс, если он ещё доступен
      if (resource.amount > 0) {
        resource.amount--;
        worker.carrying = (worker.carrying || 0) + 3;
        spawnSparkEffect(resource.x, resource.y);
        spawnSparkEffect(resource.x, resource.y);
        if (!worker.carriedResourceToken) {
          spawnResourceToken(worker, resourceType);
        }
      }
      
      // После сбора сразу идём к доставке
      const deliveryBuilding = findNearestDeliveryBuilding(worker.x, worker.y, worker.owner);
      if (deliveryBuilding) {
        worker.delivering = true;
        moveUnit(worker, deliveryBuilding.x, deliveryBuilding.y, function() {
          if (worker.owner === "player") {
            gameState.playerResources[getPreferredResourceType(worker.owner)] += worker.carrying;
          } else {
            gameState.aiResources[getPreferredResourceType(worker.owner)] += worker.carrying;
          }
          worker.carrying = 0;
          delete worker.carriedResourceToken;
          worker.delivering = false;
          setTimeout(() => startWorkerCycle(worker, warehouse), 500);
        });
      } else {
        setTimeout(() => startWorkerCycle(worker, warehouse), 500);
      }
    }, 2000); // задержка для имитации сбора
  });
}

function fireBullet(shooter, enemy) {
  if (!shooter || shooter.health <= 0) return;
  const dx = enemy.x - shooter.x, dy = enemy.y - shooter.y;
  const angle = Math.atan2(dy, dx);
  let bullet;
  if (shooter.type === "turret2") {
    bullet = new Bullet(shooter.x, shooter.y, angle, MISSILE_CONFIG.speed, shooter, enemy);
    bullet.lifetime = MISSILE_CONFIG.lifetime;
    bullet.damage = MISSILE_CONFIG.damage;
    bullet.splashRadius = MISSILE_CONFIG.splashRadius;
    bullet.splashDamage = MISSILE_CONFIG.splashDamage;
    bullet.isMissile = true;
    bullet.target = enemy;
  } else {
    let bulletConfig;
    if (shooter.type === "turret") {
      bulletConfig = TURRET_BULLET_CONFIG;
    } else if (shooter.type === "fighter") {
      bulletConfig = FIGHTER_BULLET_CONFIG;
    } else {
      bulletConfig = { speed: 300, lifetime: 1.5, damage: 10 };
    }
    bullet = new Bullet(shooter.x, shooter.y, angle, bulletConfig.speed, shooter, enemy);
    bullet.lifetime = bulletConfig.lifetime;
    bullet.damage = bulletConfig.damage;
  }
  if (shooter.type === "assault") {
    bullet.color = "128,0,128"; // Фиолетовый для штурмовика
  }
  gameState.bullets.push(bullet);
}

function startFighterCycle(fighter) {
  if (!fighter) return;
  function cycle() {
    if (fighter.health <= 0) return;
    if (fighter.commandQueue.length > 0) {
      processCommandQueue(fighter);
      requestAnimationFrame(cycle);
      return;
    }
    if (fighter.target && fighter.target.health > 0) {
      dynamicAttack(fighter, fighter.target, 1/60);
    } else {
      let enemies = getEnemiesInRange({ x: fighter.x, y: fighter.y }, fighter.range)
                     .filter(e => e.owner !== fighter.owner && e.health > 0);
      if (enemies.length > 0) {
        fighter.target = enemies.sort((a, b) =>
          Math.hypot(a.x - fighter.x, a.y - fighter.y) - Math.hypot(b.x - fighter.x, b.y - fighter.y)
        )[0];
      }
    }
    requestAnimationFrame(cycle);
  }
  cycle();
}

function startFighterCycleAI(fighter) {
  if (!fighter) return;
  function cycle() {
    if (fighter.health <= 0) return;
    const enemies = getEnemiesInRange({ x: fighter.x, y: fighter.y }, fighter.range)
                     .filter(e => e.owner !== fighter.owner && e.health > 0);
    if (enemies.length > 0) {
      fighter.target = enemies.sort((a, b) =>
        Math.hypot(a.x - fighter.x, a.y - fighter.y) - Math.hypot(b.x - fighter.x, b.y - fighter.y)
      )[0];
      dynamicAttack(fighter, fighter.target, 1/60);
    } else {
      moveUnit(fighter, playerBase.x, playerBase.y, () => {});
    }
    requestAnimationFrame(cycle);
  }
  cycle();
}

function isTargetAlive(target) {
  if (target instanceof Unit) {
    return gameState.units.includes(target);
  } else if (target instanceof Building) {
    return gameState.buildings.includes(target);
  }
  return false;
}

function startTurretCycle(turret) {
  turret.lastFireTime = 0;
  turret.active = true; // Флаг, показывающий, что цикл активен
  
  function cycle() {
    if (!turret.active) return; // Если турель деактивирована, прекращаем цикл
    if (turret.health <= 0) return;
    
    // Если цель недействительна (отсутствует, мертва или слишком далеко), ищем новую
    if (!turret.target || turret.target.health <= 0 ||
       (Math.hypot(turret.target.x - turret.x, turret.target.y - turret.y) > turret.range)) {
      const candidates = getEnemiesInRange({ x: turret.x, y: turret.y }, turret.range, turret.owner);
      turret.target = candidates.length > 0 ? candidates[0] : null;
    }
    
    // Если цель найдена, стреляем с учетом fireRate
    if (turret.target) {
      const now = performance.now();
      if (now - turret.lastFireTime >= turret.fireRate) {
        fireBullet(turret, turret.target);
        turret.lastFireTime = now;
      }
    }
    
    turret.turretCycleId = requestAnimationFrame(cycle);
  }
  
  turret.turretCycleId = requestAnimationFrame(cycle);
}

function drawCircularHP(x, y, radius, health, maxHealth) {
  const startAngle = -Math.PI / 2;
  const endAngle = startAngle + 2 * Math.PI * (health / maxHealth);
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, 2 * Math.PI);
  ctx.lineWidth = 3;
  ctx.strokeStyle = "red";
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, radius, startAngle, endAngle);
  ctx.strokeStyle = "green";
  ctx.stroke();
}

function spawnParticles(x, y, color) {
  const count = Math.floor(Math.random() * 3) + 3;
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 50 + 50;
    const particle = {
      x: x, y: y,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      life: 0.2 + Math.random() * 0.5, maxLife: 0,
      color: "yellow", radius: 1
    };
    particle.maxLife = particle.life;
    gameState.particles.push(particle);
  }
}

function getMarkerPosition(offset, rect) {
  const w = rect.width, h = rect.height;
  const perimeter = 2 * (w + h);
  let pos = offset % perimeter;
  if (pos < w) {
    return { x: rect.x + pos, y: rect.y };
  } else if (pos < w + h) {
    return { x: rect.x + w, y: rect.y + (pos - w) };
  } else if (pos < 2 * w + h) {
    return { x: rect.x + w - (pos - (w + h)), y: rect.y + h };
  } else {
    return { x: rect.x, y: rect.y + h - (pos - (2 * w + h)) };
  }
}

function renderGame() {
//console.log("renderGame called");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (backgroundImage.complete) {
    const imgWidth = backgroundImage.width;
    const imgHeight = backgroundImage.height;
    ctx.drawImage(backgroundImage, 0, canvas.height - imgHeight, imgWidth, imgHeight);
  }
  starField.draw();
  
  ctx.save();
  ctx.translate(camera.offsetX, camera.offsetY);
  ctx.scale(camera.scale, camera.scale);
  
  // Отрисовка зданий
  gameState.buildings.forEach(building => {
    ctx.save();
    ctx.translate(building.x, building.y);
    if (building.type === "turret") {
  ctx.save();
  ctx.rotate(building.angle); // угол турели (уже установлен логикой)

  const turretColor = building.owner === "player"
    ? "rgba(0,128,255,1)"
    : "rgba(255,128,0,1)";

  const baseSize = building.width * 0.7;
  const turretSize = building.width * 0.5;
  const barrelLength = building.width * 0.6; // короткий ствол
  const barrelWidth = building.width * 0.1;

  // --- Основание (квадрат) ---
  ctx.fillStyle = turretColor;
  ctx.fillRect(-baseSize / 4, -baseSize / 4, baseSize, baseSize);

  // --- Башня (меньший квадрат сверху) ---
  ctx.fillRect(-turretSize / 2, -turretSize / 2, turretSize, turretSize);

  // --- Ствол, вращающийся при стрельбе ---
ctx.save();
		
ctx.translate(turretSize / 2, 0); // смещаем вправо
ctx.rotate(Math.PI / 2); // поворот на 90°, чтобы смотреть вправо


ctx.fillStyle = "rgba(200,200,200,1)";
ctx.fillRect(-barrelWidth / 2, -barrelLength, barrelWidth, barrelLength);
ctx.restore();

  ctx.restore();
}
	if (building.type === "turret2") {
    ctx.save();
    ctx.rotate(building.angle); // Вращение всей установки в поиске цели

    const turretMainColor = building.owner === "player" ? "rgba(0,128,255,1)" : "rgba(255,128,0,1)";
    const turretBlinkColor = building.owner === "player" ? "lightgreen" : "red";

    const baseSize = building.width * 0.8;
    const turretSize = building.width * 0.5;
    const launcherWidth = building.width * 0.6;
    const launcherHeight = building.height * 0.3;
    const flameSize = building.width * 0.4;

    // --- Основание (Лафет, массивная прямоугольная платформа) ---
    ctx.fillStyle = turretMainColor;
    ctx.fillRect(-baseSize / 2, -baseSize / 4, baseSize, baseSize / 2);

    // --- Пусковая установка (Сдвинута вверх) ---
    ctx.fillRect(-turretSize / 1, -turretSize / 1 - baseSize / 5, turretSize, turretSize);

    // --- Один ракетный блок (над башней) ---
    ctx.fillStyle = "rgba(180,180,180,1)"; // Металлический блок
    ctx.fillRect(-launcherWidth / 2, -launcherHeight - turretSize / 2 - baseSize / 5, launcherWidth, launcherHeight);

    

    ctx.restore();
}

	  else if (building.type === "wall") {
    const time = performance.now();
    ctx.save();
    ctx.rotate(building.angle);

    const w = building.width;
    const h = building.height;
    const radius = h * 2.2;
    const depthFactor = 0.5;

    const shieldColor = building.owner === "player" ? "rgba(0,255,255,0.2)" : "rgba(255,128,0,0.2)";
    const lineColor = building.owner === "player" ? "rgba(0,255,255,0.6)" : "rgba(255,128,0,0.6)";

    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 0.7;

    // Полупрозрачная полусфера
    ctx.fillStyle = shieldColor;
    ctx.beginPath();
    ctx.ellipse(0, 0, radius, radius * depthFactor, 0, Math.PI, 0, false);
    ctx.closePath();
    ctx.fill();

    // Горизонтальные линии (параллели)
    for (let i = 1; i < 5; i++) {
        const r = radius * (i / 5);
        ctx.beginPath();
        ctx.ellipse(0, 0, r, r * depthFactor, 0, Math.PI, 0, false);
        ctx.stroke();
    }

    // Вертикальные линии (меридианы)
    for (let i = -4; i <= 4; i++) {
        const angle = (i / 8) * Math.PI;
        ctx.beginPath();
        ctx.moveTo(radius * Math.cos(angle), 0);
        ctx.quadraticCurveTo(
            0,
            -radius * depthFactor,
            -radius * Math.cos(angle),
            0
        );
        ctx.stroke();
    }

    // Энергетические разряды
    for (let i = 0; i < 5; i++) {
        if (Math.random() < 0.4) {
            ctx.strokeStyle = "rgba(255,255,255,0.8)";
            ctx.lineWidth = 1.5;
            const angle = Math.PI * Math.random();
            const r = radius * Math.random();
            const startX = r * Math.cos(angle);
            const startY = -r * Math.sin(angle) * depthFactor;
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(startX + Math.random() * 10 - 5, startY + Math.random() * 10 - 5);
            ctx.stroke();
        }
    }

    ctx.restore();
}
	  else if (building.type === "beacon") {
  const time = performance.now();
  const w = building.width;
  const h = building.height;
  const half = w / 1.1;
  const persp = 0.3;
  
  // Проекция: x' = x, y' = y - z * persp
  function project(v) {
    return { x: v.x, y: v.y - v.z * persp };
  }
  
  // ==============================
  // 1. Внешняя оболочка – квадратная пирамида (маяк)
  // ==============================
  // Определяем базу пирамиды – квадрат на y = h/2, а апекс – (0, -h/2, 0)
  const baseVerts = [
    { x: -half, y: h / 2, z: -half },
    { x:  half, y: h / 2, z: -half },
    { x:  half, y: h / 2, z:  half },
    { x: -half, y: h / 2, z:  half }
  ];
  const apex = { x: 0, y: -h / 2, z: 0 };
  const outerVerts = baseVerts.concat([apex]);
  
  // Определяем боковые грани внешней пирамиды – каждая грань как треугольник [i, (i+1)%4, 4]
  const outerFaces = [
    [0, 1, 4],
    [1, 2, 4],
    [2, 3, 4],
    [3, 0, 4]
  ];
  // Рёбра для каркаса
  const outerEdges = [
    [0, 1], [1, 2], [2, 3], [3, 0],
    [0, 4], [1, 4], [2, 4], [3, 4]
  ];
  
  // Вращение внешней пирамиды вокруг оси Y
  const angleOuter = -time / 2000;
  const cosA = Math.cos(angleOuter), sinA = Math.sin(angleOuter);
  const rotatedOuter = outerVerts.map(v => ({
    x: v.x * cosA - v.z * sinA,
    y: v.y,
    z: v.x * sinA + v.z * cosA
  }));
  const projectedOuter = rotatedOuter.map(project);
  
  // Отрисовка каркаса внешней оболочки (контур)
  ctx.save();
  ctx.strokeStyle = building.owner === "player" ? "rgba(0,128,255,0.8)" : "rgba(255,128,0,0.8)";
  ctx.lineWidth = 1;
  outerEdges.forEach(edge => {
    const p1 = projectedOuter[edge[0]];
    const p2 = projectedOuter[edge[1]];
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
  });
  ctx.restore();
  
  // ==============================
  // 2. Внутреннее ядро – меньшая пирамида с эффектом теней, вращается в обратном направлении
  // ==============================
  const scaleInner = 0.5;
  const innerW = w * scaleInner;
  const innerH = h * scaleInner;
  const innerHalf = innerW / 2;
  const innerBase = [
    { x: -innerHalf, y: innerH / 2, z: -innerHalf },
    { x:  innerHalf, y: innerH / 2, z: -innerHalf },
    { x:  innerHalf, y: innerH / 2, z:  innerHalf },
    { x: -innerHalf, y: innerH / 2, z:  innerHalf }
  ];
  const innerApex = { x: 0, y: -innerH / 2, z: 0 };
  const innerVerts = innerBase.concat([innerApex]);
  const innerFaces = [
    [0, 1, 4],
    [1, 2, 4],
    [2, 3, 4],
    [3, 0, 4]
  ];
  
  // Вращение внутреннего ядра в обратном направлении
  const angleInner = time / 500;
  const cosI = Math.cos(angleInner), sinI = Math.sin(angleInner);
  const rotatedInner = innerVerts.map(v => ({
    x: v.x * cosI - v.z * sinI,
    y: v.y,
    z: v.x * sinI + v.z * cosI
  }));
  const projectedInner = rotatedInner.map(project);
  
  // Цвет ядра с пульсацией, как у базы
  const pulse = (Math.sin(time / 300) + 1) / 2;
  let baseR, baseG, baseB;
  if (building.owner === "player") {
    baseR = 255;
    baseG = Math.floor(255 * (1 - pulse) + 36 * pulse);
    baseB = Math.floor(255 * (1 - pulse));
  } else {
    baseR = Math.floor(255 * (1 - pulse) + 139 * pulse);
    baseG = 0;
    baseB = 0;
  }
  
  // Отрисовка граней внутреннего ядра с эффектом теней (непрозрачное)
  innerFaces.forEach(face => {
    const avgZ = (rotatedInner[face[0]].z + rotatedInner[face[1]].z + rotatedInner[face[2]].z) / 3;
    const shadowFactor = 1 - 0.5 * (Math.max(0, avgZ) / innerHalf);
    const faceColor = `rgb(${Math.floor(baseR * shadowFactor)}, ${Math.floor(baseG * shadowFactor)}, ${Math.floor(baseB * shadowFactor)})`;
    
    const p0 = projectedInner[face[0]];
    const p1 = projectedInner[face[1]];
    const p2 = projectedInner[face[2]];
    
    ctx.save();
    ctx.fillStyle = faceColor;
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  });
  
  // ==============================
  // 3. Перерисовка передних граней внешней оболочки – только контур,
  // чтобы они перекрывали внутреннее ядро (аналогично базе)
  // ==============================
  ctx.save();
  ctx.strokeStyle = building.owner === "player" ? "rgba(0,128,255,0.8)" : "rgba(255,128,0,0.8)";
  ctx.lineWidth = 1;
  outerFaces.forEach(face => {
    const avgZ = (rotatedOuter[face[0]].z + rotatedOuter[face[1]].z + rotatedOuter[face[2]].z) / 3;
    if (avgZ < 0) {
      const p0 = project(rotatedOuter[face[0]]);
      const p1 = project(rotatedOuter[face[1]]);
      const p2 = project(rotatedOuter[face[2]]);
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.closePath();
      ctx.stroke();
    }
  });
  ctx.restore();
  
  // ==============================

  
  // Маяк кликабелен – обработка клика происходит вне этого блока.
}
	  else if (building.type === "base") {
  const time = performance.now();

  // --- Параметры внутреннего куба (ядра) ---
  const sizeInner = building.width * 0.5;
  const halfI = sizeInner / 2;

  // Пульсация цвета (от белого к алому/тёмно-красному)
  const pulse = (Math.sin(time / 300) + 1) / 2;
  let r, g, b;
  if (building.owner === "player") {
    // от (255,255,255) к (255,36,0)
    r = 255;
    g = Math.floor(255*(1 - pulse) + 36*pulse);
    b = 0;
  } else {
    // от (255,255,255) к (139,0,0)
    r = Math.floor(255*(1 - pulse) + 139*pulse);
    g = 0;
    b = 0;
  }
  // Цвет фронтальных граней ядра
  const frontColor = `rgb(${r},${g},${b})`;
  // Тень (боковые/верхние граней) чуть темнее
  const shadowFactor = 0.7;
  const sideColor = `rgb(${Math.floor(r*shadowFactor)}, ${Math.floor(g*shadowFactor)}, ${Math.floor(b*shadowFactor)})`;

  // --- Параметры внешнего каркаса (куба) ---
  const sizeOuter = building.width;
  const halfO = sizeOuter / 2;
  // Цвет wireframe для внешнего куба
  const wireColor = building.owner === "player" 
    ? "rgba(0,128,255,1)" 
    : "rgba(255,128,0,1)";

  // --- Угол вращения по оси Y ---
  const angleInner = -time / 500; // ядро
  const angleOuter =  time / 2000; // внешняя оболочка
		  

  // === ВСПОМОГАТЕЛЬНЫЕ МАССИВЫ ГРАНЕЙ ===
  // У нас будет 12 граней: 6 – внутренний куб, 6 – внешний.
  // Каждая грань: { vertices: [v1,v2,v3,v4], avgZ, fill, stroke, fillColor, strokeColor, wireframe? }
  const faces = [];

  // ----------------------------------------------------
  // 1) СОЗДАЁМ 6 ГРАНЕЙ ВНУТРЕННЕГО КУБА (ЗАКРАШЕННОГО)
  // ----------------------------------------------------
  // Опишем вершины внутреннего куба (до поворота)
  // Вершины (x,y,z) ∈ ±halfI
  const vertsInner = [
    { x:-halfI, y:-halfI, z:-halfI }, // 0
    { x: halfI, y:-halfI, z:-halfI }, // 1
    { x: halfI, y:-halfI, z: halfI }, // 2
    { x:-halfI, y:-halfI, z: halfI }, // 3
    { x:-halfI, y: halfI, z:-halfI }, // 4
    { x: halfI, y: halfI, z:-halfI }, // 5
    { x: halfI, y: halfI, z: halfI }, // 6
    { x:-halfI, y: halfI, z: halfI }  // 7
  ];
  // Индексы граней (каждая – массив из 4 индексов)
  const facesInnerIdx = [
    [0,1,2,3], // «нижняя» (y=-halfI)
    [4,5,6,7], // «верхняя» (y=+halfI)
    [0,1,5,4], // передняя
    [3,2,6,7], // задняя
    [1,2,6,5], // правая
    [0,3,7,4]  // левая
  ];
  // Цвета граней: фронтальная/задняя = frontColor, верх/низ/бок = sideColor
  // Упростим: 0 и 1 (нижняя, верхняя) → sideColor, 2 (перед) → frontColor, 3 (зад) → frontColor,
  //           4 (правая),5 (левая) → sideColor
  const colorInner = [
    sideColor,  // facesInnerIdx[0]
    sideColor,  // facesInnerIdx[1]
    frontColor, // facesInnerIdx[2]
    frontColor, // facesInnerIdx[3]
    sideColor,  // facesInnerIdx[4]
    sideColor   // facesInnerIdx[5]
  ];

  // Добавляем в общий массив
  facesInnerIdx.forEach((indices, iFace) => {
    faces.push({
      vertices: indices.map(i => ({ ...vertsInner[i] })), // копия
      fillColor: colorInner[iFace],
      wireframe: false,      // это залитая грань
      strokeColor: null      // не обводим
    });
  });

  // -----------------------------------------------------
  // 2) СОЗДАЁМ 6 ГРАНЕЙ ВНЕШНЕГО КУБА (wireframe)
  // -----------------------------------------------------
  const vertsOuter = [
    { x:-halfO, y:-halfO, z:-halfO },
    { x: halfO, y:-halfO, z:-halfO },
    { x: halfO, y:-halfO, z: halfO },
    { x:-halfO, y:-halfO, z: halfO },
    { x:-halfO, y: halfO, z:-halfO },
    { x: halfO, y: halfO, z:-halfO },
    { x: halfO, y: halfO, z: halfO },
    { x:-halfO, y: halfO, z: halfO }
  ];
  // те же 6 граней
  const facesOuterIdx = [
    [0,1,2,3],
    [4,5,6,7],
    [0,1,5,4],
    [3,2,6,7],
    [1,2,6,5],
    [0,3,7,4]
  ];
  // Все 6 граней будут wireframe
  facesOuterIdx.forEach(indices => {
    faces.push({
      vertices: indices.map(i => ({ ...vertsOuter[i] })),
      fillColor: null,        // не закрашиваем
      wireframe: true,
      strokeColor: wireColor
    });
  });

  // ------------------------------------------
  // 3) ПОВОРАЧИВАЕМ КАЖДУЮ ГРАНЬ ВКРУГ ОСИ Y,
  //    ВЫЧИСЛЯЕМ СРЕДНИЙ Z, И ДЕЛАЕМ ПРОЕКЦИЮ
  // ------------------------------------------
  faces.forEach((face, idx) => {
    // Определяем, внешний это куб или внутренний: 
    // по наличию fillColor vs wireframe
    const isInner = !face.wireframe; // внутренний?
    const angle = isInner ? angleInner : angleOuter;

    // Поворот всех вершин вокруг Y + проекция
    let sumZ = 0;
    face.vertices.forEach(v => {
      // старые x,z
      const x0 = v.x, z0 = v.z;
      const cosA = Math.cos(angle), sinA = Math.sin(angle);
      // вращение вокруг Y
      // x' = x*cos - z*sin
      // z' = x*sin + z*cos
      const x1 = x0*cosA - z0*sinA;
      const z1 = x0*sinA + z0*cosA;
      v.x = x1;
      v.z = z1;
      sumZ += z1;
    });
    face.avgZ = sumZ / face.vertices.length;

    // Ортопроекция: y2d = y - z*0.3
    face.vertices.forEach(v => {
      v.y = v.y - v.z*0.3;
    });
  });

  // ------------------------------------
  // 4) СОРТИРОВКА ГРАНЕЙ ПО avgZ (PAINTER)
  // ------------------------------------
  faces.sort((a,b) => a.avgZ - b.avgZ);

  // ------------------------------------
  // 5) РИСУЕМ ОТ ДАЛЬНИХ К БЛИЖНИМ
  // ------------------------------------
  faces.forEach(face => {
    // vertices теперь уже 2D (x,y), мы игнорируем .z (кроме сортировки)
    const vs = face.vertices;
    if (!vs || vs.length < 4) return;

    ctx.beginPath();
    ctx.moveTo(vs[0].x, vs[0].y);
    for (let i=1; i<vs.length; i++) {
      ctx.lineTo(vs[i].x, vs[i].y);
    }
    ctx.closePath();

    if (!face.wireframe) {
      // Внутренняя грань – заливаем
      ctx.fillStyle = face.fillColor;
      ctx.fill();
    }
    // Если wireframe (внешний куб), обводим
    if (face.wireframe) {
      ctx.strokeStyle = face.strokeColor;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  });

  // ------------------------------------
//  
}
	  else if (building.type === "base2") {
  const time = performance.now();
  ctx.save();
  const w = building.width;
  const h = building.height;
  const half = w / 1.5;
  const persp = 0.3;
  
  function project(v) {
      return { x: v.x, y: v.y - v.z * persp };
  }
  
  // === ВНЕШНЯЯ ОБОЛОЧКА – ОКТАЭДР ===
  // Определяем 4 вершины основания (на y = 0), верхнюю и нижнюю точки
  const baseVerts = [
      { x: -half, y: 0, z: -half },
      { x: half,  y: 0, z: -half },
      { x: half,  y: 0, z: half },
      { x: -half, y: 0, z: half }
  ];
  const top = { x: 0, y: -half, z: 0 };
  const bottom = { x: 0, y: half, z: 0 };
  const outerVerts = baseVerts.concat([top, bottom]);
  
  // Рёбра оболочки (октаэдра)
  const outerEdges = [
      [0, 1], [1, 2], [2, 3], [3, 0],
      [0, 4], [1, 4], [2, 4], [3, 4],
      [0, 5], [1, 5], [2, 5], [3, 5]
  ];
  
  // Вращение оболочки вокруг оси Y с углом time/2000 (как в базе1)
  const angleOuter = time / 2000;
  const cosA = Math.cos(angleOuter), sinA = Math.sin(angleOuter);
  const rotatedOuter = outerVerts.map(v => ({
      x: v.x * cosA - v.z * sinA,
      y: v.y,
      z: v.x * sinA + v.z * cosA
  }));
  const projectedOuter = rotatedOuter.map(v => ({ x: v.x, y: v.y - v.z * persp }));
  
  // Разбиваем рёбра на две группы по средней z (используем вращённые вершины)
  let frontEdges = [];
  let backEdges = [];
  outerEdges.forEach(edge => {
    const avgZ = (rotatedOuter[edge[0]].z + rotatedOuter[edge[1]].z) / 2;
    if (avgZ > 0) {
      frontEdges.push(edge);
    } else {
      backEdges.push(edge);
    }
  });
  
  // ===== ВНУТРЕННИЕ КУБЫ (ЯДРА) =====
  const sizeInner = w * 0.2;
  const halfI = sizeInner / 1.5;
  const coreOffset = w * 0.45;
  
  const pulse = (Math.sin(time / 300) + 1) / 2;
  let r, g, b;
  if (building.owner === "player") {
      r = 255;
      g = Math.floor(255 * (1 - pulse) + 36 * pulse);
      b = 0;
  } else {
      r = Math.floor(255 * (1 - pulse) + 139 * pulse);
      g = 0;
      b = 0;
  }
  const frontColor = `rgb(${r},${g},${b})`;
  const sideColor = `rgb(${Math.floor(r * 0.7)},${Math.floor(g * 0.7)},${Math.floor(b * 0.7)})`;
  
  // Отрисовка ядер (аналог базы1)
  ctx.save();
  for (let j = -1; j <= 1; j += 2) {
      const rotationCenterAngle = time / 800;
      const centerX = Math.cos(rotationCenterAngle + Math.PI * (j === -1 ? 0 : 1)) * coreOffset;
      const centerZ = Math.sin(rotationCenterAngle + Math.PI * j) * coreOffset * 0.5;
  
      const angleInner = (j === -1 ? time : -time) / 500;
      const cosI = Math.cos(angleInner), sinI = Math.sin(angleInner);
  
      let vertsInner = [
          { x: -halfI, y: -halfI, z: -halfI },
          { x: halfI,  y: -halfI, z: -halfI },
          { x: halfI,  y: -halfI, z: halfI },
          { x: -halfI, y: -halfI, z: halfI },
          { x: -halfI, y: halfI,  z: -halfI },
          { x: halfI,  y: halfI,  z: -halfI },
          { x: halfI,  y: halfI,  z: halfI },
          { x: -halfI, y: halfI,  z: halfI }
      ].map(v => {
          const x = v.x * cosI - v.z * sinI;
          const z = v.x * sinI + v.z * cosI;
          return { x: x + centerX, y: v.y, z: z + centerZ };
      }).map(project);
  
      // Нижняя грань
      ctx.fillStyle = frontColor;
      ctx.beginPath();
      ctx.moveTo(vertsInner[0].x, vertsInner[0].y);
      ctx.lineTo(vertsInner[1].x, vertsInner[1].y);
      ctx.lineTo(vertsInner[2].x, vertsInner[2].y);
      ctx.lineTo(vertsInner[3].x, vertsInner[3].y);
      ctx.closePath();
      ctx.fill();
  
      // Верхняя грань
      ctx.fillStyle = sideColor;
      ctx.beginPath();
      ctx.moveTo(vertsInner[4].x, vertsInner[4].y);
      ctx.lineTo(vertsInner[5].x, vertsInner[5].y);
      ctx.lineTo(vertsInner[6].x, vertsInner[6].y);
      ctx.lineTo(vertsInner[7].x, vertsInner[7].y);
      ctx.closePath();
      ctx.fill();
  
      // Передняя грань
      ctx.fillStyle = frontColor;
      ctx.beginPath();
      ctx.moveTo(vertsInner[0].x, vertsInner[0].y);
      ctx.lineTo(vertsInner[1].x, vertsInner[1].y);
      ctx.lineTo(vertsInner[5].x, vertsInner[5].y);
      ctx.lineTo(vertsInner[4].x, vertsInner[4].y);
      ctx.closePath();
      ctx.fill();
  
      // Задняя грань
      ctx.fillStyle = sideColor;
      ctx.beginPath();
      ctx.moveTo(vertsInner[3].x, vertsInner[3].y);
      ctx.lineTo(vertsInner[2].x, vertsInner[2].y);
      ctx.lineTo(vertsInner[6].x, vertsInner[6].y);
      ctx.lineTo(vertsInner[7].x, vertsInner[7].y);
      ctx.closePath();
      ctx.fill();
  
      // Правая грань
      ctx.fillStyle = sideColor;
      ctx.beginPath();
      ctx.moveTo(vertsInner[1].x, vertsInner[1].y);
      ctx.lineTo(vertsInner[2].x, vertsInner[2].y);
      ctx.lineTo(vertsInner[6].x, vertsInner[6].y);
      ctx.lineTo(vertsInner[5].x, vertsInner[5].y);
      ctx.closePath();
      ctx.fill();
  
      // Левая грань
      ctx.fillStyle = sideColor;
      ctx.beginPath();
      ctx.moveTo(vertsInner[0].x, vertsInner[0].y);
      ctx.lineTo(vertsInner[3].x, vertsInner[3].y);
      ctx.lineTo(vertsInner[7].x, vertsInner[7].y);
      ctx.lineTo(vertsInner[4].x, vertsInner[4].y);
      ctx.closePath();
      ctx.fill();
  }
  ctx.restore();
  
  // ===== 7) Отрисовка внешней оболочки (октаэдр) =====
  // Сначала рисуем задние рёбра, затем передние – чтобы ядра перекрывали задние грани.
  ctx.save();
  ctx.strokeStyle = building.owner === "player" ? "rgba(0,128,255,0.8)" : "rgba(255,128,0,0.8)";
  ctx.lineWidth = 1;
  backEdges.forEach(edge => {
      const p1 = projectedOuter[edge[0]];
      const p2 = projectedOuter[edge[1]];
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
  });
  // Затем рисуем передние рёбра поверх ядра
  frontEdges.forEach(edge => {
      const p1 = projectedOuter[edge[0]];
      const p2 = projectedOuter[edge[1]];
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
  });
  ctx.restore();
  
  ctx.restore();
}
	  else if (building.type === "base3") {
  const time = performance.now();
  ctx.save();
  // При необходимости: ctx.translate(building.x, building.y);

  // ===== 1) Утилитарные функции =====
  const persp = 0.3;
  function project(v) {
    return { x: v.x, y: v.y - v.z * persp };
  }
  // Вращение только вокруг оси X (как в базе2)
  function rotateX(v, angle) {
    const cosA = Math.cos(angle), sinA = Math.sin(angle);
    return { x: v.x, y: v.y * cosA - v.z * sinA, z: v.y * sinA + v.z * cosA };
  }

  // ===== 2) ИКОСАЭДР: Определение вершин =====
  // Стандартное определение икосаэдра (Three.js)
  const t = (1 + Math.sqrt(5)) / 2;
  const scale = building.width * 0.5;
  const rawVertices = [
    [-1,  t,  0],
    [ 1,  t,  0],
    [-1, -t,  0],
    [ 1, -t,  0],
    [ 0, -1,  t],
    [ 0,  1,  t],
    [ 0, -1, -t],
    [ 0,  1, -t],
    [ t,  0, -1],
    [ t,  0,  1],
    [-t,  0, -1],
    [-t,  0,  1]
  ];
  let vertices = rawVertices.map(([X, Y, Z]) => ({
    x: X * scale,
    y: Y * scale,
    z: Z * scale
  }));

  // ===== 3) Грани икосаэдра (20 треугольников) =====
  const faces = [
    [0, 11, 5],
    [0, 5, 1],
    [0, 1, 7],
    [0, 7, 10],
    [0, 10, 11],
    [1, 5, 9],
    [5, 11, 4],
    [11, 10, 2],
    [10, 7, 6],
    [7, 1, 8],
    [3, 9, 4],
    [3, 4, 2],
    [3, 2, 6],
    [3, 6, 8],
    [3, 8, 9],
    [4, 9, 5],
    [2, 4, 11],
    [6, 2, 10],
    [8, 6, 7],
    [9, 8, 1]
  ];

  // ===== 4) Применяем вращение вокруг оси X =====
  const angle = time / 2000;
  vertices = vertices.map(v => rotateX(v, angle));
  const projVerts = vertices.map(project);

  // ===== 5) Сортировка граней по средней z =====
  const facesSorted = faces.slice().sort((faceA, faceB) => {
    let zA = faceA.reduce((sum, i) => sum + vertices[i].z, 0) / faceA.length;
    let zB = faceB.reduce((sum, i) => sum + vertices[i].z, 0) / faceB.length;
    return zA - zB;
  });

  // ===== 6) ВНУТРЕННИЕ ЯДРА (3 кубика) =====
  const numCores = 3;
  const coreOrbitRadius = building.width * 0.3;
  const coreCubeSize = building.width * 0.15;
  const corePositions = [];
  for (let i = 0; i < numCores; i++) {
    const coreAngle = (2 * Math.PI / numCores) * i + time / 1000; // орбитальное вращение
    corePositions.push({
      x: coreOrbitRadius * Math.cos(coreAngle),
      y: coreOrbitRadius * Math.sin(coreAngle),
      z: 0
    });
  }
  
  // Функция для отрисовки кубика с эффектом объёма и тенями
  function drawCube(pos, size, color) {
    const s = size / 1;
    let cubeVerts = [
      { x: -s, y: -s, z: -s },
      { x: s,  y: -s, z: -s },
      { x: s,  y: s,  z: -s },
      { x: -s, y: s,  z: -s },
      { x: -s, y: -s, z: s },
      { x: s,  y: -s, z: s },
      { x: s,  y: s,  z: s },
      { x: -s, y: s,  z: s }
    ];
    // Вращение кубика вокруг оси X (как в базе2)
    const cubeAngle = time / 500;
    cubeVerts = cubeVerts.map(v => rotateX(v, cubeAngle));
    // Сдвиг вершин кубика в позицию pos
    cubeVerts = cubeVerts.map(v => ({
      x: v.x + pos.x,
      y: v.y + pos.y,
      z: v.z + pos.z
    }));
    const proj = cubeVerts.map(project);
    // Грани кубика (6 граней)
    const cubeFaces = [
      [0,1,2,3],
      [4,5,6,7],
      [0,1,5,4],
      [3,2,6,7],
      [1,2,6,5],
      [0,3,7,4]
    ];
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = 4;
    cubeFaces.forEach(face => {
      ctx.beginPath();
      ctx.moveTo(proj[face[0]].x, proj[face[0]].y);
      for (let i = 1; i < face.length; i++) {
        ctx.lineTo(proj[face[i]].x, proj[face[i]].y);
      }
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
    });
    ctx.restore();
  }
  
  // Определяем цвет ядер так же, как в базе2
  let pulse = (Math.sin(time / 300) + 1) / 2;
  let rColor, gColor, bColor;
  if (building.owner === "player") {
      rColor = 255;
      gColor = Math.floor(255 * (1 - pulse) + 36 * pulse);
      bColor = 0;
  } else {
      rColor = Math.floor(255 * (1 - pulse) + 139 * pulse);
      gColor = 0;
      bColor = 0;
  }
  const coreColor = `rgb(${rColor},${gColor},${bColor})`;
  corePositions.forEach(corePos => {
    // Применяем то же вращение вокруг оси X для согласованности
    let cp = rotateX(corePos, angle);
    drawCube(cp, coreCubeSize, coreColor);
  });
  
  // ===== 7) Отрисовка внешнего икосаэдра (контур, без заливки) =====
  ctx.save();
  ctx.strokeStyle = building.owner === "player" ? "rgba(0,128,255,0.8)" : "rgba(255,128,0,0.8)";
  ctx.lineWidth = 1;
  facesSorted.forEach(face => {
    ctx.beginPath();
    const start = projVerts[face[0]];
    ctx.moveTo(start.x, start.y);
    for (let i = 1; i < face.length; i++) {
      ctx.lineTo(projVerts[face[i]].x, projVerts[face[i]].y);
    }
    ctx.closePath();
    ctx.stroke();
  });
  ctx.restore();

  ctx.restore();
}	  
	  else if (building.type === "barracks") {
  const time = performance.now();
  ctx.save();
  // Если нужно сместить начало координат к (building.x, building.y), раскомментируйте:
  // ctx.translate(building.x, building.y);

  // ===== 1) ФУНКЦИИ ПРОЕКЦИИ И ВРАЩЕНИЯ =====
  const persp = 0.3;
  function project(v) {
    return { x: v.x, y: v.y - v.z * persp };
  }
  function rotateX(v, angle) {
    const cosA = Math.cos(angle), sinA = Math.sin(angle);
    return {
      x: v.x,
      y: v.y * cosA - v.z * sinA,
      z: v.y * sinA + v.z * cosA
    };
  }
  function rotateY(v, angle) {
    const cosA = Math.cos(angle), sinA = Math.sin(angle);
    return {
      x: v.x * cosA - v.z * sinA,
      y: v.y,
      z: v.x * sinA + v.z * cosA
    };
  }
  // (При необходимости можно добавить rotateZ, но здесь не требуется)

  // ===== 2) ВЕРШИНЫ КУБА (8 шт.) =====
  // Куб определяется 8 вершинами: (±1,±1,±1)
  const rawVertices = [
    [-1, -1, -1],
    [ 1, -1, -1],
    [ 1,  1, -1],
    [-1,  1, -1],
    [-1, -1,  1],
    [ 1, -1,  1],
    [ 1,  1,  1],
    [-1,  1,  1]
  ];
  // Масштабируем куб; здесь scale подбирается относительно building.width
  const scale = building.width * 0.5;
  let vertices = rawVertices.map(([X, Y, Z]) => ({
    x: X * scale,
    y: Y * scale,
    z: Z * scale
  }));

  // ===== 3) МАССИВ ГРАНЕЙ КУБА (6 ЛИЦ) =====
  // Каждая грань задается 4 вершинами (в правильном порядке обхода)
  const faces = [
    [0, 1, 2, 3], // задняя грань (z = -1)
    [4, 5, 6, 7], // передняя грань (z = 1)
    [0, 1, 5, 4], // нижняя грань (y = -1)
    [3, 2, 6, 7], // верхняя грань (y = 1)
    [1, 2, 6, 5], // правая грань (x = 1)
    [0, 3, 7, 4]  // левая грань (x = -1)
  ];

  // ===== 4) ДВОЙНОЕ ВРАЩЕНИЕ =====
  // Применяем вращение вокруг Y и вокруг X
  const angleY = time / 2000;
  const angleX = time / 3000;
  vertices = vertices.map(v => {
    let vRot = rotateY(v, angleY);
    return rotateX(vRot, angleX);
  });

  // ===== 5) ПРОЕКЦИЯ В 2D =====
  const projVerts = vertices.map(project);

  // ===== 6) ОТРИСОВКА КУБА (ТОЛЬКО КОНТУР) =====
  // Цвет линий зависит от владельца: если player, используем синий оттенок; иначе – оранжевый.
  ctx.save();
  ctx.strokeStyle = (building.owner === "player")
    ? "rgba(0,128,255,0.8)"
    : "rgba(255,128,0,0.8)";
  ctx.lineWidth = 1;
  faces.forEach(face => {
    ctx.beginPath();
    const start = projVerts[face[0]];
    ctx.moveTo(start.x, start.y);
    for (let i = 1; i < face.length; i++) {
      const p = projVerts[face[i]];
      ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    ctx.stroke();
  });
  ctx.restore();

  // ===== 7) ОТРИСОВКА "ПОРТАЛА" (ЧЕРНАЯ ДЫРА С ОБВОДКОЙ) =====
  // Портал – это радиальный градиент, имитирующий черную дыру, с пульсацией и обводкой
  const portalRotation = (time / 1000) % (2 * Math.PI);
  const pulse = 0.7 + 0.3 * Math.sin(time / 400);
  ctx.save();
  ctx.rotate(portalRotation);
  const portalRadius = building.width * 0.3 * pulse;
  
  // Градиент заливки портала
  const grad = ctx.createRadialGradient(0, 0, portalRadius * 0.1, 0, 0, portalRadius);
  grad.addColorStop(0, "black");
  grad.addColorStop(0.7, "#111"); // очень темный серый
  grad.addColorStop(1, "transparent");
  ctx.fillStyle = grad;
  
  ctx.beginPath();
  ctx.arc(0, 0, portalRadius, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fill();
  
  // Обводка портала с градиентным переливом: для игрока – зеленая, для ИИ – красная
  ctx.lineWidth = 1;
  const strokeGrad = ctx.createRadialGradient(0, 0, portalRadius * 0.9, 0, 0, portalRadius * 1.1);
  if (building.owner === "player") {
    strokeGrad.addColorStop(0, "rgba(0,255,0,1)");
    strokeGrad.addColorStop(1, "rgba(0,255,0,0)");
  } else {
    strokeGrad.addColorStop(0, "rgba(255,0,0,1)");
    strokeGrad.addColorStop(1, "rgba(255,0,0,0)");
  }
  ctx.strokeStyle = strokeGrad;
  ctx.beginPath();
  ctx.arc(0, 0, portalRadius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // ===== 8) ОТРИСОВКА МИГАЮЩИХ "КУБИКОВ" НА ВЕРШИНАХ =====
  // Маленькие квадратные индикаторы, пульсирующие по размеру
  const blinkScale = (Math.sin(time / 200) + 1) / 2; // от 0 до 1
  const baseSize = 2;
  const cubeSize = baseSize * (0.5 + blinkScale * 0.5);
  ctx.save();
  ctx.fillStyle = (building.owner === "player") ? "rgba(0,255,0,1)" : "rgba(255,0,0,1)";
  projVerts.forEach(p => {
    ctx.fillRect(p.x - cubeSize / 2, p.y - cubeSize / 2, cubeSize, cubeSize);
  });
  ctx.restore();

  ctx.restore();
}
	  else if (building.type === "barracks2") {
  const time = performance.now();
  ctx.save();
  
  // ===== 1) ФУНКЦИИ ПРОЕКЦИИ И ВРАЩЕНИЯ =====
  const persp = 0.3;
  function project(v) {
    return { x: v.x, y: v.y - v.z * persp };
  }
  function rotateX(v, angle) {
    const cosA = Math.cos(angle), sinA = Math.sin(angle);
    return {
      x: v.x,
      y: v.y * cosA - v.z * sinA,
      z: v.y * sinA + v.z * cosA
    };
  }
  function rotateY(v, angle) {
    const cosA = Math.cos(angle), sinA = Math.sin(angle);
    return {
      x: v.x * cosA - v.z * sinA,
      y: v.y,
      z: v.x * sinA + v.z * cosA
    };
  }

  // ===== 2) ВЕРШИНЫ ОКТАЭДРА (6 шт.) =====
  // Определяем октаэдр с 6 вершинами:
  // v0 = ( 1,  0,  0)
  // v1 = (-1,  0,  0)
  // v2 = ( 0,  1,  0)
  // v3 = ( 0, -1,  0)
  // v4 = ( 0,  0,  1)
  // v5 = ( 0,  0, -1)
  const rawVertices = [
    [ 1,  0,  0],
    [-1,  0,  0],
    [ 0,  1,  0],
    [ 0, -1,  0],
    [ 0,  0,  1],
    [ 0,  0, -1]
  ];
  // Масштаб: используем building.width как базовый размер
  const scale = building.width * 1;
  let vertices = rawVertices.map(([X, Y, Z]) => ({
    x: X * scale,
    y: Y * scale,
    z: Z * scale
  }));

  // ===== 3) МАССИВ ГРАНЕЙ (8 ТРЕУГОЛЬНИКОВ) =====
  // Грани октаэдра (каждая грань — треугольник):
  const faces = [
    [0, 2, 4],
    [2, 1, 4],
    [1, 3, 4],
    [3, 0, 4],
    [0, 2, 5],
    [2, 1, 5],
    [1, 3, 5],
    [3, 0, 5]
  ];

  // ===== 4) ДВОЙНОЕ ВРАЩЕНИЕ =====
  // Применяем вращение сначала вокруг Y, затем вокруг X.
  const angleY = time / 2000;
  const angleX = time / 3000;
  vertices = vertices.map(v => {
    let vRot = rotateY(v, angleY);
    return rotateX(vRot, angleX);
  });

  // ===== 5) ПРОЕКЦИЯ В 2D =====
  const projVerts = vertices.map(project);

  // ===== 6) СОРТИРОВКА ГРАНЕЙ ПО СРЕДНЕЙ z-КООРДИНАТЕ =====
  // Для корректного наложения прозрачных элементов (если понадобятся) сортируем грани
  const facesSorted = faces.slice().sort((faceA, faceB) => {
    let zA = 0, zB = 0;
    faceA.forEach(i => { zA += vertices[i].z; });
    faceB.forEach(i => { zB += vertices[i].z; });
    return (zA / faceA.length) - (zB / faceB.length);
  });

  // ===== 7) ОТРИСОВКА ОКТАЭДРА (ТОЛЬКО КОНТУР) =====
  // Цвет линий выбирается: если building.owner === "player", например, синий; иначе – оранжевый.
  ctx.save();
  ctx.strokeStyle = (building.owner === "player")
    ? "rgba(0,128,255,0.8)"
    : "rgba(255,128,0,0.8)";
  ctx.lineWidth = 1;
  facesSorted.forEach(face => {
    ctx.beginPath();
    const start = projVerts[face[0]];
    ctx.moveTo(start.x, start.y);
    for (let i = 1; i < face.length; i++) {
      const p = projVerts[face[i]];
      ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    ctx.stroke();
  });
  ctx.restore();

  // ===== 8) ОТРИСОВКА "ПОРТАЛА" В ЦЕНТРЕ =====
  // Портал – это эффект "черной дыры" с радиальным градиентом и обводкой, где
  // цвет обводки зависит от владельца: зелёный для игрока, красный для ИИ.
  const portalRotation = (time / 1000) % (2 * Math.PI);
  const pulse = 0.7 + 0.3 * Math.sin(time / 400);
  ctx.save();
  ctx.rotate(portalRotation);
  const portalRadius = building.width * 0.3 * pulse;
  
  // Градиент заливки портала
  const grad = ctx.createRadialGradient(0, 0, portalRadius * 0.1, 0, 0, portalRadius);
  grad.addColorStop(0, "black");
  grad.addColorStop(0.7, "#111"); // очень темный серый
  grad.addColorStop(1, "transparent");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, portalRadius, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fill();
  
  // Обводка портала с градиентом (перелив, зависящий от владельца)
  ctx.lineWidth = 1;
  const strokeGrad = ctx.createRadialGradient(0, 0, portalRadius * 0.9, 0, 0, portalRadius * 1.1);
  if (building.owner === "player") {
    strokeGrad.addColorStop(0, "rgba(0,255,0,1)");
    strokeGrad.addColorStop(1, "rgba(0,255,0,0)");
  } else {
    strokeGrad.addColorStop(0, "rgba(255,0,0,1)");
    strokeGrad.addColorStop(1, "rgba(255,0,0,0)");
  }
  ctx.strokeStyle = strokeGrad;
  ctx.beginPath();
  ctx.arc(0, 0, portalRadius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // ===== 9) ОТРИСОВКА МИГАЮЩИХ "ИНДИКАТОРОВ" НА ВЕРШИНАХ =====
  // Маленькие квадратные индикаторы, пульсирующие по размеру.
  const blinkScale = (Math.sin(time / 200) + 1) / 2; // от 0 до 1
  const baseSize = 2;
  const cubeSize = baseSize * (0.5 + blinkScale * 0.5);
  ctx.save();
  ctx.fillStyle = (building.owner === "player") ? "rgba(0,255,0,1)" : "rgba(255,0,0,1)";
  projVerts.forEach(p => {
    ctx.fillRect(p.x - cubeSize / 2, p.y - cubeSize / 2, cubeSize, cubeSize);
  });
  ctx.restore();

  ctx.restore();
}  
	  else if (building.type === "barracks3") {
  const time = performance.now();
  ctx.save();
  // Если нужно сместить начало координат к (building.x, building.y), раскомментируйте:
  // ctx.translate(building.x, building.y);

  // ===== 1) ФУНКЦИИ ПРОЕКЦИИ И ВРАЩЕНИЯ =====
  const persp = 0.3;
  function project(v) {
    return { x: v.x, y: v.y - v.z * persp };
  }
  function rotateX(v, angle) {
    const cosA = Math.cos(angle), sinA = Math.sin(angle);
    return {
      x: v.x,
      y: v.y * cosA - v.z * sinA,
      z: v.y * sinA + v.z * cosA
    };
  }
  function rotateY(v, angle) {
    const cosA = Math.cos(angle), sinA = Math.sin(angle);
    return {
      x: v.x * cosA - v.z * sinA,
      y: v.y,
      z: v.x * sinA + v.z * cosA
    };
  }

  // ===== 2) ВЕРШИНЫ ИКОСАЭДРА (12 шт.) =====
  // Используем стандартное определение из Three.js:
  // v0 = (-1,  t, 0), v1 = (1, t, 0), v2 = (-1, -t, 0), v3 = (1, -t, 0)
  // v4 = (0, -1,  t), v5 = (0, 1,  t), v6 = (0, -1, -t), v7 = (0, 1, -t)
  // v8 = ( t, 0, -1), v9 = ( t, 0,  1), v10 = (-t, 0, -1), v11 = (-t, 0,  1)
  const t = (1 + Math.sqrt(5)) / 2;
  const scale = building.width * 0.5;
  const rawVertices = [
    [-1,  t,  0],
    [ 1,  t,  0],
    [-1, -t,  0],
    [ 1, -t,  0],
    [ 0, -1,  t],
    [ 0,  1,  t],
    [ 0, -1, -t],
    [ 0,  1, -t],
    [ t,  0, -1],
    [ t,  0,  1],
    [-t,  0, -1],
    [-t,  0,  1]
  ];
  let vertices = rawVertices.map(([X, Y, Z]) => ({
    x: X * scale,
    y: Y * scale,
    z: Z * scale
  }));

  // ===== 3) МАССИВ ГРАНЕЙ (20 ТРЕУГОЛЬНИКОВ) =====
  // Стандартный набор граней из Three.js для икосаэдра:
  const faces = [
    [0, 11, 5],
    [0, 5, 1],
    [0, 1, 7],
    [0, 7, 10],
    [0, 10, 11],
    [1, 5, 9],
    [5, 11, 4],
    [11, 10, 2],
    [10, 7, 6],
    [7, 1, 8],
    [3, 9, 4],
    [3, 4, 2],
    [3, 2, 6],
    [3, 6, 8],
    [3, 8, 9],
    [4, 9, 5],
    [2, 4, 11],
    [6, 2, 10],
    [8, 6, 7],
    [9, 8, 1]
  ];

  // ===== 4) ВРАЩЕНИЕ =====
  // Применяем вращение вокруг Y и дополнительное вращение вокруг X
  const angleY = time / 2000;
  const angleX = time / 3000; // дополнительное вращение вокруг X
  vertices = vertices.map(v => {
    let vRot = rotateY(v, angleY);
    return rotateX(vRot, angleX);
  });

  // ===== 5) ПРОЕКЦИЯ В 2D =====
  const projVerts = vertices.map(project);

  // ===== 6) СОРТИРОВКА ГРАНЕЙ ПО СРЕДНЕЙ z-КООРДИНАТЕ =====
  // Это помогает корректно накладывать прозрачные грани (если понадобится)
  const facesSorted = faces.slice().sort((faceA, faceB) => {
    let zA = 0, zB = 0;
    faceA.forEach(i => { zA += vertices[i].z; });
    faceB.forEach(i => { zB += vertices[i].z; });
    return (zA / faceA.length) - (zB / faceB.length);
  });

  // ===== 7) ОТРИСОВКА ГРАНЕЙ (ТОЛЬКО КОНТУР) =====
  // Цвет линий зависит от владельца: у игрока — синий, у противника — оранжевый.
  ctx.save();
  ctx.strokeStyle = (building.owner === "player")
    ? "rgba(0,128,255,1)"
    : "rgba(255,128,0,1)";
  ctx.lineWidth   = 1;
  facesSorted.forEach(face => {
    ctx.beginPath();
    const start = projVerts[face[0]];
    ctx.moveTo(start.x, start.y);
    for (let i = 1; i < face.length; i++) {
      const p = projVerts[face[i]];
      ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    ctx.stroke();
  });
  ctx.restore();

  // ===== 8) ОТРИСОВКА "ПОРТАЛА" (ЭФФЕКТ ЧЕРНОЙ ДЫРЫ С ОБВОДКОЙ) =====
  // Портал – это радиальный градиент, имитирующий черную дыру, с пульсирующим эффектом.
  const portalRotation = (time / 2000) % (2 * Math.PI);
  const pulse = 0.7 + 0.7 * Math.sin(time / 400); // пульсация
  ctx.save();
  ctx.rotate(portalRotation);
  const portalRadius = building.width * 0.3 * pulse;
  
  // Градиент заливки портала
  const grad = ctx.createRadialGradient(0, 0, portalRadius * 0.1, 0, 0, portalRadius);
  grad.addColorStop(0, "black");
  grad.addColorStop(0.7, "#667"); // очень темный серый
  grad.addColorStop(1, "transparent");
  ctx.fillStyle = grad;
  
  ctx.beginPath();
  ctx.arc(0, 0, portalRadius, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fill();
  
  // Обводка портала с градиентным переливом цвета владельца
  ctx.lineWidth = 1;
  const strokeGrad = ctx.createRadialGradient(0, 0, portalRadius * 0.9, 0, 0, portalRadius * 1.1);
  if (building.owner === "player") {
    strokeGrad.addColorStop(0, "rgba(0,128,255,1)");
    strokeGrad.addColorStop(1, "rgba(0,200,255,0)");
  } else {
    strokeGrad.addColorStop(0, "rgba(255,128,0,1)");
    strokeGrad.addColorStop(1, "rgba(255,200,0,0)");
  }
  ctx.strokeStyle = strokeGrad;
  ctx.beginPath();
  ctx.arc(0, 0, portalRadius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // ===== 9) ОТРИСОВКА МИГАЛЫХ "КУБИКОВ" НА ВЕРШИНАХ =====
  // Добавляем маленькие квадратные "кубики" на каждую вершину,
  // их размер пульсирует, а цвет зависит от владельца:
  // - "player": зеленый
  // - иначе: красный
  const blinkScale = (Math.sin(time/200) + 1) / 2; // значение от 0 до 1
  const baseSize = 2; // базовый размер кубика
  const cubeSize = baseSize * (0.5 + blinkScale * 0.5); // размер пульсирует от 0.5*baseSize до baseSize
  ctx.save();
  ctx.fillStyle = (building.owner === "player") ? "rgba(0,255,0,1)" : "rgba(255,0,0,1)";
  projVerts.forEach(p => {
    ctx.fillRect(p.x - cubeSize/2, p.y - cubeSize/2, cubeSize, cubeSize);
  });
  ctx.restore();

  ctx.restore();
}	  
	  else if (building.type === "warehouse") {
  const time = performance.now();

  // ------------------------------
  // 1. Внешняя оболочка – шестигранная призма
  // ------------------------------
  // Размеры: ширина склада = building.width, высота = building.height
  const R = building.width / 2;        // радиус шестигранника
  const H = building.height;           // высота призмы
  const rot = time / 2000;             // угол вращения вокруг оси Y (в радианах)
  const persp = 0.3;                   // коэффициент перспективы

  // Для шестигранника удобно задать углы с поворотом на 30°,
  // чтобы плоская сторона была горизонтальной.
  let topVerts = [];    // вершины верхней (видимой) грани
  let bottomVerts = []; // вершины нижней грани
  for (let i = 0; i < 6; i++) {
    // базовый угол (в градусах): 60*i + 30, плюс вращение rot (в радианах, переведём в градусы)
    let angleDeg = i * 60 + 30 + (rot * 180/Math.PI);
    let angle = angleDeg * Math.PI / 180;
    let x = R * Math.cos(angle);
    let z = R * Math.sin(angle);
    // Верхняя грань (на уровне y = -H/2), нижняя (y = H/2)
    topVerts.push({ x: x, y: -H/2, z: z });
    bottomVerts.push({ x: x, y: H/2, z: z });
  }
  // Проекция: screenX = x, screenY = y - z*persp
  function project(p) {
    return { x: p.x, y: p.y - p.z * persp };
  }
  let top2D = topVerts.map(project);
  let bottom2D = bottomVerts.map(project);

  ctx.save();
  // Выбираем цвет для внешней оболочки (wireframe)
  ctx.strokeStyle = building.owner === "player" 
    ? "rgba(0,128,255,0.8)" 
    : "rgba(255,128,0,0.8)";
  ctx.lineWidth = 1;
  // Рисуем контур верхней грани (hexagon)
  ctx.beginPath();
  ctx.moveTo(top2D[0].x, top2D[0].y);
  for (let i = 1; i < 6; i++) {
    ctx.lineTo(top2D[i].x, top2D[i].y);
  }
  ctx.closePath();
  ctx.stroke();
  // Рисуем контур нижней грани
  ctx.beginPath();
  ctx.moveTo(bottom2D[0].x, bottom2D[0].y);
  for (let i = 1; i < 6; i++) {
    ctx.lineTo(bottom2D[i].x, bottom2D[i].y);
  }
  ctx.closePath();
  ctx.stroke();
  // Рисуем вертикальные линии между соответствующими вершинами
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.moveTo(top2D[i].x, top2D[i].y);
    ctx.lineTo(bottom2D[i].x, bottom2D[i].y);
    ctx.stroke();
  }
  ctx.restore();

  // ------------------------------
  // 2. Внутренний индикатор – заряд (прямоугольник с 5 секциями)
  // ------------------------------
  // Этот индикатор НЕ вращается – он остаётся статичным.
  // Размер индикатора: ширина = 80% от building.width, высота фиксированная (например, 10 пикселей)
  const indicatorWidth = building.width * 2;
  const indicatorHeight = 5;
  // Располагаем индикатор в нижней части склада (например, чуть выше нижней грани)
  const indicatorY = (H / 2) - indicatorHeight - 5; // от нижнего края с отступом 5
  const segments = 5;
  const segWidth = indicatorWidth / segments;

  ctx.save();
  // Рисуем фон индикатора (обводка или полупрозрачный фон)
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.fillRect(-indicatorWidth/2, indicatorY, indicatorWidth, indicatorHeight);
  
  // Заполняем секции. Предположим, что количество рабочих хранится в building.workers (целое число от 0 до 5)
  let filled = Math.min(segments, building.workers || 0);
  ctx.fillStyle = building.owner === "player" ? "lightgreen" : "red";
  for (let i = 0; i < filled; i++) {
    // Можно оставить небольшой промежуток между секциями, например, 1 пиксель
    ctx.fillRect(-indicatorWidth/2 + i * segWidth, indicatorY, segWidth - 1, indicatorHeight);
  }
  ctx.restore();

  // ------------------------------
  
}
      else if (building.type === "repairWorkshop") {
  const time = performance.now();

  // ------------------------------
  // 1. Внешняя оболочка – усечённая пирамида (мастерская)
  // ------------------------------
  const w = building.width;
  const h = building.height;
  const lowerHalf = w / 2;
  const upperScale = 0.6;
  const upperHalf = (w * upperScale) / 2;

  const verts = [
    { x: -lowerHalf, y: h/2, z: -lowerHalf },
    { x:  lowerHalf, y: h/2, z: -lowerHalf },
    { x:  lowerHalf, y: h/2, z:  lowerHalf },
    { x: -lowerHalf, y: h/2, z:  lowerHalf },
    { x: -upperHalf, y: -h/2, z: -upperHalf },
    { x:  upperHalf, y: -h/2, z: -upperHalf },
    { x:  upperHalf, y: -h/2, z:  upperHalf },
    { x: -upperHalf, y: -h/2, z:  upperHalf }
  ];
  const edges = [
    [0,1], [1,2], [2,3], [3,0],
    [4,5], [5,6], [6,7], [7,4],
    [0,4], [1,5], [2,6], [3,7]
  ];

  const angleOuter = time / 2000;
  const cosA = Math.cos(angleOuter), sinA = Math.sin(angleOuter);
  const persp = 0.3;
  function project(v) {
    return { x: v.x, y: v.y - v.z * persp };
  }
  const projectedVerts = verts.map(v => {
    let x = v.x * cosA - v.z * sinA;
    let z = v.x * sinA + v.z * cosA;
    return project({ x: x, y: v.y, z: z });
  });
  
  ctx.save();
  ctx.strokeStyle = building.owner === "player" 
    ? "rgba(0,128,255,0.8)" 
    : "rgba(255,128,0,0.8)";
  ctx.lineWidth = 1;
  edges.forEach(edge => {
    const p1 = projectedVerts[edge[0]];
    const p2 = projectedVerts[edge[1]];
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
  });
  ctx.restore();


  // ------------------------------
  // 2. Внутренний индикатор – заряд ремонтников (как у склада)
  // ------------------------------
  // Здесь копируем логику отрисовки индикатора из склада.
  // Размер: ширина = 80% от building.width, высота = 5 пикселей.
  const indicatorWidth = w * 2;
  const indicatorHeight = 5;
  // Индикатор располагается в нижней части здания (y = h/2 - 5)
  const indicatorY = (h / 2) - indicatorHeight - 5;
  const segments = 5;
  const segWidth = indicatorWidth / segments;
  
  ctx.save();
  
  
  // Рисуем фон индикатора.
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.fillRect(-indicatorWidth/2, indicatorY, indicatorWidth, indicatorHeight);
  //ctx.strokeStyle = "white";
  //ctx.lineWidth = 1;
  //ctx.strokeRect(-indicatorWidth/2, indicatorY, indicatorWidth, indicatorHeight);
  
  // Заполняем секции индикатора.
  // ВНИМАНИЕ: если building.repairmen не инициализировано, оно должно быть установлено (например, 0 по умолчанию)
  let filled = Math.min(segments, building.repairman || 0);
  ctx.fillStyle = building.owner === "player" ? "lightgreen" : "red";
  for (let i = 0; i < filled; i++) {
    ctx.fillRect(-indicatorWidth/2 + i * segWidth, indicatorY, segWidth - 1, indicatorHeight);
  }
  ctx.restore();

  // ------------------------------
  
}

    else {
      ctx.fillStyle = building.owner === "player" ? "rgba(0,128,255,0.7)" : "rgba(255,128,0,0.7)";
      ctx.fillRect(-building.width / 2, -building.height / 2, building.width, building.height);
    }
    if (building.health < building.maxHealth) {
      const barHeight = 4;
      ctx.fillStyle = "red";
      ctx.fillRect(-building.width / 2, -building.height / 2, building.width, barHeight);
      ctx.fillStyle = "green";
      const healthFraction = Math.max(0, building.health) / building.maxHealth;
      ctx.fillRect(-building.width / 2, -building.height / 2, building.width * healthFraction, barHeight);
    }
    ctx.restore();
  });
 	
  // Отрисовка юнитов
  gameState.units.forEach(unit => {
    if (unit.hidden) return;
    ctx.save();
    ctx.translate(unit.x, unit.y);
    ctx.scale(unit.scale, unit.scale);
    ctx.rotate(unit.angle);
    
   if (unit.type === "worker") {
  ctx.save();
// Применяем масштабирование: увеличиваем размер в 2 раза
  const scaleFactor = 0.7;
  ctx.scale(scaleFactor, scaleFactor);
  // Лёгкое покачивание, если юнит без команд
  const idleOffset = unit.commandQueue.length === 0 ? Math.sin(unit.idleTimer) * 2 : 0;
  //ctx.translate(unit.x, unit.y + idleOffset);

  // Основные цвета
  const mainColor = "#bbb"; // основной цвет корпуса (серый)
  const accentColor = (unit.owner === "player") ? "blue" : "orange";

  /* ==============================
   * 1) БОЛЬШОЙ ЗАДНИЙ СЕГМЕНТ (трейлер)
   *    x: -8..-3, y: -2..2
   * ============================== */
  ctx.beginPath();
  ctx.rect(-8, -2, 5, 4);  // ширина 5, высота 4
  ctx.fillStyle = mainColor;
  ctx.fill();
  ctx.strokeStyle = "darkblue";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Полоса цвета владельца (вертикальная)
  ctx.beginPath();
  ctx.moveTo(-6, -1.8);
  ctx.lineTo(-6, 1.8);
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 2;
  ctx.stroke();

  /* ==============================
   * 2) МАЛЕНЬКИЙ СРЕДНИЙ СЕГМЕНТ (КАБИНА)
   *    x: -3..0, y: -1.5..1.5
   * ============================== */
  ctx.beginPath();
  ctx.rect(-3, -1.5, 3, 3);  // ширина 3, высота 3
  ctx.fillStyle = mainColor;
  ctx.fill();
  ctx.strokeStyle = "black";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Полоса цвета владельца (вертикальная)
  ctx.beginPath();
  ctx.moveTo(-1.5, -1.3);
  ctx.lineTo(-1.5, 1.3);
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 2;
  ctx.stroke();

  /* ==============================
   * 3) КОНУСНАЯ СПИРАЛЬ (НОС)
   *    x: 0..4, радиус плавно от 2 до 1, 3 витка
   *    Вид сбоку
   * ============================== */
  // Спираль параметров
  const coilCount = 3;       // число витков
  const xStart = 0, xEnd = 4; // от x=0 до x=4
  const rStart = 2, rEnd = 1; // радиус от 2 до 1 (конус сужается)
  const steps = 60;          // детализация

  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    // Фракция по x
    const frac = i / steps;
    // x-координата вдоль спирали
    const xPos = xStart + frac * (xEnd - xStart);
    // Радиус на данном шаге (линейная интерполяция)
    const r = rStart + (rEnd - rStart) * frac;
    // Угол для «витков»
    const theta = coilCount * 2 * Math.PI * frac;
    // Позиция по вертикали: y = r * sin(theta)
    const yPos = r * Math.sin(theta);
    if (i === 0) ctx.moveTo(xPos, yPos);
    else ctx.lineTo(xPos, yPos);
  }
  ctx.strokeStyle = "silver";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Добавим «крышку» в начале (x=0) – больший круг (r=2)
  ctx.beginPath();
  ctx.ellipse(xStart, 0, rStart, 1, 0, 0, 2 * Math.PI);
  ctx.fillStyle = mainColor;
  ctx.fill();
  ctx.strokeStyle = "grey";
  ctx.stroke();

  // «Крышка» в конце (x=4) – меньший круг (r=1)
  ctx.beginPath();
  ctx.ellipse(xEnd, 0, rEnd, 0.5, 0, 0, 2 * Math.PI);
  ctx.fillStyle = mainColor;
  ctx.fill();
  ctx.stroke();

  // При желании, можно добавить вращение спирали вокруг оси X,
  // но это уже другая анимация (3D-эффект). Здесь только 2D-проекция.

  ctx.restore();
}

	  else if (unit.type === "fighter") {
  ctx.save();
// Применяем масштабирование: увеличиваем размер в 2 раза
  const scaleFactor = 0.7;
  ctx.scale(scaleFactor, scaleFactor);
  // Лёгкое покачивание, если юнит без команд
  const idleOffset = unit.commandQueue.length === 0 ? Math.sin(unit.idleTimer) * 4 : 0;
  //ctx.translate(unit.x, unit.y + idleOffset);

  /* ==============================
   * 1) ТОНКИЙ КОРПУС (ФЮЗЕЛЯЖ)
   * ============================== */
  ctx.beginPath();
  // Нос (самая правая точка)
  ctx.moveTo(12, 0);
  // Верхняя часть – делаем более тонкие линии
  ctx.lineTo(7, -1.5);
  ctx.lineTo(6, -2.5);
  ctx.lineTo(3, -3);
  ctx.lineTo(0, -3.5);
  // Плавно уходим к задней кромке, усечённой (x = -8)
  ctx.lineTo(-3, -3);
  ctx.lineTo(-6, -2);
  ctx.lineTo(-4, -1);
  // Середина задней кромки (усечённая)
  ctx.lineTo(-4, 0);
  // Нижняя часть (зеркало)
  ctx.lineTo(-4, 1);
  ctx.lineTo(-6, 2);
  ctx.lineTo(-3, 3);
  ctx.lineTo(0, 3.5);
  ctx.lineTo(3, 3);
  ctx.lineTo(6, 2.5);
  ctx.lineTo(7, 1.5);
  // Возвращаемся к носу (12,0)
  ctx.closePath();
  
  ctx.fillStyle = (unit.owner === "player") ? "blue" : "orange";
  ctx.fill();
  ctx.lineWidth = 0.5;
  ctx.strokeStyle = "darkgrey";
  ctx.stroke();

  /* ==============================
   * 2) БОЛЬШИЕ КРЫЛЬЯ
   * ============================== */
  // Левое крыло
  ctx.beginPath();
  // Точка крепления в районе (3, -3)
  ctx.moveTo(3, -3);
  // Выносим крыло далеко вперёд и наружу
  ctx.lineTo(-2, -4.8);
  ctx.lineTo(-5, -4.8);
  // Возвращаемся ближе к фюзеляжу
  ctx.lineTo(-2, -1);
  ctx.closePath();
  ctx.fillStyle = "#FF0000"; 
  ctx.fill();
  ctx.stroke();

  // Правое крыло (зеркально по y)
  ctx.beginPath();
  ctx.moveTo(3, 3);
  ctx.lineTo(-2, 4.4);
  ctx.lineTo(-5, 4.4);
  ctx.lineTo(-2, 1);
  ctx.closePath();
  ctx.fillStyle = "#FF0000";
  ctx.fill();
  ctx.stroke();

  /* ==============================
   * 3) ДВЕ ВЕРТИКАЛЬНЫЕ ПЛАСТИНЫ (ОПЕРЕНИЕ)
   * ============================== */
  // Левая пластина (вверху)
  ctx.beginPath();
  // Располагаем на краю хвоста, например у (-8, -1)
  ctx.moveTo(-8, -1);
  ctx.lineTo(-6, -3);  // вынос влево
  ctx.lineTo(-9, -1);   // возвращаемся чуть вперёд
  ctx.closePath();
  ctx.fillStyle = "#FF0000";
  ctx.fill();
  ctx.stroke();

  // Правая пластина (внизу)
  ctx.beginPath();
  ctx.moveTo(-8, 1);
  ctx.lineTo(-6, 3);
  ctx.lineTo(-9, 1);
  ctx.closePath();
  ctx.fillStyle = "#FF0000";
  ctx.fill();
  ctx.stroke();

  /* ==============================
   * 4) КАБИНА (ОСТЕКЛЕНИЕ)
   * ============================== */
  ctx.beginPath();
  // Небольшая эллиптическая кабина ближе к носу (x=7)
  ctx.ellipse(7, 0, 2, 1.2, 0, 0, 2 * Math.PI);
  ctx.fillStyle = "black";
  ctx.fill();

  ctx.restore();
}

	  else if (unit.type === "assault") {
  ctx.save();
// Применяем масштабирование: увеличиваем размер в 2 раза
  const scaleFactor = 0.9;
  ctx.scale(scaleFactor, scaleFactor);
  // Лёгкое покачивание, если юнит без команд
  const idleOffset = unit.commandQueue.length === 0 ? Math.sin(unit.idleTimer) * 4 : 0;
  //ctx.translate(unit.x, unit.y + idleOffset);

  /* ==============================
   * 1) ТОНКИЙ КОРПУС (ФЮЗЕЛЯЖ)
   * ============================== */
  ctx.beginPath();
  // Нос (самая правая точка)
  ctx.moveTo(10, 0);
  // Верхняя часть – делаем более тонкие линии
  ctx.lineTo(7, -1.5);
  ctx.lineTo(6, -2.5);
  ctx.lineTo(3, -3);
  ctx.lineTo(0, -3.5);
  // Плавно уходим к задней кромке, усечённой (x = -8)
  ctx.lineTo(-3, -3);
  ctx.lineTo(-6, -2);
  ctx.lineTo(-4, -1);
  // Середина задней кромки (усечённая)
  ctx.lineTo(-4, 0);
  // Нижняя часть (зеркало)
  ctx.lineTo(-4, 1);
  ctx.lineTo(-6, 2);
  ctx.lineTo(-3, 3);
  ctx.lineTo(0, 3.5);
  ctx.lineTo(3, 3);
  ctx.lineTo(6, 2.5);
  ctx.lineTo(7, 1.5);
  // Возвращаемся к носу (12,0)
  ctx.closePath();
  
  ctx.fillStyle = (unit.owner === "player") ? "blue" : "orange";
  ctx.fill();
  ctx.lineWidth = 0.5;
  ctx.strokeStyle = "#8A2BE2";
  ctx.stroke();

  /* ==============================
   * 2) БОЛЬШИЕ КРЫЛЬЯ
   * ============================== */
  // Левое крыло
  ctx.beginPath();
  // Точка крепления в районе (3, -3)
  ctx.moveTo(3, -3);
  // Выносим крыло далеко вперёд и наружу
  ctx.lineTo(2, -6.8);
  ctx.lineTo(5, -6.8);
  // Возвращаемся ближе к фюзеляжу
  ctx.lineTo(-2, -1);
  ctx.closePath();
  ctx.fillStyle = "#BA55D3"; 
  ctx.fill();
  ctx.stroke();

  // Правое крыло (зеркально по y)
  ctx.beginPath();
  ctx.moveTo(3, 3);
  ctx.lineTo(2, 6.4);
  ctx.lineTo(5, 6.4);
  ctx.lineTo(-2, 1);
  ctx.closePath();
  ctx.fillStyle = "#BA55D3";
  ctx.fill();
  ctx.stroke();

  /* ==============================
   * 3) ДВЕ ВЕРТИКАЛЬНЫЕ ПЛАСТИНЫ (ОПЕРЕНИЕ)
   * ============================== */
  // Левая пластина (вверху)
  ctx.beginPath();
  // Располагаем на краю хвоста, например у (-8, -1)
  ctx.moveTo(8, -1);
  ctx.lineTo(6, -3);  // вынос влево
  ctx.lineTo(9, -1);   // возвращаемся чуть вперёд
  ctx.closePath();
  ctx.fillStyle = "#BA55D3";
  ctx.fill();
  ctx.stroke();

  // Правая пластина (внизу)
  ctx.beginPath();
  ctx.moveTo(8, 1);
  ctx.lineTo(6, 3);
  ctx.lineTo(9, 1);
  ctx.closePath();
  ctx.fillStyle = "#BA55D3";
  ctx.fill();
  ctx.stroke();

  /* ==============================
   * 4) КАБИНА (ОСТЕКЛЕНИЕ)
   * ============================== */
  ctx.beginPath();
  // Небольшая эллиптическая кабина ближе к носу (x=7)
  ctx.ellipse(7, 0, 2, 1.2, 0, 0, 2 * Math.PI);
  ctx.fillStyle = "black";
  ctx.fill();

  ctx.restore();
}

	  else if (unit.type === "repairman") {
  ctx.save();
  const scaleFactor = 0.6;
  ctx.scale(scaleFactor, scaleFactor);
  // Лёгкое покачивание, если юнит без команд
  const idleOffset = unit.commandQueue.length === 0 ? Math.sin(unit.idleTimer) * 2 : 0;
 // ctx.translate(unit.x, unit.y + idleOffset);
  
  // Основные цвета
  const mainColor = "#ccc";  // основной цвет корпуса (светло-серый)
  const accentColor = unit.owner === "player" ? "green" : "blue"; // цвет владельца
  
  /* ==============================
   * 1) ПЕРЕДНЯЯ КАБИНА
   * Размер примерно 6x6 (x от 0 до 6, y от -3 до 3)
   * ============================== */
  ctx.beginPath();
  ctx.rect(0, -3, 6, 6);
  ctx.fillStyle = mainColor;
  ctx.fill();
  ctx.strokeStyle = "black";
  ctx.lineWidth = 1;
  ctx.stroke();
  
  // Акцентная вертикальная полоса в кабине
  ctx.beginPath();
  ctx.moveTo(3, -2.5);
  ctx.lineTo(3, 2.5);
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 2;
  ctx.stroke();
  
  /* ==============================
   * 2) ЗАДНИЙ ОТСЕК
   * Размер примерно 8x8 (x от -8 до 0, y от -4 до 4)
   * ============================== */
  ctx.beginPath();
  ctx.rect(-8, -4, 8, 8);
  ctx.fillStyle = mainColor;
  ctx.fill();
  ctx.strokeStyle = "black";
  ctx.lineWidth = 1;
  ctx.stroke();
  
  // Акцентная вертикальная полоса в заднем отсеке
  ctx.beginPath();
  ctx.moveTo(-4, -3.5);
  ctx.lineTo(-4, 3.5);
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 2;
  ctx.stroke();
  
  /* ==============================
   * 3) МАНИПУЛЯТОР (ЛАПА)
   * Размер примерно 8x3 (x от 6 до 14)
   * ============================== */
  // Основа манипулятора – прямоугольник
  ctx.beginPath();
  ctx.rect(6, -1.5, 8, 3);
  ctx.fillStyle = "#888"; // металлический оттенок
  ctx.fill();
  ctx.strokeStyle = "black";
  ctx.lineWidth = 1;
  ctx.stroke();
  
  // Бело-оранжевые полосы на манипуляторе – разделим его на 4 вертикальных полосы
  const stripes = 4;
  const stripeWidth = 8 / stripes;
  for (let i = 0; i < stripes; i++) {
    ctx.beginPath();
    ctx.rect(6 + i * stripeWidth, -1.5, stripeWidth, 3);
    ctx.fillStyle = (i % 2 === 0) ? "#fff" : "#FF8C00";
    ctx.fill();
    ctx.stroke();
  }
  
  // Захват (клешня) в конце манипулятора – примитивная форма
  ctx.beginPath();
  ctx.moveTo(14, -0.8);
  ctx.lineTo(15, -1.5);
  ctx.lineTo(15, 1.5);
  ctx.lineTo(14, 0.8);
  ctx.closePath();
  ctx.fillStyle = "#aaa";
  ctx.fill();
  ctx.stroke();
  
  ctx.restore();
}

	  
    else if (unit.type === "elite") {
  ctx.save();

  // Применяем масштаб 0.3 (уменьшение) – значит, изначально рисуем крупно,
  // а потом сжимаем в 0.3 раза, чтобы модель была длиннее и не занимала всю сцену.
  const scaleFactor = 0.13;
  ctx.scale(scaleFactor, scaleFactor);

  // Лёгкое покачивание (если юнит без команд)
  const idleOffset = (unit.commandQueue.length === 0) ? Math.sin(unit.idleTimer) * 3 : 0;
  // Так как мы уже масштабируем всё, делим координаты юнита на scaleFactor:
  //ctx.translate(unit.x / scaleFactor, (unit.y + idleOffset) / scaleFactor);

  // Основные цвета
  const hullColor = (unit.owner === "player") ? "blue" : "orange";  // тёмно-серый для корпуса
  const accentColor = (unit.owner === "player") ? "blue" : "orange"; // полосы владельца
  const turretColor = "silver"; // орудия
  
  // ==============================
  // 1) КОРПУС ЛИНКОРА (РЕЗКИЕ ЛИНИИ)
  // Длина ~ 400 пикс, высота ~ 80, нос заострён, хвост тоже
  // Координаты: x: -200..+200, y: -40..+40
  // ==============================
  ctx.beginPath();
  // Нос (самая правая точка)
  ctx.moveTo(200, 0);
  // Верхняя сторона – несколько острых углов
  ctx.lineTo(180, -10);
  ctx.lineTo(70, -30);
  ctx.lineTo(-60, -30);
  ctx.lineTo(-120, -20);
  // Хвост (задняя часть)
  ctx.lineTo(-200, -5);
  ctx.lineTo(-200, 5);
  // Нижняя сторона (зеркало)
  ctx.lineTo(-120, 20);
  ctx.lineTo(-60, 30);
  ctx.lineTo(70, 30);
  ctx.lineTo(180, 10);
  // Возвращаемся к носу
  ctx.lineTo(200, 0);
  ctx.closePath();
  
  ctx.fillStyle = hullColor;
  ctx.fill();
  ctx.strokeStyle = "white";
  ctx.lineWidth = 1;
  ctx.stroke();

  // ==============================
  // 2) АКЦЕНТНЫЕ ПОЛОСЫ (цвет владельца)
  // Несколько «острых» полос по корпусу
  // ==============================
  const stripes = [
    { x1: 180, y1: -2, x2: 50, y2: -25 },
    { x1: 180, y1: 2,  x2: 50, y2: 25 },
    { x1: 0,   y1: -28, x2: -100, y2: -22 },
    { x1: 0,   y1: 28,  x2: -100, y2: 22 }
  ];
  ctx.lineWidth = 2;
  ctx.strokeStyle = accentColor;
  stripes.forEach(s => {
    ctx.beginPath();
    ctx.moveTo(s.x1, s.y1);
    ctx.lineTo(s.x2, s.y2);
    ctx.stroke();
  });

  // ==============================
  // 3) ЦЕНТРАЛЬНАЯ НАДСТРОЙКА (блок)
  // x: -40..40, y: -10..10 (острые углы)
  // ==============================
  ctx.beginPath();
  ctx.moveTo(40, -10);
  ctx.lineTo(-40, -10);
  ctx.lineTo(-50, -5);
  ctx.lineTo(-50, 5);
  ctx.lineTo(-40, 10);
  ctx.lineTo(40, 10);
  ctx.lineTo(50, 5);
  ctx.lineTo(50, -5);
  ctx.closePath();
  ctx.fillStyle = "silver"
  ctx.fill();
  ctx.stroke();

  // ==============================
  // 4) АННИМИРОВАННЫЕ ОРУДИЯ (ПОВОРОТ)
  // Повернём их к targetAngle (например, используем time или ориентируем на врага)
  // ==============================
  // Допустим, у нас есть переменная unit.targetAngle, которую мы где-то рассчитываем
  // Если нет, можно вращать по времени
  const time = performance.now() / 4000;
  // «targetAngle» можно вычислять как Math.atan2(...), если известна позиция врага
  // Здесь просто вращаем по времени
  const targetAngle = (time % (2 * Math.PI));

  // Позиции орудий на корпусе
  const guns = [
    { x: 100, y: -15 },
    { x: 100, y:  15 },
    { x: -100, y: -15 },
    { x: -100, y:  15 }
  ];

  guns.forEach(gun => {
    // Сохраняем текущие настройки
    ctx.save();
    // Переносим систему координат в точку установки орудия
    ctx.translate(gun.x, gun.y);
    // Поворачиваем на targetAngle
    ctx.rotate(targetAngle);

    // Рисуем башню (круг)
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, 2 * Math.PI);
    ctx.fillStyle = turretColor;
    ctx.fill();
    ctx.strokeStyle = "silver";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Ствол (прямоугольник), выступающий вперёд (по оси X, т.к. rotate уже повернул)
    ctx.beginPath();
    // Пример: 3 пикс шириной, 20 пикс длиной
    ctx.rect(0, -1.5, 20, 3);
    ctx.fillStyle = "green";
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  });

  // ==============================
  // 5) ДВИГАТЕЛИ СЗАДИ (несколько сопел)
  // ==============================
  ctx.beginPath();
  // Несколько прямоугольников/эллипсов
  // x ~ -200..-210, y ~ -5..5
  ctx.rect(-210, -8, 10, 6);
  ctx.rect(-210, 2, 10, 6);
  ctx.fillStyle = "silver"
  ctx.fill();
  ctx.stroke();

  // Можно добавить «свечение» для двигателя (плазма)
  ctx.beginPath();
  ctx.arc(-210, -5, 3, 0, 2 * Math.PI);
  ctx.arc(-210, 5, 3, 0, 2 * Math.PI);
  ctx.fillStyle = "rgba(0,255,255,0.7)";
  ctx.fill();

  ctx.restore();
}

   
	  
    ctx.restore();
    if (selectedUnits.includes(unit)) drawCircularHP(unit.x, unit.y, 10, unit.health, unit.maxHealth);
  });
	
	gameState.buildings.forEach(building => {
  if (["barracks", "barracks2", "barracks3"].includes(building.type)) {
    updateProductionIndicator(building);
  }
});

  
  // Отрисовка ресурсов
  gameState.resources.forEach(resource => {
    renderResource(resource);
  });
  
  // Отрисовка пуль
  gameState.bullets.forEach(bullet => {
  const beamLength = 10;
  const endX = bullet.x - Math.cos(bullet.angle) * beamLength;
  const endY = bullet.y - Math.sin(bullet.angle) * beamLength;

  // Защитная проверка, чтобы все значения были конечными
  if (!isFinite(bullet.x) || !isFinite(bullet.y) || !isFinite(endX) || !isFinite(endY)) {
    return; // Пропускаем эту пулю
  }
  
  const bulletColor = bullet.color ? bullet.color : "255,255,0";
  const gradient = ctx.createLinearGradient(bullet.x, bullet.y, endX, endY);
  gradient.addColorStop(0, "rgba(" + bulletColor + ",1)");
  gradient.addColorStop(1, "rgba(" + bulletColor + ",0)");
  ctx.strokeStyle = gradient;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(bullet.x, bullet.y);
  ctx.lineTo(endX, endY);
  ctx.stroke();
});

// Отрисовка лазерных лучей для elite
const currentTime = performance.now();
gameState.units.forEach(unit => {
  if (unit.type === "elite" && unit.laserBeam && (currentTime - unit.laserBeam.timestamp < 100)) {
    ctx.save();
    ctx.strokeStyle = "rgba(255,0,0,0.6)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(unit.laserBeam.startX, unit.laserBeam.startY);
    ctx.lineTo(unit.laserBeam.endX, unit.laserBeam.endY);
    ctx.stroke();
    ctx.restore();
  }
});

// Отрисовка частиц
gameState.particles.forEach(p => {
  const alpha = p.life / p.maxLife;
  ctx.fillStyle = p.color;
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
});
// Отрисовка токенов ресурсов
  gameState.resourceTokens.forEach(token => {
    renderWorkerResourceToken(ctx, token);
  });
renderResourceTokens(); // Включаем отрисовку токенов
  
	renderInfluenceOverlay(); 
  ctx.restore();
	

	

  // Если нужно отобразить постоянный туман:
  renderPersistentFog();
  checkVictoryConditions();
  updateBaseNavButton();
  updateBase2NavButton();
  updateBase3NavButton();
	// После отрисовки игрового мира обновляем индикатор продажи
  updateSaleIndicator();
	
}