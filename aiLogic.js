

// --- Функция поиска оптимальной позиции для склада ---
function findOptimalWarehousePosition() {
  const index = buildSpatialIndex();
  let bestCell = null;
  let bestScore = -Infinity;
  const cols = Math.ceil(worldWidth / GRID_SIZE);
  const rows = Math.ceil(worldHeight / GRID_SIZE);
  
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const key = i + "_" + j;
      const cellObjects = index[key] || [];
      const cellCenter = { 
        x: i * GRID_SIZE + GRID_SIZE / 2, 
        y: j * GRID_SIZE + GRID_SIZE / 2 
      };
      const resourceDensity = evaluateResourceDensity(cellCenter.x, cellCenter.y, GRID_SIZE);
      const score = resourceDensity - cellObjects.length;
      
      if (score > bestScore && !isPositionInAnyBuildZone(cellCenter.x, cellCenter.y)) {
        bestScore = score;
        bestCell = { cellX: i, cellY: j };
      }
    }
  }
  
  if (bestCell) {
    return { 
      x: bestCell.cellX * GRID_SIZE + GRID_SIZE / 2, 
      y: bestCell.cellY * GRID_SIZE + GRID_SIZE / 2 
    };
  }
  return { x: worldWidth / 2, y: worldHeight / 2 };
}

// --- Функция поиска целевой точки экспансии по ресурсам ---
function findExpansionTarget() {
  let bestTarget = null;
  let bestScore = -Infinity;
  
  gameState.resources.forEach(resource => {
    if (resource.depleted) return;
    
    const cluster = gameState.resources.filter(r =>
      !r.depleted && Math.hypot(r.x - resource.x, r.y - resource.y) < RESOURCE_CLUSTER_RADIUS
    );
    
    let clusterScore = 0;
    cluster.forEach(r => { clusterScore += r.amount; });
    
    const nearestDistance = gameState.buildings
      .filter(b => b.owner === "ai")
      .reduce((min, b) => Math.min(min, Math.hypot(b.x - resource.x, b.y - resource.y)), Infinity);
    if (nearestDistance > MAX_EXPANSION_DISTANCE) return;
    
    const distanceFactor = nearestDistance / (nearestDistance + 100);
    const effectiveScore = clusterScore * distanceFactor;
    
    if (effectiveScore > bestScore) {
      bestScore = effectiveScore;
      bestTarget = { x: resource.x, y: resource.y };
    }
  });
  
  return bestTarget || { x: worldWidth / 2, y: worldHeight / 2 };
}

// --- Функция вычисления границ построек ИИ ---
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

// --- Функция вычисления границ маяков ИИ (если есть) ---
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

// --- Функция размещения здания для ИИ ---
function aiPlaceBuilding(buildingType, x, y) {
  let cost, buildingWidth, buildingHeight;
  switch (buildingType) {
    case "warehouse":
      cost = WAREHOUSE_COST;
      buildingWidth = 10; buildingHeight = 10;
      break;
    case "repairWorkshop":
      cost = REPAIR_WORKSHOP_COST;
      buildingWidth = 10; buildingHeight = 10;
      break;
    case "barracks":
      cost = BARRACKS_COST;
      buildingWidth = 15; buildingHeight = 15;
      break;
    case "turret":
      cost = TURRET_COST;
      buildingWidth = 12; buildingHeight = 12;
      break;
    case "beacon":
      cost = BEACON_COST;
      buildingWidth = 20; buildingHeight = 20;
      break;
    case "base2":
      cost = BASE2_COST;
      buildingWidth = 25; buildingHeight = 30;
      break;
    case "barracks2":
      cost = BARRACKS2_COST;
      buildingWidth = 25; buildingHeight = 15;
      break;
    case "turret2":
      cost = TURRET2_COST;
      buildingWidth = 15; buildingHeight = 17;
      break;
    case "base3":
      cost = BASE3_COST;
      buildingWidth = 30; buildingHeight = 30;
      break;
    case "barracks3":
      cost = BARRACKS3_COST;
      buildingWidth = 20; buildingHeight = 15;
      break;
    case "wall":
      cost = WALL_COST;
      buildingWidth = 40; buildingHeight = 10;
      break;
    default:
      //console.log("Неизвестный тип здания для ИИ:", buildingType);
      return false;
  }
  
  if (!canAfford(cost, "ai")) return false;
  
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
    if (rectsOverlap(newRect, bRect)) {
      //console.log("Нельзя строить: новое здание попадает в зону строительства существующего здания", b);
      return false;
    }
  }
  
  gameState.aiResources.gold -= cost.gold;
  gameState.aiResources.silicon -= cost.silicon;
  gameState.aiResources.plasma -= cost.plasma;
  updateResourceUI();
  
  const building = new Building(buildingType, "ai", x, y);
  gameState.buildings.push(building);
  
  if (buildingType === "turret" || buildingType === "turret2") {
    startTurretCycle(building);
  }
  
  return true;
}

