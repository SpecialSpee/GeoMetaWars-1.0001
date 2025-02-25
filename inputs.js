// ---------------------------------------------
// Переменные для перетаскивания стены
// ---------------------------------------------
let isWallDragging = false;
let wallDragStart = { x: 0, y: 0 };
let currentWallDragZone = null;

// ---------------------------------------------
// Обработчики перетаскивания карты (мышь)
// ---------------------------------------------
let isDragging = false, dragStart = { x: 0, y: 0 }, cameraStart = { offsetX: 0, offsetY: 0 };

canvas.addEventListener("mousedown", e => {
  isDragging = true;
  dragStart = { x: e.clientX, y: e.clientY };
  cameraStart = { offsetX: camera.offsetX, offsetY: camera.offsetY };
});
canvas.addEventListener("mousemove", e => {
  if (isDragging) {
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    camera.offsetX = cameraStart.offsetX + dx;
    camera.offsetY = cameraStart.offsetY + dy;
  }
});
canvas.addEventListener("mouseup", () => { isDragging = false; });
canvas.addEventListener("mouseleave", () => { isDragging = false; });

// ---------------------------------------------
// Обработчики перетаскивания карты (touch)
// ---------------------------------------------
canvas.addEventListener("touchstart", e => {
  // Обрабатываем только одиночное касание для перетаскивания
  if (e.touches.length === 1) {
    isDragging = true;
    let touch = e.touches[0];
    dragStart = { x: touch.clientX, y: touch.clientY };
    cameraStart = { offsetX: camera.offsetX, offsetY: camera.offsetY };
  }
}, { passive: false });

canvas.addEventListener("touchmove", e => {
  if (isDragging && e.touches.length === 1) {
    let touch = e.touches[0];
    const dx = touch.clientX - dragStart.x;
    const dy = touch.clientY - dragStart.y;
    camera.offsetX = cameraStart.offsetX + dx;
    camera.offsetY = cameraStart.offsetY + dy;
  }
}, { passive: false });

canvas.addEventListener("touchend", e => { isDragging = false; }, { passive: false });
canvas.addEventListener("touchcancel", e => { isDragging = false; }, { passive: false });

// ---------------------------------------------
// Функция, вызывающая ремонтников из мастерской по клику
// (без изменений, так как вызывается программно)
// ---------------------------------------------
function recallRepairmenFromWorkshop(workshop) {
  const recalledRepairmen = gameState.units.filter(u =>
    u.owner === "player" &&
    u.type === "repairman" &&
    u.hidden && u.inWorkshop === workshop
  );
  if (recalledRepairmen.length > 0) {
    recalledRepairmen.forEach(u => {
      if (u.currentMovementAnimation) {
        cancelAnimationFrame(u.currentMovementAnimation);
        u.currentMovementAnimation = null;
      }
      const exitOffset = 20;
      const angle = Math.random() * Math.PI * 2;
      const exitX = workshop.x + exitOffset * Math.cos(angle);
      const exitY = workshop.y + exitOffset * Math.sin(angle);
      animateMoveAndScale(u, exitX, exitY, 1, 500, () => {
        u.hidden = false;
        u.inWorkshop = null;
      });
    });
  } else {
    hireRepairmanForPlayer(workshop);
  }
}

// ---------------------------------------------
// Функция найма ремонтника для игрока
// ---------------------------------------------
function hireRepairmanForPlayer(workshop) {
  if (workshop.repairman >= workshop.capacity) {
    showWarning("Максимум ремонтников для этой мастерской достигнут");
    return;
  }
  if (gameState.playerResources.gold < REPAIRMAN_COST.gold ||
      gameState.playerResources.silicon < REPAIRMAN_COST.silicon ||
      gameState.playerResources.plasma < REPAIRMAN_COST.plasma) {
    showWarning("Недостаточно ресурсов для найма ремонтника");
    return;
  }
  gameState.playerResources.gold -= REPAIRMAN_COST.gold;
  gameState.playerResources.silicon -= REPAIRMAN_COST.silicon;
  gameState.playerResources.plasma -= REPAIRMAN_COST.plasma;
  updateResourceUI();
  workshop.repairman++;  // увеличиваем счётчик
  const { spawn, target } = spawnAtBoundary(workshop, 10);
  const repairman = new Unit("repairman", "player", spawn.x, spawn.y);
  repairman.homeWorkshop = workshop;
  gameState.units.push(repairman);
  moveUnit(repairman, target.x, target.y, () => {
    autoRepairDamagedObjects();
  });
}

