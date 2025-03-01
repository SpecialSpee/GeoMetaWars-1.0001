// aiLogic.js
// Полный обновлённый файл для AI с системой зависимостей, экспансией по ресурсным кластерам
// и восстановлением базовой инфраструктуры через state machine.

// Предполагается, что глобальные переменные и функции уже определены:
// gameState, aiBase, playerBase, aiPhase, canAfford, aiPlaceBuilding,
// randomFarPosition, randomNearbyPosition, hasBuilding, getBuilding, buildSpatialIndex,
// evaluateResourceDensity, isPositionInAnyBuildZone, rectsOverlap, updateResourceUI,
// attemptToHireWorkers, attemptToHireRepairman, attemptToHireMilitaryUnits,
// spawnAtBoundary, moveUnit, startWorkerCycle, startRepairCycle, dynamicAttack, dynamicAttackAssault,
// dynamicAttackElite, startRepairProcess, getEnemiesInRange, and соответствующие константы.

// ===========================
// --- Функция построения кластера ресурсов ---
// ===========================
let failedClusters = []; // Глобальный массив для неудачных точек

function buildClusterAt(target) {
  // Если эта точка уже помечена как неудачная, не пытаемся снова
  if (failedClusters.some(pt => Math.hypot(pt.x - target.x, pt.y - target.y) < 50)) {
    console.log("Эта точка уже помечена как неудачная:", target);
    return;
  }
  
  // Проверяем, достаточно ли ресурсов для маяка
  if (!canAfford(BEACON_COST, "ai")) {
    console.log("Недостаточно ресурсов для маяка");
    return;
  }
  
  // Пытаемся построить маяк
  const beaconBuilt = aiPlaceBuilding("beacon", target.x, target.y);
  if (!beaconBuilt) {
    console.log("Не удалось построить маяк в точке:", target);
    failedClusters.push({ x: target.x, y: target.y });
    return;
  }
  
  console.log("Маяк построен в точке:", target);
  
  // Постепенное строительство остальных объектов кластера с задержками
  setTimeout(() => {
    if (canAfford(WAREHOUSE_COST, "ai")) {
      aiPlaceBuilding("warehouse", target.x - 40, target.y);
    }
  }, 500);
  
  setTimeout(() => {
    if (canAfford(WAREHOUSE_COST, "ai")) {
      aiPlaceBuilding("warehouse", target.x + 40, target.y);
    }
  }, 1000);
  
  setTimeout(() => {
    if (canAfford(REPAIR_WORKSHOP_COST, "ai")) {
      aiPlaceBuilding("repairWorkshop", target.x, target.y + 40);
    }
  }, 1500);
  
  setTimeout(() => {
    if (canAfford(TURRET_COST, "ai")) {
      aiPlaceBuilding("turret", target.x, target.y - 60);
    }
  }, 2000);
  
  setTimeout(() => {
    if (canAfford(TURRET_COST, "ai")) {
      aiPlaceBuilding("turret", target.x - 60, target.y - 30);
    }
  }, 2500);
  
  setTimeout(() => {
    if (canAfford(TURRET_COST, "ai")) {
      aiPlaceBuilding("turret", target.x + 60, target.y - 30);
    }
  }, 3000);
  
  console.log("Начато последовательное строительство кластера в точке:", target);
  
  // Помечаем ресурсы в данной области как использованные
  gameState.resources.forEach(resource => {
    if (!resource.depleted && Math.hypot(resource.x - target.x, resource.y - target.y) < RESOURCE_CLUSTER_RADIUS) {
      resource.depleted = true;
    }
  });
}

// ===========================
// --- Функции поиска целевой точки ---
// ===========================
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