// --- Функция найма рабочего для ИИ ---
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
  gameState.units.push(worker);
  
  moveUnit(worker, target.x, target.y, () => startWorkerCycle(worker, building));
}

// --- Функция оптимального выбора позиции для склада (заглушка) ---
function findOptimalWarehousePosition() {
  return { x: worldWidth / 2, y: worldHeight / 2 };
}

// --- Функции для попытки строительства склада и найма рабочих для ИИ ---
function attemptToBuildWarehouse() {
  if (countBuildings("warehouse", "ai") < DESIRED_WAREHOUSE_COUNT) {
    const pos = findOptimalWarehousePosition();
    if (pos && canAfford(WAREHOUSE_COST, "ai")) {
      if (aiPlaceBuilding("warehouse", pos.x, pos.y)) {
        //console.log("AI построил склад в оптимальной позиции", pos);
      }
    }
  }
}

function attemptToHireWorkers() {
  gameState.buildings
    .filter(b => b.owner === "ai" && b.type === "warehouse")
    .forEach(warehouse => {
      warehouse.workers = warehouse.workers || 0;
      while (warehouse.workers < DESIRED_WORKER_COUNT && canAfford(WORKER_COST, "ai")) {
        aiHireWorker(warehouse);
        //console.log("AI нанял рабочего для склада", warehouse);
      }
    });
}

// --- Функция найма ремонтника для ИИ ---
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
  gameState.units.push(repairman);
  moveUnit(repairman, target.x, target.y, () => startRepairCycle(repairman, repairWorkshop));
}

function attemptToHireRepairman() {
  gameState.buildings
    .filter(b => b.owner === "ai" && b.type === "repairWorkshop")
    .forEach(workshop => {
      while (workshop.repairman < workshop.capacity && canAfford(REPAIRMAN_COST, "ai")) {
        aiHireRepairMan(workshop);
        //console.log("AI нанял ремонтника для мастерской", workshop);
      }
    });
}

// --- Функция попытки постройки мастерской для ИИ ---
function attemptToBuildRepairWorkshop() {
  if (countBuildings("repairWorkshop", "ai") < DESIRED_REPAIR_WORKSHOP_COUNT) {
    const warehouses = gameState.buildings.filter(b => b.owner === "ai" && b.type === "warehouse");
    if (warehouses.length > 0) {
      const warehouse = warehouses[0];
      const pos = { x: warehouse.x + 50, y: warehouse.y };
      if (aiPlaceBuilding("repairWorkshop", pos.x, pos.y)) {
        //console.log("AI построил мастерскую в оптимальной позиции", pos);
      }
    }
  }
}

// --- Функция найма военного юнита для ИИ из здания-казармы ---
function aiHireMilitaryUnits(unitType, building) {
  let cost;
  switch (unitType) {
    case "fighter":
      cost = FIGHTER_COST;
      break;
    case "assault":
      cost = {
        gold: ASSAULT_COST.gold,
        silicon: ASSAULT_COST.silicon,
        plasma: ASSAULT_COST.plasma
      };
      break;
    case "elite":
      cost = {
        gold: ELITE_COST.gold,
        silicon: ELITE_COST.silicon,
        plasma: ELITE_COST.plasma
      };
      break;
    default:
      //console.log("Неизвестный тип военного юнита:", unitType);
      return false;
  }
  
  if (!canAfford(cost, "ai")) return false;
  
  gameState.aiResources.gold -= cost.gold;
  gameState.aiResources.silicon -= cost.silicon;
  gameState.aiResources.plasma -= cost.plasma;
  updateResourceUI();
  
  const { spawn, target } = spawnAtBoundary(building, 10);
  const unit = new Unit(unitType, "ai", spawn.x, spawn.y);
  unit.homeBuilding = building;
  gameState.units.push(unit);
  
  moveUnit(unit, target.x, target.y, () => {
    startFighterCycle(unit);
  });
  
  //console.log("AI нанял", unitType, "из здания", building);
  return true;
}

