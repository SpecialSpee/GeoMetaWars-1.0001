// aiLogic.js
// Итоговый файл для AI с системой зависимостей, экспансией по ресурсным кластерам,
// восстановлением базовой инфраструктуры через state machine, мгновенной реакцией на урон
// и мобильной обороной (включая укрепление стен).
//
// Предполагается, что глобальные переменные и функции уже определены:
// gameState, aiBase, playerBase, canAfford, randomFarPosition, randomNearbyPosition, hasBuilding,
// getBuilding, buildSpatialIndex, evaluateResourceDensity, isPositionInAnyBuildZone, rectsOverlap,
// updateResourceUI, attemptToHireWorkers, attemptToHireRepairman, attemptToHireMilitaryUnits,
// spawnAtBoundary, moveUnit, startWorkerCycle, startRepairCycle, startTurretCycle,
// dynamicAttack, dynamicAttackAssault, dynamicAttackElite, startRepairProcess, getEnemiesInRange,
// а также константы: GRID_SIZE, RESOURCE_CLUSTER_RADIUS, DEFENSE_RADIUS, DESIRED_DEFENDERS_PER_BUILDING,
// MIN_GARRISON_COUNT. Константы GREY_ZONE_RADIUS и ENEMY_ACTIVITY_THRESHOLD определяются в другом файле.
let gameStarted = false;
let soldBuildings = [];
function hasBuilding(buildingType, owner) {
  const found = gameState.buildings.some(b => b.owner === owner && b.type === buildingType);
  //console.log(`hasBuilding(${buildingType}, ${owner}) =>`, found);
  return found;
}


let aiSaleQueue = [];
let aiSaleCooldown = false; // Флаг задержки между продажами

// Функция для добавления здания в очередь продаж
// Функция добавления здания в очередь продажи
function queueSale(building) {
  if (building.isSelling) return; // Если здание уже в процессе продажи, выходим
  building.isSelling = true;      // Помечаем здание как находящееся в продаже
  aiSaleQueue.push(building);
  //console.log("Здание добавлено в очередь продажи:", building.type);
}

// Функция обработки продажи здания
function triggerSale(building) {
  // Если здание уже не присутствует в gameState, выходим
  if (!gameState.buildings.includes(building)) return;
  
  // Если здание – турель, останавливаем цикл стрельбы
  if (building.type === "turret" || building.type === "turret2") {
    building.active = false;
    if (building.turretCycleId) {
      cancelAnimationFrame(building.turretCycleId);
      building.turretCycleId = null;
    }
  }
  
  // Удаляем здание из gameState
  gameState.buildings = gameState.buildings.filter(b => b !== building);
  
  // Возвращаем часть ресурсов (например, 20% от стоимости здания)
  const refundPercent = 0.2;
  const refundGold = building.buildCost.gold * refundPercent;
  const refundSilicon = building.buildCost.silicon * refundPercent;
  const refundPlasma = building.buildCost.plasma * refundPercent;
  gameState.playerResources.gold += refundGold;
  gameState.playerResources.silicon += refundSilicon;
  gameState.playerResources.plasma += refundPlasma;
  updateResourceUI();
  
  // Начисляем очки за продажу, если здание принадлежало ИИ
  if (building.owner === "ai") {
    const points = SCORE_VALUES[building.type] || 0;
    gameState.playerScore += points;
    updateScoreUI();
  }
  
  // Добавляем координаты проданного здания в список проданных
  soldBuildings.push({ x: building.x, y: building.y });
  
  // Можно, при необходимости, сбросить флаг isSelling
  // building.isSelling = false;
}


// Функция обработки очереди продаж (вызывается, например, через setInterval)
function processAISaleQueue() {
  if (aiSaleQueue.length > 0 && !aiSaleCooldown) {
    const building = aiSaleQueue.shift();
   //console.log("Продажа здания из очереди:", building.type);
    triggerSale(building);
    aiSaleCooldown = true;
    // Устанавливаем задержку (например, 2000 мс)
    setTimeout(() => { aiSaleCooldown = false; }, 6000);
  }
}

// Запускаем обработку очереди продаж раз в 500 мс
//setInterval(processAISaleQueue, 10000);


// Константы для тактических расстояний (эти значения можно корректировать по результатам тестирования)
const FLANK_OFFSET = 4700;       // расстояние до позиции сбоку для фланговой атаки
const DIVERSION_OFFSET = 3600;   // смещение для отвлекающего манёвра
const SAFE_DISTANCE = 2000;      // дистанция для элитных юнитов (безопасное отступление)
const BATTLE_ZONE_RADIUS = 150; // радиус, равный диапазону поражения оружия

const PHASES = {
  initialEconomy: "initialEconomy",
  basicDefense: "basicDefense",
  advancedEconomy: "advancedEconomy",
  armyBuildUp: "armyBuildUp",
  expansionAndAttack: "expansionAndAttack"
};

let aiPhase = PHASES.initialEconomy;

// Глобальные переменные для очереди построек и для неудачных точек
let buildQueue = [];
let failedClusters = []; // Глобальный массив неудачных (отклонённых) точек для построек
let builtClusters = [];  // Массив для сохранения координат построенных кластеров

let cachedQueryResult = null;
let lastQueryTime = 0;



const UNIT_LIMITS = {
  fighter: 10,
  assault: 7,
  elite: 3
};



const MIN_GOLD_FOR_EXPANSION = 100;
const MIN_SILICON_FOR_EXPANSION = 100;
const MIN_PLASMA_FOR_EXPANSION = 100;

const GREY_ZONE_RADIUS = 300;
const ENEMY_ACTIVITY_THRESHOLD = 0;

const DESIRED_WAREHOUSE_COUNT = 20;
const DESIRED_WORKER_COUNT = 5;
const DESIRED_REPAIR_WORKSHOP_COUNT = 3;
const DESIRED_REPAIRMAN_COUNT = 10;
const DESIRED_BEACON_COUNT = 10; // для маяков

const RESOURCE_CLUSTER_RADIUS = 100; // Радиус подсчёта кластера ресурсов
const MIN_CLUSTER_DISTANCE = 100;      // Минимальное расстояние между кластерами
const MAX_EXPANSION_DISTANCE = 100;   // Максимальное расстояние от существующей инфраструктуры для экспансии

const MIN_GARRISON_COUNT = 20;  // Минимальное число юнитов для массовой атаки из кластера
const MAX_GARRISON_COUNT = 50; // Если юнитов больше – часть остаётся в обороне
const CLUSTER_RADIUS = 100;    // Радиус для группировки построек в кластер

const DESIRED_DEFENDERS_PER_BUILDING = 5;
const DEFENSE_RADIUS = 200; // Радиус, в пределах которого считается, что здание защищено

const GARRISON_COUNT_PER_CLUSTER = MIN_GARRISON_COUNT; // число юнитов, которые должны оставаться в кластере для защиты



function canHireUnit(type) {
  const currentCount = gameState.units.filter(u => u.owner === "ai" && u.type === type && u.health > 0).length;
  return currentCount < UNIT_LIMITS[type];
}

// Например, обновлённая функция getCachedObjectsInRange:
function getCachedObjectsInRange(range) {
  const cacheInterval = 5000; // интервал кэширования в мс
  const now = performance.now();
  if (now - lastQueryTime > cacheInterval) {
    if (typeof quadtree !== "undefined" && quadtree !== null) {
      const result = quadtree.query(range);
      // Если результат null, заменяем на пустой массив
      cachedQueryResult = result ? result : [];
    } else {
      cachedQueryResult = [];
    }
    lastQueryTime = now;
  }
  return cachedQueryResult;
}

const buildingPrerequisites = {
  "base2": ["barracks"],
  "barracks2": ["base2"],
  "turret2": ["base2"],
  "base3": ["barracks2"],
  "barracks3": ["base3"]
};

function canBuild(buildingType) {
  const prereqs = buildingPrerequisites[buildingType];
  if (!prereqs) return true;
  for (const prereq of prereqs) {
    if (!hasBuilding(prereq, "ai")) {
      return false;
    }
  }
  return true;
}

//////////////////////////////////////////////////////////////

// Изменённая функция формирования группы атаки с проверкой минимального резерва
function formMixedAttackGroupDynamic() {
  // Минимальное требуемое количество юнитов для начала атаки
  const MIN_RESERVE_UNITS = 20;
  const freeReserve = getFreeReserveUnits();

  // Если в резерве недостаточно юнитов, не инициируем атаку
  if (freeReserve.length < MIN_RESERVE_UNITS) {
    //console.log("Недостаточно резерва для атаки:", freeReserve.length, "юнитов. Ожидаем накопления.");
    return [];
  }

  // Базовый состав группы (минимальное требование по типам)
  const baseMix = { fighter: 3, assault: 2, elite: 1 };
  const totalFree = freeReserve.length;
  // Масштабируем состав в зависимости от общего числа свободных юнитов
  const scale = totalFree / 6; // 6 – сумма базового состава
  const desiredMix = {
    fighter: Math.max(baseMix.fighter, Math.floor(baseMix.fighter * scale)),
    assault: Math.max(baseMix.assault, Math.floor(baseMix.assault * scale)),
    elite: Math.max(baseMix.elite, Math.floor(baseMix.elite * scale))
  };

  // Группируем свободные юниты по типу
  const grouped = freeReserve.reduce((acc, unit) => {
    acc[unit.type] = acc[unit.type] || [];
    acc[unit.type].push(unit);
    return acc;
  }, {});

  // Собираем группу, выбирая ближайших юнитов к базе ИИ (или к точке атаки)
  const group = [];
  Object.keys(desiredMix).forEach(type => {
    const available = grouped[type] || [];
    // Сортируем по расстоянию до aiBase
    available.sort((a, b) => {
      const distA = Math.hypot(a.x - aiBase.x, a.y - aiBase.y);
      const distB = Math.hypot(b.x - aiBase.x, b.y - aiBase.y);
      return distA - distB;
    });
    const countToTake = Math.min(desiredMix[type], available.length);
    group.push(...available.slice(0, countToTake));
  });

  // Если итоговая группа меньше минимального размера (например, 5 юнитов),
  // дополняем её случайными юнитами из резерва
  const MIN_ATTACK_UNITS = 5;
  if (group.length < MIN_ATTACK_UNITS) {
    const additional = freeReserve.filter(u => !group.includes(u));
    group.push(...additional.slice(0, MIN_ATTACK_UNITS - group.length));
  }
  
  return group;
}



//////////////////////////////////////////////////////////////
// Функции очереди построек
function scheduleAIBuilding(type, x, y, delay = 500) {
  buildQueue.push({
    type,
    x,
    y,
    plannedAt: performance.now(),
    delay
  });
}

function processBuildQueue() {
  const now = performance.now();
  for (let i = 0; i < buildQueue.length; i++) {
    const item = buildQueue[i];
    if (now - item.plannedAt >= item.delay) {
      // Если здание построено, aiPlaceBuilding возвращает объект здания (не просто true)
      const built = aiPlaceBuilding(item.type, item.x, item.y);
      if (built) {
        //console.log(`ИИ построил ${item.type} в (${Math.round(item.x)}, ${Math.round(item.y)}) после задержки ${item.delay} мс`);
        buildQueue.splice(i, 1);
        i--;
      }
    }
  }
}

