// Глобальное состояние игры
const gameState = {


  buildings: [],
  units: [],
  resources: [],
  bullets: [],
  particles: [],
  playerResources: { gold: 200, silicon: 300, plasma: 150 },
  aiResources: { gold: 200, silicon: 300, plasma: 150 },
	// Новые массивы для оптимизации
  attackers: [],    // для всех боевых юнитов (fighter, assault, elite)
  repairmen: [],    // для ремонтников
  defenders: []     // если нужно отдельно хранить юнитов, назначенных для защиты
};



const fragmentColors = {
  worker: "#00FF00",      // зелёный для рабочих
  fighter: "#FF0000",     // красный для истребителей
  assault: "#800080",     // фиолетовый для штурмовиков
  repairman: "#0000FF",   // синий для ремонтников
  elite: "#808080",       // серый для элитных
  building: "#FFFF00"     // например, жёлтый для зданий (можно расширить для разных типов зданий)
};



// ======================
// === Оригинальные константы и функции (оставляем без изменений)
// ======================
//const SPEED_WORKER = 100;
//const SPEED_REPAIRMAN = 100;
//const SPEED_FIGHTER = 70;
//const SPEED_ASSAULT = 70;
//const SPEED_ELITE = 50;




// Пересмотр баланса цен – увеличены затраты для повышения стоимости юнитов и построек
// Базовые постройки и инфраструктура
const BASE_COST = { gold: 87, silicon: 103, plasma: 42 };
const WAREHOUSE_COST = { gold: 12, silicon: 5, plasma: 3 };
const WORKER_COST = { gold: 4, silicon: 6, plasma: 3 };
const REPAIR_WORKSHOP_COST = { gold: 15, silicon: 7, plasma: 4 };
const REPAIRMAN_COST = { gold: 5, silicon: 7, plasma: 4 };
// Боевые постройки и юниты первого уровня
const BARRACKS_COST = { gold: 41, silicon: 52, plasma: 15 };
const FIGHTER_COST = { gold: 13, silicon: 15, plasma: 8 };
const ASSAULT_COST = { gold: 23, silicon: 26, plasma: 12 };
const ELITE_COST = { gold: 58, silicon: 73, plasma: 36 };
const TURRET_COST = { gold: 17, silicon: 21, plasma: 7 };
const BEACON_COST = { gold: 27, silicon: 38, plasma: 12 };
// Улучшенные постройки (2 уровень)
const BASE2_COST = { gold: 111, silicon: 112, plasma: 53 };
const BARRACKS2_COST = { gold: 65, silicon: 72, plasma: 19 };
const TURRET2_COST = { gold: 21, silicon: 36, plasma: 14 };
// Поздняя игра (3 уровень)
const BASE3_COST = { gold: 132, silicon: 148, plasma: 62 };
const BARRACKS3_COST = { gold: 73, silicon: 84, plasma: 24 };
// Дополнительные оборонительные сооружения
const WALL_COST = { gold: 8, silicon: 4, plasma: 2 };


// === Константы и глобальные переменные для тумана войны ===
const FOG_CELL_SIZE = 45;      // размер ячейки тумана (в мировых единицах)
const VISION_RADIUS = 250;     // радиус видимости юнита игрока (в мировых единицах)
let fogMap = [];               // двумерный массив для хранения состояния видимости (0 – туман, 1 – видимость)
let persistentFogMap = [];


const WORKER_SPEED = 50;
const FIGHTER_BULLET_CONFIG = { speed: 200, lifetime: 0.8, damage: 10 };
const TURRET_BULLET_CONFIG = { speed: 300, lifetime: 1.2, damage: 15 };
const AUTO_COLLECT_ENABLED = true;
//const GRID_SIZE = 50;

const MISSILE_CONFIG = { 
  speed: 130,          // Скорость полёта ракеты
  lifetime: 3,         // Время жизни (секунд)
  damage: 20,          // Основной урон при попадании
  splashRadius: 30,    // Радиус действия splash-урона
  splashDamage: 5     // Урон по объектам в области
};

const MELEE_BULLET_CONFIG = {
  speed: 250,     // скорость пули (можно настроить)
  lifetime: 0.5,  // время жизни пули (короткое, так как это ближний бой)
  damage: 5       // урон одной пули
};