// --- Функция, которая перебирает казармы ИИ и пытается нанять военных юнитов ---
function attemptToHireMilitaryUnits() {
  const militaryBuildings = gameState.buildings.filter(b =>
    b.owner === "ai" &&
    (b.type === "barracks" || b.type === "barracks2" || b.type === "barracks3")
  );
  const capacity = 30; // Задаём "емкость" для каждого здания (например, 30 юнитов)
  
  militaryBuildings.forEach(building => {
    building.militaryCount = building.militaryCount || 0;
    
    while (building.militaryCount < capacity) {
      if (building.type === "barracks") {
        if (canAfford(FIGHTER_COST, "ai")) {
          if (aiHireMilitaryUnits("fighter", building)) {
            building.militaryCount++;
            //console.log("AI нанял fighter из здания", building);
          } else {
            break;
          }
        } else {
          break;
        }
      } else if (building.type === "barracks2") {
        if (canAfford(ASSAULT_COST, "ai")) {
          if (aiHireMilitaryUnits("assault", building)) {
            building.militaryCount++;
            //console.log("AI нанял assault из здания", building);
          } else {
            break;
          }
        } else {
          break;
        }
      } else if (building.type === "barracks3") {
        if (canAfford(ELITE_COST, "ai")) {
          if (aiHireMilitaryUnits("elite", building)) {
            building.militaryCount++;
            //console.log("AI нанял elite из здания", building);
          } else {
            break;
          }
        } else {
          break;
        }
      }
    }
  });
}

// --- Функции для кластеризации построек ИИ ---
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
  cluster.forEach(b => {
    sumX += b.x;
    sumY += b.y;
  });
  return { x: sumX / cluster.length, y: sumY / cluster.length };
}

// --- Функция формирования атакующей группы из кластера ---
function sendAttackGroupFromCluster(units, clusterCenter) {
  const target = playerBase;
  units.forEach((unit, index) => {
    let baseAngle = Math.atan2(target.y - clusterCenter.y, target.x - clusterCenter.x);
    let offset = ((index / units.length) - 0.5) * (Math.PI / 6); // ±15°
    let attackAngle = baseAngle + offset + (Math.random() - 0.5) * 0.1;
    let attackTarget = {
      x: target.x + Math.cos(attackAngle) * (50 + Math.random() * 50),
      y: target.y + Math.sin(attackAngle) * (50 + Math.random() * 50)
    };
    unit.commandQueue = [];
    unit.commandQueue.push({ type: "move", x: attackTarget.x, y: attackTarget.y });
    unit.commandQueue.push({ type: "attack", target: target });
  });
  //console.log("Массовая атака из кластера запущена в сторону базы игрока.");
}

// --- Функция формирования атакующей группы (общая) ---
function sendAttackGroup() {
  const attackGroup = gameState.units.filter(u =>
    u.owner === "ai" &&
    (u.type === "fighter" || u.type === "assault" || u.type === "elite") &&
    u.commandQueue.length === 0
  );
  if (attackGroup.length === 0) return;
  
  const target = playerBase;
  const randomOffset = { 
    x: (Math.random() - 0.5) * 100, 
    y: (Math.random() - 0.5) * 100 
  };
  const attackTarget = { x: target.x + randomOffset.x, y: target.y + randomOffset.y };
  
  attackGroup.forEach(unit => {
    unit.commandQueue = [];
    unit.commandQueue.push({ type: "move", x: attackTarget.x, y: attackTarget.y });
    unit.commandQueue.push({ type: "attack", target: target });
  });
  //console.log("Атакующая группа отправлена в сторону:", attackTarget);
}

