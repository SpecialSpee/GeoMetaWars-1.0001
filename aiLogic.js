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



// Константы для тактических расстояний (эти значения можно корректировать по результатам тестирования)
const FLANK_OFFSET = 700;       // расстояние до позиции сбоку для фланговой атаки
const DIVERSION_OFFSET = 600;   // смещение для отвлекающего манёвра
const SAFE_DISTANCE = 400;      // дистанция для элитных юнитов (безопасное отступление)
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
  fighter: 20,
  assault: 15,
  elite: 10
};



const MIN_GOLD_FOR_EXPANSION = 90;
const MIN_SILICON_FOR_EXPANSION = 100;
const MIN_PLASMA_FOR_EXPANSION = 40;

const GREY_ZONE_RADIUS = 200;
const ENEMY_ACTIVITY_THRESHOLD = 0;

const DESIRED_WAREHOUSE_COUNT = 20;
const DESIRED_WORKER_COUNT = 5;
const DESIRED_REPAIR_WORKSHOP_COUNT = 3;
const DESIRED_REPAIRMAN_COUNT = 10;
const DESIRED_BEACON_COUNT = 10; // для маяков

const RESOURCE_CLUSTER_RADIUS = 100; // Радиус подсчёта кластера ресурсов
const MIN_CLUSTER_DISTANCE = 100;      // Минимальное расстояние между кластерами
const MAX_EXPANSION_DISTANCE = 100;   // Максимальное расстояние от существующей инфраструктуры для экспансии

const MIN_GARRISON_COUNT = 10;  // Минимальное число юнитов для массовой атаки из кластера
const MAX_GARRISON_COUNT = 50; // Если юнитов больше – часть остаётся в обороне
const CLUSTER_RADIUS = 100;    // Радиус для группировки построек в кластер

const DESIRED_DEFENDERS_PER_BUILDING = 4;
const DEFENSE_RADIUS = 200; // Радиус, в пределах которого считается, что здание защищено

const GARRISON_COUNT_PER_CLUSTER = MIN_GARRISON_COUNT; // число юнитов, которые должны оставаться в кластере для защиты

function canHireUnit(type) {
  const currentCount = gameState.units.filter(u => u.owner === "ai" && u.type === type).length;
  return currentCount < UNIT_LIMITS[type];
}