function findExpansionTarget() {
  let bestTarget = null;
  let bestScore = -Infinity;
  
  // Опорная точка: крайнее строение (маяк), если оно есть, иначе база
  let referencePoint = aiBase;
  const beacons = gameState.buildings.filter(b => b.owner === "ai" && b.type === "beacon");
  if (beacons.length > 0) {
    referencePoint = beacons.reduce((farthest, b) => {
      return (Math.hypot(b.x - aiBase.x, b.y - aiBase.y) >
              Math.hypot(farthest.x - aiBase.x, farthest.y - aiBase.y))
             ? b : farthest;
    }, aiBase);
  }
  
  gameState.resources.forEach(resource => {
    if (resource.depleted) return;
    
    // Вычисляем расстояние от ресурса до referencePoint
    const distance = Math.hypot(resource.x - referencePoint.x, resource.y - referencePoint.y);
    
    // Вместо жёсткого ограничения, используем коэффициент штрафа, если ресурс далеко
    const penalty = distance > MAX_EXPANSION_DISTANCE ? (MAX_EXPANSION_DISTANCE / distance) : 1;
    
    // Формируем кластер вокруг данного ресурса
    const cluster = gameState.resources.filter(r =>
      !r.depleted && Math.hypot(r.x - resource.x, r.y - resource.y) < RESOURCE_CLUSTER_RADIUS
    );
    
    let clusterScore = 0;
    cluster.forEach(r => {
      clusterScore += r.amount;
    });
    
    // Также можно учитывать расстояние до ближайшего здания ИИ
    const nearestDistance = gameState.buildings
      .filter(b => b.owner === "ai")
      .reduce((min, b) => Math.min(min, Math.hypot(b.x - resource.x, b.y - resource.y)), Infinity);
    
    // Если ресурс сильно отдалён, применяем дополнительный штраф
    const distanceFactor = nearestDistance > MAX_EXPANSION_DISTANCE ? (MAX_EXPANSION_DISTANCE / nearestDistance) : 1;
    
    const effectiveScore = clusterScore * penalty * distanceFactor;
    
    if (effectiveScore > bestScore) {
      bestScore = effectiveScore;
      bestTarget = { x: resource.x, y: resource.y };
    }
  });
  
  // Если ни один ресурс не дал положительную оценку, возвращаем referencePoint
  return bestTarget || { x: referencePoint.x, y: referencePoint.y };
}


// ===========================
// --- Функции для границ, найма и строительства ---
// ===========================
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

function attemptToBuildWarehouse() {
  if (countBuildings("warehouse", "ai") < DESIRED_WAREHOUSE_COUNT) {
    const pos = findOptimalWarehousePosition();
    if (pos && canAfford(WAREHOUSE_COST, "ai")) {
      aiPlaceBuilding("warehouse", pos.x, pos.y);
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
  gameState.units.push(repairman);
  moveUnit(repairman, target.x, target.y, () => startRepairCycle(repairman, repairWorkshop));
}

function attemptToHireRepairman() {
  gameState.buildings
    .filter(b => b.owner === "ai" && b.type === "repairWorkshop")
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
      cost = FIGHTER_COST;
      break;
    case "assault":
      cost = { gold: ASSAULT_COST.gold, silicon: ASSAULT_COST.silicon, plasma: ASSAULT_COST.plasma };
      break;
    case "elite":
      cost = { gold: ELITE_COST.gold, silicon: ELITE_COST.silicon, plasma: ELITE_COST.plasma };
      break;
    default:
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
  
  moveUnit(unit, target.x, target.y, () => startFighterCycle(unit));
  return true;
}

function attemptToHireMilitaryUnits() {
  const militaryBuildings = gameState.buildings.filter(b =>
    b.owner === "ai" &&
    (b.type === "barracks" || b.type === "barracks2" || b.type === "barracks3")
  );
  const capacity = 30;
  
  militaryBuildings.forEach(building => {
    building.militaryCount = building.militaryCount || 0;
    
    while (building.militaryCount < capacity) {
      if (building.type === "barracks") {
        if (canAfford(FIGHTER_COST, "ai")) {
          if (aiHireMilitaryUnits("fighter", building)) {
            building.militaryCount++;
          } else break;
        } else break;
      } else if (building.type === "barracks2") {
        if (canAfford(ASSAULT_COST, "ai")) {
          if (aiHireMilitaryUnits("assault", building)) {
            building.militaryCount++;
          } else break;
        } else break;
      } else if (building.type === "barracks3") {
        if (canAfford(ELITE_COST, "ai")) {
          if (aiHireMilitaryUnits("elite", building)) {
            building.militaryCount++;
          } else break;
        } else break;
      }
    }
  });
}

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
}

function sendAttackGroupFromCluster(units, clusterCenter) {
  const target = playerBase;
  units.forEach((unit, index) => {
    let baseAngle = Math.atan2(target.y - clusterCenter.y, target.x - clusterCenter.x);
    let offset = ((index / units.length) - 0.5) * (Math.PI / 6);
    let attackAngle = baseAngle + offset + (Math.random() - 0.5) * 0.1;
    let attackTarget = {
      x: target.x + Math.cos(attackAngle) * (50 + Math.random() * 50),
      y: target.y + Math.sin(attackAngle) * (50 + Math.random() * 50)
    };
    unit.commandQueue = [];
    unit.commandQueue.push({ type: "move", x: attackTarget.x, y: attackTarget.y });
    unit.commandQueue.push({ type: "attack", target: target });
  });
}

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
      });
    }
  });
}

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
    if (clusterUnits.length > GARRISON_COUNT_PER_CLUSTER) {
      const attackers = clusterUnits.slice(GARRISON_COUNT_PER_CLUSTER);
      sendAttackGroupFromCluster(attackers, center);
      console.log("Гарнизон в кластере оставлен:", clusterUnits.slice(0, GARRISON_COUNT_PER_CLUSTER));
    } else {
      clusterUnits.forEach(unit => {
        unit.commandQueue = [];
      });
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
      const attackTarget = { x: playerBase.x + randomOffset.x, y: playerBase.y + randomOffset.y };
      freeUnits.forEach(unit => {
        unit.commandQueue = [];
        unit.commandQueue.push({ type: "move", x: attackTarget.x, y: attackTarget.y });
        unit.commandQueue.push({ type: "attack", target: playerBase });
      });
    }
    aiMilitaryLogic.lastAttackTime = now;
  }
}

