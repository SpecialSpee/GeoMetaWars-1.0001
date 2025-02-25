let gameLoopId;
let isPaused = false;
// Объявляем переменные виртуального мира заранее
let worldWidth, worldHeight;
const ctx = canvas.getContext("2d");

// Объект камеры и функции преобразования координат
const camera = {
  offsetX: 0,
  offsetY: 0,
  scale: 0.5  // Начальный масштаб – можно регулировать
};



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
      this.range = 250; this.fireRate = 150;
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
      this.width = 40; this.height = 10;
      this.health = 200; this.maxHealth = 200;
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
      this.health = 50;
      this.maxHealth = 50;
    } else if (type === "fighter") {
      this.health = 100;
      this.maxHealth = 100;
      this.range = 150;
      this.fireRate = 100;
      this.lastFireTime = 0;
      this.orbitRadius = undefined;
      this.orbitAngle = undefined;
      this.engagementRadius = 500;
    } else if (type === "repairman") {
      this.health = 50;
      this.maxHealth = 50;
      this.engagementRadius = 500;
      this.scale = 0.4;
    }
    else if (type === "assault") {
  this.health = 200;
  this.maxHealth = 200;
  // Пулемётный режим:
  this.machineGunRange = 100;          // Радиус действия пулемёта
  this.machineGunFireRate = 200;         // Интервал стрельбы пулемётом (мс)
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


// ======================
// === Оригинальные константы и функции (оставляем без изменений)
// ======================



const DESIRED_WAREHOUSE_COUNT = 150;
const DESIRED_WORKER_COUNT = 5;
const DESIRED_REPAIR_WORKSHOP_COUNT = 150;
const DESIRED_REPAIRMAN_COUNT = 3;
const DESIRED_BEACON_COUNT = 150; // для маяков

const RESOURCE_CLUSTER_RADIUS = 50; // Радиус подсчёта кластера ресурсов
const MIN_CLUSTER_DISTANCE = 10;      // Минимальное расстояние между кластерами
const MAX_EXPANSION_DISTANCE = 300;   // Максимальное расстояние от существующей инфраструктуры для экспансии

const MIN_GARRISON_COUNT = 5;  // Минимальное число юнитов для массовой атаки из кластера
const MAX_GARRISON_COUNT = 10; // Если юнитов больше – часть остаётся в обороне
const CLUSTER_RADIUS = 100;    // Радиус для группировки построек в кластер

const DESIRED_DEFENDERS_PER_BUILDING = 2;
const DEFENSE_RADIUS = 50; // Радиус, в пределах которого считается, что здание защищено


// Константы игры (новые здания)
const WAREHOUSE_COST = { gold: 28, silicon: 44, plasma: 17 };
const WORKER_COST = { gold: 9, silicon: 16, plasma: 6 };
const REPAIR_WORKSHOP_COST = { gold: 34, silicon: 43, plasma: 21};
const REPAIRMAN_COST = { gold: 13, silicon: 22, plasma: 9 };
const BARRACKS_COST = { gold: 56, silicon: 73, plasma: 27 };
const FIGHTER_COST = { gold: 24, silicon: 27, plasma: 12 };
const ASSAULT_COST = { gold: 56, silicon: 72, plasma: 26 };
const ELITE_COST = { gold: 82, silicon: 94, plasma: 36 };
const TURRET_COST = { gold: 31, silicon: 44, plasma: 18 };
const BEACON_COST = { gold: 53, silicon: 67, plasma: 23 };
const BASE2_COST = { gold: 323, silicon: 432, plasma: 211 };
const BARRACKS2_COST = { gold: 107, silicon: 168, plasma: 68 };
const TURRET2_COST = { gold: 57, silicon: 95, plasma: 29 };
const BASE3_COST = { gold: 1113, silicon: 1402, plasma: 527 };
const BARRACKS3_COST = { gold: 346, silicon: 472, plasma: 194 };
const WALL_COST = { gold: 26, silicon: 34, plasma: 4 };
// === Константы и глобальные переменные для тумана войны ===
const FOG_CELL_SIZE = 45;      // размер ячейки тумана (в мировых единицах)
const VISION_RADIUS = 250;     // радиус видимости юнита игрока (в мировых единицах)
let fogMap = [];               // двумерный массив для хранения состояния видимости (0 – туман, 1 – видимость)
let persistentFogMap = [];


const WORKER_SPEED = 100;
const FIGHTER_BULLET_CONFIG = { speed: 300, lifetime: 1.5 };
const TURRET_BULLET_CONFIG = { speed: 300, lifetime: 1.5 };
const AUTO_COLLECT_ENABLED = true;
const GRID_SIZE = 50;

const MISSILE_CONFIG = { 
  speed: 200,          // Скорость полёта ракеты
  lifetime: 1,         // Время жизни (секунд)
  damage: 20,          // Основной урон при попадании
  splashRadius: 30,    // Радиус действия splash-урона
  splashDamage: 5     // Урон по объектам в области
};

const MELEE_BULLET_CONFIG = {
  speed: 250,     // скорость пули (можно настроить)
  lifetime: 0.3,  // время жизни пули (короткое, так как это ближний бой)
  damage: 5       // урон одной пули
};


// Дополнительная константа для артиллерии
const ARTILLERY_BULLET_CONFIG = {
  speed: 150,          // скорость снаряда
  lifetime: 1.5,       // время жизни (секунд)
  damage: 40,          // базовый урон
  splashRadius: 50,    // радиус splash-урона
  splashDamage: 8     // урон по объектам в области
};

// Дополнительные константы для динамичного поведения fighter
const BASE_SPEED = 70;
const TURN_SPEED = 70;
const WANDER_STRENGTH = 70;
const MIN_TURN_ANGLE = 200 * Math.PI / 180;
const MAX_TURN_ANGLE = 300 * Math.PI / 180;


// Глобальное состояние игры
const gameState = {
  buildings: [],
  units: [],
  resources: [],
  bullets: [],
  particles: [],
  playerResources: { gold: 300, silicon: 200, plasma: 250 },
  aiResources: { gold: 300, silicon: 200, plasma: 250 }
};
let selectedUnits = [];

const margin = 100;
const MAX_SCALE = 2;

// Массив с путями к фоновым изображениям
const backgroundImages = [
  'src/images/background1.jpeg',
  'src/images/background2.jpeg',
  'src/images/background3.jpeg',
  'src/images/background4.jpeg',
  'src/images/background5.jpeg',
	'src/images/background6.jpeg',
	'src/images/background7.jpeg'
];
// Выбор случайного изображения из массива
const randomIndex = Math.floor(Math.random() * backgroundImages.length);
const selectedImage = backgroundImages[randomIndex];
// Создание объекта изображения и установка источника
const backgroundImage = new Image();
backgroundImage.src = selectedImage;
backgroundImage.onload = () => {
  console.log('Фоновая картинка загружена:', selectedImage);
  
  // Пример установки фона для body
  document.body.style.backgroundImage = `url(${selectedImage})`;
  document.body.style.backgroundSize = 'cover';
  document.body.style.backgroundPosition = 'center';
	
};
let isWallDragging = false;
let wallDragStart = { x: 0, y: 0 };
let currentWallDragZone = null;


// Обработчики перетаскивания карты
// Универсальная функция для получения координат события (mouse/touch)
function getEventPosition(e) {
  if (e.touches && e.touches.length > 0) {
    return { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }
  return { x: e.clientX, y: e.clientY };
}

// Глобальные переменные для перетаскивания карты
let isDragging = false;
let dragStart = { x: 0, y: 0 };
let cameraStart = { offsetX: 0, offsetY: 0 };

// --- Обработчики перетаскивания карты ---
// Мышь
canvas.addEventListener("mousedown", e => {
  isDragging = true;
  dragStart = getEventPosition(e);
  cameraStart = { offsetX: camera.offsetX, offsetY: camera.offsetY };
});
canvas.addEventListener("mousemove", e => {
  if (isDragging) {
    const pos = getEventPosition(e);
    const dx = pos.x - dragStart.x;
    const dy = pos.y - dragStart.y;
    camera.offsetX = cameraStart.offsetX + dx;
    camera.offsetY = cameraStart.offsetY + dy;
  }
});
canvas.addEventListener("mouseup", () => { isDragging = false; });
canvas.addEventListener("mouseleave", () => { isDragging = false; });

// Touch
canvas.addEventListener("touchstart", e => {
  e.preventDefault();
  isDragging = true;
  dragStart = getEventPosition(e);
  cameraStart = { offsetX: camera.offsetX, offsetY: camera.offsetY };
}, { passive: false });
canvas.addEventListener("touchmove", e => {
  e.preventDefault();
  if (isDragging) {
    const pos = getEventPosition(e);
    const dx = pos.x - dragStart.x;
    const dy = pos.y - dragStart.y;
    camera.offsetX = cameraStart.offsetX + dx;
    camera.offsetY = cameraStart.offsetY + dy;
  }
}, { passive: false });
canvas.addEventListener("touchend", e => {
  e.preventDefault();
  isDragging = false;
  // Если касание не было перетаскиванием (движение минимально), вызываем обработчик клика
  const pos = getEventPosition(e);
  handleClick(pos.x, pos.y);
}, { passive: false });

// --- Обработчики кликов ---
// Общий обработчик клика для mouse и touch
canvas.addEventListener("click", e => {
  // Если не перетаскиваем (mouse click)
  if (!isDragging) {
    const pos = getEventPosition(e);
    handleClick(pos.x, pos.y);
  }
});

// Обработчик двойного клика
canvas.addEventListener("dblclick", e => {
  clearBuildZones();
  const pos = screenToWorld(e.clientX, e.clientY);
  const clickedBuilding = gameState.buildings.find(b =>
    pos.x >= b.x - b.width/2 && pos.x <= b.x + b.width/2 &&
    pos.y >= b.y - b.height/2 && pos.y <= b.y + b.height/2
  );
  if (clickedBuilding) return;
  const unitRadius = 5;
  const clickedUnit = gameState.units.find(u => 
    u.owner === "player" && Math.hypot(u.x - pos.x, u.y - pos.y) < unitRadius
  );
  if (clickedUnit) {
    selectedUnits = gameState.units.filter(u => u.owner === "player" && u.type === clickedUnit.type);
  } else {
    startSelectionFrame(e);
  }
});

// Обработчик контекстного меню (правый клик)
canvas.addEventListener("contextmenu", e => {
  e.preventDefault();
  clearBuildZones();
  const pos = screenToWorld(e.clientX, e.clientY);
  const unitRadius = 5;
  let enemyTarget = gameState.units.find(u => 
    u.owner !== "player" && Math.hypot(u.x - pos.x, u.y - pos.y) < unitRadius
  );
  if (!enemyTarget) {
    enemyTarget = gameState.buildings.find(b =>
      b.owner !== "player" &&
      pos.x >= b.x - b.width/2 && pos.x <= b.x + b.width/2 &&
      pos.y >= b.y - b.height/2 && pos.y <= b.y + b.height/2
    );
  }
  if (enemyTarget) {
    selectedUnits.forEach(unit => {
      unit.commandQueue = [];
      unit.commandQueue.push({ type: "attack", target: enemyTarget });
    });
  } else {
    selectedUnits = [];
  }
});

// Универсальная функция обработки клика
function handleClick(clientX, clientY) {
  clearBuildZones();
  const pos = screenToWorld(clientX, clientY);
  
  // Если выбран ремонтник, обрабатываем особый случай
  const selectedRepairman = selectedUnits.find(u => u.type === "repairman");
  if (selectedRepairman) {
    const clickedResource = gameState.resources.find(r => Math.hypot(r.x - pos.x, r.y - pos.y) < 10);
    if (clickedResource) return;
    const clickedBuilding = gameState.buildings.find(b =>
      b.owner === "player" &&
      pos.x >= b.x - b.width/2 && pos.x <= b.x + b.width/2 &&
      pos.y >= b.y - b.height/2 && pos.y <= b.y + b.height/2
    );
    // Дополнительная логика для ремонта (если нужна)
  }
  
  const clickedResource = gameState.resources.find(r => Math.hypot(r.x - pos.x, r.y - pos.y) < 10);
  const clickedBuilding = gameState.buildings.find(b =>
    b.owner === "player" &&
    pos.x >= b.x - b.width/2 && pos.x <= b.x + b.width/2 &&
    pos.y >= b.y - b.height/2 && pos.y <= b.y + b.height/2
  );
  
  if (clickedBuilding) {
    if (clickedBuilding.type === "warehouse") { hireWorkerForPlayer(clickedBuilding); return; }
    if (clickedBuilding.type === "barracks") { hireFighterForPlayer(clickedBuilding); return; }
    if (clickedBuilding.type === "barracks2") { hireAssaultForPlayer(clickedBuilding); return; }
    if (clickedBuilding.type === "repairWorkshop") { recallRepairmenFromWorkshop(clickedBuilding); return; }
    if (clickedBuilding.type === "barracks3") { hireEliteForPlayer(clickedBuilding); return; }
    if (clickedBuilding.type === "base" || clickedBuilding.type === "base2" ||
        clickedBuilding.type === "base3" || clickedBuilding.type === "beacon") { 
      showBuildingMenu(clickedBuilding); 
      return;
    }
  }
  
  if (clickedResource && selectedUnits.length > 0) {
    selectedUnits.forEach(unit => {
      if (unit.type === "worker") {
        unit.commandQueue = [];
        unit.commandQueue.push({ type: "gather", resource: clickedResource });
      }
    });
    return;
  }
  
  const unitRadius = 5;
  const clickedUnit = gameState.units.find(u => 
    u.owner === "player" && Math.hypot(u.x - pos.x, u.y - pos.y) < unitRadius
  );
  
  if (clickedUnit) {
    selectedUnits = [clickedUnit];
  } else if (selectedUnits.length > 0) {
    // Если есть выделенные юниты, задаём им команду перемещения
    selectedUnits.forEach(unit => {
      unit.commandQueue = [];
      if (unit.currentMovementAnimation) {
        cancelAnimationFrame(unit.currentMovementAnimation);
        unit.currentMovementAnimation = null;
      }
      const randomTarget = getRandomTargetPoint(pos.x, pos.y, 50);
      unit.commandQueue.push({ type: "move", x: randomTarget.x, y: randomTarget.y });
    });
  }
}