// Дополнительная константа для артиллерии
const ARTILLERY_BULLET_CONFIG = {
  speed: 150,          // скорость снаряда
  lifetime: 3,       // время жизни (секунд)
  damage: 40,          // базовый урон
  splashRadius: 50,    // радиус splash-урона
  splashDamage: 8     // урон по объектам в области
};

// Дополнительные константы для динамичного поведения fighter
const BASE_SPEED = 100;
const TURN_SPEED = 70;
const WANDER_STRENGTH = 100;
const MIN_TURN_ANGLE = 200 * Math.PI / 180;
const MAX_TURN_ANGLE = 300 * Math.PI / 180;



let selectedUnits = [];


function calculateWallPosition(base) {
  // Выбираем случайный угол для размещения стены вокруг базы.
  const angle = Math.random() * 2 * Math.PI;
  // Определяем отступ: половина ширины базы плюс фиксированный отступ (например, 20 пикселей)
  const offset = base.width / 2 + 40;
  return {
    x: base.x + offset * Math.cos(angle),
    y: base.y + offset * Math.sin(angle)
  };
}


function randomFarPosition(building, minDistance) {
  // minDistance – минимальное расстояние от здания
  const angle = Math.random() * Math.PI * 3;
  // Можно задать, что случайное расстояние будет в диапазоне от minDistance до, например, 2*minDistance
  const distance = minDistance + Math.random() * minDistance;
  return { 
    x: building.x + distance * Math.cos(angle), 
    y: building.y + distance * Math.sin(angle) 
  };
}


function countBuildings(buildingType, owner) {
  return gameState.buildings.filter(b => b.owner === owner && b.type === buildingType).length;
}

function canAfford(cost, owner) {
  if (owner === "ai") {
    return gameState.aiResources.gold >= cost.gold &&
           gameState.aiResources.silicon >= cost.silicon &&
           gameState.aiResources.plasma >= cost.plasma;
  } else if (owner === "player") {
    return gameState.playerResources.gold >= cost.gold &&
           gameState.playerResources.silicon >= cost.silicon &&
           gameState.playerResources.plasma >= cost.plasma;
  }
  return false;
}

// Функция оценки плотности ресурсов в заданной области
function evaluateResourceDensity(x, y, radius) {
  let density = 0;
  const pos = { x, y };
  // Запрос только ресурсов (предполагается, что у ресурсов есть тип gold, silicon или plasma)
  const resources = getObjectsInRange(pos, radius)
    .filter(r => r.type === "gold" || r.type === "silicon" || r.type === "plasma");
  resources.forEach(resource => {
    const d = Math.hypot(resource.x - x, resource.y - y);
    if (d < radius) {
      density += resource.amount;
    }
  });
  return density;
}

function attemptToBuildWarehouse() {
  if (countBuildings("warehouse", "ai") < DESIRED_WAREHOUSE_COUNT) {
    const pos = findOptimalWarehousePosition();
    if (pos && canAfford(WAREHOUSE_COST, "ai")) {
      if (aiPlaceBuilding("warehouse", pos.x, pos.y)) {
        console.log("AI построил склад в оптимальной позиции", pos);
      }
    }
  }
}

function randomNearbyPosition(building, distance) {
  const angle = Math.random() * Math.PI * 2;
  return { x: building.x + distance * Math.cos(angle), y: building.y + distance * Math.sin(angle) };
}

function isPositionInBuildingZone(x, y) {
  const zoneMargin = 20; // базовый отступ для зоны строительства
  for (let b of gameState.buildings) {
    // Для складов можно использовать меньший margin, если требуется
    let currentMargin = zoneMargin;
    if (b.type === "warehouse") {
      currentMargin = 10;
    }
    const bRect = {
      left: b.x - b.width / 2 - currentMargin,
      top: b.y - b.height / 2 - currentMargin,
      right: b.x + b.width / 2 + currentMargin,
      bottom: b.y + b.height / 2 + currentMargin
    };
    if (x >= bRect.left && x <= bRect.right && y >= bRect.top && y <= bRect.bottom) {
      return true;
    }
  }
  return false;
}