function processCommandQueue(unit) {
  if (!unit.commandQueue || unit.commandQueue.length === 0) {
    if (
      (unit.type === "fighter" || unit.type === "assault" || unit.type === "elite") &&
      getEnemiesInRange({ x: unit.x, y: unit.y }, unit.range)
        .filter(e => e.owner !== unit.owner && e.health > 0).length > 0
    ) {
      requestAnimationFrame(function cycle() {
        if (unit.commandQueue.length === 0 &&
            (unit.type === "fighter" || unit.type === "assault" || unit.type === "elite")) {
          const enemies = getEnemiesInRange({ x: unit.x, y: unit.y }, unit.range)
                          .filter(e => e.owner !== unit.owner && e.health > 0);
          if (enemies.length > 0) {
            let newTarget = unit.target;
            if (!newTarget || newTarget.health <= 0) {
              newTarget = enemies[0];
              unit.target = newTarget;
            }
            if (unit.type === "assault") {
              dynamicAttackAssault(unit, newTarget, 1 / 60);
            } else if (unit.type === "elite") {
              dynamicAttackElite(unit, newTarget, 1 / 60);
            } else {
              dynamicAttack(unit, newTarget, 1 / 60);
            }
            requestAnimationFrame(cycle);
          }
        }
      });
    }
    return;
  }
  
  unit.maneuvering = false;
  const command = unit.commandQueue.shift();
  
  if (!command) return;
  
  if (!command.type || command.type === "") {
    processCommandQueue(unit);
    return;
  }
  
  if (command.type === "move") {
    moveUnit(unit, command.x, command.y, () => {
      unit.idleTimer = 0;
      processCommandQueue(unit);
    });
  } else if (command.type === "attack") {
    if (!command.target || command.target.health <= 0) {
      processCommandQueue(unit);
      return;
    }
    unit.target = command.target;
    if (unit.type === "elite") {
      dynamicAttackElite(unit, command.target, 1 / 60);
    } else if (unit.type === "assault") {
      dynamicAttackAssault(unit, command.target, 1 / 60);
    } else if (unit.type === "fighter") {
      dynamicAttack(unit, command.target, 1 / 60);
    } else {
      moveUnit(unit, command.target.x, command.target.y, () => processCommandQueue(unit));
      return;
    }
    requestAnimationFrame(() => processCommandQueue(unit));
  } else if (command.type === "gather") {
    const resource = command.resource;
    moveUnit(unit, resource.x, resource.y, () => {
      if (resource.amount > 0) {
        resource.amount--;
        unit.carrying = (unit.carrying || 0) + 1;
      }
      const deliveryBuilding = findNearestDeliveryBuilding(unit.x, unit.y, unit.owner);
      if (deliveryBuilding) {
        moveUnit(unit, deliveryBuilding.x, deliveryBuilding.y, () => {
          if (unit.carrying > 0) {
            if (unit.owner === "player")
              gameState.playerResources[resource.type] += unit.carrying;
            else
              gameState.aiResources[resource.type] += unit.carrying;
            unit.carrying = 0;
          }
          if (resource.amount > 0) {
            unit.commandQueue.unshift({ type: "gather", resource: resource });
          }
          processCommandQueue(unit);
        });
      } else {
        if (resource.amount > 0) {
          unit.commandQueue.unshift({ type: "gather", resource: resource });
        }
        processCommandQueue(unit);
      }
    });
  } else if (command.type === "repair") {
    console.log("Получена команда ремонта для объекта", command.target);
    if (unit.inWorkshop) {
      const exitOffset = 20;
      const angle = Math.random() * Math.PI * 2;
      const exitX = command.workshop.x + exitOffset * Math.cos(angle);
      const exitY = command.workshop.y + exitOffset * Math.sin(angle);
      animateMoveAndScale(unit, exitX, exitY, 1, 1000, () => {
        unit.hidden = false;
        unit.inWorkshop = null;
        moveUnit(unit, command.target.x, command.target.y, () => {
          startRepairProcess(unit, command);
        });
      });
    } else {
      const distanceToWorkshop = Math.hypot(unit.x - command.workshop.x, unit.y - command.workshop.y);
      if (distanceToWorkshop > 10) {
        moveUnit(unit, command.workshop.x, command.workshop.y, () => {
          moveUnit(unit, command.target.x, command.target.y, () => {
            startRepairProcess(unit, command);
          });
        });
      } else {
        moveUnit(unit, command.target.x, command.target.y, () => {
          startRepairProcess(unit, command);
        });
      }
    }
  }
}