// ---------------------------------------------
// Новая функция для найма штурмовика из казармы2
// ---------------------------------------------
function hireAssaultForPlayer(barracks2) {
  const ASSAULT_COST = { 
    gold: FIGHTER_COST.gold * 1.5, 
    silicon: FIGHTER_COST.silicon * 1.5, 
    plasma: FIGHTER_COST.plasma * 1.5 
  };
  if (gameState.playerResources.gold < ASSAULT_COST.gold ||
      gameState.playerResources.silicon < ASSAULT_COST.silicon ||
      gameState.playerResources.plasma < ASSAULT_COST.plasma) {
    showWarning("Недостаточно ресурсов для найма штурмовика");
    return;
  }
  gameState.playerResources.gold -= ASSAULT_COST.gold;
  gameState.playerResources.silicon -= ASSAULT_COST.silicon;
  gameState.playerResources.plasma -= ASSAULT_COST.plasma;
  updateResourceUI();
  barracks2.fighters = (barracks2.fighters || 0) + 1;
  const { spawn, target } = spawnAtBoundary(barracks2, 10);
  const assault = new Unit("assault", "player", spawn.x, spawn.y);
  assault.lastRocketTime = performance.now();
  gameState.units.push(assault);
  moveUnit(assault, target.x, target.y, () => startFighterCycle(assault));
}

// ---------------------------------------------
// Команда атаки для юнитов
// ---------------------------------------------
function commandUnitsToAttack(owner, target) {
  gameState.units.forEach(u => {
    if (u.owner === owner && u.type === "fighter") {
      u.commandQueue.push({ type: "attack", target: target });
    }
  });
}

// ---------------------------------------------
// Функции подсчёта, проверки и удаления (без изменений)
// ---------------------------------------------
function countMissingTurrets() {
  let missing = 0;
  gameState.buildings.forEach(b => {
    if (b.owner === "ai" && (b.type === "base" || b.type === "barracks" || b.type === "warehouse" || b.type === "beacon")) {
      const desired = (b.type === "base" || b.type === "barracks") ? 2 : 1;
      const current = gameState.buildings.filter(t => t.type === "turret" && Math.hypot(t.x - b.x, t.y - b.y) < 100).length;
      if (current < desired) missing += (desired - current);
    }
  });
  return missing;
}

function hasBuilding(buildingType, owner) {
  return gameState.buildings.some(b => b.owner === owner && b.type === buildingType);
}

function armySize(owner, unitType) {
  return gameState.units.filter(u => u.owner === owner && u.type === unitType).length;
}

function enemyNear(building, radius) {
  let enemyFound = false;
  gameState.units.forEach(u => { 
    if (u.owner !== building.owner && Math.hypot(u.x - building.x, u.y - building.y) < radius)
      enemyFound = true; 
  });
  gameState.buildings.forEach(b => { 
    if (b.owner !== building.owner && Math.hypot(b.x - building.x, b.y - building.y) < radius)
      enemyFound = true; 
  });
  return enemyFound;
}

function removeUnit(unit) {
  if (unit.type === "worker" && unit.homeWarehouse) {
    unit.homeWarehouse.workers = Math.max(0, unit.homeWarehouse.workers - 1);
  }
  if (unit.type === "repairman" && unit.homeWorkshop) {
    unit.homeWorkshop.repairman = Math.max(0, unit.homeWorkshop.repairman - 1);
  }
  gameState.units = gameState.units.filter(u => u !== unit);
  selectedUnits = selectedUnits.filter(u => u !== unit);
}

// Остальная логика (updateGameState, gameLoop, getRandomTargetPoint, обработчики кликов мыши)
// остается без изменений – добавлены отдельные обработчики для touch ниже...