// --- Функция распределения защитных войск по зданиям ---
function assignDefendersToBuildings() {
  const buildingsToDefend = gameState.buildings.filter(b =>
    b.owner === "ai" && (b.type === "warehouse" || b.type === "repairWorkshop" || b.type === "beacon")
  );
  buildingsToDefend.forEach(building => {
    const defenders = gameState.units.filter(u =>
      u.owner === "ai" &&
      (u.type === "fighter" || u.type === "assault" || u.type === "elite") &&
      Math.hypot(u.x - building.x, u.y - building.y) < DEFENSE_RADIUS
    );
    if (defenders.length < DESIRED_DEFENDERS_PER_BUILDING) {
      const freeUnits = gameState.units.filter(u =>
        u.owner === "ai" &&
        (u.type === "fighter" || u.type === "assault" || u.type === "elite") &&
        u.commandQueue.length === 0
      );
      const needed = DESIRED_DEFENDERS_PER_BUILDING - defenders.length;
      freeUnits.slice(0, needed).forEach(unit => {
        unit.commandQueue = [];
        const offsetX = (Math.random() - 0.5) * 20;
        const offsetY = (Math.random() - 0.5) * 20;
        unit.commandQueue.push({ type: "move", x: building.x + offsetX, y: building.y + offsetY });
        //console.log("Назначен защитник для здания", building);
      });
    }
  });
}

// --- Функция распределения войск по кластерам и массовой атаки ---
function aiMilitaryLogic() {
  assignDefendersToBuildings();
  
  const clusters = getBuildingClusters("ai");
  clusters.forEach(cluster => {
    const center = getClusterCenter(cluster);
    const clusterUnits = gameState.units.filter(u =>
      u.owner === "ai" &&
      (u.type === "fighter" || u.type === "assault" || u.type === "elite") &&
      Math.hypot(u.x - center.x, u.y - center.y) < CLUSTER_RADIUS
    );
    if (clusterUnits.length >= MIN_GARRISON_COUNT && clusterUnits.length <= MAX_GARRISON_COUNT) {
      sendAttackGroupFromCluster(clusterUnits, center);
    } else {
      clusterUnits.forEach(unit => {
        unit.commandQueue = [];
        const offsetX = (Math.random() - 0.5) * 20;
        const offsetY = (Math.random() - 0.5) * 20;
        unit.commandQueue.push({ type: "", x: center.x + offsetX, y: center.y + offsetY });
      });
      //console.log("Гарнизон сформирован в кластере у:", center);
    }
  });
  
  if (!aiMilitaryLogic.lastAttackTime) {
    aiMilitaryLogic.lastAttackTime = performance.now();
  }
  const now = performance.now();
  if (now - aiMilitaryLogic.lastAttackTime > 10000) {
    const freeUnits = gameState.units.filter(u =>
      u.owner === "ai" &&
      (u.type === "fighter" || u.type === "assault" || u.type === "elite") &&
      u.commandQueue.length === 0
    );
    if (freeUnits.length > 0) {
      const randomOffset = {
        x: (Math.random() - 0.5) * 100,
        y: (Math.random() - 0.5) * 100
      };
      const attackTarget = {
        x: playerBase.x + randomOffset.x,
        y: playerBase.y + randomOffset.y
      };
      freeUnits.forEach(unit => {
        unit.commandQueue = [];
        unit.commandQueue.push({ type: "move", x: attackTarget.x, y: attackTarget.y });
        unit.commandQueue.push({ type: "attack", target: playerBase });
      });
      //console.log("Небольшая группа атакующих юнитов отправлена в сторону базы игрока:", attackTarget);
    }
    aiMilitaryLogic.lastAttackTime = now;
  }
}

// ======================
// === Основная логика ИИ с интегрированной state machine ===
// ======================

// Глобальная переменная для отслеживания этапа ИИ
let aiPhase = "warehouses"; // Возможные: "warehouses", "repairWorkshop", "barracks", "turrets", "normal"