const ENEMY_ACTIVITY_THRESHOLD = 5;
const GREY_ZONE_RADIUS = 200;

function isGreyZone(target) {
  const enemyUnits = gameState.units.filter(u =>
    u.owner === "player" && Math.hypot(u.x - target.x, u.y - target.y) < GREY_ZONE_RADIUS
  );
  const enemyBuildings = gameState.buildings.filter(b =>
    b.owner === "player" && Math.hypot(b.x - target.x, b.y - target.y) < GREY_ZONE_RADIUS
  );
  return (enemyUnits.length + enemyBuildings.length) > ENEMY_ACTIVITY_THRESHOLD;
}

let aiLogicInterval;

// ===========================
// --- Модули ИИ ---
// ===========================
if (typeof EconomicExpansionModule === 'undefined') {
  class EconomicExpansionModule {
    constructor(gameState, aiBase) {
      this.gameState = gameState;
      this.aiBase = aiBase;
    }
    
    planExpansion() {
      // Используем оригинальную функцию для выбора ресурсного кластера
      return findExpansionTarget();
    }
    
    buildInfrastructure() {
      const target = this.planExpansion();
      if (!target) return;
      
      // Если рядом с целевой точкой уже есть маяк, считаем, что этот кластер обслуживается
      if (this.gameState.buildings.some(b => 
            b.owner === "ai" && b.type === "beacon" &&
            Math.hypot(b.x - target.x, b.y - target.y) < 50)) {
        return;
      }
      
      // Строим кластер прямо в выбранной точке ресурса
      buildClusterAt(target);
    }
    
    update() {
      if (
        canAfford(WAREHOUSE_COST, "ai") ||
        canAfford(REPAIR_WORKSHOP_COST, "ai") ||
        canAfford(BEACON_COST, "ai")
      ) {
        this.buildInfrastructure();
      }
    }
  }
  
 class DefenseModule {
  constructor(gameState) {
    this.gameState = gameState;
    this.lastAssignmentTime = 0; // время последнего обновления защитных мер
    // Радиус, в пределах которого оценивается угроза и назначаются защитники
    this.defenseRadius = DEFENSE_RADIUS; 
    // Минимальное количество защитников, которые должны находиться рядом с объектом
    this.desiredDefenders = DESIRED_DEFENDERS_PER_BUILDING;
  }
  
  // Функция динамического перераспределения защитных сил для всех стратегических объектов
  assignDynamicDefenders() {
    const currentTime = performance.now();
    // Обновление не чаще, чем раз в 20 секунд для экономии вычислений
    if (currentTime - this.lastAssignmentTime < 2000) return;
    this.lastAssignmentTime = currentTime;
    
    // Собираем все стратегические объекты: здания, рабочие и ремонтные юниты
    const strategicEntities = [
      ...this.gameState.buildings.filter(b => b.owner === "ai"),
      ...this.gameState.units.filter(u =>
          u.owner === "ai" && (u.type === "worker" || u.type === "repairman")
      )
    ];
    
    strategicEntities.forEach(entity => {
      // Позиция объекта (для зданий и мобильных юнитов)
      const pos = { x: entity.x, y: entity.y };

      // Оцениваем угрозу: считаем количество вражеских юнитов в заданном радиусе
      const enemyUnits = this.gameState.units.filter(u =>
        u.owner === "player" && Math.hypot(u.x - pos.x, u.y - pos.y) < this.defenseRadius
      );
      const threatLevel = enemyUnits.length;
      
      // Определяем количество уже назначенных защитников (боевые юниты)
      const defenders = this.gameState.units.filter(u =>
        u.owner === "ai" &&
        (u.type === "fighter" || u.type === "assault" || u.type === "elite") &&
        Math.hypot(u.x - pos.x, u.y - pos.y) < this.defenseRadius
      );
      
      // Расчитываем, сколько дополнительных защитников нужно:
      // базовое требование плюс дополнительное число в зависимости от угрозы
      const additionalNeeded = Math.max(this.desiredDefenders - defenders.length, 0) + Math.floor(threatLevel / 2);
      
      if (additionalNeeded > 0) {
        // Назначаем свободных боевых юнитов, если они есть
        const freeUnits = this.gameState.units.filter(u =>
          u.owner === "ai" &&
          (u.type === "fighter" || u.type === "assault" || u.type === "elite") &&
          u.commandQueue.length === 0
        );
        freeUnits.slice(0, additionalNeeded).forEach(unit => {
          unit.commandQueue = []; // очищаем текущие команды
          // Небольшое смещение для распределения юнитов вокруг объекта
          const offsetX = (Math.random() - 0.5) * 20;
          const offsetY = (Math.random() - 0.5) * 20;
          unit.commandQueue.push({ type: "move", x: pos.x + offsetX, y: pos.y + offsetY });
          console.log(`Перевод юнита ${unit.type} для защиты объекта на позиции (${pos.x}, ${pos.y}).`);
        });
        
        // Если в данной зоне отсутствуют оборонительные сооружения (турели), инициируем их строительство
        const nearbyTurrets = this.gameState.buildings.filter(b =>
          b.owner === "ai" && b.type === "turret" &&
          Math.hypot(b.x - pos.x, b.y - pos.y) < this.defenseRadius
        );
        if (nearbyTurrets.length < 1 && canAfford(TURRET_COST, "ai")) {
          const turretPos = randomNearbyPosition(entity, 50);
          if (aiPlaceBuilding("turret", turretPos.x, turretPos.y)) {
            console.log("Построена дополнительная турель для защиты объекта:", entity);
          }
        }
      }
    });
  }
  
  // Объединяем динамическое назначение защитников
  assignDefenders() {
    this.assignDynamicDefenders();
  }
  
  update() {
    this.assignDefenders();
  }
}



  
  class AttackModule {
    constructor(gameState, playerBase) {
      this.gameState = gameState;
      this.playerBase = playerBase;
      this.lastAttackTime = performance.now();
    }
    
    formAttackPool() {
      return this.gameState.units.filter(u =>
        u.owner === "ai" &&
        (u.type === "fighter" || u.type === "assault" || u.type === "elite") &&
        u.commandQueue.length === 0
      );
    }
    
    planAttack() {
      return this.playerBase;
    }
    
    launchAttack() {
      const pool = this.formAttackPool();
      if (pool.length === 0) return;
      
      const target = this.planAttack();
      const randomOffset = { 
        x: (Math.random() - 0.5) * 100, 
        y: (Math.random() - 0.5) * 100 
      };
      const attackTarget = { x: target.x + randomOffset.x, y: target.y + randomOffset.y };
      
      pool.forEach(unit => {
        unit.commandQueue = [];
        unit.commandQueue.push({ type: "move", x: attackTarget.x, y: attackTarget.y });
        unit.commandQueue.push({ type: "attack", target: target });
      });
    }
    
    readyForAttack() {
      const pool = this.formAttackPool();
      return pool.length >= MIN_GARRISON_COUNT && (performance.now() - this.lastAttackTime > 10000);
    }
    
    update() {
      if (this.readyForAttack()) {
        this.launchAttack();
        this.lastAttackTime = performance.now();
      }
    }
  }
  
  window.EconomicExpansionModule = EconomicExpansionModule;
  window.DefenseModule = DefenseModule;
  window.AttackModule = AttackModule;
}