function updateGameState(deltaTime) {
  updateUnits(deltaTime);
  updateResources(deltaTime);
  
  gameState.bullets.forEach(bullet => {
    if (bullet.isArtillery) {
      bullet.x += Math.cos(bullet.angle) * bullet.speed * deltaTime;
      bullet.y += Math.sin(bullet.angle) * bullet.speed * deltaTime;
      bullet.lifetime -= deltaTime;
      const potentialTargets = gameState.units.concat(gameState.buildings)
        .filter(obj => obj.owner !== bullet.shooter.owner && obj.health > 0);
      for (let obj of potentialTargets) {
        let collisionThreshold = (obj instanceof Building) ? obj.width / 2 : 8;
        if (Math.hypot(bullet.x - obj.x, bullet.y - obj.y) < collisionThreshold) {
          const splashTargets = getEnemiesInRange({ x: bullet.x, y: bullet.y }, bullet.splashRadius);
          splashTargets.forEach(target => {
            target.health -= bullet.splashDamage;
            if (target.health <= 0) {
              if (target instanceof Building) {
                spawnParticles(target.x, target.y, "green");
                gameState.buildings = gameState.buildings.filter(b => b !== target);
                if (target === aiBase) { aiBase = null; }
              } else if (target instanceof Unit) {
                removeUnit(target);
              }
            }
          });
          bullet.alive = false;
          spawnParticles(bullet.x, bullet.y, "green");
          break;
        }
      }
    } else if (bullet.isMissile) {
      if (bullet.target && bullet.target.health > 0) {
        const desiredAngle = Math.atan2(bullet.target.y - bullet.y, bullet.target.x - bullet.x);
        bullet.angle = lerpAngle(bullet.angle, desiredAngle, 0.05);
      }
      bullet.x += Math.cos(bullet.angle) * bullet.speed * deltaTime;
      bullet.y += Math.sin(bullet.angle) * bullet.speed * deltaTime;
      bullet.lifetime -= deltaTime;
      const potentialTargets = gameState.units.concat(gameState.buildings)
        .filter(obj => obj.owner !== bullet.shooter.owner && obj.health > 0);
      for (let obj of potentialTargets) {
        let collisionThreshold = (obj instanceof Building) ? obj.width / 2 : 8;
        if (Math.hypot(bullet.x - obj.x, bullet.y - obj.y) < collisionThreshold) {
          obj.health -= bullet.damage;
          const splashTargets = getEnemiesInRange({ x: bullet.x, y: bullet.y }, bullet.splashRadius);
          splashTargets.forEach(target => {
            if (target.owner !== bullet.shooter.owner && target !== obj && target.health > 0) {
              target.health -= bullet.splashDamage;
              if (target.health <= 0) {
                if (target instanceof Building) {
                  spawnParticles(target.x, target.y, "red");
                  gameState.buildings = gameState.buildings.filter(b => b !== target);
                  if (target === aiBase) { aiBase = null; }
                } else if (target instanceof Unit) {
                  removeUnit(target);
                }
              }
            }
          });
          bullet.alive = false;
          spawnParticles(bullet.x, bullet.y, "orange");
          if (obj.health <= 0) {
            if (obj instanceof Unit) {
              removeUnit(obj);
            } else if (obj instanceof Building) {
              spawnParticles(obj.x, obj.y, "red");
              gameState.buildings = gameState.buildings.filter(b => b !== obj);
              if (obj === aiBase) { aiBase = null; }
            }
          }
          break;
        }
      }
    } else {
      bullet.x += Math.cos(bullet.angle) * bullet.speed * deltaTime;
      bullet.y += Math.sin(bullet.angle) * bullet.speed * deltaTime;
      bullet.lifetime -= deltaTime;
      if (bullet.lifetime <= 0) bullet.alive = false;
      const enemyUnits = gameState.units.filter(u => u.owner !== bullet.shooter.owner && u.health > 0);
      for (let unit of enemyUnits) {
        const d = Math.hypot(bullet.x - unit.x, bullet.y - unit.y);
        if (d < 8) {
          bullet.alive = false;
          unit.health -= bullet.damage;
          if (unit.health < 0) unit.health = 0;
          spawnParticles(bullet.x, bullet.y, "orange");
          if (unit.health <= 0) {
            spawnParticles(unit.x, unit.y, "red");
            removeUnit(unit);
          }
          break;
        }
      }
      const enemyBuildings = gameState.buildings.filter(b => b.owner !== bullet.shooter.owner && b.health > 0);
      for (let building of enemyBuildings) {
        const d = Math.hypot(bullet.x - building.x, bullet.y - building.y);
        if (d < building.width / 2) {
          bullet.alive = false;
          building.health -= bullet.damage;
          if (building.health < 0) building.health = 0;
          spawnParticles(bullet.x, bullet.y, "orange");
          if (building.health <= 0) {
            spawnParticles(building.x, building.y, "red");
            gameState.buildings = gameState.buildings.filter(b => b !== building);
            if (building === aiBase) { aiBase = null; }
          }
          break;
        }
      }
    }
  });
  
  gameState.bullets = gameState.bullets.filter(b => b.alive);
  gameState.particles.forEach(p => {
    p.x += p.vx * deltaTime;
    p.y += p.vy * deltaTime;
    p.life -= deltaTime;
  });
  gameState.particles = gameState.particles.filter(p => p.life > 0);
  updateResourceUI();
  processResourceDepletion();
  updateBaseNavButton();
  updateBase2NavButton();
  updateBase3NavButton();
  autoRepairDamagedObjects();
}