//////////////////////////////////////////////////////////////
// Универсальный обработчик урона – должен вызываться при попадании пули
function onDamage(entity, damage) {
  entity.health -= damage;
  reactToAttack();
  mobilizeDefendersAround(entity);

  if (entity.health <= 0) {
    handleEntityDestruction(entity);
    if (entity instanceof Unit) removeUnit(entity);
  }
}




//////////////////////////////////////////////////////////////
// Функции для защиты и укрепления
function hasNearbyWalls(object, radius) {
  const walls = gameState.buildings.filter(b =>
    b.owner === object.owner &&
    b.type === "wall" &&
    Math.hypot(b.x - object.x, b.y - object.y) < radius
  );
  return walls.length > 0;
}

function fortifyBaseBuildings(owner) {
  const bases = gameState.buildings.filter(b =>
    b.owner === owner && (b.type === "base" || b.type === "base2" || b.type === "base3")
  );
  bases.forEach(base => {
    if (!hasNearbyWalls(base, 50) && canSpendResources(WALL_COST, owner)) {
      const angles = [0, Math.PI / 2];
      const chosenAngle = angles[Math.floor(Math.random() * angles.length)];
      const wallX = base.x + Math.cos(chosenAngle) * (base.width / 2 + 20);
      const wallY = base.y + Math.sin(chosenAngle) * (base.height / 2 + 20);
      if (owner === "ai") {
        if (aiPlaceBuilding("wall", wallX, wallY)) {
          //console.log(`ИИ построил стену для защиты базы ${base.type} в (${Math.round(wallX)}, ${Math.round(wallY)})`);
        }
      } else {
        if (placeBuilding(wallX, wallY, "wall", owner)) {
          //console.log(`Игрок построил стену для защиты базы ${base.type} в (${Math.round(wallX)}, ${Math.round(wallY)})`);
        }
      }
    }
  });
}


function fortifyClusterWith4Walls(cluster) {
  const filteredCluster = cluster.filter(b => b.type !== "wall");
  if (filteredCluster.length === 0) return;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  filteredCluster.forEach(b => {
    const left = b.x - b.width / 2;
    const right = b.x + b.width / 2;
    const top = b.y - b.height / 2;
    const bottom = b.y + b.height / 2;
    if (left < minX) minX = left;
    if (right > maxX) maxX = right;
    if (top < minY) minY = top;
    if (bottom > maxY) maxY = bottom;
  });
  const margin = 30;
  minX -= margin; maxX += margin; minY -= margin; maxY += margin;
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;
  if (!hasNearbyWalls({ x: midX, y: minY, owner: "ai" }, 20) && canAfford(WALL_COST, "ai")) {
    placeWallWithOrientation(midX, minY, 0, "ai");
  }
  if (!hasNearbyWalls({ x: midX, y: maxY, owner: "ai" }, 20) && canAfford(WALL_COST, "ai")) {
    placeWallWithOrientation(midX, maxY, 0, "ai");
  }
  if (!hasNearbyWalls({ x: minX, y: midY, owner: "ai" }, 20) && canAfford(WALL_COST, "ai")) {
    placeWallWithOrientation(minX, midY, Math.PI / 2, "ai");
  }
  if (!hasNearbyWalls({ x: maxX, y: midY, owner: "ai" }, 20) && canAfford(WALL_COST, "ai")) {
    placeWallWithOrientation(maxX, midY, Math.PI / 2, "ai");
  }
}

function placeWallWithOrientation(x, y, angle, owner) {
  if (owner === "ai") {
    const built = aiPlaceBuilding("wall", x, y);
    if (built) {
      built.angle = angle;
      //console.log(`ИИ построил стену с углом ${Math.round(angle * 180 / Math.PI)}° в (${Math.round(x)}, ${Math.round(y)})`);
      return built;
    }
  } else {
    const built = placeBuilding(x, y, "wall", owner);
    if (built) {
      built.angle = angle;
      //console.log(`Игрок построил стену с углом ${Math.round(angle * 180 / Math.PI)}° в (${Math.round(x)}, ${Math.round(y)})`);
      return built;
    }
  }
  return null;
}

//////////////////////////////////////////////////////////////
// Мобильная оборонительная реакция
function mobilizeDefendersAround(object) {
  const pos = { x: object.x, y: object.y };
  const enemyUnits = gameState.units.filter(u =>
    u.owner === "player" && Math.hypot(u.x - pos.x, u.y - pos.y) < GREY_ZONE_RADIUS
  );
  if (enemyUnits.length >= ENEMY_ACTIVITY_THRESHOLD) {
    const freeUnits = gameState.units.filter(u =>
      u.owner === "ai" &&
      (u.type === "fighter" || u.type === "assault" || u.type === "elite") &&
      u.commandQueue.length === 0
    );
    if (freeUnits.length > 0) {
      //console.log(`Мобилизация обороны вокруг (${Math.round(pos.x)}, ${Math.round(pos.y)}), врагов: ${enemyUnits.length}`);
      freeUnits.forEach(unit => {
        unit.commandQueue = [];
        const nearestEnemy = enemyUnits.reduce((prev, curr) =>
          Math.hypot(curr.x - pos.x, curr.y - pos.y) < Math.hypot(prev.x - pos.x, prev.y - pos.y) ? curr : prev
        );
        if (nearestEnemy) {
          unit.commandQueue.push({ type: "move", x: nearestEnemy.x, y: nearestEnemy.y });
          unit.commandQueue.push({ type: "attack", target: nearestEnemy });
        }
      });
    }
  }
}

// Обновлённая функция isGreyZone – теперь гарантируем, что filter вызывается на массиве:
function isGreyZone(target) {
  const dangerThreshold = 400; // пороговое расстояние для опасной зоны
  
  // Проверка неудачных попыток строительства
  if (failedClusters.some(pt => Math.hypot(pt.x - target.x, pt.y - target.y) < dangerThreshold)) {
    //console.log("Целевая точка в зоне неудачного строительства");
    return true;
  }
  
  // Проверка проданных зданий
  if (soldBuildings.some(pt => Math.hypot(pt.x - target.x, pt.y - target.y) < dangerThreshold)) {
    //console.log("Целевая точка в зоне продажи здания");
    return true;
  }
  
  // Стандартная логика – проверка активности врагов
  const queryRange = {
    x: target.x - GREY_ZONE_RADIUS,
    y: target.y - GREY_ZONE_RADIUS,
    width: GREY_ZONE_RADIUS * 2,
    height: GREY_ZONE_RADIUS * 2
  };
  const objectsInRange = getCachedObjectsInRange(queryRange) || [];
  const enemyCount = objectsInRange.filter(obj =>
    obj.owner === "player" &&
    Math.hypot(obj.x - target.x, obj.y - target.y) < GREY_ZONE_RADIUS
  ).length;
  
  return enemyCount > ENEMY_ACTIVITY_THRESHOLD;
}



// Экономическая экспансия и построение кластеров ресурсов
function buildClusterAt(target) {
  // 1. Очищаем устаревшие метки неудачного строительства, чтобы можно было планировать новые постройки
  cleanupFailedClusters();
  
  // 2. Определяем радиус, в пределах которого считается, что точка уже помечена как неудачная для строительства
  const failureRadius = 10;
  
  // 3. Если вблизи target уже есть отметка о неудачном строительстве, прекращаем попытку создать кластер
  if (failedClusters.some(pt => Math.hypot(pt.x - target.x, pt.y - target.y) < failureRadius)) {
    //console.log("Зона", target, "помечена как неудачная — пропускаем строительство.");
    return;
  }
  
  // 4. Начинаем формирование кластера инфраструктуры ИИ.
  // Приоритет строения: маяк (beacon) задаёт центральную точку кластера, 
  // затем последовательно строятся склад (warehouse), ремонтная мастерская (repairWorkshop) и оборонительные объекты (турели).
  
  // 4.1. Строим маяк в центре кластера.
  if (!canSpendResources(BEACON_COST, "ai")) {
    //console.log("Недостаточно ресурсов для строительства маяка в точке", target);
    return;
  }
  scheduleAIBuilding("beacon", target.x, target.y, 0);
  
  // 4.2. Через 500 мс планируем строительство склада с небольшим смещением влево.
  setTimeout(() => { 
    if (!canSpendResources(WAREHOUSE_COST, "ai")) {
      scheduleAIBuilding("warehouse", target.x - 40, target.y, 0); 
    } else {
      //console.log("Недостаточно ресурсов для склада в кластере, точка", target);
    }
  }, 500);
  
  // 4.3. Через 1500 мс планируем строительство ремонтной мастерской с смещением вниз.
  setTimeout(() => { 
    if (!canSpendResources(REPAIR_WORKSHOP_COST, "ai")) {
      scheduleAIBuilding("repairWorkshop", target.x, target.y + 40, 0); 
    } else {
      //console.log("Недостаточно ресурсов для ремонтной мастерской в кластере, точка", target);
    }
  }, 1500);
  
  // 4.4. Через 2000 мс планируем строительство первой турели для обороны кластера, смещённой вверх.
  setTimeout(() => { 
    if (!canSpendResources(TURRET_COST, "ai")) {
      scheduleAIBuilding("turret", target.x, target.y - 60, 0); 
    } else {
      //console.log("Недостаточно ресурсов для турели в кластере, точка", target);
    }
  }, 2000);
  
  // 4.5. Через 2500 мс планируем строительство дополнительной турели справа от центра для усиления обороны.
  setTimeout(() => {
    if (!canSpendResources(TURRET_COST, "ai")) {
      scheduleAIBuilding("turret", target.x + 60, target.y - 60, 0);
    }
  }, 2500);
  
  // 4.6. Через 3000 мс можно добавить ещё один склад или другой объект для дальнейшего расширения кластера.
  setTimeout(() => {
    if (!canSpendResources(WAREHOUSE_COST, "ai")) {
      scheduleAIBuilding("warehouse", target.x, target.y + 80, 0);
    }
  }, 3000);
  
  // 4.7. (Опционально) Можно добавить построение оборонительных стен или других объектов,
  // если хотите дополнительно укрепить кластер. Пример:
  // setTimeout(() => {
  //   if (canAfford(WALL_COST, "ai")) {
  //     scheduleAIBuilding("wall", target.x - 80, target.y, 0);
  //   }
  // }, 3500);
  
  // Все построения, запланированные в этом кластере, помогают ИИ укрепить контроль над данной областью и подготовить базу для дальнейшей экспансии.
}


//////////////////////////////////////////////////////////////
// Функции поиска целевых точек
function findOptimalWarehousePosition() {
  let bestPos = null;
  let bestScore = -Infinity;
  const step = 50;
  const maxDistanceFromBase = 300; // максимальное расстояние от базы ИИ
  
  for (let x = step / 2; x < worldWidth; x += step) {
    for (let y = step / 2; y < worldHeight; y += step) {
      // Ограничиваем область строительства – проверяем расстояние до базы ИИ
      const distanceFromBase = Math.hypot(x - aiBase.x, y - aiBase.y);
      if (distanceFromBase > maxDistanceFromBase) continue;
      
      // Если точка уже находится в зоне строительства какого-либо здания, пропускаем
      if (isInAnyBuildZone(x, y)) continue;
      
      let resourceDensity = 0;
      gameState.resources.forEach(resource => {
        const d = Math.hypot(resource.x - x, resource.y - y);
        if (d < step * 2) {
          resourceDensity += resource.amount;
        }
      });
      
      const nearbyObjects = getObjectsInRange({ x, y }, step * 2);
      const penalty = nearbyObjects.length;
      
      const score = resourceDensity - penalty * 10;
      if (score > bestScore) {
        bestScore = score;
        bestPos = { x, y };
      }
    }
  }
  
  return bestPos || { x: aiBase.x, y: aiBase.y };
}