// ===========================
// --- Главная логика ИИ с интегрированной state machine ---
// ===========================
let aiPhase = "warehouses"; // Возможные фазы: "warehouses", "repairWorkshop", "barracks", "turrets", "normal"

// Инициализация модулей ИИ
let economicModule = new EconomicExpansionModule(gameState, aiBase);
let defenseModule = new DefenseModule(gameState);
let attackModule = new AttackModule(gameState, playerBase);

const MIN_GOLD_FOR_EXPANSION = 150;
const MIN_SILICON_FOR_EXPANSION = 250;
const MIN_PLASMA_FOR_EXPANSION = 80;

// Глобальный массив для хранения центров построенных кластеров (если используется)
let builtClusters = [];

const buildingPrerequisites = {
  "base2": ["barracks"],      // Улучшённая база (base2) доступна только после построенной базовой казармы
  "barracks2": ["base2"],     // Улучшенная казарма (barracks2) – только после наличия base2
  "turret2": ["base2"],       // Улучшённая турель (turret2) – только после наличия base2
  "base3": ["barracks2"],     // Пример зависимости для базы3
  "barracks3": ["base3"]      // Улучшенная казарма (barracks3) – после базы3
};

function canBuild(buildingType) {
  const prereqs = buildingPrerequisites[buildingType];
  if (!prereqs) return true; // Если зависимостей нет, можно строить
  for (const prereq of prereqs) {
    if (!hasBuilding(prereq, "ai")) {
      return false;
    }
  }
  return true;
}