// Например, обновлённая функция getCachedObjectsInRange:
function getCachedObjectsInRange(range) {
  const cacheInterval = 100; // интервал кэширования в мс
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

function formMixedAttackGroupDynamic() {
  // Идеальный состав для базового уровня (минимум)
  const baseMix = { fighter: 3, assault: 2, elite: 1 };
  const freeReserve = getFreeReserveUnits();
  const totalFree = freeReserve.length;

  // Определяем коэффициент масштабирования: если свободных много – увеличиваем состав пропорционально,
  // но не меньше базового и не больше общего числа свободных юнитов
  const scale = totalFree / 6; // 6 – сумма базового состава
  // Например, если в резерве 12 юнитов, scale=2, значит идеальный состав удваивается

  // Для каждого типа вычисляем новое количество, округляя до целого числа, не менее базового
  const desiredMix = {
    fighter: Math.max(baseMix.fighter, Math.floor(baseMix.fighter * scale)),
    assault: Math.max(baseMix.assault, Math.floor(baseMix.assault * scale)),
    elite: Math.max(baseMix.elite, Math.floor(baseMix.elite * scale))
  };

  // Собираем группу согласно желаемой пропорции
  const group = [];
  // Группируем свободных юнитов по типу
  const grouped = freeReserve.reduce((acc, unit) => {
    acc[unit.type] = acc[unit.type] || [];
    acc[unit.type].push(unit);
    return acc;
  }, {});

  Object.keys(desiredMix).forEach(type => {
    const countNeeded = desiredMix[type];
    const available = grouped[type] || [];
    // Берём нужное число, но не больше, чем имеется
    const countToTake = Math.min(countNeeded, available.length);
    group.push(...available.slice(0, countToTake));
  });

  // Если группа всё ещё меньше 5, дополняем случайными юнитами из резерва
  const MIN_ATTACK_UNITS = 5;
  if (group.length < MIN_ATTACK_UNITS) {
    const additional = freeReserve.filter(u => !group.includes(u));
    group.push(...additional.slice(0, MIN_ATTACK_UNITS - group.length));
  }

  return group;
}

//////////////////////////////////////////////////////////////
// Функции очереди построек
function scheduleAIBuilding(type, x, y, delay = 2000) {
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
  // Мгновенная реакция: запускаем реакцию на атаку
  reactToAttack();
  // Дополнительно можно вызвать mobilizeDefendersAround(entity);
	mobilizeDefendersAround(entity)
  if (entity.health <= 0) {
    if (typeof handleEntityDestruction === "function") {
      handleEntityDestruction(entity);
    } else {
      console.log("Объект уничтожен:", entity);
    }
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
    if (!hasNearbyWalls(base, 50) && canAfford(WALL_COST, owner)) {
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
         // console.log(`Игрок построил стену для защиты базы ${base.type} в (${Math.round(wallX)}, ${Math.round(wallY)})`);
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
      console.log(`Мобилизация обороны вокруг (${Math.round(pos.x)}, ${Math.round(pos.y)}), врагов: ${enemyUnits.length}`);
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
  const queryRange = {
    x: target.x - GREY_ZONE_RADIUS,
    y: target.y - GREY_ZONE_RADIUS,
    width: GREY_ZONE_RADIUS * 2,
    height: GREY_ZONE_RADIUS * 2
  };
  // Если getCachedObjectsInRange возвращает null, используем [] по умолчанию
  const objectsInRange = getCachedObjectsInRange(queryRange) || [];
  const enemyCount = objectsInRange.filter(obj =>
    obj.owner === "player" &&
    Math.hypot(obj.x - target.x, obj.y - target.y) < GREY_ZONE_RADIUS
  ).length;
  return enemyCount > ENEMY_ACTIVITY_THRESHOLD;
}

// Экономическая экспансия и построение кластеров ресурсов
function buildClusterAt(target) {
  // Если точка уже помечена как неудачная – выходим
  if (failedClusters.some(pt => Math.hypot(pt.x - target.x, pt.y - target.y) < 10)) {
    return;
  }
  // Проверяем наличие хотя бы одного инфраструктурного объекта в радиусе 50 единиц
  const infraTypes = ["beacon", "warehouse", "repairWorkshop", "turret"];
  if (gameState.buildings.some(b =>
    b.owner === "ai" && infraTypes.includes(b.type) &&
    Math.hypot(b.x - target.x, b.y - target.y) < 50
  )) {
    return;
  }
  // Если ресурсов для маяка хватает, начинаем кластер с маяка
  if (!canAfford(BEACON_COST, "ai")) { return; }
  scheduleAIBuilding("beacon", target.x, target.y, 0);
  
  // Затем через небольшие интервалы строим остальные объекты кластера
  setTimeout(() => { if (canAfford(WAREHOUSE_COST, "ai")) scheduleAIBuilding("warehouse", target.x - 40, target.y, 0); }, 500);
  setTimeout(() => { if (canAfford(WAREHOUSE_COST, "ai")) scheduleAIBuilding("warehouse", target.x + 40, target.y, 0); }, 1000);
  setTimeout(() => { if (canAfford(REPAIR_WORKSHOP_COST, "ai")) scheduleAIBuilding("repairWorkshop", target.x, target.y + 40, 0); }, 1500);
  setTimeout(() => { if (canAfford(TURRET_COST, "ai")) scheduleAIBuilding("turret", target.x, target.y - 60, 0); }, 2000);
  setTimeout(() => { if (canAfford(TURRET_COST, "ai")) scheduleAIBuilding("turret", target.x - 60, target.y - 30, 0); }, 2500);
  setTimeout(() => { if (canAfford(TURRET_COST, "ai")) scheduleAIBuilding("turret", target.x + 60, target.y - 30, 0); }, 3000);
  
  // Помечаем ресурсы в этом кластере как исчерпанные
  gameState.resources.forEach(resource => {
    if (!resource.depleted && Math.hypot(resource.x - target.x, resource.y - target.y) < RESOURCE_CLUSTER_RADIUS) {
      resource.depleted = true;
    }
  });
}

//////////////////////////////////////////////////////////////
// Функции поиска целевых точек
function findOptimalWarehousePosition() {
  let bestPos = null;
  let bestScore = -Infinity;
  const step = 50;
  
  for (let x = step / 2; x < worldWidth; x += step) {
    for (let y = step / 2; y < worldHeight; y += step) {
      if (isPositionInAnyBuildZone(x, y)) continue;
      
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
  
  return bestPos || { x: worldWidth / 2, y: worldHeight / 2 };
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
  if (!hasBuilding("base2", "ai") && canAfford(BASE2_COST, "ai") && canBuild("base2")) {
    const pos = randomFarPosition(aiBase, 100);
    if (aiPlaceBuilding("base2", pos.x, pos.y)) {
      //console.log("Строится улучшенная база (base2) по координатам:", pos);
    }
  }
  if (!hasBuilding("barracks2", "ai") && canAfford(BARRACKS2_COST, "ai") && canBuild("barracks2")) {
    const reference = getBuilding("base2", "ai") || aiBase;
    const pos = randomNearbyPosition(reference, 100);
    if (aiPlaceBuilding("barracks2", pos.x, pos.y)) {
      //console.log("Строится улучшенная казарма (barracks2) по координатам:", pos);
    }
  }
  if (!hasBuilding("turret2", "ai") && canAfford(TURRET2_COST, "ai") && canBuild("turret2")) {
    const reference = getBuilding("base2", "ai") || aiBase;
    const pos = randomNearbyPosition(reference, 100);
    if (aiPlaceBuilding("turret2", pos.x, pos.y)) {
      //console.log("Строится улучшенная турель (turret2) по координатам:", pos);
    }
  }
  if (!hasBuilding("base3", "ai") && canAfford(BASE3_COST, "ai") && canBuild("base3")) {
    const pos = randomFarPosition(aiBase, 100);
    if (aiPlaceBuilding("base3", pos.x, pos.y)) {
      //console.log("Строится улучшенная база (base3) по координатам:", pos);
    }
  }
  if (!hasBuilding("barracks3", "ai") && canAfford(BARRACKS3_COST, "ai") && canBuild("barracks3")) {
    const reference = getBuilding("base3", "ai") || aiBase;
    const pos = randomNearbyPosition(reference, 100);
    if (aiPlaceBuilding("barracks3", pos.x, pos.y)) {
      //console.log("Строится улучшенная казарма (barracks3) по координатам:", pos);
    }
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
  const zoneMargin = 10;
  for (let b of gameState.buildings) {
    const bRect = { 
      left: b.x - b.width / 2 - zoneMargin, 
      top: b.y - b.height / 2 - zoneMargin, 
      right: b.x + b.width / 2 + zoneMargin, 
      bottom: b.y + b.height / 2 + zoneMargin 
    };
    if (rectsOverlap(newRect, bRect)) return false;
  }
  
  if (!canAfford(cost, "ai")) return false;
  
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


function attemptToBuildWarehouse() {
  if (countBuildings("warehouse", "ai") < DESIRED_WAREHOUSE_COUNT) {
    const pos = findOptimalWarehousePosition();
    if (pos && canAfford(WAREHOUSE_COST, "ai")) {
      aiPlaceBuilding("warehouse", pos.x, pos.y);
    }
  }
}

function attemptToHireWorkers() {
  gameState.buildings.filter(b => b.owner === "ai" && b.type === "warehouse")
    .forEach(warehouse => {
      warehouse.workers = warehouse.workers || 0;
      while (warehouse.workers < DESIRED_WORKER_COUNT && canAfford(WORKER_COST, "ai")) {
        aiHireWorker(warehouse);
      }
    });
}

function aiHireRepairMan(repairWorkshop) {
  if (repairWorkshop.repairman >= repairWorkshop.capacity) return;
  if (!canAfford(REPAIRMAN_COST, "ai")) return;
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

function attemptToHireRepairman() {
  gameState.buildings.filter(b => b.owner === "ai" && b.type === "repairWorkshop")
    .forEach(workshop => {
      while (workshop.repairman < workshop.capacity && canAfford(REPAIRMAN_COST, "ai")) {
        aiHireRepairMan(workshop);
      }
    });
}

function attemptToBuildRepairWorkshop() {
  if (countBuildings("repairWorkshop", "ai") < DESIRED_REPAIR_WORKSHOP_COUNT) {
    const warehouses = gameState.buildings.filter(b => b.owner === "ai" && b.type === "warehouse");
    if (warehouses.length > 0) {
      const warehouse = warehouses[0];
      const pos = { x: warehouse.x + 50, y: warehouse.y };
      aiPlaceBuilding("repairWorkshop", pos.x, pos.y);
    }
  }
}

function aiHireMilitaryUnits(unitType, building) {
  let cost;
  switch (unitType) {
    case "fighter":
      cost = FIGHTER_COST; break;
    case "assault":
      cost = ASSAULT_COST; break;
    case "elite":
      cost = ELITE_COST; break;
    default: return false;
  }
  
  if (!canAfford(cost, "ai")) return false;
  
  gameState.aiResources.gold -= cost.gold;
  gameState.aiResources.silicon -= cost.silicon;
  gameState.aiResources.plasma -= cost.plasma;
  updateResourceUI();
  
  const { spawn, target } = spawnAtBoundary(building, 10);
  const unit = new Unit(unitType, "ai", spawn.x, spawn.y);
  unit.homeBuilding = building;
  addUnit(unit);
  moveUnit(unit, target.x, target.y, () => startFighterCycle(unit));
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
  const angle = Math.random() * 2 * Math.PI;
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
      console.log(`Назначен защитник ${defender.type} для ${building.type} на (${Math.round(building.x)}, ${Math.round(building.y)})`);
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
  return (infraCount * 5) / militaryCount;
}
//////////////////////////////////////////////////////////////
// Функция расчёта безопасного маршрута атаки с обходом опасных зон
function calculateSafeAttackRoute(start, target, checkRadius = 550, enemyThreshold = 5) {
  const midPoint = { x: (start.x + target.x) / 2, y: (start.y + target.y) / 2 };
  const enemiesAtMid = getEnemiesInRange(midPoint, checkRadius).filter(e => e.owner === "player");
  if (enemiesAtMid.length >= enemyThreshold) {
    const dx = target.x - start.x;
    const dy = target.y - start.y;
    const length = Math.hypot(dx, dy);
    const perpX = -dy / length;
    const perpY = dx / length;
    const offsetMagnitude = 250;
    const safeMid = { x: midPoint.x + perpX * offsetMagnitude, y: midPoint.y + perpY * offsetMagnitude };
    const enemiesAtSafeMid = getEnemiesInRange(safeMid, checkRadius).filter(e => e.owner === "player");
    if (enemiesAtSafeMid.length < enemyThreshold) {
      return [safeMid, target];
    }
  }
  return [target];
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
    this.MIN_ATTACK_UNITS = 5;
    // Используем процент из общего резерва для атаки
    this.deployPercentage = 0.5;
    this.MAX_ATTACK_UNITS = 20;
    this.attackCooldown = 35000; // задержка между атаками (мс)
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
    const candidateTypes = ["warehouse", "repairWorkshop", "base", "base2", "base3", "barracks", "barracks2", "barracks3", "turret", "beacon"];
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
      console.log("Тактика: Прямая атака с индивидуальной перегруппировкой");
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
      console.log("Тактика: Фланговая атака с индивидуальной перегруппировкой");
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
      console.log("Тактика: Отвлекающий манёвр с индивидуальной перегруппировкой");
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
      console.log("Тактика: Гибридная (элитные держатся на SAFE_DISTANCE, остальные перегруппируются)");
      break;
  }
  this.lastAttackTime = performance.now();
}

// Функция проверки, что все ключевые здания имеют достаточный гарнизон
function allKeyBuildingsGarrisoned() {
  // Задаём типы зданий, для которых требуется наличие гарнизона
  const keyTypes = ["warehouse", "repairWorkshop", "beacon", "base", "base2", "base3", "barracks", "barracks2", "barracks3"];
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

// Начальный этап: гарантированное строительство 3 складов и 1 мастерской
function ensureInitialInfrastructure() {
  // Добавляем 3 задания на строительство склада, если их ещё нет
  if (countBuildings("warehouse", "ai") < 3 && canAfford(WAREHOUSE_COST, "ai")) {
    for (let i = 0; i < 3 - countBuildings("warehouse", "ai"); i++) {
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


// Функция обновления гарнизонного состава для каждого ключевого здания
// Функция обновления гарнизонных назначений с использованием процентного отбора из свободного резерва
function updateGarrisonAssignments() {
  const freeReserve = getFreeReserveUnits();
  const reserveDeployPercentage = 0.3;
  const maxDefendersFromReserve = Math.floor(freeReserve.length * reserveDeployPercentage);
  
  // Ключевые здания для защиты
  const keyBuildings = gameState.buildings.filter(b =>
    b.owner === "ai" && ["warehouse", "repairWorkshop", "beacon", "base", "base2", "base3", "barracks", "barracks2", "barracks3"].includes(b.type)
  );
  
  keyBuildings.forEach(building => {
    const currentDefenders = gameState.units.filter(u =>
      u.owner === "ai" && u.defending &&
      Math.hypot(u.x - building.x, u.y - building.y) < DEFENSE_RADIUS
    );
    const desired = DESIRED_DEFENDERS_PER_BUILDING;
    const missing = desired - currentDefenders.length;
    if (missing > 0) {
      const availableForAssignment = getFreeReserveUnits();
      const toAssign = availableForAssignment.slice(0, Math.min(missing, maxDefendersFromReserve));
      toAssign.forEach(unit => {
        unit.commandQueue = [];
        unit.defending = true;
        const offsetX = (Math.random() - 0.5) * 40;
        const offsetY = (Math.random() - 0.5) * 40;
        unit.commandQueue.push({ type: "move", x: building.x + offsetX, y: building.y + offsetY });
        console.log(`Назначен ${unit.type} для защиты ${building.type} на (${Math.round(building.x)}, ${Math.round(building.y)})`);
      });
    }
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
function updateReservePool(threshold = 30) {
  const reserve = getFreeReserveUnits();
  if (reserve.length < threshold) {
    //console.log(`Резерв свободных юнитов (${reserve.length}) ниже порога ${threshold}. Попытка нанять новые военные юниты.`);
    attemptToHireMilitaryUnits();
  }
}

// Основная логика ИИ с проверкой гарнизонов и развитием базы
// Функция для проверки, заполнен ли резерв (минимум threshold свободных юнитов)
function isReserveFull(threshold = 30) {
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

function updateGarrisonAssignmentsClustered() {
  // Получаем общий резерв свободных боевых юнитов (без уже назначенных)
  const freeReserveUnits = getFreeReserveUnits();
  const totalFreeReserve = freeReserveUnits.length;
  // Глобальный лимит для защиты – 40 % от общего резерва
  const globalDefenderLimit = Math.floor(totalFreeReserve * 0.4);

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
        console.log(`Назначен ${unit.type} для защиты ${building.type} на (${Math.round(building.x)}, ${Math.round(building.y)})`);
      });
      totalAssignedGlobal += unitsToAssign.length;
      // Если после назначения защитников для здания требуемое число достигнуто, блокируем его гарнизон
      if (buildingDefenders.length + toAssignCount >= DESIRED_DEFENDERS_PER_BUILDING) {
        building.garrisonLocked = true;
      }
    });
  });
}

function formMixedAttackGroup() {
  // Идеальный состав атакующей группы: 3 fighter, 2 assault, 1 elite.
  const desiredMix = { fighter: 3, assault: 2, elite: 1 };
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
  const factor = Math.max(1, performance.now() / 60000);
  return {
    fighter: Math.floor(baseValues.fighter * factor),
    assault: Math.floor(baseValues.assault * factor),
    elite: Math.floor(baseValues.elite * factor)
  };
}

function attemptToHireMilitaryUnits() {
  const desiredReserve = calculateDesiredReserve();
  const militaryBuildings = gameState.buildings.filter(b =>
    b.owner === "ai" && (b.type === "barracks" || b.type === "barracks2" || b.type === "barracks3")
  );
  
  militaryBuildings.forEach(building => {
    let unitType, cost;
    if (building.type === "barracks") {
      unitType = "fighter";
      cost = FIGHTER_COST;
      // Ограничение: если уже достаточно fighter, переходите к следующему зданию
      if (gameState.units.filter(u => u.owner === "ai" && u.type === "fighter").length > UNIT_LIMITS.fighter * 0.8) {
        return;
      }
    } else if (building.type === "barracks2") {
      unitType = "assault";
      cost = ASSAULT_COST;
		if (gameState.units.filter(u => u.owner === "ai" && u.type === "assault").length > UNIT_LIMITS.assault * 0.6) {
        return;
      }
    } else if (building.type === "barracks3") {
      unitType = "elite";
      cost = ELITE_COST;
		if (gameState.units.filter(u => u.owner === "ai" && u.type === "elite").length > UNIT_LIMITS.elite * 0.4) {
        return;
      }
    }
    
    while (canAfford(cost, "ai") && canHireUnit(unitType)) {
      if (!aiHireMilitaryUnits(unitType, building)) break;
    }
  });
}


function attemptToBuild(buildingType, requiredCount) {
  // Если количество зданий ниже требуемого, попытаемся построить новое
  if (countBuildings(buildingType, "ai") < requiredCount) {
    const pos = randomNearbyPosition(aiBase, 130);
    scheduleAIBuilding(buildingType, pos.x, pos.y, 0);
  }
}


function aiLogic() {
  // Обновляем очередь построек, защиту и атаки
  processBuildQueue();
  defenseModule.update();
  attackModule.update();

  switch (aiPhase) {
    case PHASES.initialEconomy:
      // Фаза начальной экономики: строим 2 склада, 1 ремонтную мастерскую и нанимаем рабочих
      ensureInitialInfrastructure();
      attemptToHireWorkers();
		  attemptToHireRepairman();
		  reactToAttack();
      // Если инфраструктура достигнута, переходим к базовой защите
      if (countBuildings("warehouse", "ai") >= 2 && hasBuilding("repairWorkshop", "ai")) {
        aiPhase = PHASES.basicDefense;
        console.log("Переход к фазе basicDefense");
      }
      break;

    case PHASES.basicDefense:
      // Фаза базовой защиты: строим казармы, турели и нанимаем минимальный гарнизон
      attemptToBuild("barracks", 1);
      attemptToBuild("turret", 2);
      attemptToHireMilitaryUnits();
		  reactToAttack();
      // Если все ключевые здания защищены, переходим к улучшению инфраструктуры
      //if (allKeyBuildingsGarrisoned()) {
        aiPhase = PHASES.advancedEconomy;
      //  console.log("Переход к фазе advancedEconomy");
      //}
      //break;

    case PHASES.advancedEconomy:
      // Фаза улучшения инфраструктуры: строим улучшенные здания (base2, barracks2, turret2)
      aiBuildImprovedBuildings();
		  attemptToHireMilitaryUnits();
		  reactToAttack();
      // Если улучшенные здания (например, base2 и barracks2) построены, переходим к набору армии
      if (hasBuilding("base2", "ai") && hasBuilding("barracks2", "ai")) {
        aiPhase = PHASES.armyBuildUp;
        console.log("Переход к фазе armyBuildUp");
      }
      break;

    case PHASES.armyBuildUp:
		  aiBuildImprovedBuildings()
      // Фаза набора армии: нанимаем военные юниты
      attemptToHireMilitaryUnits();
		  reactToAttack();
      // При условии наличия улучшенных зданий (base3, barracks3, и хотя бы turret2 или turret3)
      // и достаточного количества ресурсов, переходим к экспансии и активной атаке
      if (hasBuilding("base3", "ai") &&
          hasBuilding("barracks3", "ai") &&
          (hasBuilding("turret2", "ai") || hasBuilding("turret3", "ai")) &&
          (gameState.aiResources.gold > MIN_GOLD_FOR_EXPANSION * 2)) {
        aiPhase = PHASES.expansionAndAttack;
        console.log("Переход к фазе expansionAndAttack");
      }
      break;

    case PHASES.expansionAndAttack:
      // Фаза экспансии и атаки: обновляем инфраструктуру, выполняем атаки и продолжаем набор армии
      economicModule.update();
      attackModule.update();
      attemptToHireWorkers();
      attemptToHireRepairman();
      attemptToHireMilitaryUnits();
		  reactToAttack();
      break;

    default:
      // Если фаза не распознана – можно задать дефолтные действия
      console.log("Фаза ИИ не распознана, выполняем стандартные действия.");
      break;
  }
  
  // Дополнительные обновления: перераспределение защитников и проверка резерва
  //updateGarrisonAssignments();
  //updateReservePool(30);
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
}, 30000);


// Первоначальное обновление гарнизонов и резерва
updateGarrisonAssignments();
updateReservePool(30);


// Запускаем основной цикл логики AI
gameLoopAI();