function gameLoop(time) {
  const deltaTime = (time - lastTime) / 1000;
  lastTime = time;
  updateGameState(deltaTime);
  renderGame();
  updateFogOfWar();
  renderFogOfWar();
  renderDynamicFog();
  renderPersistentFog();
  gameLoopId = requestAnimationFrame(gameLoop);
}
// Сначала определим утилитную функцию для генерации случайной точки в круге:
function getRandomTargetPoint(centerX, centerY, radius) {
  const angle = Math.random() * 2 * Math.PI;
  const r = Math.random() * radius;
  return {
    x: centerX + r * Math.cos(angle),
    y: centerY + r * Math.sin(angle)
  };
}
//Обработчики кликов
canvas.addEventListener("click", e => {
  clearBuildZones();
  const pos = screenToWorld(e.clientX, e.clientY);
  
  const selectedRepairman = selectedUnits.find(u => u.type === "repairman");
  if (selectedRepairman) {
    const clickedResource = gameState.resources.find(r => Math.hypot(r.x - pos.x, r.y - pos.y) < 10);
    if (clickedResource) return;
    const clickedBuilding = gameState.buildings.find(b =>
      b.owner === "player" &&
      pos.x >= b.x - b.width / 2 && pos.x <= b.x + b.width / 2 &&
      pos.y >= b.y - b.height / 2 && pos.y <= b.y + b.height / 2
    );
  }
  
  const clickedResource = gameState.resources.find(r => Math.hypot(r.x - pos.x, r.y - pos.y) < 10);
  const clickedBuilding = gameState.buildings.find(b =>
    b.owner === "player" &&
    pos.x >= b.x - b.width / 2 && pos.x <= b.x + b.width / 2 &&
    pos.y >= b.y - b.height / 2 && pos.y <= b.y + b.height / 2
  );
  
  if (clickedBuilding) {
    if (clickedBuilding.type === "warehouse") { hireWorkerForPlayer(clickedBuilding); return; }
    if (clickedBuilding.type === "barracks") { hireFighterForPlayer(clickedBuilding); return; }
    if (clickedBuilding.type === "barracks2") { hireAssaultForPlayer(clickedBuilding); return; }
    if (clickedBuilding.type === "repairWorkshop") {
      recallRepairmenFromWorkshop(clickedBuilding);
      return;
    }
    if (clickedBuilding) {
      if (clickedBuilding.type === "warehouse") { hireWorkerForPlayer(clickedBuilding); return; }
      if (clickedBuilding.type === "barracks") { hireFighterForPlayer(clickedBuilding); return; }
      if (clickedBuilding.type === "barracks2") { hireAssaultForPlayer(clickedBuilding); return; }
      if (clickedBuilding.type === "barracks3") { hireEliteForPlayer(clickedBuilding); return; }
      if (clickedBuilding.type === "repairWorkshop") {
        recallRepairmanFromRepWorkshop(clickedBuilding);
        return;
      }
      if (clickedBuilding.type === "base" || clickedBuilding.type === "base2" ||
          clickedBuilding.type === "base3" || clickedBuilding.type === "beacon") { 
        showBuildingMenu(clickedBuilding); 
        return;
      }
    }
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
  const clickedUnit = gameState.units.find(u => u.owner === "player" && Math.hypot(u.x - pos.x, u.y - pos.y) < unitRadius);
  
  if (clickedUnit) {
    selectedUnits = [clickedUnit];
  } else if (selectedUnits.length > 0) {
    // Вместо того чтобы направлять все юниты в одну точку (pos),
    // вычисляем для каждого свою цель в области вокруг pos (радиус, например, 20)
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
});

canvas.addEventListener("dblclick", e => {
  clearBuildZones();
  const pos = screenToWorld(e.clientX, e.clientY);
  const clickedBuilding = gameState.buildings.find(b =>
    pos.x >= b.x - b.width / 2 && pos.x <= b.x + b.width / 2 &&
    pos.y >= b.y - b.height / 2 && pos.y <= b.y + b.height / 2
  );
  if (clickedBuilding) return;
  const unitRadius = 5;
  const clickedUnit = gameState.units.find(u => u.owner === "player" && Math.hypot(u.x - pos.x, u.y - pos.y) < unitRadius);
  if (clickedUnit) {
    selectedUnits = gameState.units.filter(u => u.owner === "player" && u.type === clickedUnit.type);
  } else {
    startSelectionFrame(e);
  }
});

function startSelectionFrame(initialEvent) {
  const startX = initialEvent.clientX, startY = initialEvent.clientY;
  const selectionBox = document.createElement("div");
  selectionBox.style.position = "absolute";
  selectionBox.style.border = "1px dashed #00FF00";
  selectionBox.style.backgroundColor = "rgba(0,255,0,0.2)";
  selectionBox.style.left = startX + "px";
  selectionBox.style.top = startY + "px";
  selectionBox.style.zIndex = "1000";
  document.body.appendChild(selectionBox);
  function onMouseMove(e) {
    const currentX = e.clientX, currentY = e.clientY;
    const left = Math.min(startX, currentX), top = Math.min(startY, currentY);
    const width = Math.abs(startX - currentX), height = Math.abs(startY - currentY);
    selectionBox.style.left = left + "px";
    selectionBox.style.top = top + "px";
    selectionBox.style.width = width + "px";
    selectionBox.style.height = height + "px";
  }
  function onMouseUp(e) {
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
    const rect = selectionBox.getBoundingClientRect();
    selectedUnits = gameState.units.filter(u => {
      if (u.owner !== "player") return false;
      const screenPos = worldToScreen(u.x, u.y);
      return (screenPos.x >= rect.left && screenPos.x <= rect.right &&
              screenPos.y >= rect.top && screenPos.y <= rect.bottom);
    });
    selectionBox.remove();
  }
  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", onMouseUp);
}

canvas.addEventListener("contextmenu", e => {
  e.preventDefault();
  clearBuildZones();
  const pos = screenToWorld(e.clientX, e.clientY);
  const unitRadius = 5;
  let enemyTarget = gameState.units.find(u => u.owner !== "player" && Math.hypot(u.x - pos.x, u.y - pos.y) < unitRadius);
  if (!enemyTarget) {
    enemyTarget = gameState.buildings.find(b =>
      b.owner !== "player" &&
      pos.x >= b.x - b.width / 2 && pos.x <= b.x + b.width / 2 &&
      pos.y >= b.y - b.height / 2 && pos.y <= b.y + b.height / 2
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
// Меню строительства
// Функция, возвращающая HTML-строку для пункта меню с учетом условий
function getMenuItem(buildingType, label) {
  let available = false;
  if (buildingType === "warehouse") {
    available = (!hasBuilding("warehouse", "player") && canAfford(WAREHOUSE_COST, "player"));
  } else if (buildingType === "repairWorkshop") {
    available = (!hasBuilding("repairWorkshop", "player") && canAfford(REPAIR_WORKSHOP_COST, "player"));
  } else if (buildingType === "barracks") {
    available = (hasBuilding("warehouse", "player") &&
                 hasBuilding("repairWorkshop", "player") &&
                 !hasBuilding("barracks", "player") &&
                 canAfford(BARRACKS_COST, "player"));  
  }  else if (buildingType === "turret") {
    available = (hasBuilding("warehouse", "player") &&
                 hasBuilding("barracks", "player") &&
                 hasBuilding("repairWorkshop", "player") &&
                 !hasBuilding("turret", "player") &&
                 canAfford(TURRET_COST, "player"));
	  
  } else if (buildingType === "wall") {
    available = (hasBuilding("warehouse", "player") &&
                 hasBuilding("barracks", "player") &&
                 hasBuilding("repairWorkshop", "player") &&
				 !hasBuilding("wall", "player") &&
                 canAfford(WALL_COST, "player"));
  } else if (buildingType === "beacon") {
    available = (hasBuilding("warehouse", "player") &&
                 hasBuilding("barracks", "player") &&
                 hasBuilding("turret", "player") &&
                 hasBuilding("repairWorkshop", "player") &&
                 !hasBuilding("beacon", "player") &&
                 canAfford(BEACON_COST, "player"));
  } else if (buildingType === "barracks2") {
    available = (hasBuilding("warehouse", "player") &&
                 hasBuilding("barracks", "player") &&
                 hasBuilding("turret", "player") &&
                 hasBuilding("repairWorkshop", "player") &&
                 hasBuilding("beacon", "player") &&
				 hasBuilding("base2", "player") &&
                 !hasBuilding("barracks2", "player") &&
                 canAfford(BARRACKS2_COST, "player"));
	  }  else if (buildingType === "turret2") {
    available = (hasBuilding("warehouse", "player") &&
                 hasBuilding("barracks", "player") &&
                 hasBuilding("turret", "player") &&
                 hasBuilding("repairWorkshop", "player") &&
                 hasBuilding("beacon", "player") &&
				 hasBuilding("base2", "player") &&
                 hasBuilding("barracks2", "player") &&
                 !hasBuilding("turret2", "player") &&
                 canAfford(TURRET2_COST, "player"));
  } else if (buildingType === "base2") {
    available = (!hasBuilding("base2", "player") &&
                 hasBuilding("warehouse", "player") &&
                 hasBuilding("barracks", "player") &&
                 hasBuilding("turret", "player") &&
                 hasBuilding("repairWorkshop", "player") &&
                 hasBuilding("beacon", "player") &&
                 canAfford(BASE2_COST, "player"));
  
  } else if (buildingType === "base3") {
    available = (hasBuilding("warehouse", "player") &&
                 hasBuilding("barracks", "player") &&
                 hasBuilding("turret", "player") &&
                 hasBuilding("repairWorkshop", "player") &&
                 hasBuilding("beacon", "player") &&
				 hasBuilding("base2", "player") &&
                 hasBuilding("barracks2", "player") &&
                 hasBuilding("turret2", "player") &&
                 !hasBuilding("base3", "player") &&
                 canAfford(BASE3_COST, "player"));
  } else if (buildingType === "barracks3") {
    available = (hasBuilding("warehouse", "player") &&
                 hasBuilding("barracks", "player") &&
                 hasBuilding("turret", "player") &&
                 hasBuilding("repairWorkshop", "player") &&
                 hasBuilding("beacon", "player") &&
				 hasBuilding("base2", "player") &&
                 hasBuilding("barracks2", "player") &&
                 hasBuilding("turret2", "player") &&
                 hasBuilding("base3", "player") &&
				 !hasBuilding("barracks3", "player") &&
                 canAfford(BARRACKS3_COST, "player"));
  } 
  
  // Если все условия выполнены, добавляем inline-стиль для зеленого цвета
  return `<div data-type="${buildingType}" ${available ? 'style="color:green;"' : ''}>${label}</div>`;
}
//ТУТ НАСТРАИВАЕТСЯ ПОСЛЕДОВАТЕЛЬНОСТЬ ПОСТРОЙКИ 
function showBuildingMenu(building) {
  clearBuildZones();
  let existing = document.getElementById("buildMenu");
  if (existing) existing.remove();
  const menu = document.createElement("div");
  menu.id = "buildMenu";
  const screenPos = worldToScreen(building.x, building.y);
  menu.style.top = (screenPos.y + building.height * camera.scale / 2 + 5) + "px";
  menu.style.left = (screenPos.x - 50) + "px";
  // Формируем меню с учетом базовых построек
  let menuHTML = getMenuItem("warehouse", "Склад") +
                 getMenuItem("repairWorkshop", "Мастерская");
  if (hasBuilding("warehouse", "player") && hasBuilding("repairWorkshop", "player")) {
    menuHTML += getMenuItem("barracks", "Казарма");
  }
  if (hasBuilding("warehouse", "player") && hasBuilding("barracks", "player") && hasBuilding("repairWorkshop", "player")) {
    menuHTML += getMenuItem("turret", "Турель") +
				getMenuItem("wall", "Стена");
  }
  if (hasBuilding("warehouse", "player") && hasBuilding("barracks", "player") &&
      hasBuilding("turret", "player") && hasBuilding("repairWorkshop", "player")) {
    menuHTML += getMenuItem("beacon", "Маяк");
  }
  
  // Продвинутые постройки
if (!hasBuilding("base2", "player") &&
    hasBuilding("warehouse", "player") &&
    hasBuilding("barracks", "player") &&
    hasBuilding("turret", "player") &&
    hasBuilding("repairWorkshop", "player") &&
    hasBuilding("beacon", "player")) {
  menuHTML += getMenuItem("base2", "База2");
} else if (hasBuilding("base2", "player")) {
  if (!hasBuilding("barracks2", "player")) {
    menuHTML += getMenuItem("barracks2", "Казарма2");
  }
  if (hasBuilding("barracks2", "player") && !hasBuilding("turret2", "player")) {
    menuHTML += getMenuItem("turret2", "Турель2");
  }
  // База3 появляется только после того, как построены база2, казарма2 и турель2
  if (hasBuilding("base2", "player") && hasBuilding("barracks2", "player") && hasBuilding("turret2", "player") && !hasBuilding("base3", "player")) {
    menuHTML += getMenuItem("base3", "База3");
  }
  // Казарма3 появляется только после базы3
  if (hasBuilding("base3", "player") && !hasBuilding("barracks3", "player")) {
    menuHTML += getMenuItem("barracks3", "Казарма3");
  }
}

  
  menu.innerHTML = menuHTML;
  menu.querySelectorAll("div").forEach(item => {
    item.addEventListener("click", e => {
      const buildingType = e.target.getAttribute("data-type");
      showBuildZone(building, buildingType);
      menu.remove();
    });
  });
  document.body.appendChild(menu);
}

function clearBuildZones() {
  document.querySelectorAll(".buildZone").forEach(zone => zone.remove());
  const menu = document.getElementById("buildMenu");
  if (menu) menu.remove();
}

function placeBuildingWithOrientation(x, y, buildingType, angle, owner) {
  // Проверка ресурсов и пересечения аналогична функции placeBuilding
  if (owner === "player" && buildingType === "wall") {
    if (gameState.playerResources.gold < WALL_COST.gold ||
        gameState.playerResources.silicon < WALL_COST.silicon ||
        gameState.playerResources.plasma < WALL_COST.plasma) {
      showWarning("Недостаточно ресурсов для строительства стены");
      return;
    }
    gameState.playerResources.gold -= WALL_COST.gold;
    gameState.playerResources.silicon -= WALL_COST.silicon;
    gameState.playerResources.plasma -= WALL_COST.plasma;
  }
  updateResourceUI();
  const building = new Building(buildingType, owner, x, y);
  building.angle = angle; // сохраняем ориентацию
  gameState.buildings.push(building);
  console.log(`Стена построена с углом ${angle * 180 / Math.PI}°`);
}
//ЛОГИКА КЛИКОВ В МЕНЮ ПОСТРОЙКИ
function showSingleBuildZone(building, buildingType) {
  const zone = document.createElement("div");
  zone.className = "buildZone";
  const multiplier = (building.type === "beacon") ? (building.buildZoneMultiplier || 2) : 1;
  const overlaySize = 100 * camera.scale * multiplier;
  const screenPos = worldToScreen(building.x, building.y);
  zone.style.width = overlaySize + "px";
  zone.style.height = overlaySize + "px";
  zone.style.top = (screenPos.y - overlaySize / 2) + "px";
  zone.style.left = (screenPos.x - overlaySize / 2) + "px";
  zone.style.backgroundColor = "rgba(0,255,0,0.3)";
  zone.style.border = "2px dashed lightgreen";
  zone.style.position = "absolute";
  zone.style.zIndex = "1000";
  
  zone.addEventListener("wheel", e => {
    e.preventDefault();
    const zoomFactor = 1.1;
    let newScale = camera.scale;
    newScale = e.deltaY < 0 ? newScale * zoomFactor : newScale / zoomFactor;
    setZoom(newScale, e.clientX, e.clientY);
  });
  
  if (buildingType === "wall") {
    // Для стены обрабатываем перетаскивание для установки ориентации
    zone.addEventListener("mousedown", e => {
      e.preventDefault();
      e.stopPropagation();
      isWallDragging = true;
      wallDragStart = { x: e.clientX, y: e.clientY };
      currentWallDragZone = zone;
    });
    zone.addEventListener("mousemove", e => {
      if (isWallDragging && currentWallDragZone) {
        const dx = e.clientX - wallDragStart.x;
        const dy = e.clientY - wallDragStart.y;
        console.log("Перетаскивание стены: dx =", dx, "dy =", dy);
      }
    });
    zone.addEventListener("mouseup", e => {
      e.preventDefault();
      e.stopPropagation();
      if (!isWallDragging) return;
      const dragEnd = { x: e.clientX, y: e.clientY };
      const dx = dragEnd.x - wallDragStart.x;
      const dy = dragEnd.y - wallDragStart.y;
      let angle = Math.atan2(dy, dx);
      if (angle < 0) angle += 2 * Math.PI;
      // Округляем до ближайшего кратного 90° (π/2)
      angle = Math.round(angle / (Math.PI / 2)) * (Math.PI / 2);
      const worldPos = screenToWorld(e.clientX, e.clientY);
      console.log("Стена будет построена с ориентацией:", angle * 180 / Math.PI, "°");
      placeBuildingWithOrientation(worldPos.x, worldPos.y, buildingType, angle, "player");
      clearBuildZones();
      isWallDragging = false;
      currentWallDragZone = null;
    });
    zone.addEventListener("mouseleave", e => {
      if (isWallDragging) {
        isWallDragging = false;
        currentWallDragZone = null;
      }
    });
  } else {
    // Для остальных типов зданий — обычный обработчик клика
    zone.addEventListener("click", e => {
      e.preventDefault();
      e.stopPropagation();
      const worldPos = screenToWorld(e.clientX, e.clientY);
      console.log("Клик по зоне, строим", buildingType, "в", worldPos);
      placeBuilding(worldPos.x, worldPos.y, buildingType, "player");
      clearBuildZones();
    });
  }
  
  document.body.appendChild(zone);
  console.log("Зона для здания", building.type, "с опцией", buildingType, "создана. Экранные координаты:", screenPos);
}

function placeBuilding(x, y, buildingType, owner) {
  if (buildingType === "barracks") {
    const existing = gameState.buildings.filter(b => b.owner === owner && b.type === "barracks");
    if (existing.length >= 1) { showWarning("Казарма уже построена"); return; }
  } else if (buildingType === "barracks2") {
    const existing = gameState.buildings.filter(b => b.owner === owner && b.type === "barracks2");
    if (existing.length >= 1) { showWarning("Казарма2 уже построена"); return; }
  } else if (buildingType === "barracks3") {
    const existing = gameState.buildings.filter(b => b.owner === owner && b.type === "barracks3");
    if (existing.length >= 1) { showWarning("Казарма3 уже построена"); return; }
  }
  let buildingWidth, buildingHeight;
  if (buildingType === "warehouse") { 
    buildingWidth = 10; buildingHeight = 10; 
  } else if (buildingType === "barracks") { 
    buildingWidth = 15; buildingHeight = 15; 
  } else if (buildingType === "barracks2") { 
    buildingWidth = 25; buildingHeight = 15; 
  } else if (buildingType === "barracks3") { 
    buildingWidth = 20; buildingHeight = 15; 
  } else if (buildingType === "beacon") { 
    buildingWidth = 20; buildingHeight = 20; 
  } else if (buildingType === "turret") { 
    buildingWidth = 12; buildingHeight = 12; 
  } else if (buildingType === "turret2") { 
    buildingWidth = 15; buildingHeight = 17; 
  } else if (buildingType === "base2") {
    buildingWidth = 25; buildingHeight = 30;
  } else if (buildingType === "base3") {
    buildingWidth = 30; buildingHeight = 30;
  } else if (buildingType === "wall") {
    buildingWidth = 40; buildingHeight = 10;
  } else { 
    buildingWidth = 20; buildingHeight = 20; 
  }
  const newRect = { left: x - buildingWidth / 2, top: y - buildingHeight / 2, right: x + buildingWidth / 2, bottom: y + buildingHeight / 2 };
  for (let b of gameState.buildings) {
    const bRect = { left: b.x - b.width / 2 - 5, top: b.y - b.height / 2 - 5, right: b.x + b.width / 2 + 5, bottom: b.y + b.height / 2 + 5 };
    if (rectsOverlap(newRect, bRect)) { showWarning("Нельзя строить здания, накладывая их друг на друга"); return; }
  }
  if (owner === "player") {
    if (buildingType === "warehouse") {
      if (gameState.playerResources.gold < WAREHOUSE_COST.gold ||
          gameState.playerResources.silicon < WAREHOUSE_COST.silicon ||
          gameState.playerResources.plasma < WAREHOUSE_COST.plasma) {
        showWarning("Недостаточно ресурсов для строительства склада");
        return;
      }
      gameState.playerResources.gold -= WAREHOUSE_COST.gold;
      gameState.playerResources.silicon -= WAREHOUSE_COST.silicon;
      gameState.playerResources.plasma -= WAREHOUSE_COST.plasma;
    } else if (buildingType === "barracks") {
      if (gameState.playerResources.gold < BARRACKS_COST.gold ||
          gameState.playerResources.silicon < BARRACKS_COST.silicon ||
          gameState.playerResources.plasma < BARRACKS_COST.plasma) {
        showWarning("Недостаточно ресурсов для строительства казармы");
        return;
      }
      gameState.playerResources.gold -= BARRACKS_COST.gold;
      gameState.playerResources.silicon -= BARRACKS_COST.silicon;
      gameState.playerResources.plasma -= BARRACKS_COST.plasma;
    } else if (buildingType === "barracks2") {
      if (gameState.playerResources.gold < BARRACKS2_COST.gold ||
          gameState.playerResources.silicon < BARRACKS2_COST.silicon ||
          gameState.playerResources.plasma < BARRACKS2_COST.plasma) {
        showWarning("Недостаточно ресурсов для строительства казармы2");
        return;
      }
      gameState.playerResources.gold -= BARRACKS2_COST.gold;
      gameState.playerResources.silicon -= BARRACKS2_COST.silicon;
      gameState.playerResources.plasma -= BARRACKS2_COST.plasma;
    } else if (buildingType === "barracks3") {
      if (gameState.playerResources.gold < BARRACKS3_COST.gold ||
          gameState.playerResources.silicon < BARRACKS3_COST.silicon ||
          gameState.playerResources.plasma < BARRACKS3_COST.plasma) {
        showWarning("Недостаточно ресурсов для строительства казармы3");
        return;
      }
      gameState.playerResources.gold -= BARRACKS3_COST.gold;
      gameState.playerResources.silicon -= BARRACKS3_COST.silicon;
      gameState.playerResources.plasma -= BARRACKS3_COST.plasma;
    } else if (buildingType === "turret") {
      if (gameState.playerResources.gold < TURRET_COST.gold ||
          gameState.playerResources.silicon < TURRET_COST.silicon ||
          gameState.playerResources.plasma < TURRET_COST.plasma) {
        showWarning("Недостаточно ресурсов для строительства турели");
        return;
      }
      gameState.playerResources.gold -= TURRET_COST.gold;
      gameState.playerResources.silicon -= TURRET_COST.silicon;
      gameState.playerResources.plasma -= TURRET_COST.plasma;
    } else if (buildingType === "turret2") {
      if (gameState.playerResources.gold < TURRET2_COST.gold ||
          gameState.playerResources.silicon < TURRET2_COST.silicon ||
          gameState.playerResources.plasma < TURRET2_COST.plasma) {
        showWarning("Недостаточно ресурсов для строительства турели2");
        return;
      }
      gameState.playerResources.gold -= TURRET2_COST.gold;
      gameState.playerResources.silicon -= TURRET2_COST.silicon;
      gameState.playerResources.plasma -= TURRET2_COST.plasma;
    } else if (buildingType === "beacon") {
      if (gameState.playerResources.gold < BEACON_COST.gold ||
          gameState.playerResources.silicon < BEACON_COST.silicon ||
          gameState.playerResources.plasma < BEACON_COST.plasma) {
        showWarning("Недостаточно ресурсов для строительства маяка");
        return;
      }
      gameState.playerResources.gold -= BEACON_COST.gold;
      gameState.playerResources.silicon -= BEACON_COST.silicon;
      gameState.playerResources.plasma -= BEACON_COST.plasma;
    } else if (buildingType === "base2") {
      if (gameState.playerResources.gold < BASE2_COST.gold ||
          gameState.playerResources.silicon < BASE2_COST.silicon ||
          gameState.playerResources.plasma < BASE2_COST.plasma) {
        showWarning("Недостаточно ресурсов для строительства базы2");
        return;
      }
      gameState.playerResources.gold -= BASE2_COST.gold;
      gameState.playerResources.silicon -= BASE2_COST.silicon;
      gameState.playerResources.plasma -= BASE2_COST.plasma;
    } else if (buildingType === "base3") {
      if (gameState.playerResources.gold < BASE3_COST.gold ||
          gameState.playerResources.silicon < BASE3_COST.silicon ||
          gameState.playerResources.plasma < BASE3_COST.plasma) {
        showWarning("Недостаточно ресурсов для строительства базы3");
        return;
      }
      gameState.playerResources.gold -= BASE3_COST.gold;
      gameState.playerResources.silicon -= BASE3_COST.silicon;
      gameState.playerResources.plasma -= BASE3_COST.plasma;
    } else if (buildingType === "wall") {
      if (gameState.playerResources.gold < WALL_COST.gold ||
          gameState.playerResources.silicon < WALL_COST.silicon ||
          gameState.playerResources.plasma < WALL_COST.plasma) {
        showWarning("Недостаточно ресурсов для строительства стены");
        return;
      }
      gameState.playerResources.gold -= WALL_COST.gold;
      gameState.playerResources.silicon -= WALL_COST.silicon;
      gameState.playerResources.plasma -= WALL_COST.plasma;
    }
  }
  updateResourceUI();
  const building = new Building(buildingType, owner, x, y);
  gameState.buildings.push(building);
  if (building.type === "turret" || building.type === "turret2") { 
    startTurretCycle(building); 
  }
}