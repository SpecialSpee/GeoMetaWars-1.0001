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
const SPEED_WORKER = 100;
const SPEED_REPAIRMAN = 100;
const SPEED_FIGHTER = 95;
const SPEED_ASSAULT = 75;
const SPEED_ELITE = 50;



const DESIRED_WAREHOUSE_COUNT = 20;
const DESIRED_WORKER_COUNT = 5;
const DESIRED_REPAIR_WORKSHOP_COUNT = 3;
const DESIRED_REPAIRMAN_COUNT = 10;
const DESIRED_BEACON_COUNT = 10; // для маяков

const RESOURCE_CLUSTER_RADIUS = 50; // Радиус подсчёта кластера ресурсов
const MIN_CLUSTER_DISTANCE = 100;      // Минимальное расстояние между кластерами
const MAX_EXPANSION_DISTANCE = 100;   // Максимальное расстояние от существующей инфраструктуры для экспансии

const MIN_GARRISON_COUNT = 10;  // Минимальное число юнитов для массовой атаки из кластера
const MAX_GARRISON_COUNT = 20; // Если юнитов больше – часть остаётся в обороне
const CLUSTER_RADIUS = 100;    // Радиус для группировки построек в кластер

const DESIRED_DEFENDERS_PER_BUILDING = 1;
const DEFENSE_RADIUS = 200; // Радиус, в пределах которого считается, что здание защищено

const GARRISON_COUNT_PER_CLUSTER = MIN_GARRISON_COUNT; // число юнитов, которые должны оставаться в кластере для защиты

// Константы игры (новые здания)
const BASE_COST = { gold: 211, silicon: 305, plasma: 113 };
const WAREHOUSE_COST = { gold: 28, silicon: 44, plasma: 17 };
const WORKER_COST = { gold: 9, silicon: 16, plasma: 6 };
const REPAIR_WORKSHOP_COST = { gold: 34, silicon: 43, plasma: 21};
const REPAIRMAN_COST = { gold: 13, silicon: 22, plasma: 9 };
const BARRACKS_COST = { gold: 46, silicon: 56, plasma: 24 };
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
const FIGHTER_BULLET_CONFIG = { speed: 200, lifetime: 1.5 };
const TURRET_BULLET_CONFIG = { speed: 200, lifetime: 1.5 };
const AUTO_COLLECT_ENABLED = true;
const GRID_SIZE = 50;