function aiBuildImprovedBuildings() {
  // Строим улучшенную базу (base2) только если базовая казарма уже построена (зависимость: base2 требует barracks)
  if (!hasBuilding("base2", "ai") && canAfford(BASE2_COST, "ai") && canBuild("base2")) {
    const pos = randomFarPosition(aiBase, 100);
    if (aiPlaceBuilding("base2", pos.x, pos.y)) {
      console.log("Строится улучшенная база (base2) по координатам:", pos);
    }
  }
  
  // Строим улучшенную казарму (barracks2) только если база2 уже построена
  if (!hasBuilding("barracks2", "ai") && canAfford(BARRACKS2_COST, "ai") && canBuild("barracks2")) {
    const reference = getBuilding("base2", "ai") || aiBase;
    const pos = randomNearbyPosition(reference, 100);
    if (aiPlaceBuilding("barracks2", pos.x, pos.y)) {
      console.log("Строится улучшенная казарма (barracks2) по координатам:", pos);
    }
  }
  
  // Строим улучшенную турель (turret2) только если база2 уже построена
  if (!hasBuilding("turret2", "ai") && canAfford(TURRET2_COST, "ai") && canBuild("turret2")) {
    const reference = getBuilding("base2", "ai") || aiBase;
    const pos = randomNearbyPosition(reference, 100);
    if (aiPlaceBuilding("turret2", pos.x, pos.y)) {
      console.log("Строится улучшенная турель (turret2) по координатам:", pos);
    }
  }
  
  // Опционально: Строим улучшенную базу 3, если предусмотрено
  if (!hasBuilding("base3", "ai") && canAfford(BASE3_COST, "ai") && canBuild("base3")) {
    const pos = randomFarPosition(aiBase, 100);
    if (aiPlaceBuilding("base3", pos.x, pos.y)) {
      console.log("Строится улучшенная база (base3) по координатам:", pos);
    }
  }
  
  // Опционально: Строим улучшенную казарму 3, если предусмотрено
  if (!hasBuilding("barracks3", "ai") && canAfford(BARRACKS3_COST, "ai") && canBuild("barracks3")) {
    const reference = getBuilding("base3", "ai") || aiBase;
    const pos = randomNearbyPosition(reference, 100);
    if (aiPlaceBuilding("barracks3", pos.x, pos.y)) {
      console.log("Строится улучшенная казарма (barracks3) по координатам:", pos);
    }
  }
}