function findExpansionTarget() {
  let bestTarget = null;
  let bestScore = -Infinity;
  const referencePoint = aiBase;
  const candidates = getObjectsInRange(referencePoint, worldWidth)
    .filter(r => (r.type === "gold" || r.type === "silicon" || r.type === "plasma") && !r.depleted && r.amount > 0);
  
  candidates.forEach(resource => {
    const distance = Math.hypot(resource.x - referencePoint.x, resource.y - referencePoint.y);
    const penalty = distance > MAX_EXPANSION_DISTANCE ? (MAX_EXPANSION_DISTANCE / distance) : 1;
    const cluster = getObjectsInRange({ x: resource.x, y: resource.y }, RESOURCE_CLUSTER_RADIUS)
      .filter(r => (r.type === "gold" || r.type === "silicon" || r.type === "plasma") && !r.depleted);
    
    let clusterScore = 0;
    cluster.forEach(r => { clusterScore += r.amount; });
    
    const aiBuildings = getObjectsInRange({ x: resource.x, y: resource.y }, MAX_EXPANSION_DISTANCE)
      .filter(b => b.owner === "ai");
    const nearestDistance = aiBuildings.reduce((min, b) => Math.min(min, Math.hypot(b.x - resource.x, b.y - resource.y)), Infinity);
    const distanceFactor = nearestDistance > MAX_EXPANSION_DISTANCE ? (MAX_EXPANSION_DISTANCE / nearestDistance) : 1;
    
    const effectiveScore = clusterScore * penalty * distanceFactor;
    if (effectiveScore > bestScore) {
      bestScore = effectiveScore;
      bestTarget = { x: resource.x, y: resource.y };
    }
  });
  
  return bestTarget || { x: referencePoint.x, y: referencePoint.y };
}
//////////////////////////////////////////////////////////////
// Функции для найма, построек и границ
function getAIBoundaries() {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  gameState.buildings.forEach(b => {
    if (b.owner === "ai") {
      if (b.x < minX) minX = b.x;
      if (b.x > maxX) maxX = b.x;
      if (b.y < minY) minY = b.y;
      if (b.y > maxY) maxY = b.y;
    }
  });
  return { minX, maxX, minY, maxY };
}

function getBeaconBoundaries() {
  const beacons = gameState.buildings.filter(b => b.owner === "ai" && b.type === "beacon");
  if (beacons.length === 0) return null;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  beacons.forEach(b => {
    if (b.x < minX) minX = b.x;
    if (b.x > maxX) maxX = b.x;
    if (b.y < minY) minY = b.y;
    if (b.y > maxY) maxY = b.y;
  });
  return { minX, maxX, minY, maxY };
}

function aiBuildImprovedBuildings() {
  if (!hasBuilding("base2", "ai") && canSpendResources(BASE2_COST, "ai") && canBuild("base2")) {
    const pos = randomFarPosition(aiBase, 100);
    aiPlaceBuilding("base2", pos.x, pos.y);
  }

  if (!hasBuilding("barracks2", "ai") && canSpendResources(BARRACKS2_COST, "ai") && canBuild("barracks2")) {
    const reference = getBuilding("base2", "ai") || aiBase;
    const pos = randomNearbyPosition(reference, 100);
    aiPlaceBuilding("barracks2", pos.x, pos.y);
  }

  // Надёжная проверка на близость турелей
  if (hasBuilding("barracks2", "ai") && canSpendResources(TURRET2_COST, "ai") && canBuild("turret2")) {
    const candidateTypes = ["warehouse", "repairWorkshop", "barracks", "barracks2", "base2"];
    const candidates = gameState.buildings.filter(b => b.owner === "ai" && candidateTypes.includes(b.type));

    let chosenCandidate = null;

    for (let candidate of candidates) {
      const hasNearbyTurret2 = gameState.buildings.some(b =>
        b.owner === "ai" &&
        b.type === "turret2" &&
        Math.hypot(b.x - candidate.x, b.y - candidate.y) < 150
      );
      if (!hasNearbyTurret2) {
        chosenCandidate = candidate;
        break;
      }
    }

    if (chosenCandidate) {
      const pos = randomNearbyPosition(chosenCandidate, 100);
      aiPlaceBuilding("turret2", pos.x, pos.y);
    }
  }

  // Дальнейшие этапы (base3 и barracks3)
  if (!hasBuilding("base3", "ai") && canSpendResources(BASE3_COST, "ai") && canBuild("base3")) {
    const pos = randomFarPosition(aiBase, 100);
    aiPlaceBuilding("base3", pos.x, pos.y);
  }

  if (!hasBuilding("barracks3", "ai") && canSpendResources(BARRACKS3_COST, "ai") && canBuild("barracks3")) {
    const reference = getBuilding("base3", "ai") || aiBase;
    const pos = randomNearbyPosition(reference, 100);
    aiPlaceBuilding("barracks3", pos.x, pos.y);
  }
}



//////////////////////////////////////////////////////////////
// Функция размещения здания для ИИ
function aiPlaceBuilding(buildingType, x, y) {
  // Корректируем координаты, чтобы они находились в пределах игрового мира
  x = Math.max(0, Math.min(worldWidth, x));
  y = Math.max(0, Math.min(worldHeight, y));

  let cost, buildingWidth, buildingHeight;
  switch (buildingType) {
    case "warehouse":
      cost = WAREHOUSE_COST; buildingWidth = 10; buildingHeight = 10; break;
    case "repairWorkshop":
      cost = REPAIR_WORKSHOP_COST; buildingWidth = 10; buildingHeight = 10; break;
    case "barracks":
      cost = BARRACKS_COST; buildingWidth = 15; buildingHeight = 15; break;
    case "turret":
      cost = TURRET_COST; buildingWidth = 12; buildingHeight = 12; break;
    case "beacon":
      cost = BEACON_COST; buildingWidth = 20; buildingHeight = 20; break;
    case "base2":
      cost = BASE2_COST; buildingWidth = 25; buildingHeight = 30; break;
    case "barracks2":
      cost = BARRACKS2_COST; buildingWidth = 25; buildingHeight = 15; break;
    case "turret2":
      cost = TURRET2_COST; buildingWidth = 15; buildingHeight = 17; break;
    case "base3":
      cost = BASE3_COST; buildingWidth = 30; buildingHeight = 30; break;
    case "barracks3":
      cost = BARRACKS3_COST; buildingWidth = 20; buildingHeight = 15; break;
    case "wall":
      cost = WALL_COST; buildingWidth = 40; buildingHeight = 10; break;
    default:
      return false;
  }
  
  // Дополнительная проверка на коллизию и возможность строительства
  const newRect = { 
    left: x - buildingWidth / 2, 
    top: y - buildingHeight / 2, 
    right: x + buildingWidth / 2, 
    bottom: y + buildingHeight / 2 
  };
  for (let b of gameState.buildings) {
  // Если объект – стена, используем меньший margin
  const margin = (b.type === "wall") ? 2 : 10;
  const bRect = { 
    left: b.x - b.width / 2 - margin, 
    top: b.y - b.height / 2 - margin, 
    right: b.x + b.width / 2 + margin, 
    bottom: b.y + b.height / 2 + margin 
  };
  if (rectsOverlap(newRect, bRect)) return false;
}

  
  // Списание ресурсов
  gameState.aiResources.gold -= cost.gold;
  gameState.aiResources.silicon -= cost.silicon;
  gameState.aiResources.plasma -= cost.plasma;
  updateResourceUI();
  
  const building = new Building(buildingType, "ai", x, y);
  gameState.buildings.push(building);
  assignDefendersToBuildings();
  if (buildingType === "turret" || buildingType === "turret2") {
    startTurretCycle(building);
  }
  
  return building;
}


//////////////////////////////////////////////////////////////
// Функции найма и строительства
function aiHireWorker(building) {
  if (building.workers >= 5) return;
  if (!canAfford(WORKER_COST, "ai")) return;
  gameState.aiResources.gold -= WORKER_COST.gold;
  gameState.aiResources.silicon -= WORKER_COST.silicon;
  gameState.aiResources.plasma -= WORKER_COST.plasma;
  updateResourceUI();
  building.workers++;
  const { spawn, target } = spawnAtBoundary(building, 10);
  const worker = new Unit("worker", "ai", spawn.x, spawn.y);
  worker.homeWarehouse = building;
  addUnit(worker);
  moveUnit(worker, target.x, target.y, () => startWorkerCycle(worker, building));
}

// Обновлённая функция для строительства склада ИИ
function attemptToBuildWarehouse() {
  if (countBuildings("warehouse", "ai") < DESIRED_WAREHOUSE_COUNT) {
    const pos = findOptimalWarehousePosition();
    if (pos && canSpendResources(WAREHOUSE_COST, "ai")) {
      aiPlaceBuilding("warehouse", pos.x, pos.y);
    }
  }
}

// Обновлённая функция для найма рабочих ИИ
function attemptToHireWorkers() {
  gameState.buildings
    .filter(b => b.owner === "ai" && b.type === "warehouse")
    .forEach(warehouse => {
      warehouse.workers = warehouse.workers || 0;
      while (warehouse.workers < DESIRED_WORKER_COUNT && canSpendResources(WORKER_COST, "ai")) {
        aiHireWorker(warehouse);
      }
    });
}

// Обновлённая функция найма ремонтника для ИИ
function aiHireRepairMan(repairWorkshop) {
  if (repairWorkshop.repairman >= repairWorkshop.capacity) return;
  if (!canSpendResources(REPAIRMAN_COST, "ai")) return;
  
  // Списание ресурсов
  gameState.aiResources.gold -= REPAIRMAN_COST.gold;
  gameState.aiResources.silicon -= REPAIRMAN_COST.silicon;
  gameState.aiResources.plasma -= REPAIRMAN_COST.plasma;
  updateResourceUI();
  
  repairWorkshop.repairman++;
  const { spawn, target } = spawnAtBoundary(repairWorkshop, 10);
  const repairman = new Unit("repairman", "ai", spawn.x, spawn.y);
  repairman.homeWorkshop = repairWorkshop;
  addUnit(repairman);
  moveUnit(repairman, target.x, target.y);
}

// Обновлённая функция для найма ремонтников ИИ
function attemptToHireRepairman() {
  gameState.buildings
    .filter(b => b.owner === "ai" && b.type === "repairWorkshop")
    .forEach(workshop => {
      // Если количество ремонтников ниже максимально допустимого
      while (workshop.repairman < workshop.capacity) {
        // Дополнительная проверка: если поврежденных зданий много, можно попробовать нанять ремонтника даже при небольшом дефиците ресурсов
        if (canSpendResources(REPAIRMAN_COST, "ai") || (countDamagedBuildings("ai") / gameState.buildings.filter(b => b.owner === "ai").length) > 0.3) {
          aiHireRepairMan(workshop);
        } else {
          break;
        }
      }
    });
}

// Вспомогательная функция для подсчета поврежденных зданий
function countDamagedBuildings(owner) {
  return gameState.buildings.filter(b => b.owner === owner && b.health < b.maxHealth * 0.7).length;
}