const MISSILE_CONFIG = { 
  speed: 130,          // Скорость полёта ракеты
  lifetime: 5,         // Время жизни (секунд)
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



let selectedUnits = [];


function calculateWallPosition(base) {
  // Выбираем случайный угол для размещения стены вокруг базы.
  const angle = Math.random() * 2 * Math.PI;
  // Определяем отступ: половина ширины базы плюс фиксированный отступ (например, 20 пикселей)
  const offset = base.width / 2 + 20;
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
  gameState.resources.forEach(resource => {
    const d = Math.hypot(resource.x - x, resource.y - y);
    if (d < radius) {
      density += resource.amount; // можно добавить вес для разных типов ресурсов
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

function startRepairCycle(repairMan, workshop) {
  console.log("Запущен цикл ремонта для ремонтника", repairMan, "из мастерской", workshop);
  // Логика ремонта
}

function startRepairProcess(repairman, command) {
  console.log("Запущен процесс ремонта для объекта", command.target, "ремонтником", repairman);
  const repairRate = 5;
  const intervalTime = 100;
  const REPAIR_COST = { gold: 2, silicon: 5, plasma: 1 };
  const intervalsPerSecond = 1000 / intervalTime;
  const costGoldPerInterval = REPAIR_COST.gold / intervalsPerSecond;
  const costSiliconPerInterval = REPAIR_COST.silicon / intervalsPerSecond;
  const costPlasmaPerInterval = REPAIR_COST.plasma / intervalsPerSecond;
  
  const repairInterval = setInterval(() => {
    const resources = command.target.owner === "player" ? gameState.playerResources : gameState.aiResources;
    if (resources.gold < costGoldPerInterval || resources.silicon < costSiliconPerInterval || resources.plasma < costPlasmaPerInterval) {
      showWarning("Недостаточно ресурсов для ремонта");
      clearInterval(repairInterval);
      command.target.isRepairing = false;
      processCommandQueue(repairman);
      return;
    }
    resources.gold -= costGoldPerInterval;
    resources.silicon -= costSiliconPerInterval;
    resources.plasma -= costPlasmaPerInterval;
    updateResourceUI();
    
    if (command.target.health >= command.target.maxHealth || command.target.health <= 0) {
      console.log("Ремонт завершён для объекта", command.target);
      clearInterval(repairInterval);
      command.target.isRepairing = false;
      processCommandQueue(repairman);
      return;
    }
    command.target.health += (repairRate * intervalTime) / 1000;
    if (command.target.health > command.target.maxHealth) {
      command.target.health = command.target.maxHealth;
    }
  }, intervalTime);
}

// Универсальная функция запроса ремонта
function requestRepair(target, workshop, repairman) {
  // Если объект уже в процессе ремонта и прошло меньше 5 сек с последней попытки – ничего не делаем
  if (target.isRepairing && target.repairAttemptedAt && performance.now() - target.repairAttemptedAt < 5000) return;
  target.isRepairing = true;
  target.repairAttemptedAt = performance.now();

  const distance = Math.hypot(target.x - workshop.x, target.y - workshop.y);
  if (distance > workshop.controlRadius) return;

  // Если ремонтника не передали, ищем доступного
  if (!repairman) {
    // Используем let для временной переменной availableRepairmen, чтобы потом выбрать одного ремонтника
    let availableRepairmen = gameState.units.filter(u => u.owner === target.owner && u.type === "repairman");
    if (availableRepairmen.length > 0) {
      availableRepairmen.sort((a, b) =>
        Math.hypot(a.x - workshop.x, a.y - workshop.y) - Math.hypot(b.x - workshop.x, b.y - workshop.y)
      );
      repairman = availableRepairmen[0];
    }
  }
  
  // При желании можно вести подсчет количества ремонтов:
  if (target.repairCount === undefined) {
    target.repairCount = 0;
  }
  target.repairCount++;

  if (repairman) {
    repairman.commandQueue = [];
    repairman.commandQueue.push({ type: "repair", target: target, workshop: workshop });
    processCommandQueue(repairman);
  } else {
    showWarning("Нет доступных ремонтников для ремонта");
  }
}


// Функция автоматического ремонта повреждённых объектов
function autoRepairDamagedObjects() {
  // Собираем все объекты, у которых health меньше maxHealth на значимую величину (например, 10% потерь)
  const repairables = [].concat(
    gameState.units.filter(u => u.health < u.maxHealth * 0.99),
    gameState.buildings.filter(b => b.health < b.maxHealth * 0.99)
  );
  
  repairables.forEach(target => {
    // Если объект уже находится в ремонте и прошло более 1 сек с последней попытки – сбрасываем флаг
    if (target.isRepairing && target.repairAttemptedAt && performance.now() - target.repairAttemptedAt > 1000) {
      target.isRepairing = false;
    }
    if (target.isRepairing) return;
    
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
  for (let b of gameState.buildings) {
    // Для складов можно использовать меньший отступ, если нужно
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
  victoryDiv.style.backgroundColor = "rgba(0,0,0,0.8)";
  victoryDiv.style.padding = "20px 40px";
  victoryDiv.style.borderRadius = "10px";
  victoryDiv.style.zIndex = "10000";
  document.body.appendChild(victoryDiv);
}

function rectsOverlap(r1, r2) {
  return !(r1.right <= r2.left || r1.left >= r2.right ||
           r1.bottom <= r2.top || r1.top >= r2.bottom);
}




