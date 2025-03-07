let gameLoopId;
let isPaused = false;
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

// Классы игровых объектов
class Building {
  constructor(type, owner, x, y) {
    this.type = type;
    this.owner = owner;
    this.x = x;
    this.y = y;
    if (type === "warehouse") {
      this.width = 10; this.height = 10;
      this.workers = 0; this.health = 250; this.maxHealth = 250;
    } else if (type === "barracks") {
      this.width = 15; this.height = 15;
      this.fighters = 0; this.health = 400; this.maxHealth = 400;
    } else if (type === "barracks2") {
      this.width = 25; this.height = 15;
      // Для казармы2 будем использовать её для найма штурмовиков
      this.fighters = 0; this.health = 550; this.maxHealth = 550;
    } else if (type === "base") {
      this.width = 20; this.height = 20;
      this.health = 1000; this.maxHealth = 1000;
    } else if (type === "base2") {
      this.width = 25; this.height = 30;
      this.health = 1200; this.maxHealth = 1200;
    } else if (type === "turret") {
      this.width = 12; this.height = 12;
      this.health = 250; this.maxHealth = 250;
      this.range = 250; this.fireRate = 70;
      this.lastFireTime = 0; this.angle = 0;
      this.target = null;
    } else if (type === "turret2") {
      this.width = 15; this.height = 17;
      this.health = 350; this.maxHealth = 350;
      this.range = 500; this.fireRate = 3000;
      this.lastFireTime = 0; this.angle = 0;
      this.target = null;
    } else if (type === "beacon") {
      this.width = 4; this.height = 17;
      this.health = 250; this.maxHealth = 250;
      this.buildZoneMultiplier = 2;
    } else if (type === "repairWorkshop") {
      this.width = 10; this.height = 10;
      this.health = 300; this.maxHealth = 300;
      this.capacity = 5;
      this.repairman = 0;
      this.controlRadius = 200;
    }
    // Новые типы зданий:
    else if (type === "base3") {
      this.width = 30; this.height = 30;
      this.health = 1500; this.maxHealth = 1500;
    } else if (type === "barracks3") {
      this.width = 20; this.height = 15;
      this.fighters = 0; this.health = 80; this.maxHealth = 80;
    } else if (type === "wall") {
      this.width = 50; this.height = 5;
      this.health = 400; this.maxHealth = 400;
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
  this.rocketRange = 300;               // Радиус для ракетного выстрела
  this.rocketCooldown = 3000;           // Кулдаун ракетного выстрела (мс)
  this.lastRocketFireTime = performance.now();
  this.engagementRadius = 500;
  this.range = 300; // <-- Добавляем общее свойство range для определения дистанции атаки
}

    // Новый тип: элитный (лингкор)
    else if (type === "elite") {
		this.vx = 0; // инициализация скорости по x
      this.vy = 0; // инициализация скорости по y
      this.health = 350;
      this.maxHealth = 350;
      this.range = 300;
      this.meleeRange = 100;   // Если враг ближе 100 единиц – использовать шрапнель
      this.artilleryRange = 500;  // Если враг между 100 и 150 – использовать ракетный залп
      this.laserRange = 300;   // Если враг дальше 150 – использовать лазерный выстрел
      
      this.lastMeleeAttack = 0;
      this.lastArtilleryAttack = 0;
      this.lastLaserAttack = 0;
      this.meleeCooldown = 500;
      this.artilleryCooldown = 3000;
      this.laserCooldown = 8000;
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
    
    // Запускаем игровой цикл и ИИ
    isPaused = false;
    lastTime = performance.now();
    gameLoopId = requestAnimationFrame(gameLoop);
    aiLogicInterval = setInterval(aiLogic, 1000);
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
    const state = localStorage.getItem("savedGameState");
    if (state) {
      let loadedState = JSON.parse(state);
      // Убираем данные тумана из сохраненного состояния, чтобы не перезатирать их
      delete loadedState.fogMap;
      delete loadedState.persistentFogMap;
      
      Object.assign(gameState, loadedState);
      
      // Явно очищаем глобальные переменные тумана перед переинициализацией
      fogMap = [];
      persistentFogMap = [];
      
      // Переинициализируем туман полностью на основе текущих размеров и позиций
      initFogOfWar();
      updateFogOfWar();
      
      alert("Игра загружена!");
    } else {
      alert("Нет сохраненных данных!");
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
  const neighborRadius = 15;         // Радиус для поиска соседей (в мировых координатах)
  const cohesionFactor = 0.05;         // Влияние стремления к центру масс соседей
  const alignmentFactor = 0.05;        // Влияние выравнивания направления
  const separationDistance = 20;       // Минимальное расстояние между юнитами
  const separationSmoothing = 1;       // Коэффициент сглаживания отделения

  // Этап 1: Когезия и выравнивание – ищем соседей через квадродерево
  gameState.units.forEach(unit => {
    // Запрос соседей – фильтруем только юниты (исключая здания)
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

  // Этап 2: Отделение – используем квадродерево для поиска слишком близких соседей
  gameState.units.forEach(unit => {
    // Опять же, фильтруем только юниты
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


// Функция обновления юнитов
function updateUnits(deltaTime) {
  gameState.units.forEach(unit => {
    // Если у юнита нет команд, добавляем автоматическое поведение для боевых юнитов
    if (unit.commandQueue.length === 0) {
      // Если юнит является боевым и уже имеет цель
      if ((unit.type === "fighter" || unit.type === "assault" || unit.type === "elite") && unit.target) {
        // Если тактика ещё не установлена, можно случайно выбрать одну
        if (!unit.tactic) {
          // Например, случайный выбор между "orbit" и "figure8"
          unit.tactic = Math.random() < 0.5 ? "orbit" : "figure8";
        }
        // Вызываем расширенное динамическое движение
        dynamicMoveAdvanced(unit, unit.target, deltaTime);
      } else {
        // Для рабочих и ремонтников или если цели нет – стандартное поведение
        unit.idleTimer += deltaTime;
        // Здесь могут быть другие действия (например, автосбор ресурсов для рабочих)
      }
    }
    // Если в очереди команд есть команды – обрабатываем их
    if (unit.commandQueue.length > 0) {
      processCommandQueue(unit);
    }
  });
  
  // Фильтрация юнитов с нулевым или отрицательным здоровьем
  gameState.units = gameState.units.filter(unit => {
    if (unit.health <= 0) {
      removeUnit(unit);
      return false;
    }
    return true;
  });
  
  updateSwarmBehavior(deltaTime);
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
    if (building.type === "turret" || building.type === "turret2") {
      const turretMainColor = building.owner === "player" ? "rgba(0,128,255,0.7)" : "rgba(255,128,0,0.7)";
      const turretBlinkColor = building.owner === "player" ? "lightgreen" : "red";
      ctx.rotate(building.angle);
      const colWidth = building.width / 3, colHeight = building.height / 2, barHeight = building.height / 3;
      ctx.fillStyle = turretMainColor;
      ctx.fillRect(-colWidth / 2, -building.height / 2, colWidth, colHeight);
      ctx.fillRect(-building.width / 2, 0, building.width, barHeight);
      const t = performance.now() / 500;
      const alpha = (Math.sin(t) + 1) / 2;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = turretBlinkColor;
      ctx.fillRect(-building.width / 2, 0, 2, 2);
      ctx.fillRect(building.width / 2 - 2, 0, 2, 2);
      ctx.globalAlpha = 1;
    }
	  
	  else if (building.type === "wall") {
  ctx.rotate(building.angle); // поворот стены по заданному углу
  ctx.fillStyle = building.owner === "player" ? "rgba(0,128,255,0.7)" : "rgba(255,128,0,0.7)";
  ctx.fillRect(-building.width / 2, -building.height / 2, building.width, building.height);
} else if (building.type === "beacon") {
      ctx.fillStyle = building.owner === "player" ? "rgba(0,128,255,0.7)" : "rgba(255,128,0,0.7)";
      ctx.fillRect(-building.width / 2, -building.height / 2, building.width, building.height);
      const time = performance.now() / 500, alpha = (Math.sin(time) + 1) / 2;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = building.owner === "player" ? "lightgreen" : "red";
      ctx.fillRect(-3, -building.height / 2 - 3, 6, 6);
      ctx.globalAlpha = 1;
    } else if (building.type === "base") {
      const half = building.width / 2;
      ctx.fillStyle = building.owner === "player" ? "rgba(0,128,255,0.7)" : "rgba(255,128,0,0.7)";
      ctx.fillRect(-half, -half, building.width, building.height);
      const time = performance.now() / 500, alpha = (Math.sin(time) + 1) / 2;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = building.owner === "player" ? "lightgreen" : "red";
      const corners = [{ x: -half, y: -half }, { x: half, y: -half }, { x: -half, y: half }, { x: half, y: half }];
      corners.forEach(corner => {
        ctx.beginPath();
        ctx.arc(corner.x, corner.y, 3, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
    } else if (building.type === "base2") {
      const halfW = building.width / 2, halfH = building.height / 2;
      ctx.fillStyle = building.owner === "player" ? "rgba(0,128,255,0.7)" : "rgba(255,128,0,0.7)";
      ctx.fillRect(-halfW, -halfH, building.width, building.height);
      const time = performance.now() / 500, alpha = (Math.sin(time) + 1) / 2;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = building.owner === "player" ? "lightgreen" : "red";
      ctx.fillRect(-3, -halfH - 3, 6, 6);
      ctx.globalAlpha = 1;
    } else if (building.type === "barracks" || building.type === "barracks2") {
      const sides = 6, radius = building.width * 0.8;
      let vertices = [];
      ctx.beginPath();
      for (let i = 0; i < sides; i++) {
        const angle = (Math.PI * 2 / sides) * i - Math.PI / 2;
        const x = radius * Math.cos(angle), y = radius * Math.sin(angle);
        vertices.push({ x, y });
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = building.owner === "player" ? "rgba(0,128,255,0.7)" : "rgba(255,128,0,0.7)";
      ctx.fill();
      const time = performance.now() / 500, alpha = (Math.sin(time) + 1) / 2;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = building.owner === "player" ? "lightgreen" : "red";
      vertices.forEach(v => {
        ctx.beginPath();
        ctx.arc(v.x, v.y, 3, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
    } else if (building.type === "warehouse") {
      const fillColor = building.owner === "player" ? "rgba(0,128,255,0.7)" : "rgba(255,128,0,0.7)";
      ctx.fillStyle = fillColor;
      ctx.fillRect(-building.width / 2, -building.height / 2, 2, building.height);
      ctx.fillRect(building.width / 2 - 2, -building.height / 2, 2, building.height);
      ctx.fillRect(-building.width / 2, building.height / 2 - 2, building.width, 2);
      const time = performance.now() / 500, alpha = (Math.sin(time) + 1) / 2;
      ctx.globalAlpha = alpha;
      const blinkColor = building.owner === "player" ? "lightgreen" : "red";
      ctx.fillStyle = blinkColor;
      ctx.fillRect(-building.width / 2, building.height / 2 - 2, 2, 2);
      ctx.fillRect(building.width / 2 - 2, building.height / 2 - 2, 2, 2);
      ctx.globalAlpha = 1;
    } else if (building.type === "repairWorkshop") {
      let fillColor = building.owner === "player" ? "rgba(0,128,255,0.7)" : "rgba(255,128,0,0.7)";
      ctx.fillStyle = fillColor;
      const halfW = building.width / 2;
      const halfH = building.height / 2;
      const p1 = { x: 0, y: -halfH };
      const p2 = { x: -halfW, y: halfH };
      const p3 = { x: halfW, y: halfH };
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.lineTo(p3.x, p3.y);
      ctx.closePath();
      ctx.fill();
      const t = performance.now() / 500;
      const alpha = (Math.sin(t) + 1) / 2;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = building.owner === "player" ? "lightgreen" : "red";
      [p1, p2, p3].forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
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
      const idleOffset = unit.commandQueue.length === 0 ? Math.sin(unit.idleTimer) * 2 : 0;
      ctx.translate(0, idleOffset);
      ctx.fillStyle = unit.owner === "player" ? "green" : "blue";
      ctx.fillRect(-4, -2, 8, 4);
      ctx.beginPath();
      ctx.moveTo(2, -1);
      ctx.lineTo(3, 0);
      ctx.lineTo(2, 1);
      ctx.closePath();
      ctx.fillStyle = "yellow";
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = "black";
      ctx.stroke();
    } else if (unit.type === "fighter") {
      const idleOffset = unit.commandQueue.length === 0 ? Math.sin(unit.idleTimer) * 2 : 0;
      ctx.translate(0, idleOffset);
      ctx.beginPath();
      ctx.moveTo(0, -4);
      ctx.lineTo(8, 0);
      ctx.lineTo(0, 4);
      ctx.lineTo(-4, 0);
      ctx.closePath();
      ctx.fillStyle = unit.owner === "player" ? "red" : "orange";
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = "black";
      ctx.stroke();
    } else if (unit.type === "assault") {
      const idleOffset = unit.commandQueue.length === 0 ? Math.sin(unit.idleTimer) * 2 : 0;
      ctx.translate(0, idleOffset);
      ctx.rotate(Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(0, -10);
      ctx.lineTo(8, 5);
      ctx.lineTo(4, 8);
      ctx.lineTo(-4, 8);
      ctx.lineTo(-8, 5);
      ctx.closePath();
      ctx.fillStyle = "#4B0082";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#8A2BE2";
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, -4, 3, 0, Math.PI * 2);
      ctx.fillStyle = "lightblue";
      ctx.fill();
    } else if (unit.type === "repairman") {
      ctx.beginPath();
      ctx.arc(0, 0, 6, 0, Math.PI * 2);
      ctx.fillStyle = unit.owner === "player" ? "#8A2BE2" : "#A0522D";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = unit.owner === "player" ? "#DDA0DD" : "#CD853F";
      ctx.beginPath();
      ctx.moveTo(-3, 0);
      ctx.lineTo(-10, -5);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(-10, -5, 2, 0, Math.PI * 2);
      ctx.fillStyle = unit.owner === "player" ? "#DDA0DD" : "#CD853F";
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(3, 0);
      ctx.lineTo(10, -5);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(10, -5, 2, 0, Math.PI * 2);
      ctx.fillStyle = unit.owner === "player" ? "#DDA0DD" : "#CD853F";
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(0, 6);
      ctx.lineTo(-3, 10);
      ctx.lineTo(3, 10);
      ctx.closePath();
      ctx.fillStyle = unit.owner === "player" ? "#BA55D3" : "#D2691E";
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = "black";
      ctx.stroke();
    }
    else if (unit.type === "elite") {
      ctx.fillStyle = "gray";
      ctx.beginPath();
      ctx.moveTo(-17, -6);
      ctx.lineTo(17, -6);
      ctx.lineTo(20, 0);
      ctx.lineTo(17, 6);
      ctx.lineTo(-17, 6);
      ctx.lineTo(-20, 0);
      ctx.closePath();
      ctx.fill();
    }
   
	  
    ctx.restore();
    if (selectedUnits.includes(unit)) drawCircularHP(unit.x, unit.y, 10, unit.health, unit.maxHealth);
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


  
  ctx.restore();
	
	// Если нужно отобразить динамичный туман:
  renderFogOfWar();

  // Если нужно отобразить постоянный туман:
  renderPersistentFog();
  checkVictoryConditions();
  updateBaseNavButton();
  updateBase2NavButton();
  updateBase3NavButton();
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
// Функция движения юнитов с анимацией
function moveUnit(unit, targetX, targetY, callback, spreadDone = false) {
  const startX = unit.x, startY = unit.y;
  const dx = targetX - startX, dy = targetY - startY;
  const distance = Math.hypot(dx, dy);
  if (distance < 1) {
    if (callback) callback();
    return;
  }
  unit.angle = Math.atan2(dy, dx);
  // Используем unit.speed, либо, если не задан, WORKER_SPEED (или другой подходящий базовый параметр)
  const speed = unit.speed || WORKER_SPEED;
  const duration = distance / speed; 
  const startTime = performance.now();

  function animate() {
    const currentTime = performance.now();
    const elapsed = (currentTime - startTime) / 1000;
    const progress = Math.min(elapsed / duration, 1);

    // Добавляем проверку наличия врагов во время движения:
    // Если у юнита не определён диапазон атаки, можно задать значение по умолчанию (например, 150)
    const range = unit.range || 150;
    const enemies = getEnemiesInRange({ x: unit.x, y: unit.y }, range)
                      .filter(e => e.owner !== unit.owner);
    if (enemies.length > 0) {
      // Если враги обнаружены, прерываем движение и переключаемся на атаку
      unit.commandQueue = [];
      // Выбираем ближайшего врага
      const nearestEnemy = enemies.reduce((prev, curr) =>
        Math.hypot(curr.x - unit.x, curr.y - unit.y) < Math.hypot(prev.x - unit.x, prev.y - unit.y)
          ? curr : prev
      );
      unit.commandQueue.push({ type: "attack", target: nearestEnemy });
      // Прерываем анимацию движения
      if (unit.currentMovementAnimation) {
        cancelAnimationFrame(unit.currentMovementAnimation);
        unit.currentMovementAnimation = null;
      }
      return;
    }

    // Обновляем позицию юнита
    unit.x = startX + dx * progress;
    unit.y = startY + dy * progress;

    if (progress < 1) {
      unit.currentMovementAnimation = requestAnimationFrame(animate);
    } else {
      unit.currentMovementAnimation = null;
      // Если реализована логика "spread" после достижения цели, можно её выполнить здесь,
      // иначе вызываем callback по завершении движения
      if (!spreadDone) {
        // Если требуется дополнительное разбрасывание, реализуйте здесь (например, вызов moveUnit с новыми координатами)
        // Для простоты можно сразу вызвать callback
        if (callback) callback();
      } else {
        if (callback) callback();
      }
    }
  }

  // Если анимация уже запущена, отменяем её перед новым запуском
  if (unit.currentMovementAnimation) {
    cancelAnimationFrame(unit.currentMovementAnimation);
    unit.currentMovementAnimation = null;
  }
  animate();
}


function updateUnits(deltaTime) {
  gameState.units.forEach(unit => {
    // Пропускаем скрытые юниты (если нужно)
    // if (unit.hidden) return;
    
    if (unit.commandQueue.length === 0) {
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
    if (unit.commandQueue.length > 0) processCommandQueue(unit);
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

function getPreferredResourceType(owner) {
  const res = owner === "player" ? gameState.playerResources : gameState.aiResources;
  const min = Math.min(res.gold, res.silicon, res.plasma);
  if (min === res.gold) return "gold";
  if (min === res.silicon) return "silicon";
  return "plasma";
}

function startWorkerCycle(worker, warehouse) {
  // Если рабочий не существует или мёртв, завершаем цикл
  if (!worker || worker.health <= 0 || !gameState.units.includes(worker)) return;

  // Если рабочий уже что-то несёт, направляем его к ближайшему зданию для доставки
  if (worker.carrying > 0) {
    const deliveryBuilding = findNearestDeliveryBuilding(worker.x, worker.y, worker.owner);
    if (deliveryBuilding) {
      moveUnit(worker, deliveryBuilding.x, deliveryBuilding.y, () => {
        const resourceType = getPreferredResourceType(worker.owner);
        if (worker.owner === "player")
          gameState.playerResources[resourceType] += worker.carrying;
        else
          gameState.aiResources[resourceType] += worker.carrying;
        worker.carrying = 0;
        setTimeout(() => startWorkerCycle(worker, warehouse), 1000);
      });
      return;
    }
  }

  // Определяем нужный тип ресурса для рабочего
  const resourceType = getPreferredResourceType(worker.owner);
  const resource = findNearestResource(worker.x, worker.y, resourceType);

  // Если ресурс отсутствует или его количество равно нулю, ждем и пробуем снова через задержку
  if (!resource || resource.amount <= 0) {
    //console.log("Ресурс недоступен или исчерпан, рабочий ждёт...", worker);
    setTimeout(() => startWorkerCycle(worker, warehouse), 1000);
    return;
  }

	
	
  // Вычисляем расстояние до ресурса и динамический таймаут
  const distance = Math.hypot(resource.x - worker.x, resource.y - worker.y);
  // Базовое время (например, 5000 мс) плюс 10 мс на каждую единицу расстояния (коэффициент можно подобрать)
  const maxTravelTime = 10000 + distance * 10;
  let reached = false;
  const travelTimeout = setTimeout(() => {
    if (!reached) {
      //console.log("Рабочий не добрался до ресурса за", maxTravelTime, "мс, возвращается к складу.");
      const deliveryBuilding = findNearestDeliveryBuilding(worker.x, worker.y, worker.owner);
      if (deliveryBuilding) {
        moveUnit(worker, deliveryBuilding.x, deliveryBuilding.y, () => {
          setTimeout(() => startWorkerCycle(worker, warehouse), 1000);
        });
      } else {
        setTimeout(() => startWorkerCycle(worker, warehouse), 1000);
      }
    }
  }, maxTravelTime);

  // Двигаем рабочего к ресурсу
  moveUnit(worker, resource.x, resource.y, () => {
    reached = true;  // рабочий добрался до цели
    clearTimeout(travelTimeout);

    // Прибыв, проверяем снова ресурс (на случай, если он исчез за время движения)
    if (resource.amount > 0) {
      resource.amount--;
      worker.carrying = (worker.carrying || 0) + 10;
    } else {
      console.log("Ресурс исчез во время сбора, перезапуск цикла рабочего.");
      setTimeout(() => startWorkerCycle(worker, warehouse), 1000);
      return;
    }

    // После сбора направляем рабочего к ближайшему зданию для доставки
    const deliveryBuilding = findNearestDeliveryBuilding(worker.x, worker.y, worker.owner);
    if (deliveryBuilding) {
      moveUnit(worker, deliveryBuilding.x, deliveryBuilding.y, () => {
        if (worker.owner === "player")
          gameState.playerResources[resourceType] += worker.carrying;
        else
          gameState.aiResources[resourceType] += worker.carrying;
        worker.carrying = 0;
        setTimeout(() => startWorkerCycle(worker, warehouse), 1000);
      });
    } else {
      setTimeout(() => startWorkerCycle(worker, warehouse), 1000);
    }
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
  function cycle() {
    if (turret.health <= 0) return;
    
    // Если цель недействительна (отсутствует, мертва или слишком далеко), ищем новую
    if (!turret.target || turret.target.health <= 0 ||
       (Math.hypot(turret.target.x - turret.x, turret.target.y - turret.y) > turret.range)) {
      const candidates = getEnemiesInRange({ x: turret.x, y: turret.y }, turret.range, turret.owner);
      if (candidates.length > 0) {
        turret.target = candidates[0];
      } else {
        turret.target = null;
      }
    }
    
    // Если цель найдена, стрелять с учетом fireRate
    if (turret.target) {
      const now = performance.now();
      if (now - turret.lastFireTime >= turret.fireRate) {
        fireBullet(turret, turret.target);
        turret.lastFireTime = now;
      }
    }
    
    requestAnimationFrame(cycle);
  }
  cycle();
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

function processResourceDepletion() {
  gameState.resources.slice().forEach(resource => {
    if (resource.amount <= 0 && !resource.depleted) {
      resource.depleted = true;
      spawnParticles(resource.x, resource.y, "orange");
      setTimeout(() => {
        const idx = gameState.resources.indexOf(resource);
        if (idx !== -1) gameState.resources.splice(idx, 1);
        setTimeout(() => {
          const x = Math.random() * (worldWidth - 40) + 10;
          const y = Math.random() * (worldHeight - 40) + 10;
          const newResource = new Resource(resource.type, x, y, resource.max, resource.max);
          gameState.resources.push(newResource);
        }, 50000);
      }, 500);
    }
  });
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