// Обновлённая функция для строительства мастерской ремонта ИИ
function attemptToBuildRepairWorkshop() {
  if (countBuildings("repairWorkshop", "ai") < DESIRED_REPAIR_WORKSHOP_COUNT) {
    const warehouses = gameState.buildings.filter(b => b.owner === "ai" && b.type === "warehouse");
    if (warehouses.length > 0) {
      const warehouse = warehouses[0];
      const pos = { x: warehouse.x + 50, y: warehouse.y };
      if (canSpendResources(REPAIR_WORKSHOP_COST, "ai")) {
        aiPlaceBuilding("repairWorkshop", pos.x, pos.y);
      }
    }
  }
}

// Функция для расчёта резервируемых ресурсов для владельца (например, "ai")
// Изменённая функция резервирования ресурсов для ИИ,
// где базовый резерв уменьшен, а коэффициенты влияния прогресса и повреждений снижены.
function getReservedResources(owner) {
  // Уменьшенный базовый резерв
  const baseReserve = { gold: 10, silicon: 10, plasma: 10 };

  // Фактор прогресса игры: от 0 до 1 за первые 10 минут
  const gameProgressFactor = Math.min(1, performance.now() / (2 * 60 * 1000));

  // Оценка доли повреждённых зданий
  const totalBuildings = gameState.buildings.filter(b => b.owner === owner).length;
  const damagedBuildings = gameState.buildings.filter(
    b => b.owner === owner && (b.health / b.maxHealth) < 0.7
  ).length;
  const damageFactor = totalBuildings > 0 ? (damagedBuildings / totalBuildings) : 0;
  
  // Дополнительный резерв только если повреждений больше 30%, но с пониженным коэффициентом
  const additionalReserveFactor = (damageFactor > 0.3) ? damageFactor * 0.5 : 0;

  return {
    gold: baseReserve.gold * (1 + gameProgressFactor + additionalReserveFactor),
    silicon: baseReserve.silicon * (1 + gameProgressFactor + additionalReserveFactor),
    plasma: baseReserve.plasma * (1 + gameProgressFactor + additionalReserveFactor)
  };
}



// Функция, проверяющая возможность потратить ресурсы, не опустив баланс ниже резерва
function canSpendResources(cost, owner) {
  // Выбираем объект с ресурсами для ИИ или игрока
  const resources = owner === "ai" ? gameState.aiResources : gameState.playerResources;
  const reserved = getReservedResources(owner);
  
  return (
    (resources.gold - cost.gold) >= reserved.gold &&
    (resources.silicon - cost.silicon) >= reserved.silicon &&
    (resources.plasma - cost.plasma) >= reserved.plasma
  );
}


// Функция добавления заказа в очередь производства для здания
function aiEnqueueMilitaryUnit(unitType, building) {
  let productionTime;
  switch(unitType) {
    case "fighter": productionTime = 6000; break;
    case "assault": productionTime = 12000; break;
    case "elite": productionTime = 25000; break;
    default: return false;
  }
  
  if (!building.productionQueue) {
    building.productionQueue = [];
  }
  
  if (building.productionQueue.length >= building.productionLimit) return false;
  
  // Корректное назначение времени начала производства
  const lastOrder = building.productionQueue[building.productionQueue.length - 1];
  let timeStart = performance.now();
  if (lastOrder) {
    timeStart = lastOrder.timeStart + lastOrder.productionTime; // Начало после завершения предыдущего
  }
  
  const order = {
    unitType: unitType,
    timeStart: timeStart,
    productionTime: productionTime
  };
  
  building.productionQueue.push(order);
  return true;
}


// Функция обработки очереди заказов: проверяем, готовы ли заказы к выполнению, и производим юнитов
function processAIMilitaryProductionQueue() {
  const now = performance.now();
  gameState.buildings.forEach(building => {
    if (building.owner !== "ai" || !building.productionQueue || building.productionQueue.length === 0) {
      return;
    }

    const order = building.productionQueue[0];

    if (now >= order.timeStart + order.productionTime) {
      const unitCost = (order.unitType === "fighter") ? FIGHTER_COST :
                       (order.unitType === "assault") ? ASSAULT_COST :
                       (order.unitType === "elite") ? ELITE_COST : null;

      if (unitCost && canSpendResources(unitCost, "ai")) {
        gameState.aiResources.gold -= unitCost.gold;
        gameState.aiResources.silicon -= unitCost.silicon;
        gameState.aiResources.plasma -= unitCost.plasma;
        updateResourceUI();

        const { spawn, target } = spawnAtBoundary(building, 10);
        const unit = new Unit(order.unitType, building.owner, spawn.x, spawn.y);
        gameState.units.push(unit);
        moveUnit(unit, target.x, target.y, () => {
          if (order.unitType === "fighter") startFighterCycle(unit);
          else startAssaultEliteCycle(unit);
        });

        building.productionQueue.shift();
      }
    }
  });
}




// Функция, которая проходит по всем казармам ИИ и, если очередь не заполнена, добавляет новый заказ
function attemptToEnqueueMilitaryOrders() {
  const barracksBuildings = gameState.buildings.filter(b => 
    b.owner === "ai" && (b.type === "barracks" || b.type === "barracks2" || b.type === "barracks3")
  );
  
  barracksBuildings.forEach(building => {
    let unitType;
    if (building.type === "barracks") {
      unitType = "fighter";
    } else if (building.type === "barracks2") {
      unitType = "assault";
    } else if (building.type === "barracks3") {
      unitType = "elite";
    }
    if (!building.productionQueue || building.productionQueue.length < building.productionLimit) {
      aiEnqueueMilitaryUnit(unitType, building);
    }
  });
}

// Пример таймера, который каждые 1000 мс (1 сек) проверяет очередь заказов и добавляет новые заказы
setInterval(() => {
  if (gameStarted) {
    processAIMilitaryProductionQueue();
    attemptToEnqueueMilitaryOrders();
  }
}, 1000);




// Пример использования в функции найма юнитов или строительства
function aiHireMilitaryUnits(unitType, building) {
  let cost;
  switch (unitType) {
    case "fighter":
      cost = FIGHTER_COST; 
      break;
    case "assault":
      cost = ASSAULT_COST; 
      break;
    case "elite":
      cost = ELITE_COST; 
      break;
    default: 
      return false;
  }
  
  // Проверяем возможность потратить ресурсы с учётом резерва
  if (!canSpendResources(cost, "ai")) return false;
  
  // Списание ресурсов
  gameState.aiResources.gold -= cost.gold;
  gameState.aiResources.silicon -= cost.silicon;
  gameState.aiResources.plasma -= cost.plasma;
  updateResourceUI();
  
  const { spawn, target } = spawnAtBoundary(building, 10);
  const unit = new Unit(unitType, "ai", spawn.x, spawn.y);
  unit.homeBuilding = building;
  addUnit(unit);
  
  // Для файловых юнитов (fighter) запускаем стандартный цикл, для штурмовиков и элитных – новый цикл
  if (unitType === "fighter") {
    moveUnit(unit, target.x, target.y, () => startFighterCycle(unit));
  } else if (unitType === "assault" || unitType === "elite") {
    moveUnit(unit, target.x, target.y, () => startAssaultEliteCycle(unit));
  }
  
  return true;
}


//////////////////////////////////////////////////////////////
// Функции кластеризации зданий
function getBuildingClusters(owner, clusterRadius = CLUSTER_RADIUS) {
  const clusters = [];
  const buildings = gameState.buildings.filter(b => b.owner === owner);
  const visited = new Set();
  buildings.forEach(b => {
    if (visited.has(b)) return;
    const cluster = [b];
    visited.add(b);
    buildings.forEach(other => {
      if (!visited.has(other) && Math.hypot(b.x - other.x, b.y - other.y) < clusterRadius) {
        cluster.push(other);
        visited.add(other);
      }
    });
    clusters.push(cluster);
  });
  return clusters;
}

function getClusterCenter(cluster) {
  let sumX = 0, sumY = 0;
  cluster.forEach(b => { sumX += b.x; sumY += b.y; });
  return { x: sumX / cluster.length, y: sumY / cluster.length };
}

//////////////////////////////////////////////////////////////
// Функции атаки


// Функция для выбора случайной точки в круге (зоне боевого соприкосновения)
function getBattleZone(center, radius) {
  const angle = Math.random() * 4 * Math.PI;
  const r = Math.random() * radius;
  return { x: center.x + r * Math.cos(angle), y: center.y + r * Math.sin(angle) };
}


//////////////////////////////////////////////////////////////
// Функция назначения защитников для зданий
function assignDefendersToBuildings() {
  // Определяем ключевые здания, для которых требуется гарнизон
  const keyBuildings = gameState.buildings.filter(b =>
    b.owner === "ai" &&
    // Можно расширить список типов, если требуется
    ["warehouse", "repairWorkshop", "beacon", "base", "base2", "base3", "barracks", "barracks2", "barracks3"].includes(b.type)
  );

  // Формируем пул свободных боевых юнитов, которые не заняты защитой
  let freeDefenders = gameState.units.filter(u =>
    u.owner === "ai" &&
    (u.type === "fighter" || u.type === "assault" || u.type === "elite") &&
    (!u.defending) &&
    (!u.commandQueue || u.commandQueue.length === 0)
  );

  // Для каждого здания проверяем, сколько уже назначено защитников и сколько нужно
  keyBuildings.forEach(building => {
    // Определяем диапазон поиска вокруг здания (например, DEFENSE_RADIUS)
    const queryRange = {
      x: building.x - DEFENSE_RADIUS,
      y: building.y - DEFENSE_RADIUS,
      width: DEFENSE_RADIUS * 2,
      height: DEFENSE_RADIUS * 2
    };

    // Определяем уже назначенных защитников, находящихся в пределах радиуса
    const assignedDefenders = gameState.units.filter(u =>
      u.owner === "ai" &&
      (u.type === "fighter" || u.type === "assault" || u.type === "elite") &&
      u.defending &&
      Math.hypot(u.x - building.x, u.y - building.y) < DEFENSE_RADIUS
    );

    const needed = Math.max(0, DESIRED_DEFENDERS_PER_BUILDING - assignedDefenders.length);

    // Отбираем кандидатов из пула свободных защитников, которые находятся достаточно близко
    // Если таких недостаточно, можно назначать даже более удалённых, но по желанию ограничим поиск
    const candidates = freeDefenders.filter(u =>
      Math.hypot(u.x - building.x, u.y - building.y) < DEFENSE_RADIUS
    );

    // Назначаем из кандидатов нужное количество юнитов
    for (let i = 0; i < needed && candidates.length > 0; i++) {
      const defender = candidates.shift();
      // Удаляем выбранного защитника из глобального пула, чтобы он не был назначен повторно
      freeDefenders = freeDefenders.filter(u => u !== defender);

      defender.commandQueue = [];
      defender.defending = true;
      // Небольшое случайное смещение, чтобы юниты не накладывались точно друг на друга
      const offsetX = (Math.random() - 0.5) * 20;
      const offsetY = (Math.random() - 0.5) * 20;
      defender.commandQueue.push({ type: "move", x: building.x + offsetX, y: building.y + offsetY });
      //console.log(`Назначен защитник ${defender.type} для ${building.type} на (${Math.round(building.x)}, ${Math.round(building.y)})`);
    }
  });
}