// Основная логика AI
function aiLogic() {
  if (!aiBase) return;
  
  // Нанимаем рабочих, ремонтников и военных
  attemptToHireWorkers();
  attemptToHireRepairman();
  attemptToHireMilitaryUnits();
  
  // Обновляем модули обороны и атаки
  defenseModule.update();
  attackModule.update();
  
  // Если ресурсов достаточно для экспансии улучшённых объектов
  if (
    gameState.aiResources.gold >= MIN_GOLD_FOR_EXPANSION &&
    gameState.aiResources.silicon >= MIN_SILICON_FOR_EXPANSION &&
    gameState.aiResources.plasma >= MIN_PLASMA_FOR_EXPANSION
  ) {
    // Строим улучшённые здания с зависимостями (как у игрока)
    aiBuildImprovedBuildings();
    
    // Экспансия по ресурсным кластерам
    const expansionTarget = findExpansionTarget();
    if (expansionTarget && !gameState.buildings.some(b =>
          b.owner === "ai" && b.type === "beacon" &&
          Math.hypot(b.x - expansionTarget.x, b.y - expansionTarget.y) < 50
    )) {
      buildClusterAt(expansionTarget);
    }
  } else {
    // Если ресурсов недостаточно, восстанавливаем базовую инфраструктуру вокруг базы через state machine
    switch (aiPhase) {
      case "warehouses":
        if (countBuildings("warehouse", "ai") < 2) {
          if (canAfford(WAREHOUSE_COST, "ai")) {
            const pos = randomNearbyPosition(aiBase, 100);
            aiPlaceBuilding("warehouse", pos.x, pos.y);
          }
          return;
        } else {
          aiPhase = "repairWorkshop";
        }
        // fall-through
      case "repairWorkshop":
        if (!hasBuilding("repairWorkshop", "ai")) {
          if (canAfford(REPAIR_WORKSHOP_COST, "ai")) {
            const pos = randomNearbyPosition(aiBase, 100);
            aiPlaceBuilding("repairWorkshop", pos.x, pos.y);
          }
          return;
        }
        attemptToHireRepairman();
        if (!gameState.units.some(u => u.owner === "ai" && u.type === "repairman")) {
          return;
        }
        aiPhase = "barracks";
        // fall-through
      case "barracks":
        if (!hasBuilding("barracks", "ai")) {
          if (canAfford(BARRACKS_COST, "ai")) {
            const pos = randomNearbyPosition(aiBase, 100);
            aiPlaceBuilding("barracks", pos.x, pos.y);
          }
          return;
        }
        aiPhase = "turrets";
        // fall-through
      case "turrets":
        if (!gameState.units.some(u =>
            u.owner === "ai" &&
            (u.type === "fighter" || u.type === "assault" || u.type === "elite")
        )) {
          aiPhase = "normal";
          break;
        }
        if (!hasBuilding("turret", "ai") && canAfford(TURRET_COST, "ai")) {
          const barracks = getBuilding("barracks", "ai");
          const pos = randomNearbyPosition(barracks, 100);
          aiPlaceBuilding("turret", pos.x, pos.y);
        }
        aiPhase = "normal";
        break;
      case "normal":
        // Базовая инфраструктура установлена – дополнительные действия, если нужно.
        break;
    }
    
    if (!hasBuilding("warehouse", "ai") && canAfford(WAREHOUSE_COST, "ai")) {
      const pos = randomNearbyPosition(aiBase, 100);
      aiPlaceBuilding("warehouse", pos.x, pos.y);
    }
  }
}