function startRepairProcess(repairman, command) {
  const repairRate = 5;          // скорость ремонта
  const intervalTime = 100;      // интервал в мс
  const REPAIR_COST = { gold: 0.3, silicon: 0.4, plasma: 0.2 };
  const intervalsPerCycle = 5000 / intervalTime;
  const costGoldPerInterval = REPAIR_COST.gold / intervalsPerCycle;
  const costSiliconPerInterval = REPAIR_COST.silicon / intervalsPerCycle;
  const costPlasmaPerInterval = REPAIR_COST.plasma / intervalsPerCycle;
  
  // Если здание уже полностью восстановлено, не запускаем ремонт
  if (command.target.health >= command.target.maxHealth) return;
  
  command.target.isRepairing = true;
  command.target.repairIntervalId = setInterval(() => {
    // Если здание полностью восстановлено или уничтожено, прекращаем ремонт
    if (command.target.health >= command.target.maxHealth || command.target.health <= 0) {
      clearInterval(command.target.repairIntervalId);
      command.target.repairIntervalId = null;
      command.target.isRepairing = false;
      repairman.busyRepair = false;
      processCommandQueue(repairman);
      return;
    }
    
    // Определяем, какие ресурсы использовать (игрок или ИИ)
    const resources = command.target.owner === "player" ? gameState.playerResources : gameState.aiResources;
    
    // Если ресурсов недостаточно, останавливаем ремонт
    if (resources.gold < costGoldPerInterval || resources.silicon < costSiliconPerInterval || resources.plasma < costPlasmaPerInterval) {
      showWarning("Недостаточно ресурсов для ремонта");
      clearInterval(command.target.repairIntervalId);
      command.target.repairIntervalId = null;
      command.target.isRepairing = false;
      repairman.busyRepair = false;
      processCommandQueue(repairman);
      return;
    }
    
    // Списываем ресурсы за интервал ремонта
    resources.gold -= costGoldPerInterval;
    resources.silicon -= costSiliconPerInterval;
    resources.plasma -= costPlasmaPerInterval;
    updateResourceUI();
    
    // Применяем ремонт: увеличиваем здоровье здания
    command.target.health += (repairRate * intervalTime) / 5000;
    if (command.target.health > command.target.maxHealth) {
      command.target.health = command.target.maxHealth;
    }
    
    // Если после ремонта здание полностью восстановлено, останавливаем цикл
    if (command.target.health >= command.target.maxHealth) {
      clearInterval(command.target.repairIntervalId);
      command.target.repairIntervalId = null;
      command.target.isRepairing = false;
      repairman.busyRepair = false;
      processCommandQueue(repairman);
    }
    
  }, intervalTime);
}


// Универсальная функция запроса ремонта
function requestRepair(target, workshop) {
  // Если объект уже ремонтируется, выходим
  if (target.isRepairing) return;
  target.isRepairing = true;
  target.repairAttemptedAt = performance.now();

  const distance = Math.hypot(target.x - workshop.x, target.y - workshop.y);
  if (distance > workshop.controlRadius) return;

  // Поиск свободных ремонтников
  let availableRepairmen = gameState.units.filter(u => 
    u.owner === target.owner && u.type === "repairman" && !u.busyRepair
  );
  if (availableRepairmen.length === 0) {
    showWarning("Нет доступных ремонтников для ремонта");
    return;
  }
  // Выбираем первого свободного
  const repairman = availableRepairmen[0];
  repairman.busyRepair = true;

  // При желании можно вести подсчет ремонтов:
  if (target.repairCount === undefined) {
    target.repairCount = 0;
  }
  target.repairCount++;

  repairman.commandQueue = [];
  repairman.commandQueue.push({ type: "repair", target: target, workshop: workshop });
  processCommandQueue(repairman);
}