function aiLogic() {
  if (!aiBase) return;
  //console.log("AI logic executed, phase:", aiPhase);
  
  // Всегда пытаемся нанять рабочих для складов
  attemptToHireWorkers();

  // --- Этапы строительства (state machine) ---
  switch (aiPhase) {
    case "warehouses":
      // Если складов меньше 3, строим их по очереди
      if (countBuildings("warehouse", "ai") < 2) {
        if (canAfford(WAREHOUSE_COST, "ai")) {
          const pos = randomNearbyPosition(aiBase, 100);
          if (aiPlaceBuilding("warehouse", pos.x, pos.y)) {
            //console.log("AI построил склад. Осталось построить:", 2 - countBuildings("warehouse", "ai"));
          }
        }
        return;
      } else {
        aiPhase = "repairWorkshop";
        //console.log("Переход к этапу: repairWorkshop");
      }
      // fall-through
      
    case "repairWorkshop":
      if (!hasBuilding("repairWorkshop", "ai")) {
        if (canAfford(REPAIR_WORKSHOP_COST, "ai")) {
          const pos = randomNearbyPosition(aiBase, 100);
          if (aiPlaceBuilding("repairWorkshop", pos.x, pos.y)) {
            //console.log("AI построил мастерскую");
          }
        }
        return;
      }
      attemptToHireRepairman();
      const hasRepairman = gameState.units.some(u => u.owner === "ai" && u.type === "repairman");
      if (!hasRepairman) {
        return;
      }
      aiPhase = "barracks";
      //console.log("Переход к этапу: barracks");
      // fall-through
      
    case "barracks":
      if (!hasBuilding("barracks", "ai")) {
        if (canAfford(BARRACKS_COST, "ai")) {
          const pos = randomNearbyPosition(aiBase, 100);
          if (aiPlaceBuilding("barracks", pos.x, pos.y)) {
            //console.log("AI построил казарму после мастерской и найма ремонтника");
          }
        }
        return;
      }
      aiPhase = "turrets";
      //console.log("Переход к этапу: turrets");
      // fall-through
      
    case "turrets":
  // Проверяем, есть ли военные юниты (ганизон)
  const hasMilitaryUnit = gameState.units.some(u =>
    u.owner === "ai" &&
    (u.type === "fighter" || u.type === "assault" || u.type === "elite")
  );
  if (!hasMilitaryUnit) {
    // Если военных юнитов ещё нет, не ждём их появления бесконечно,
    // а переходим к нормальной логике, где будут запускаться наймы военных
    //console.log("Нет военных юнитов, переходим к нормальной логике. Военные будут набраны позже.");
    aiPhase = "normal";
    break;
  }
  // Если военные уже есть, пытаемся построить первую турель
  if (!hasBuilding("turret", "ai") && canAfford(TURRET_COST, "ai")) {
    const barracks = getBuilding("barracks", "ai");
    const pos = randomNearbyPosition(barracks, 100);
    if (aiPlaceBuilding("turret", pos.x, pos.y)) {
      //console.log("AI построил первую турель после казармы и найма военных");
    }
  }
  aiPhase = "normal";
  //console.log("Переход к этапу: normal");
  break;

      
    case "normal":
      // Базовая инфраструктура готова – переходим к дальнейшей логике
      break;
  }
  
  // --- Дальнейшая логика ИИ (на этапе normal) ---
  if (!hasBuilding("warehouse", "ai") && canAfford(WAREHOUSE_COST, "ai")) {
    const pos = randomNearbyPosition(aiBase, 100);
    if (aiPlaceBuilding("warehouse", pos.x, pos.y)) {
      //console.log("AI восстановил склад");
    }
  }
  if (!hasBuilding("repairWorkshop", "ai") && canAfford(REPAIR_WORKSHOP_COST, "ai")) {
    const pos = randomNearbyPosition(aiBase, 100);
    if (aiPlaceBuilding("repairWorkshop", pos.x, pos.y)) {
      //console.log("AI восстановил мастерскую");
    }
  }
  if (!hasBuilding("barracks", "ai") && canAfford(BARRACKS_COST, "ai")) {
    const pos = randomNearbyPosition(aiBase, 100);
    if (aiPlaceBuilding("barracks", pos.x, pos.y)) {
      //console.log("AI восстановил казарму");
    }
  }
  if (!hasBuilding("turret", "ai") && canAfford(TURRET_COST, "ai")) {
    const pos = randomNearbyPosition(aiBase, 100);
    if (aiPlaceBuilding("turret", pos.x, pos.y)) {
      //console.log("AI восстановил турель");
    }
  }
  if (!hasBuilding("beacon", "ai") && canAfford(BEACON_COST, "ai")) {
    const pos = randomNearbyPosition(aiBase, 100);
    if (aiPlaceBuilding("beacon", pos.x, pos.y)) {
     // console.log("AI восстановил маяк");
    }
  }
  if (!hasBuilding("base2", "ai") && canAfford(BASE2_COST, "ai")) {
    const pos = randomFarPosition(aiBase, 100);
    if (aiPlaceBuilding("base2", pos.x, pos.y)) {
      //console.log("AI восстановил базу2");
    }
  }
  if (!hasBuilding("barracks2", "ai") && canAfford(BARRACKS2_COST, "ai")) {
    const base2 = getBuilding("base2", "ai") || aiBase;
    const pos = randomNearbyPosition(base2, 100);
    if (aiPlaceBuilding("barracks2", pos.x, pos.y)) {
      //console.log("AI восстановил казарму2");
    }
  }
  if (!hasBuilding("turret2", "ai") && canAfford(TURRET2_COST, "ai")) {
    const barracks2 = getBuilding("barracks2", "ai") || aiBase;
    const pos = randomNearbyPosition(barracks2, 100);
    if (aiPlaceBuilding("turret2", pos.x, pos.y)) {
      //console.log("AI восстановил турель2");
    }
  }
  if (!hasBuilding("base3", "ai") && canAfford(BASE3_COST, "ai")) {
    const pos = randomFarPosition(aiBase, 100);
    if (aiPlaceBuilding("base3", pos.x, pos.y)) {
      //console.log("AI восстановил базу3");
    }
  }
  if (!hasBuilding("barracks3", "ai") && canAfford(BARRACKS3_COST, "ai")) {
    const base3 = getBuilding("base3", "ai") || aiBase;
    const pos = randomNearbyPosition(base3, 100);
    if (aiPlaceBuilding("barracks3", pos.x, pos.y)) {
      //console.log("AI восстановил казарму3");
    }
  }
  if (hasBuilding("base3", "ai") && canAfford(WALL_COST, "ai") && !hasBuilding("wall", "ai")) {
    const base3 = getBuilding("base3", "ai");
    const pos = calculateWallPosition(base3);
    if (aiPlaceBuilding("wall", pos.x, pos.y)) {
      //console.log("AI восстановил стену вокруг базы3");
    }
  }
  
  gameState.buildings.forEach(b => {
    if (b.owner === "ai" && (b.type === "base" || b.type === "warehouse" ||
        b.type === "repairWorkshop" || b.type === "base2" || b.type === "base3" || b.type === "beacon")) {
      const protectionRadius = 100;
      const nearbyTurrets = gameState.buildings.filter(t =>
        t.owner === "ai" &&
        (t.type === "turret" || t.type === "turret2") &&
        Math.hypot(t.x - b.x, t.y - b.y) < protectionRadius
      );
      if (nearbyTurrets.length === 0 && canAfford(TURRET_COST, "ai")) {
        const pos = randomNearbyPosition(b, protectionRadius);
        if (aiPlaceBuilding("turret", pos.x, pos.y)) {
          //console.log("AI построил дополнительную турель для защиты", b);
        }
      }
    }
  });
  
  attemptToBuildWarehouse();
  attemptToHireWorkers();
  attemptToBuildRepairWorkshop();
  attemptToHireRepairman();
  
  attemptToHireMilitaryUnits();
  
  aiMilitaryLogic();
  
  if (hasBuilding("warehouse", "ai") &&
      hasBuilding("repairWorkshop", "ai") &&
      !hasBuilding("barracks", "ai") &&
      canAfford(BARRACKS_COST, "ai")) {
    const pos = randomNearbyPosition(aiBase, 100);
    if (aiPlaceBuilding("barracks", pos.x, pos.y)) {
      //console.log("AI построил казарму");
    }
  }
  if (hasBuilding("barracks", "ai") && canAfford(TURRET_COST, "ai")) {
    const barracks = getBuilding("barracks", "ai");
    const pos = randomNearbyPosition(barracks, 100);
    if (aiPlaceBuilding("turret", pos.x, pos.y)) {
      //console.log("AI построил турель у казармы");
    }
  }
  if (hasBuilding("turret", "ai") &&
      !hasBuilding("beacon", "ai") &&
      canAfford(BEACON_COST, "ai")) {
    const pos = randomNearbyPosition(aiBase, 100);
    if (aiPlaceBuilding("beacon", pos.x, pos.y)) {
      //console.log("AI построил маяк");
    }
  }
  if (hasBuilding("beacon", "ai") &&
      !hasBuilding("base2", "ai") &&
      canAfford(BASE2_COST, "ai")) {
    const pos = randomFarPosition(aiBase, 100);
    if (aiPlaceBuilding("base2", pos.x, pos.y)) {
      //console.log("AI построил базу2");
    }
  }
  if (hasBuilding("base2", "ai") &&
      !hasBuilding("barracks2", "ai") &&
      canAfford(BARRACKS2_COST, "ai")) {
    const base2 = getBuilding("base2", "ai");
    const pos = randomNearbyPosition(base2, 100);
    if (aiPlaceBuilding("barracks2", pos.x, pos.y)) {
      //console.log("AI построил казарму2");
    }
  }
  if (hasBuilding("barracks2", "ai") && canAfford(TURRET2_COST, "ai")) {
    const barracks2 = getBuilding("barracks2", "ai");
    const pos = randomNearbyPosition(barracks2, 100);
    if (aiPlaceBuilding("turret2", pos.x, pos.y)) {
      //console.log("AI построил турель2 у казармы2");
    }
  }
  if (hasBuilding("base2", "ai") &&
      !hasBuilding("base3", "ai") &&
      canAfford(BASE3_COST, "ai")) {
    const pos = randomFarPosition(aiBase, 100);
    if (aiPlaceBuilding("base3", pos.x, pos.y)) {
      //console.log("AI построил базу3");
    }
  }
  if (hasBuilding("base3", "ai") &&
      !hasBuilding("barracks3", "ai") &&
      canAfford(BARRACKS3_COST, "ai")) {
    const base3 = getBuilding("base3", "ai");
    const pos = randomNearbyPosition(base3, 100);
    if (aiPlaceBuilding("barracks3", pos.x, pos.y)) {
      //console.log("AI построил казарму3");
    }
  }
  if (hasBuilding("base3", "ai") &&
      canAfford(WALL_COST, "ai") &&
      !hasBuilding("wall", "ai")) {
    const base3 = getBuilding("base3", "ai");
    const pos = calculateWallPosition(base3);
    if (aiPlaceBuilding("wall", pos.x, pos.y)) {
      //console.log("AI построил стену вокруг базы3");
    }
  }
  
  const expansionTarget = findExpansionTarget();
  if (expansionTarget) {
    const existingExpansion = gameState.buildings.filter(b =>
      b.owner === "ai" &&
      (b.type === "warehouse" || b.type === "repairWorkshop" || b.type === "beacon")
    );
    const tooClose = existingExpansion.some(b =>
      Math.hypot(b.x - expansionTarget.x, b.y - expansionTarget.y) < MIN_CLUSTER_DISTANCE
    );
    if (tooClose) {
      //console.log("Новая экспансия слишком близко к существующей инфраструктуре");
    } else {
      if (countBuildings("beacon", "ai") < DESIRED_BEACON_COUNT && canAfford(BEACON_COST, "ai")) {
        if (aiPlaceBuilding("beacon", expansionTarget.x, expansionTarget.y)) {
          //console.log("AI расширяется: построил маяк в зоне экспансии", expansionTarget);
        }
      }
      if (countBuildings("warehouse", "ai") < DESIRED_WAREHOUSE_COUNT && canAfford(WAREHOUSE_COST, "ai")) {
        if (aiPlaceBuilding("warehouse", expansionTarget.x + 50, expansionTarget.y + 50)) {
          //console.log("AI расширяется: построил склад в зоне экспансии", expansionTarget);
        }
      }
      if (countBuildings("repairWorkshop", "ai") < DESIRED_REPAIR_WORKSHOP_COUNT && canAfford(REPAIR_WORKSHOP_COST, "ai")) {
        if (aiPlaceBuilding("repairWorkshop", expansionTarget.x - 50, expansionTarget.y)) {
          //console.log("AI расширяется: построил мастерскую в зоне экспансии", expansionTarget);
        }
      }
      if (canAfford(TURRET_COST, "ai")) {
        if (aiPlaceBuilding("turret", expansionTarget.x - 100, expansionTarget.y)) {
          //console.log("AI расширяется: построил турель слева от экспансии", expansionTarget);
        }
        if (aiPlaceBuilding("turret", expansionTarget.x + 100, expansionTarget.y)) {
          //console.log("AI расширяется: построил турель справа от экспансии", expansionTarget);
        }
      }
    }
  }
}

let aiLogicInterval;