function computeInfrastructureBalance() {
  // Ключевые здания для инфраструктуры
  const keyTypes = ["warehouse", "repairWorkshop", "barracks", "turret", "beacon"];
  const infraCount = gameState.buildings.filter(b => b.owner === "ai" && keyTypes.includes(b.type)).length;
  const militaryCount = gameState.units.filter(u =>
    u.owner === "ai" && (u.type === "fighter" || u.type === "assault" || u.type === "elite")
  ).length;
  if (militaryCount === 0) return 0;
  // Умножаем число зданий на 5: таким образом, если 1 здание и 5 юнитов, баланс будет равен 1.
  return (infraCount * 4) / militaryCount;
}
//////////////////////////////////////////////////////////////
// Функция расчёта безопасного маршрута атаки с обходом опасных зон
function calculateSafeAttackRoute(start, target, checkRadius = 1000, enemyThreshold = 5) {
  // Первоначальный промежуточный пункт
  let midPoint = { x: (start.x + target.x) / 2, y: (start.y + target.y) / 2 };

  // Если промежуточная точка находится в опасной зоне, смещаем её перпендикулярно линии атаки
  if (isGreyZone(midPoint)) {
    const dx = target.x - start.x;
    const dy = target.y - start.y;
    const length = Math.hypot(dx, dy);
    // Нормальный вектор к линии атаки
    const perpX = -dy / length;
    const perpY = dx / length;
    // Смещение на фиксированное расстояние
    const offsetMagnitude = 250;
    midPoint = { x: midPoint.x + perpX * offsetMagnitude, y: midPoint.y + perpY * offsetMagnitude };
  }
  
  // Если и новая промежуточная точка не безопасна, можно дополнительно добавить логику перегруппировки
  if (isGreyZone(midPoint)) {
    //console.log("Невозможно найти безопасный промежуточный пункт для атаки");
    return [target]; // В крайнем случае возвращаем прямой маршрут
  }
  
  return [midPoint, target];
}



// Новая функция, реализующая мгновенную реакцию на атаку – она выдаёт команды свободным юнитам, если вокруг здания обнаружены враги:
function reactToEnemyAttack() {
  // Для каждого здания ИИ (можно ограничить до ключевых зданий)
  gameState.buildings.filter(b => b.owner === "ai").forEach(building => {
    if (isGreyZone({ x: building.x, y: building.y })) {
      // Определяем область поиска вокруг здания
      const queryRange = {
        x: building.x - GREY_ZONE_RADIUS,
        y: building.y - GREY_ZONE_RADIUS,
        width: GREY_ZONE_RADIUS * 2,
        height: GREY_ZONE_RADIUS * 2
      };
      const nearbyObjects = getCachedObjectsInRange(queryRange) || [];
      // Фильтруем объекты, принадлежащие игроку (врагов)
      const enemyUnits = nearbyObjects.filter(obj => obj.owner === "player");
      if (enemyUnits.length === 0) return;
      // Для каждого свободного боевого юнита ИИ в этой области выдаём команду перейти к ближайшему врагу
      nearbyObjects.filter(u =>
        u.owner === "ai" &&
        (u.type === "fighter" || u.type === "assault" || u.type === "elite") &&
        (!u.commandQueue || u.commandQueue.length === 0)
      ).forEach(unit => {
        unit.commandQueue = [];
        const nearestEnemy = enemyUnits.reduce((prev, curr) =>
          Math.hypot(curr.x - unit.x, curr.y - unit.y) < Math.hypot(prev.x - unit.x, prev.y - unit.y)
            ? curr
            : prev
        );
        if (nearestEnemy) {
          unit.commandQueue.push({ type: "move", x: nearestEnemy.x, y: nearestEnemy.y });
          unit.commandQueue.push({ type: "attack", target: nearestEnemy });
        }
      });
    }
  });
}
//////////////////////////////////////////////////////////////
// Модули ИИ
if (typeof EconomicExpansionModule === 'undefined') {
  class EconomicExpansionModule {
    constructor(gameState, aiBase) {
      this.gameState = gameState;
      this.aiBase = aiBase;
    }
    
    planExpansion() {
      return findExpansionTarget();
    }
    
    buildInfrastructure() {
      const target = this.planExpansion();
      if (!target) return;
      // Проверяем, не построен ли уже кластер слишком близко – здесь порог можно увеличить до 100
      if (this.gameState.buildings.some(b =>
          b.owner === "ai" && b.type === "beacon" &&
          Math.hypot(b.x - target.x, b.y - target.y) < 100
      )) {
        return;
      }
      buildClusterAt(target);
      builtClusters.push(target);
    }
    
    update() {
      if (canAfford(WAREHOUSE_COST, "ai") ||
          canAfford(REPAIR_WORKSHOP_COST, "ai") ||
          canAfford(BEACON_COST, "ai")) {
        this.buildInfrastructure();
      }
    }
  }
  
 // Обновлённый класс модуля защиты, где вызывается мгновенная реакция:
class DefenseModule {
  constructor(gameState) {
    this.gameState = gameState;
    this.lastAssignmentTime = 0;
    this.defenseRadius = DEFENSE_RADIUS;
    this.desiredDefenders = DESIRED_DEFENDERS_PER_BUILDING;
  }
  
  assignDynamicDefenders() {
    const currentTime = performance.now();
    if (currentTime - this.lastAssignmentTime < 500) return;
    this.lastAssignmentTime = currentTime;
    
    // Распределяем защитников по зданиям
    assignDefendersToBuildings();
    // Мгновенная реакция на атаку: выдаём команды защитникам сразу при обнаружении врагов
    reactToEnemyAttack();
    
    // Дополнительно укрепляем кластеры и базы
    const clusters = getBuildingClusters("ai");
    clusters.forEach(cluster => {
      fortifyClusterWith4Walls(cluster);
    });
    fortifyBaseBuildings("ai");
  }
  
  update() {
    this.assignDynamicDefenders();
  }
}

  
 // Модуль атаки с использованием процентного отбора из резерва
// В модуле атаки
class AttackModule {
  constructor(gameState, playerBase) {
    this.gameState = gameState;
    this.playerBase = playerBase;
    this.lastAttackTime = performance.now();
    this.MIN_ATTACK_UNITS = 3;
    // Используем процент из общего резерва для атаки
    this.deployPercentage = 0.2;
    this.MAX_ATTACK_UNITS = 10;
    this.attackCooldown = 60000; // задержка между атаками (мс)
	this.sendAttackGroup = sendAttackGroup;  
  }
  selectDistractionTarget() {
  // Выбираем альтернативную цель для отвлекающего манёвра.
  // В данном примере выбираем слабое здание противника типа "warehouse" или "repairWorkshop".
  const candidateTypes = ["warehouse", "repairWorkshop"];
  const candidates = gameState.buildings.filter(b =>
    b.owner === "player" && candidateTypes.includes(b.type)
  );
  let bestCandidate = null;
  let bestScore = Infinity;
  candidates.forEach(candidate => {
    // Оценка цели: чем ниже здоровье и чем меньше защитников вокруг – тем лучше.
    let score = candidate.health;
    const defenders = getEnemiesInRange({ x: candidate.x, y: candidate.y }, 100)
                        .filter(u => u.owner === "player");
    score += defenders.length * 50;
    if (score < bestScore) {
      bestScore = score;
      bestCandidate = candidate;
    }
  });
  return bestCandidate || playerBase;
}

  getReservePool() {
    return getFreeReserveUnits();
  }
  
formGarrisonFromReserve() {
    // Вместо простой выборки возвращаем смешанную группу
    return formMixedAttackGroupDynamic();
  }
  
  readyForAttack() {
    return getFreeReserveUnits().length >= this.MIN_ATTACK_UNITS &&
           (performance.now() - this.lastAttackTime > this.attackCooldown);
  }
  
  selectWeakTarget() {
    const candidateTypes = ["base", "base2", "base3", "barracks", "barracks2", "barracks3", "beacon"];
    const candidates = this.gameState.buildings.filter(b => b.owner === "player" && candidateTypes.includes(b.type));
    let bestCandidate = null;
    let bestScore = Infinity;
    candidates.forEach(candidate => {
      const defenders = getEnemiesInRange({ x: candidate.x, y: candidate.y }, DEFENSE_RADIUS)
                         .filter(e => e.owner === "player");
      let score = candidate.health + defenders.length * 50;
      if (["warehouse", "repairWorkshop"].includes(candidate.type)) {
        score += 100;
      }
      if (score < bestScore) {
        bestScore = score;
        bestCandidate = candidate;
      }
    });
    return bestCandidate || this.playerBase;
  }
  
  // Вспомогательная функция для вычисления индивидуальной точки перегруппировки.
// Для заданного юнита и центра безопасной зоны возвращает точку на окружности радиуса 'radius',
// которая является диаметрально противоположной позиции юнита относительно центра.


  
  update() {
    if (this.readyForAttack()) {
      this.sendAttackGroup();
    }
  }
}

  window.EconomicExpansionModule = EconomicExpansionModule;
  window.DefenseModule = DefenseModule;
  window.AttackModule = AttackModule;
}
//////////////////////////////////////////////////////////////
// State Machine и главная логика ИИ
//let aiPhase = "warehouses"; // Фазы: warehouses, repairWorkshop, barracks, turrets, normal
let economicModule = new EconomicExpansionModule(gameState, aiBase);
let defenseModule = new DefenseModule(gameState);
let attackModule = new AttackModule(gameState, playerBase);

function computeRegroupingPosition(unit, center, radius) {
  let dx = unit.x - center.x;
  let dy = unit.y - center.y;
  let norm = Math.hypot(dx, dy);
  if (norm === 0) return { x: center.x + radius, y: center.y };
  // Возвращаем точку на окружности радиуса 'radius' по направлению от центра к юниту
  return { x: center.x + (dx / norm) * radius, y: center.y + (dy / norm) * radius };
}