// Функция автоматического ремонта повреждённых объектов
function autoRepairDamagedObjects() {
  // Считаем объект повреждённым, если его здоровье меньше максимума на хотя бы 1 единицу
  const repairables = [].concat(
    gameState.units.filter(u => u.health < u.maxHealth - 1),
    gameState.buildings.filter(b => b.health < b.maxHealth - 1)
  );
  
  repairables.forEach(target => {
    // Если объект уже ремонтируется и прошло меньше 1 сек с последней попытки – ничего не делаем
    if (target.isRepairing && target.repairAttemptedAt && performance.now() - target.repairAttemptedAt < 5000) {
      return;
    }
    // Если объект уже ремонтируется, сбрасываем флаг, чтобы разрешить новый цикл
    if (target.isRepairing && performance.now() - target.repairAttemptedAt >= 5000) {
      target.isRepairing = false;
    }
    
    // Находим мастерские для данного владельца
    let workshops = gameState.buildings.filter(b => b.owner === target.owner && b.type === "repairWorkshop");
    if (workshops.length === 0) return;
    
    // Сортируем мастерские по расстоянию до объекта
    workshops.sort((a, b) =>
      Math.hypot(target.x - a.x, target.y - a.y) - Math.hypot(target.x - b.x, target.y - b.y)
    );
    
    const nearestWorkshop = workshops[0];
    // Запускаем ремонт, только если объект находится в зоне контроля мастерской
    if (Math.hypot(target.x - nearestWorkshop.x, target.y - nearestWorkshop.y) <= nearestWorkshop.controlRadius) {
      requestRepair(target, nearestWorkshop);
    }
  });
}
// Функция, возвращающая прямоугольник зоны строительства для здания
function getBuildZoneRect(building) {
  // Если здание имеет buildZoneMultiplier (например, для маяка или базы), используем его, иначе — значение по умолчанию
  const zoneMargin = building.buildZoneMultiplier || 20;
  return {
    left: building.x - building.width / 2 - zoneMargin,
    top: building.y - building.height / 2 - zoneMargin,
    right: building.x + building.width / 2 + zoneMargin,
    bottom: building.y + building.height / 2 + zoneMargin
  };
}

// Функция проверки, находится ли точка (x, y) в зоне строительства какого-либо здания
function isInAnyBuildZone(x, y) {
  // Предположим, что максимальный радиус для поиска зон строительства – 100 единиц
  const candidates = getObjectsInRange({ x, y }, 100)
    .filter(b => b instanceof Building);
  for (let b of candidates) {
    let currentMargin = (b.type === "warehouse") ? 10 : (b.buildZoneMultiplier || 20);
    const bRect = {
      left: b.x - b.width / 2 - currentMargin,
      top: b.y - b.height / 2 - currentMargin,
      right: b.x + b.width / 2 + currentMargin,
      bottom: b.y + b.height / 2 + currentMargin
    };
    if (x >= bRect.left && x <= bRect.right && y >= bRect.top && y <= bRect.bottom) {
      return true;
    }
  }
  return false;
}


// Функция проверки, находится ли точка в пределах зоны союзных построек.
// Здесь в качестве зоны используется радиус от каждой союзной постройки.
function isWithinAlliedZone(x, y) {
  const zoneRadius = 100; // можно настроить радиус зоны
  // Считаем, что база ИИ тоже является союзной постройкой
  if (Math.hypot(x - aiBase.x, y - aiBase.y) <= zoneRadius) {
    return true;
  }
  // Проверяем остальные союзные здания
  for (const building of gameState.buildings.filter(b => b.owner === "ai")) {
    if (Math.hypot(x - building.x, y - building.y) <= zoneRadius) {
      return true;
    }
  }
  return false;
}



/* === Условие победы === */
function checkVictoryConditions() {
  const playerBases = gameState.buildings.filter(b =>
    b.owner === "player" && (b.type === "base" || b.type === "base2" || b.type === "base3")
  );
  const aiBases = gameState.buildings.filter(b =>
    b.owner === "ai" && (b.type === "base" || b.type === "base2" || b.type === "base3")
  );
  
  if (aiBases.length === 0) {
    clearInterval(aiLogicInterval);
    cancelAnimationFrame(gameLoopId);
    showVictoryMessage("Победа! Все базы противника уничтожены.");
    return;
  }
  if (playerBases.length === 0) {
    clearInterval(aiLogicInterval);
    cancelAnimationFrame(gameLoopId);
    showVictoryMessage("Поражение! Все ваши базы уничтожены.");
    return;
  }
}

function showVictoryMessage(message) {
  const victoryDiv = document.createElement("div");
  victoryDiv.innerText = message;
  victoryDiv.style.position = "fixed";
  victoryDiv.style.top = "50%";
  victoryDiv.style.left = "50%";
  victoryDiv.style.transform = "translate(-50%, -50%)";
  victoryDiv.style.fontSize = "48px";
  victoryDiv.style.color = "yellow";
  victoryDiv.style.backgroundFColor = "rgba(0,0,0,0.8)";
  victoryDiv.style.padding = "20px 40px";
  victoryDiv.style.borderRadius = "10px";
  victoryDiv.style.zIndex = "10000";
  document.body.appendChild(victoryDiv);
}

function rectsOverlap(r1, r2) {
  return !(r1.right <= r2.left || r1.left >= r2.right ||
           r1.bottom <= r2.top || r1.top >= r2.bottom);
}