function sendAttackGroup() {
  // Формируем группу атакующих юнитов ИИ (fighter, assault, elite), у которых нет активных команд.
  const attackGroup = gameState.units.filter(u =>
    u.owner === "ai" &&
    (u.type === "fighter" || u.type === "assault" || u.type === "elite") &&
    u.commandQueue.length === 0
  );
  if (attackGroup.length === 0) return;
  
  // Выбираем кандидата – слабый объект противника (например, через уже реализованную selectWeakTarget)
  const candidate = this.selectWeakTarget();
  
  // Определяем область боевого соприкосновения вокруг кандидата:
  // Находим все вражеские объекты в радиусе 150 единиц от кандидата.
  const nearbyObjects = getObjectsInRange({ x: candidate.x, y: candidate.y }, 150);
  const enemyCluster = nearbyObjects.filter(obj =>
    obj.owner === "player" && obj.health > 0
  );
  
  let clusterCenter;
  if (enemyCluster.length > 0) {
    let sumX = 0, sumY = 0;
    enemyCluster.forEach(obj => {
      sumX += obj.x;
      sumY += obj.y;
    });
    clusterCenter = { x: sumX / enemyCluster.length, y: sumY / enemyCluster.length };
  } else {
    clusterCenter = { x: candidate.x, y: candidate.y };
  }
  
  // Определяем "battle zone" как безопасную зону вокруг центра кластера.
  // Вместо того чтобы задавать одну общую точку, для каждого юнита вычислим индивидуальное место.
  // Здесь также ищем поддерживающие цели в battle zone.
  let supportTargets = getObjectsInRange({ x: clusterCenter.x, y: clusterCenter.y }, BATTLE_ZONE_RADIUS)
    .filter(obj =>
      obj.owner === "player" &&
      (obj.type === "turret" || obj.type === "fighter" || obj.type === "assault" || obj.type === "elite")
    );
  
  // Финальная цель атаки — если в battle zone есть поддерживающие объекты, выбираем самый слабый из них.
  let finalTarget = candidate;
  if (supportTargets.length > 0) {
    finalTarget = supportTargets.reduce((prev, curr) => (prev.health < curr.health ? prev : curr));
  }
  
  // Выбираем тактику атаки: 0 – прямая, 1 – фланговая, 2 – отвлекающий манёвр, 3 – гибридная.
  const tacticIndex = Math.floor(Math.random() * 4);
  this.currentTactic = tacticIndex;
  
  switch (tacticIndex) {
    case 0:
      // Прямая атака: каждый юнит вычисляет индивидуальную точку перегруппировки в safe zone,
      // затем переходит к атаке финальной цели.
      attackGroup.forEach(unit => {
        unit.commandQueue = [];
        const regroupPos = computeRegroupingPosition(unit, clusterCenter, BATTLE_ZONE_RADIUS);
		  unit.commandQueue.push({ type: "attack", target: finalTarget });
        unit.commandQueue.push({ type: "move", x: regroupPos.x, y: regroupPos.y });
        
      });
     // console.log("Тактика: Прямая атака с индивидуальной перегруппировкой");
      break;
      
    case 1:
      // Фланговая атака: каждый юнит вычисляет точку перегруппировки, затем — смещается боком.
      attackGroup.forEach((unit, index) => {
        unit.commandQueue = [];
        const regroupPos = computeRegroupingPosition(unit, clusterCenter, BATTLE_ZONE_RADIUS);
        // Для фланга добавляем смещение по перпендикулярной оси.
        const angle = Math.atan2(regroupPos.y - clusterCenter.y, regroupPos.x - clusterCenter.x);
        const flankDirection = (index % 2 === 0) ? 1 : -1;
        const flankX = regroupPos.x + Math.cos(angle + flankDirection * Math.PI / 2) * (FLANK_OFFSET * 0.1);
        const flankY = regroupPos.y + Math.sin(angle + flankDirection * Math.PI / 2) * (FLANK_OFFSET * 0.1);
		  unit.commandQueue.push({ type: "attack", target: finalTarget });
        unit.commandQueue.push({ type: "move", x: flankX, y: flankY });
        
      });
      //console.log("Тактика: Фланговая атака с индивидуальной перегруппировкой");
      break;
      
    case 2:
      // Отвлекающий манёвр: примерно 30% группы отвлекаются на альтернативную цель,
      // остальные используют индивидуальную перегруппировку.
      const diversionSize = Math.max(1, Math.floor(attackGroup.length * 0.3));
      const diversionGroup = attackGroup.slice(0, diversionSize);
      const mainGroup = attackGroup.slice(diversionSize);
      
      const distractionTarget = this.selectDistractionTarget();
      
      diversionGroup.forEach(unit => {
        unit.commandQueue = [];
        const regroupPos = computeRegroupingPosition(unit, clusterCenter, BATTLE_ZONE_RADIUS);
		  unit.commandQueue.push({ type: "attack", target: distractionTarget });
        unit.commandQueue.push({ type: "move", x: regroupPos.x, y: regroupPos.y });
        
      });
      mainGroup.forEach(unit => {
        unit.commandQueue = [];
        const regroupPos = computeRegroupingPosition(unit, clusterCenter, BATTLE_ZONE_RADIUS);
		  unit.commandQueue.push({ type: "attack", target: finalTarget });
        unit.commandQueue.push({ type: "move", x: regroupPos.x, y: regroupPos.y });
		  
        
      });
     // console.log("Тактика: Отвлекающий манёвр с индивидуальной перегруппировкой");
      break;
      
    case 3:
      // Гибридная тактика: элитные юниты остаются на безопасной дистанции, остальные – индивидуально перегруппируются.
      attackGroup.forEach(unit => {
        unit.commandQueue = [];
        if (unit.type === "elite") {
          const angle = Math.atan2(unit.y - clusterCenter.y, unit.x - clusterCenter.x);
          const holdX = clusterCenter.x - Math.cos(angle) * SAFE_DISTANCE;
          const holdY = clusterCenter.y - Math.sin(angle) * SAFE_DISTANCE;
			unit.commandQueue.push({ type: "attack", target: finalTarget });
          unit.commandQueue.push({ type: "move", x: holdX, y: holdY });
          
        } else {
          const regroupPos = computeRegroupingPosition(unit, clusterCenter, BATTLE_ZONE_RADIUS);
			unit.commandQueue.push({ type: "attack", target: finalTarget });
          unit.commandQueue.push({ type: "move", x: regroupPos.x, y: regroupPos.y });
          
        }
      });
      //console.log("Тактика: Гибридная (элитные держатся на SAFE_DISTANCE, остальные перегруппируются)");
      break;
  }
  this.lastAttackTime = performance.now();
}

// Функция проверки, что все ключевые здания имеют достаточный гарнизон
function allKeyBuildingsGarrisoned() {
  // Задаём типы зданий, для которых требуется наличие гарнизона
  const keyTypes = ["beacon", "base", "base2", "base3", "barracks", "barracks2", "barracks3"];
  let allGarrisoned = true;
  keyTypes.forEach(type => {
    const buildings = gameState.buildings.filter(b => b.owner === "ai" && b.type === type);
    buildings.forEach(building => {
      // Считаем число защитников вокруг здания в пределах DEFENSE_RADIUS
      const defenders = gameState.units.filter(u =>
         u.owner === "ai" &&
         (u.type === "fighter" || u.type === "assault" || u.type === "elite") &&
         Math.hypot(u.x - building.x, u.y - building.y) < DEFENSE_RADIUS &&
         u.defending === true
      );
      if (defenders.length < DESIRED_DEFENDERS_PER_BUILDING) {
         allGarrisoned = false;
      }
    });
  });
  return allGarrisoned;
}

// Начальный этап: гарантированное строительство 4 складов и 1 мастерской
function ensureInitialInfrastructure() {
  // Добавляем 3 задания на строительство склада, если их ещё нет
  if (countBuildings("warehouse", "ai") < 4 && canAfford(WAREHOUSE_COST, "ai")) {
    for (let i = 0; i < 4 - countBuildings("warehouse", "ai"); i++) {
      const pos = randomNearbyPosition(aiBase, 100);
      scheduleAIBuilding("warehouse", pos.x, pos.y, 0);
    }
  }
  
  // Добавляем задание на строительство мастерской, если её ещё нет
  if (!hasBuilding("repairWorkshop", "ai") && canAfford(REPAIR_WORKSHOP_COST, "ai")) {
    const pos = randomNearbyPosition(aiBase, 100);
    scheduleAIBuilding("repairWorkshop", pos.x, pos.y, 0);
  }
}

// Определяем оптимальную композицию гарнизона для каждого объекта защиты
const optimalGarrison = {
  fighter: 3,
  assault: 2,
  elite: 1  // допустим, elite – это линкор
};

// Функция для получения свободных (не задействованных) боевых юнитов из резерва
function getFreeReserveUnits() {
  return gameState.attackers.filter(u => !u.defending && (!u.commandQueue || u.commandQueue.length === 0));
}




function updateGarrisonAssignmentsClustered() {
  // Получаем общий резерв свободных боевых юнитов (без уже назначенных)
  const freeReserveUnits = getFreeReserveUnits();
  const totalFreeReserve = freeReserveUnits.length;
  // Глобальный лимит для защиты – 40 % от общего резерва
  const globalDefenderLimit = Math.floor(totalFreeReserve * 0.2);

  // Ключевые здания для защиты
  const keyBuildingTypes = ["warehouse", "repairWorkshop", "beacon", "base", "base2", "base3", "barracks", "barracks2", "barracks3"];
  const keyBuildings = gameState.buildings.filter(b => b.owner === "ai" && keyBuildingTypes.includes(b.type));
  // Группируем здания по близости, используя DEFENSE_RADIUS как радиус кластеризации
  const clusters = getBuildingClusters("ai", DEFENSE_RADIUS);

  let totalAssignedGlobal = 0;

  clusters.forEach(cluster => {
    // Фильтруем здания, у которых гарнизон уже сформирован (заблокирован)
    const clusterBuildings = cluster.filter(building => !building.garrisonLocked);
    if (clusterBuildings.length === 0) return;

    // Рассчитываем суммарную потребность для данного кластера
    const clusterRequirement = clusterBuildings.length * DESIRED_DEFENDERS_PER_BUILDING;
    // Получаем уже назначенных защитников для зданий этого кластера
    const clusterDefenders = gameState.units.filter(u =>
      u.owner === "ai" &&
      u.defending === true &&
      clusterBuildings.some(b => Math.hypot(u.x - b.x, u.y - b.y) < DEFENSE_RADIUS)
    );
    const currentClusterCount = clusterDefenders.length;
    const missingInCluster = clusterRequirement - currentClusterCount;
    if (missingInCluster <= 0) return;

    // Вычисляем, сколько защитников можно ещё назначить, не превышая глобальный лимит
    const remainingGlobal = globalDefenderLimit - totalAssignedGlobal;
    if (remainingGlobal <= 0) return;

    // Количество для назначения в кластере – минимум из недостающих и оставшихся глобально
    const assignable = Math.min(missingInCluster, remainingGlobal);
    // Распределяем равномерно по зданиям кластера
    const perBuildingAssign = Math.floor(assignable / clusterBuildings.length);

    clusterBuildings.forEach(building => {
      // Если у здания уже сформирован гарнизон, пропускаем
      const buildingDefenders = gameState.units.filter(u =>
        u.owner === "ai" &&
        u.defending === true &&
        Math.hypot(u.x - building.x, u.y - building.y) < DEFENSE_RADIUS
      );
      const missingForBuilding = DESIRED_DEFENDERS_PER_BUILDING - buildingDefenders.length;
      if (missingForBuilding <= 0) {
        building.garrisonLocked = true;
        return;
      }
      // Для данного здания назначаем не более, чем минимум из (missingForBuilding) и (perBuildingAssign)
      const toAssignCount = Math.min(missingForBuilding, perBuildingAssign);
      if (toAssignCount <= 0) return;
      
      const freeUnitsForAssignment = getFreeReserveUnits().filter(u =>
        u.type === "fighter" || u.type === "assault" || u.type === "elite"
      );
      const unitsToAssign = freeUnitsForAssignment.slice(0, toAssignCount);
      unitsToAssign.forEach(unit => {
        unit.commandQueue = []; 
        unit.defending = true;
        // Добавляем случайное смещение, чтобы защитники не стояли в точке
        const offsetX = (Math.random() - 0.5) * 40;
        const offsetY = (Math.random() - 0.5) * 40;
        unit.commandQueue.push({ type: "move", x: building.x + offsetX, y: building.y + offsetY });
        //console.log(`Назначен ${unit.type} для защиты ${building.type} на (${Math.round(building.x)}, ${Math.round(building.y)})`);
      });
      totalAssignedGlobal += unitsToAssign.length;
      // Если после назначения защитников для здания требуемое число достигнуто, блокируем его гарнизон
      if (buildingDefenders.length + toAssignCount >= DESIRED_DEFENDERS_PER_BUILDING) {
        building.garrisonLocked = true;
      }
    });
  });
}

function reactToAttack() {
  // Выбираем ключевые здания для быстрого реагирования
  const keyBuildings = gameState.buildings.filter(b =>
    b.owner === "ai" &&
    ["warehouse", "repairWorkshop", "base", "base2", "base3", "beacon"].includes(b.type)
  );
  
  keyBuildings.forEach(building => {
    const queryRange = {
      x: building.x - DEFENSE_RADIUS,
      y: building.y - DEFENSE_RADIUS,
      width: DEFENSE_RADIUS * 2,
      height: DEFENSE_RADIUS * 2
    };
    
    // Получаем объекты из квадродерева через кэшированную функцию
    const objectsInRange = getCachedObjectsInRange(queryRange) || [];
    
    // Фильтруем вражеские объекты (принадлежащие игроку) в радиусе защиты
    const enemies = objectsInRange.filter(obj =>
      obj.owner === "player" &&
      Math.hypot(obj.x - building.x, obj.y - building.y) < DEFENSE_RADIUS
    );
    
    // Если обнаружен хотя бы один враг, запускаем реакцию
    if (enemies.length > 0) { // можно использовать условие >= 1
      // Находим свободные боевые единицы для защиты
      const freeUnits = gameState.units.filter(u =>
        u.owner === "ai" &&
        (u.type === "fighter" || u.type === "assault" || u.type === "elite") &&
        (!u.commandQueue || u.commandQueue.length === 0) &&
        !u.defending
      );
      
      freeUnits.forEach(unit => {
        // Находим ближайшего врага относительно здания
        const nearestEnemy = enemies.reduce((prev, curr) =>
          Math.hypot(curr.x - building.x, curr.y - building.y) <
          Math.hypot(prev.x - building.x, prev.y - building.y) ? curr : prev
        );
        if (nearestEnemy) {
          unit.commandQueue = [];
          unit.commandQueue.push({ type: "move", x: nearestEnemy.x, y: nearestEnemy.y });
          unit.commandQueue.push({ type: "attack", target: nearestEnemy });
          unit.defending = true;
        }
      });
    }
  });
}


// Функция, которая проверяет, если в резервном пуле свободных боевых юнитов меньше заданного порога,
// то инициирует найм новых юнитов (например, вызывает attemptToHireMilitaryUnits)
// Порог можно задавать в зависимости от баланса (например, 10)
function updateReservePool(threshold = 20) {
  const reserve = getFreeReserveUnits();
  if (reserve.length < threshold) {
    //console.log(`Резерв свободных юнитов (${reserve.length}) ниже порога ${threshold}. Попытка нанять новые военные юниты.`);
    attemptToHireMilitaryUnits();
  }
}

// Основная логика ИИ с проверкой гарнизонов и развитием базы
// Функция для проверки, заполнен ли резерв (минимум threshold свободных юнитов)
function isReserveFull(threshold = 20) {
  return getFreeReserveUnits().length >= threshold;
}

function findHiddenLocation() {
  const cols = persistentFogMap[0].length;
  const rows = persistentFogMap.length;
  const hiddenCells = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // Если ячейка никогда не была открыта
      if (persistentFogMap[r][c] === 0) {
        hiddenCells.push({ r, c });
      }
    }
  }
  
  if (hiddenCells.length === 0) {
    // Если все ячейки открыты, возвращаем случайную точку в дальнем углу
    return { x: worldWidth - 100, y: worldHeight - 100 };
  }
  
  const chosen = hiddenCells[Math.floor(Math.random() * hiddenCells.length)];
  // Преобразуем координаты ячейки в координаты игрового мира
  const cellSize = FOG_CELL_SIZE;
  return {
    x: chosen.c * cellSize + cellSize / 2,
    y: chosen.r * cellSize + cellSize / 2
  };
}

function selectWaveTarget() {
  const candidates = gameState.buildings.filter(b => b.owner === "player");
  let bestCandidate = null;
  let bestScore = Infinity;
  candidates.forEach(candidate => {
    // Чем ниже здоровье и чем дальше от playerBase, тем ниже приоритет
    const distance = Math.hypot(candidate.x - playerBase.x, candidate.y - playerBase.y);
    const score = candidate.health + distance * 0.1;
    if (score < bestScore) {
      bestScore = score;
      bestCandidate = candidate;
    }
  });
  return bestCandidate || playerBase;
}


function formMixedAttackGroup() {
  // Идеальный состав атакующей группы: 3 fighter, 2 assault, 1 elite.
  const desiredMix = { fighter: 5, assault: 3, elite: 1 };
  const group = [];
  
  const freeReserve = getFreeReserveUnits();
  
  // Группируем юниты по типу
  const grouped = freeReserve.reduce((acc, unit) => {
    acc[unit.type] = acc[unit.type] || [];
    acc[unit.type].push(unit);
    return acc;
  }, {});
  
  Object.keys(desiredMix).forEach(type => {
    const countNeeded = desiredMix[type];
    const available = grouped[type] || [];
    const countToTake = Math.min(countNeeded, available.length);
    group.push(...available.slice(0, countToTake));
  });
  
  const MIN_ATTACK_UNITS = 10;
  if (group.length < MIN_ATTACK_UNITS) {
    const additional = freeReserve.filter(u => !group.includes(u));
    group.push(...additional.slice(0, MIN_ATTACK_UNITS - group.length));
  }
  
  return group;
}

function calculateDesiredReserve() {
  // Базовые значения для каждого типа
  const baseValues = { fighter: 10, assault: 5, elite: 3 };
  // Фактор роста, например, зависящий от времени игры (1 минута = базовые значения)
  const factor = Math.max(1, performance.now() / 20000);
  return {
    fighter: Math.floor(baseValues.fighter * factor),
    assault: Math.floor(baseValues.assault * factor),
    elite: Math.floor(baseValues.elite * factor)
  };
}

// Новая функция, которая перебирает все казармы ИИ и выставляет заказы на найм юнитов
function attemptToHireMilitaryUnits() {
  const barracksBuildings = gameState.buildings.filter(b => 
    b.owner === "ai" && (b.type === "barracks" || b.type === "barracks2" || b.type === "barracks3")
  );

  barracksBuildings.forEach(building => {
    let unitType;
    if (building.type === "barracks") unitType = "fighter";
    else if (building.type === "barracks2") unitType = "assault";
    else if (building.type === "barracks3") unitType = "elite";

    if (!building.productionQueue) building.productionQueue = [];

    if (building.productionQueue.length < building.productionLimit) {
      const productionTime = (unitType === "fighter") ? 6000 : (unitType === "assault") ? 12000 : 25000;

      // Только добавляем в очередь, НЕ создаём сразу юнита!
      aiEnqueueMilitaryUnit(unitType, building, productionTime);
    }
  });
}

// Отдельная функция добавления в очередь (ничего сразу не создаёт!)
function aiEnqueueMilitaryUnit(unitType, building, productionTime) {
  if (!building.productionQueue) building.productionQueue = [];

  const lastOrder = building.productionQueue[building.productionQueue.length - 1];
  const timeStart = lastOrder 
    ? lastOrder.timeStart + lastOrder.productionTime 
    : performance.now();

  building.productionQueue.push({ unitType, timeStart, productionTime });
}




function attemptToBuild(buildingType, requiredCount) {
  // Если количество зданий ниже требуемого, попытаемся построить новое
  if (countBuildings(buildingType, "ai") < requiredCount) {
    const pos = randomNearbyPosition(aiBase, 130);
    scheduleAIBuilding(buildingType, pos.x, pos.y, 0);
  }
}

function startAssaultEliteCycle(unit) {
  if (!unit) return;
  function cycle() {
    if (unit.health <= 0) return;
    
    // Если есть команды – обрабатываем их и продолжаем цикл
    if (unit.commandQueue && unit.commandQueue.length > 0) {
      processCommandQueue(unit);
      requestAnimationFrame(cycle);
      return;
    }
    
    // Если у юнита есть цель, и она жива, вызываем динамическую атаку
    if (unit.target && unit.target.health > 0) {
      if (unit.type === "assault") {
        dynamicAttackAssault(unit, unit.target, 1/60);
      } else if (unit.type === "elite") {
        dynamicAttackElite(unit, unit.target, 1/60);
      }
    } else {
      // Если цели нет или она мертва, ищем новую цель
      let enemies = getEnemiesInRange({ x: unit.x, y: unit.y }, unit.range)
                    .filter(e => e.owner !== unit.owner && e.health > 0);
      if (enemies.length > 0) {
        unit.target = enemies.sort((a, b) =>
          Math.hypot(a.x - unit.x, a.y - unit.y) - Math.hypot(b.x - unit.x, b.y - unit.y)
        )[0];
      }
    }
    requestAnimationFrame(cycle);
  }
  cycle();
}






// Функция случайного отклонения позиции
function randomizePosition(basePosition, variance) {
  const angle = Math.random() * 2 * Math.PI;
  const radius = Math.random() * variance;
  return {
    x: basePosition.x + radius * Math.cos(angle),
    y: basePosition.y + radius * Math.sin(angle)
  };
}

// Функция случайного безопасного маршрута
function getRandomSafeRoute(start, end, deviation) {
  const midPoint = {
    x: (start.x + end.x) / 2 + (Math.random() - 0.5) * deviation,
    y: (start.y + end.y) / 2 + (Math.random() - 0.5) * deviation
  };
  return [start, midPoint, end];
}

// Отложенная реакция
function reactWithRandomDelay(unit, command, minDelay, maxDelay) {
  const delay = minDelay + Math.random() * (maxDelay - minDelay);
  setTimeout(() => {
    unit.commandQueue.push(command);
  }, delay);
}

// История атак игрока
let attackHistory = [];

function recordPlayerAttack(x, y) {
  attackHistory.push({ x, y, timestamp: performance.now() });
}

// Анализ поведения игрока
function analyzePlayerBehavior() {
  const zones = [];
  attackHistory.forEach(atk => {
    const zone = zones.find(z => Math.hypot(z.x - atk.x, z.y - atk.y) < 100);
    if (zone) zone.count++;
    else zones.push({ x: atk.x, y: atk.y, count: 1 });
  });
  return zones.sort((a, b) => b.count - a.count)[0];
}

// Адаптация защиты
function adaptDefenses() {
  const zone = analyzePlayerBehavior();
  if (zone && canAfford(TURRET_COST, "ai")) {
    const pos = randomizePosition(zone, 50);
    aiPlaceBuilding("turret", pos.x, pos.y);
  }
}


// Адаптивная атака
function initiateAdaptiveAttack() {
  const freeUnits = getFreeReserveUnits();
  const attackTarget = findWeakestPlayerZone();
  const randomizedAttackPoint = randomizePosition(attackTarget, 100);

  freeUnits.forEach(unit => {
    const route = getRandomSafeRoute(unit, randomizedAttackPoint, 200);
    route.forEach(pos => unit.commandQueue.push({ type: "move", x: pos.x, y: pos.y }));
    reactWithRandomDelay(unit, { type: "attack", target: attackTarget }, 500, 1500);
  });
}



// Функция для добавления зоны неудачного строительства с временной меткой
function markConstructionFailure(x, y) {
  failedClusters.push({ x, y, timestamp: performance.now() });
}

// Функция очистки устаревших меток неудачного строительства (например, старше 30 секунд)
function cleanupFailedClusters() {
  const timeout = 30000; // 30 секунд
  const now = performance.now();
  failedClusters = failedClusters.filter(pt => (now - pt.timestamp) < timeout);
}

// Функция планирования строительства кластера
function buildClusterAt(target) {
  const buildSteps = [
    { type: "beacon", x: target.x, y: target.y, cost: BEACON_COST },
    { type: "warehouse", x: target.x - 40, y: target.y, cost: WAREHOUSE_COST },
    { type: "repairWorkshop", x: target.x, y: target.y + 40, cost: REPAIR_WORKSHOP_COST },
    { type: "turret", x: target.x, y: target.y - 60, cost: TURRET_COST },
    { type: "turret", x: target.x + 60, y: target.y - 60, cost: TURRET_COST },
    { type: "warehouse", x: target.x, y: target.y + 80, cost: WAREHOUSE_COST }
  ];

  function processBuildQueue(index = 0) {
    if (index >= buildSteps.length) return;

    const { type, x, y, cost } = buildSteps[index];

    // Проверка ресурсов перед постройкой
    if (!canSpendResources(cost, "ai")) {
      //console.log(`Недостаточно ресурсов для ${type}`);
      setTimeout(() => processBuildQueue(index), 1000); // ждем и повторяем проверку
      return;
    }

    scheduleAIBuilding(type, x, y, 0);

    // Ждем постройки текущего здания перед продолжением очереди
    const checkBuildComplete = setInterval(() => {
      if (hasBuildingNearby(type, x, y, 20, "ai")) {
        clearInterval(checkBuildComplete);
        processBuildQueue(index + 1); // переходим к следующему зданию
      }
    }, 500);
  }

  processBuildQueue(); // запуск первой постройки
}

// Вспомогательная функция для точной проверки
function hasBuildingNearby(buildingType, x, y, radius, owner) {
  return gameState.buildings.some(b =>
    b.owner === owner &&
    b.type === buildingType &&
    Math.hypot(b.x - x, b.y - y) <= radius
  );
}


// Пример: при уничтожении здания (или продаже) вызываем функцию для маркировки зоны
function onBuildingDestroyed(building) {
  // Выполнение стандартных действий (удаление здания, эффекты и т.п.)
  // ...

  // Маркируем зону, где здание было расположено
  markConstructionFailure(building.x, building.y);
}

// В функции проверки неудачных построек (например, checkAndSellUnprofitableBuildings),
// если здание находится в опасной зоне, его можно продать, и его координаты добавить в soldBuildings
// (если такой массив используется для аналогичных целей).

// Также, если вы используете очередь построек, можно добавить проверку перед вызовом aiPlaceBuilding:
function scheduleAIBuilding(type, x, y, delay = 2000) {
  cleanupFailedClusters();
  // Если в этой зоне есть неудачная метка, не планируем строительство
  const failureRadius = 10;
  if (failedClusters.some(pt => Math.hypot(pt.x - x, pt.y - y) < failureRadius)) {
    //console.log("Постройка", type, "не планируется, так как зона", {x, y}, "помечена как неудачная.");
    return;
  }
  // Иначе добавляем в очередь построек
  buildQueue.push({
    type,
    x,
    y,
    plannedAt: performance.now(),
    delay
  });
}


function fortifyWarehousesProtection() {
  const protectionRadius = 100; // Радиус проверки вокруг склада
  // Минимальное число турелей в зоне склада
  const desiredTurretCount = 2;

  gameState.buildings.forEach(warehouse => {
    if (warehouse.owner === "ai" && warehouse.type === "warehouse") {
      const queryRange = {
        x: warehouse.x - protectionRadius,
        y: warehouse.y - protectionRadius,
        width: protectionRadius * 2,
        height: protectionRadius * 2
      };

      const nearbyBuildings = quadtree.query(queryRange);
      // Подсчитываем количество турелей (turret) в зоне склада
      const turretCount = nearbyBuildings.filter(b =>
        b.owner === "ai" && b.type === "turret"
      ).length;

      // Если турелей меньше требуемого количества, планируем строительство недостающих
      if (turretCount < desiredTurretCount) {
        const missing = desiredTurretCount - turretCount;
        for (let i = 0; i < missing; i++) {
          // Распределяем немного случайное смещение для каждого строительства
          const pos = randomNearbyPosition(warehouse, protectionRadius);
          if (canAfford(TURRET_COST, "ai")) {
            scheduleAIBuilding("turret", pos.x, pos.y, 0);
          }
        }
      }
    }
  });
}

// Запускаем защиту складов каждые 20 секунд:
setInterval(fortifyWarehousesProtection, 120000);















function initAILogic() {
  // Запускаем периодическую обработку очереди продаж, например, раз в 10 секунд.
  setInterval(processAISaleQueue, 10000);
}

function aiLogic() {
	processAISaleQueue();
  // 1. Обновление очереди построек, модулей защиты и атаки
  processBuildQueue();
  defenseModule.update();
  attackModule.update();

  // 2. Оценка текущей численности боевых сил
  const aiMilitaryCount = gameState.units.filter(u =>
    u.owner === "ai" && (u.type === "fighter" || u.type === "assault" || u.type === "elite")
  ).length;
  const playerMilitaryCount = gameState.units.filter(u =>
    u.owner === "player" && (u.type === "fighter" || u.type === "assault" || u.type === "elite")
  ).length;

  // 3. Динамическое переключение тактики по соотношению сил:
  // Если у игрока значительно больше военных, ИИ переходит в оборонительную тактику.
  if (playerMilitaryCount > aiMilitaryCount * 20) {
    aiPhase = PHASES.basicDefense;
    //console.log("Переход на оборону: basicDefense (численное преимущество игрока)");
  }

  // 4. Выполнение логики в зависимости от текущей фазы ИИ
  switch (aiPhase) {
    case PHASES.initialEconomy:
      // Фаза начальной экономики: строим начальную инфраструктуру
      ensureInitialInfrastructure();  // Например, 4 склада, 1 ремонтная мастерская
      attemptToHireWorkers();
		  attemptToHireMilitaryUnits();
      reactToAttack();
 if (!gameStarted) return;
      // Если инфраструктура достигнута, переключаемся на базовую защиту
      if (countBuildings("warehouse", "ai") >= 4 && hasBuilding("repairWorkshop", "ai")) {
        aiPhase = PHASES.basicDefense;
        //console.log("Переход к фазе basicDefense");
      }
      break;

    case PHASES.basicDefense:
  // 1. Экономические меры: строим склады и нанимаем рабочих.
  attemptToBuildWarehouse();
  attemptToHireWorkers();

  // 2. Инфраструктурное укрепление: строим казармы и базовую турель.
  attemptToBuild("barracks", 1);  // Строим казармы для производства юнитов
  attemptToBuild("turret", 1);    // Строим одну базовую турель для обороны
  
  // 3. Активный найм военной мощи:
  if (gameState.aiResources.gold > 150) {
    const barracksList = gameState.buildings.filter(b => 
      b.owner === "ai" && (b.type === "barracks" || b.type === "barracks2" || b.type === "barracks3")
    );
    if (barracksList.length > 0) {
      const surplusGold = gameState.aiResources.gold - 150;
      const goldPerBarracks = surplusGold / barracksList.length;
      
      barracksList.forEach(barrack => {
        let unitType;
        if (barrack.type === "barracks") {
          unitType = "fighter";
        } else if (barrack.type === "barracks2") {
          unitType = "assault";
        } else if (barrack.type === "barracks3") {
          unitType = "elite";
        }
        let cost;
        switch(unitType) {
          case "fighter": cost = FIGHTER_COST; break;
          case "assault": cost = ASSAULT_COST; break;
          case "elite": cost = ELITE_COST; break;
          default: cost = { gold: 0, silicon: 0, plasma: 0 };
        }
        if (goldPerBarracks >= cost.gold && canSpendResources(cost, "ai")) {
          aiHireMilitaryUnits(unitType, barrack);
        }
      });
    }
  }

  // 4. Переход в advancedEconomy происходит только если игра уже запущена (gameStarted === true)
  // и базовые здания ИИ (base, barracks и warehouse) созданы.
  if (gameStarted && hasBuilding("base", "ai") && hasBuilding("barracks", "ai") && hasBuilding("warehouse", "ai")) {
    aiPhase = PHASES.advancedEconomy;
    //console.log("Переход к фазе advancedEconomy");
  }
  break;




    case PHASES.advancedEconomy:
      // Строим улучшенные здания: base2, barracks2, turret2 и т.д.
      aiBuildImprovedBuildings();
      attemptToHireMilitaryUnits();
		 
      attemptToHireRepairman();
      reactToAttack();

      // Если построены улучшенные здания (например, base2 и barracks2), переключаемся на набор армии
      if (hasBuilding("base2", "ai") && hasBuilding("barracks2", "ai")) {
        aiPhase = PHASES.armyBuildUp;
        //console.log("Переход к фазе armyBuildUp");
      }
      break;

    case PHASES.armyBuildUp:
      // Продолжаем улучшать инфраструктуру и набираем военные единицы
      aiBuildImprovedBuildings();
      attemptToHireMilitaryUnits();
		  
      reactToAttack();

      // Если улучшенные здания (base3, barracks3) и достаточное количество турелей присутствуют,
      // а также ресурсы позволяют экспансию, переходим к фазе экспансии и активной атаки
      if (hasBuilding("base3", "ai") &&
          hasBuilding("barracks3", "ai") &&
          (hasBuilding("turret2", "ai") || hasBuilding("turret", "ai")) &&
          (gameState.aiResources.gold > MIN_GOLD_FOR_EXPANSION * 2)) {
        aiPhase = PHASES.expansionAndAttack;
        //console.log("Переход к фазе expansionAndAttack");
      }
      break;

    case PHASES.expansionAndAttack:
      // Фаза экспансии и атаки: обновляем экономику, продолжаем набор войск и запускаем атаки
      economicModule.update();
      attackModule.update();
      attemptToHireWorkers();
      attemptToHireRepairman();
      attemptToHireMilitaryUnits();
		  
      reactToAttack();

      // Если ИИ имеет численное преимущество, инициируем массовую атаку через безопасный маршрут
      if (aiMilitaryCount > playerMilitaryCount * 1.2) {
        const expansionTarget = findExpansionTarget();
        const safeRoute = calculateSafeAttackRoute(aiBase, expansionTarget);
        const attackGroup = formMixedAttackGroupDynamic();
        attackGroup.forEach(unit => {
          // Полностью очищаем очередь команд и задаем маршрут по безопасной схеме
          unit.commandQueue = [];
          safeRoute.forEach(point => {
            unit.commandQueue.push({ type: "move", x: point.x, y: point.y });
          });
          // Затем приступаем к атаке
          unit.commandQueue.push({ type: "attack", target: expansionTarget });
        });
      }
      break;

    default:
      //console.log("Фаза ИИ не распознана, выполняем стандартные действия.");
      break;
  }

  // 5. После выполнения тактических действий проверяем неэффективные здания и инициируем их продажу
  checkAndSellUnprofitableBuildings();
}


// Далее запускается основной цикл логики AI, например:
function gameLoopAI() {
  aiLogic();
  requestAnimationFrame(gameLoopAI);
	
}

// Отдельный таймер, который раз в 30 секунд сбрасывает защиту и перераспределяет гарнизоны
setInterval(() => {
  gameState.units.forEach(u => {
    if (
      (u.type === "fighter" || u.type === "assault" || u.type === "elite") &&
      u.defending &&
      u.commandQueue.length === 0 &&
      !u.attacking // добавляем проверку, что юнит не находится в активной атаке
    ) {
      u.defending = false;
    }
  });
  updateGarrisonAssignmentsClustered();
}, 60000);


// Первоначальное обновление гарнизонов и резерва

updateReservePool(20);


// Запускаем основной цикл логики AI
gameLoopAI();

// Регулярная адаптация
setInterval(analyzePlayerBehavior, 15000); 
setInterval(adaptDefenses, 20000);

