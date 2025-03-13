let saleTimeout = null;
let saleBuilding = null;
let saleStartTime = 0;
const saleDuration = 2000; // длительность удержания (2 секунды)
const saleMoveThreshold = 5; // порог движения (в пикселях), при котором продажа отменяется

// ==============================================
// Переменные для работы с построением стен (build zone)
let isWallDragging = false;
let wallDragStart = { x: 0, y: 0 };
let currentWallDragZone = null;

// ==============================================
// Переменные для перетаскивания карты
let isDragging = false,
    dragStart = { x: 0, y: 0 },
    cameraStart = { offsetX: 0, offsetY: 0 };

// Для pinch‑zoom (touch)
let lastTouchDistance = null;

// ==============================================
// Обработчики перетаскивания карты – МЫШЬ
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


canvas.addEventListener("mousedown", e => {
  isDragging = true;
  dragStart = { x: e.clientX, y: e.clientY };
  cameraStart = { offsetX: camera.offsetX, offsetY: camera.offsetY };

  const worldPos = screenToWorld(e.clientX, e.clientY);
  const clickedBuilding = gameState.buildings.find(b =>
    worldPos.x >= (b.x - b.width / 2) &&
    worldPos.x <= (b.x + b.width / 2) &&
    worldPos.y >= (b.y - b.height / 2) &&
    worldPos.y <= (b.y + b.height / 2) &&
    b.owner === "player"
  );
  if (clickedBuilding) {
    saleBuilding = clickedBuilding;
    saleStartTime = performance.now();
    createSaleIndicator();
    saleTimeout = setTimeout(() => {
      triggerSale(saleBuilding);
      clearSaleIndicator();
      saleTimeout = null;
      saleBuilding = null;
    }, saleDuration);
  }
});

canvas.addEventListener("mousemove", e => {
  if (isDragging) {
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    if (Math.hypot(dx, dy) > saleMoveThreshold && saleTimeout) {
      clearTimeout(saleTimeout);
      saleTimeout = null;
      saleBuilding = null;
      clearSaleIndicator();
    }
    camera.offsetX = cameraStart.offsetX + dx;
    camera.offsetY = cameraStart.offsetY + dy;
  }
});

canvas.addEventListener("mouseup", e => {
  isDragging = false;
  if (saleTimeout) {
    clearTimeout(saleTimeout);
    saleTimeout = null;
    saleBuilding = null;
    clearSaleIndicator();
  }
});


// ==============================================
// Обработчики перетаскивания карты – TOUCH
canvas.addEventListener("touchstart", e => {
  if (e.touches.length === 1) {
    // Одно касание – перетаскивание карты
    isDragging = true;
    const touch = e.touches[0];
    dragStart = { x: touch.clientX, y: touch.clientY };
    cameraStart = { offsetX: camera.offsetX, offsetY: camera.offsetY };
  } else if (e.touches.length === 2) {
    // Два касания – pinch‑zoom
    isDragging = false;
    const t1 = e.touches[0], t2 = e.touches[1];
    lastTouchDistance = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
  }
}, { passive: false });
canvas.addEventListener("touchmove", e => {
  if (e.touches.length === 1 && isDragging) {
    const touch = e.touches[0];
    const dx = touch.clientX - dragStart.x;
    const dy = touch.clientY - dragStart.y;
    camera.offsetX = cameraStart.offsetX + dx;
    camera.offsetY = cameraStart.offsetY + dy;
  } else if (e.touches.length === 2) {
    e.preventDefault();
    const t1 = e.touches[0], t2 = e.touches[1];
    const currentDistance = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
    if (lastTouchDistance) {
      const scaleFactor = currentDistance / lastTouchDistance;
      let newScale = camera.scale * scaleFactor;
      if (newScale > MAX_SCALE) newScale = MAX_SCALE;
      const midX = (t1.clientX + t2.clientX) / 2;
      const midY = (t1.clientY + t2.clientY) / 2;
      setZoom(newScale, midX, midY);
    }
    lastTouchDistance = currentDistance;
  }
}, { passive: false });
canvas.addEventListener("touchend", e => {
  if (e.touches.length < 2) { lastTouchDistance = null; }
  if (e.touches.length === 0) { isDragging = false; }
}, { passive: false });
canvas.addEventListener("touchcancel", e => {
  lastTouchDistance = null;
  isDragging = false;
}, { passive: false });


// Глобальный массив для суперновых эффектов
let supernovaEffects = [];



function processResourceDepletion() {
  gameState.resources.slice().forEach(resource => {
    //console.log("Ресурс:", resource.type, "amount:", resource.amount, "depleted:", resource.depleted);
    if (resource.amount <= 10 && !resource.depleted) {
      console.log("Запускается суперновая для ресурса:", resource);
      resource.depleted = true;
      spawnSupernovaEffect(resource);
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


function spawnSupernovaFragments(x, y, explosionRadius, resourceColor) {
  const numFragments = 50; // Количество фрагментов для эффекта суперновой
  for (let i = 0; i < numFragments; i++) {
    // Форма фрагмента: случайное число вершин от 3 до 5
    const numVertices = 3 + Math.floor(Math.random() * 3);
    const points = [];
    // Базовый радиус фрагмента относительно explosionRadius (маленький размер)
    const baseFragmentRadius = explosionRadius * (0.05 + Math.random() * 0.06);
    for (let j = 0; j < numVertices; j++) {
      const baseAngle = (j / numVertices) * 2 * Math.PI;
      // Добавляем небольшое случайное отклонение угла
      const angleOffset = (Math.random() - 0.5) * (Math.PI / 8);
      const angle = baseAngle + angleOffset;
      // Радиус фрагмента немного варьируется
      const radius = baseFragmentRadius * (0.8 + Math.random() * 0.4);
      points.push({
        x: radius * Math.cos(angle),
        y: radius * Math.sin(angle)
      });
    }
    // Фрагменты будут иметь небольшую скорость (относительно explosionRadius)
    const fragment = {
      x: x,
      y: y,
      vx: (Math.random() - 0.5) * explosionRadius * 2,
      vy: (Math.random() - 0.5) * explosionRadius * 2,
      angle: Math.random() * Math.PI * 2,
      angularVelocity: (Math.random() - 0.5) * 4,
      points: points,
      // Время жизни фрагмента от 1.5 до 3 секунд
      life: 2 + Math.random() * 2,
      maxLife: 3 + Math.random() * 3,
      // Цвет фрагмента берём из ресурса
      color: resourceColor
    };
    gameState.fragments.push(fragment);
  }
}


function drawFragments() {
  ctx.save();
  // Применяем смещение и зум камеры
  ctx.translate(camera.offsetX, camera.offsetY);
  ctx.scale(camera.scale, camera.scale);
  gameState.fragments.forEach(frag => {
    ctx.save();
    ctx.translate(frag.x, frag.y);
    if (frag.angle) {
      ctx.rotate(frag.angle);
    }
    const alpha = Math.max(0, frag.life / frag.maxLife);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = frag.color;
    if (frag.drawAsCircle) {
      // Отрисовка фрагмента как круг с учетом его радиуса
      ctx.beginPath();
      ctx.arc(0, 0, frag.radius, 0, Math.PI * 2);
      ctx.fill();
    } else if (frag.points && frag.points.length > 0) {
      ctx.beginPath();
      ctx.moveTo(frag.points[0].x, frag.points[0].y);
      for (let j = 1; j < frag.points.length; j++) {
        ctx.lineTo(frag.points[j].x, frag.points[j].y);
      }
      ctx.closePath();
      ctx.fill();
    } else {
      // Значение по умолчанию, если нет настроек – масштабируется
      ctx.fillRect(-5, -5, 10, 10);
    }
    ctx.restore();
  });
  ctx.restore();
}




function spawnSupernovaEffect(resource) {
  console.log("Запущен эффект суперновой для ресурса:", resource);
  const effect = {
    x: resource.x,
    y: resource.y,
    startTime: performance.now(),
    duration: 3000,         // Общая длительность эффекта (например, 3 сек)
    pulsateDuration: 2000,  // Фаза пульсации (2 сек)
    exploded: false,        // Флаг, что взрыв уже произошёл
    currentScale: 0.5,        // Текущий масштаб эффекта
    baseRadius: 50,         // Базовый радиус эффекта
    // Цвет ресурса передаётся, если он задан в объекте ресурса,
    // иначе используется значение по умолчанию
    resourceColor: resource.color || "#FFD700"
  };
  supernovaEffects.push(effect);
}

function updateSupernovaEffects(deltaTime) {
  const now = performance.now();
  for (let i = supernovaEffects.length - 1; i >= 0; i--) {
    const effect = supernovaEffects[i];
    const elapsed = now - effect.startTime;
    if (elapsed < effect.pulsateDuration) {
      // Фаза пульсации: эффект сжимается с небольшими осцилляциями
      const progress = elapsed / effect.pulsateDuration;
      const baseScale = 1 - 0.9 * progress; // от 1 до 0.1
      const pulsation = 0.1 * Math.sin(elapsed * 0.02 * Math.PI * 2);
      effect.currentScale = baseScale + pulsation;
    } else {
      if (!effect.exploded) {
        // При переходе в фазу взрыва генерируем осколки суперновой с нужными параметрами
        spawnSupernovaFragments(effect.x, effect.y, effect.baseRadius, effect.resourceColor);
        effect.exploded = true;
      }
      // Фаза затухания: эффект постепенно исчезает
      const fadeProgress = (elapsed - effect.pulsateDuration) / (effect.duration - effect.pulsateDuration);
      effect.currentScale = Math.max(0, effect.currentScale * (1 - fadeProgress));
    }
    if (elapsed >= effect.duration) {
      supernovaEffects.splice(i, 1);
    }
  }
}

function renderSupernovaEffects() {
  supernovaEffects.forEach(effect => {
    ctx.save();
    const screenPos = worldToScreen(effect.x, effect.y);
    ctx.translate(screenPos.x, screenPos.y);
    const screenRadius = effect.baseRadius * effect.currentScale * camera.scale;
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, screenRadius);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.5, effect.resourceColor);
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(0, 0, screenRadius, 0, 2 * Math.PI);
    ctx.fill();
    ctx.restore();
  });
}







// ==============================================
// Обработчики для установки стены (build zone) – МЫШЬ
function wallDragStartHandler(e) {
  e.preventDefault();
  e.stopPropagation();
  isWallDragging = true;
  wallDragStart = { x: e.clientX, y: e.clientY };
  currentWallDragZone = e.currentTarget;
}
function wallDragMoveHandler(e) {
  if (!isWallDragging) return;
  const dx = e.clientX - wallDragStart.x;
  const dy = e.clientY - wallDragStart.y;
  console.log("Перетаскивание стены (mouse): dx =", dx, "dy =", dy);
}
function wallDragEndHandler(e) {
  e.preventDefault();
  e.stopPropagation();
  if (!isWallDragging) return;
  const dx = e.clientX - wallDragStart.x;
  const dy = e.clientY - wallDragStart.y;
  let angle = Math.atan2(dy, dx);
  if (angle < 0) angle += 2 * Math.PI;
  angle = Math.round(angle / (Math.PI / 2)) * (Math.PI / 2);
  const worldPos = screenToWorld(e.clientX, e.clientY);
  console.log("Стена будет построена с углом (mouse):", angle * 180 / Math.PI, "°");
  placeBuildingWithOrientation(worldPos.x, worldPos.y, "wall", angle, "player");
  clearBuildZones();
  isWallDragging = false;
  currentWallDragZone = null;
}
  
// ==============================================
// Обработчики для установки стены (build zone) – TOUCH
function wallTouchStartHandler(e) {
  e.preventDefault();
  e.stopPropagation();
  if (e.touches.length > 0) {
    isWallDragging = true;
    const touch = e.touches[0];
    wallDragStart = { x: touch.clientX, y: touch.clientY };
    currentWallDragZone = e.currentTarget;
  }
}
function wallTouchMoveHandler(e) {
  e.preventDefault();
  if (!isWallDragging || e.touches.length === 0) return;
  const touch = e.touches[0];
  const dx = touch.clientX - wallDragStart.x;
  const dy = touch.clientY - wallDragStart.y;
  console.log("Перетаскивание стены (touch): dx =", dx, "dy =", dy);
}
function wallTouchEndHandler(e) {
  e.preventDefault();
  e.stopPropagation();
  if (!isWallDragging) return;
  const touch = e.changedTouches[0];
  const dx = touch.clientX - wallDragStart.x;
  const dy = touch.clientY - wallDragStart.y;
  let angle = Math.atan2(dy, dx);
  if (angle < 0) angle += 2 * Math.PI;
  angle = Math.round(angle / (Math.PI / 2)) * (Math.PI / 2);
  const worldPos = screenToWorld(touch.clientX, touch.clientY);
  console.log("Стена будет построена с углом (touch):", angle * 180 / Math.PI, "°");
  placeBuildingWithOrientation(worldPos.x, worldPos.y, "wall", angle, "player");
  clearBuildZones();
  isWallDragging = false;
  currentWallDragZone = null;
}
  
// Функция для привязки обработчиков стены к элементу (например, в showSingleBuildZone)
function attachWallEventListeners(zone) {
  zone.addEventListener("mousedown", wallDragStartHandler);
  zone.addEventListener("mousemove", wallDragMoveHandler);
  zone.addEventListener("mouseup", wallDragEndHandler);
  zone.addEventListener("mouseleave", e => {
    if (isWallDragging) { isWallDragging = false; currentWallDragZone = null; }
  });
  zone.addEventListener("touchstart", wallTouchStartHandler, { passive: false });
  zone.addEventListener("touchmove", wallTouchMoveHandler, { passive: false });
  zone.addEventListener("touchend", wallTouchEndHandler, { passive: false });
  zone.addEventListener("touchcancel", e => {
    isWallDragging = false; currentWallDragZone = null;
  }, { passive: false });
}

// ==============================================
// Обработчики кликов, двойного клика, контекстного меню и выделения рамкой
// ==============================================
function processCanvasClick(pos) {
  clearBuildZones();
  const worldPos = screenToWorld(pos.x, pos.y);
  
  // Поиск ресурса через квадродерево
  const clickedResource = getObjectsInRange(worldPos, 10)
    .find(r => (r.type === "gold" || r.type === "silicon" || r.type === "plasma"));
    
  // Поиск здания через квадродерево
  const clickedBuilding = getObjectsInRange(worldPos, 10)
    .find(b => b.owner === "player" && b instanceof Building);
  
  if (clickedBuilding) {
    if (clickedBuilding.type === "warehouse") { hireWorkerForPlayer(clickedBuilding); return; }
    if (clickedBuilding.type === "barracks") { hireFighterForPlayer(clickedBuilding); return; }
    if (clickedBuilding.type === "barracks2") { hireAssaultForPlayer(clickedBuilding); return; }
    if (clickedBuilding.type === "repairWorkshop") {
      recallRepairmenFromWorkshop(clickedBuilding);
      return;
    }
    if (clickedBuilding.type === "barracks3") { hireEliteForPlayer(clickedBuilding); return; }
    if (["base", "base2", "base3", "beacon"].includes(clickedBuilding.type)) {
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
  const clickedUnit = getObjectsInRange(worldPos, unitRadius)
    .find(u => u.owner === "player" && u instanceof Unit);
  if (clickedUnit) {
    selectedUnits = [clickedUnit];
  } else if (selectedUnits.length > 0) {
    selectedUnits.forEach(unit => {
      unit.commandQueue = [];
      if (unit.currentMovementAnimation) {
        cancelAnimationFrame(unit.currentMovementAnimation);
        unit.currentMovementAnimation = null;
      }
      const randomTarget = getRandomTargetPoint(worldPos.x, worldPos.y, 50);
      unit.commandQueue.push({ type: "move", x: randomTarget.x, y: randomTarget.y });
    });
  }
}

  
// Клики мышью и touch (для одиночного касания)
canvas.addEventListener("click", e => {
  processCanvasClick({ x: e.clientX, y: e.clientY });
});
canvas.addEventListener("touchend", e => {
  if (e.changedTouches.length === 1 && !document.querySelector(".selectionBox")) {
    const touch = e.changedTouches[0];
    processCanvasClick({ x: touch.clientX, y: touch.clientY });
  }
}, { passive: false });
  
// Двойной клик (dblclick)
canvas.addEventListener("dblclick", e => {
  clearBuildZones();
  const pos = screenToWorld(e.clientX, e.clientY);
  const clickedBuilding = gameState.buildings.find(b =>
    pos.x >= b.x - b.width / 2 && pos.x <= b.x + b.width / 2 &&
    pos.y >= b.y - b.height / 2 && pos.y <= b.y + b.height / 2
  );
  if (clickedBuilding) return;
  const unitRadius = 5;
  const clickedUnit = gameState.units.find(u =>
    u.owner === "player" &&
    Math.hypot(u.x - pos.x, u.y - pos.y) < unitRadius
  );
  if (clickedUnit) {
    selectedUnits = gameState.units.filter(u => u.owner === "player" && u.type === clickedUnit.type);
  } else {
    startSelectionFrame(e);
  }
});
  
// Контекстное меню (правый клик)
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
  

// Функция, вызывающая ремонтников из мастерской по клику
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
// Функция найма ремонтника для игрока
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
  workshop.repairman++;  // увеличиваем счётчик, а не вызываем push
  const { spawn, target } = spawnAtBoundary(workshop, 10);
  const repairman = new Unit("repairman", "player", spawn.x, spawn.y);
  repairman.homeWorkshop = workshop;
  gameState.units.push(repairman);
  moveUnit(repairman, target.x, target.y, () => {
    autoRepairDamagedObjects();
  });
}
// Новая функция для найма штурмовика из казармы2
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

function commandUnitsToAttack(owner, target) {
  gameState.units.forEach(u => {
    if (u.owner === owner && u.type === "fighter") {
      u.commandQueue.push({ type: "attack", target: target });
    }
  });
}

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

function hasBuilding(buildingType, owner) {function hasBuilding(buildingType, owner) {
  const found = gameState.buildings.some(b => b.owner === owner && b.type === buildingType);
  console.log(`hasBuilding(${buildingType}, ${owner}) =>`, found, gameState.buildings.filter(b => b.type === "barracks"));
  return found;
}

  return gameState.buildings.some(b => b.owner === owner && b.type === buildingType);
	console.log("Построены казармы:", gameState.buildings.filter(b => b.type === "barracks"));

}

function armySize(owner, unitType) {
  return gameState.units.filter(u => u.owner === owner && u.type === unitType).length;
}

function enemyNear(building, radius) {
  let enemyFound = false;
  gameState.units.forEach(u => { if (u.owner !== building.owner && Math.hypot(u.x - building.x, u.y - building.y) < radius) enemyFound = true; });
  gameState.buildings.forEach(b => { if (b.owner !== building.owner && Math.hypot(b.x - building.x, b.y - building.y) < radius) enemyFound = true; });
  return enemyFound;
}
// Вспомогательная функция для удаления юнита и корректировки счетчиков в зданиях
function removeUnit(unit) {
  const unitWidth = unit.width || 10;
  const unitHeight = unit.height || 10;
  // Создаем эффект разрушения
  spawnDestructionFragments(unit.x, unit.y, unitWidth, unitHeight, unit.type);
 // console.log(`Юнит ${unit.type} уничтожен.`);
  
  // Если это рабочий, уменьшаем счётчик в homeWarehouse
  if (unit.type === "worker" && unit.homeWarehouse) {
    unit.homeWarehouse.workers = Math.max(0, unit.homeWarehouse.workers - 1);
  }
  
  // Если это ремонтник, уменьшаем счётчик в мастерской
  if (unit.type === "repairman" && unit.homeWorkshop) {
    unit.homeWorkshop.repairman = Math.max(0, unit.homeWorkshop.repairman - 1);
  }
  // Если военный юнит – fighter, assault, elite – уменьшаем militaryCount в соответствующем здании
  if ((unit.type === "fighter" || unit.type === "assault" || unit.type === "elite") && unit.homeBuilding) {
    unit.homeBuilding.militaryCount = Math.max(0, unit.homeBuilding.militaryCount - 1);
  }
  
  // Удаляем юнита из глобального массива
  gameState.units = gameState.units.filter(u => u !== unit);
}
  // Остальная логика удаления юнита из gameState.units (обычно через фильтрацию)

function updateGameState(deltaTime) {
  // Обновляем квадродерево: очищаем и заново вставляем объекты
  quadtree.clear();
  gameState.buildings.forEach(b => quadtree.insert(b));
  gameState.units.forEach(u => quadtree.insert(u));
  gameState.resources.forEach(r => quadtree.insert(r));

  // Обновляем игровые объекты
  updateUnits(deltaTime);
  updateResources(deltaTime);
  updateBullets(deltaTime);
  updateFragments(deltaTime);
  updateFogOfWar();
	
	  processResourceDepletion(); 
	
	// Обновляем токены ресурсов, собираем их из рабочих
  // Сначала очищаем массив токенов
  gameState.resourceTokens = [];
  gameState.units.forEach(unit => {
    if (unit.type === "worker" && unit.carriedResourceToken) {
      updateWorkerResourceToken(unit);
      gameState.resourceTokens.push(unit.carriedResourceToken);
    }
  });
	
}
//const INFLUENCE_UPDATE_INTERVAL = 5; // обновляем зону влияния раз в 5 кадров
function gameLoop(time) {
  const deltaTime = (time - lastTime) / 1000;
  lastTime = time;
  
  // Обновляем игровые объекты
  updateUnits(deltaTime);
  updateResources(deltaTime);
  updateFragments(deltaTime);
  updateParticles(deltaTime);
  updateFogOfWar();
  
  // Перестройка квадродерева с актуальными позициями
  quadtree.clear();
  gameState.buildings.forEach(b => quadtree.insert(b));
  gameState.units.forEach(u => quadtree.insert(u));
  gameState.resources.forEach(r => quadtree.insert(r));
  processBuildQueue();
  
  // Обработка пуль и авто-ремонт
  updateBullets(deltaTime);
  autoRepairDamagedObjects();
  
  // Обновление турелей
  gameState.buildings.forEach(building => {
    if (building.type === "turret" || building.type === "turret2") {
      updateTurret(building);
    }
  });
  
  // Удаление зданий с нулевым здоровьем
  gameState.buildings = gameState.buildings.filter(b => b.health > 0);
  
  updateResourceUI();
  
  // Обновляем массив токенов ресурсов
  updateGameState(deltaTime);
  // Отрисовка токенов ресурсов
  renderResourceTokens();
	
	 // Обновление сетки зон влияния:
  updateZoneControlUI();
  smoothInfluenceGrid();
  normalizeInfluenceGrid();
	
  
  // Отрисовка игровых объектов
  renderGame();
  
  // Дополнительная отрисовка фрагментов и частиц
  drawFragments();
  renderParticles();
	
	 // Обновление UI: вывод счета зон контроля
  updateZoneControlUI();
  
  // Обновление логики ИИ с учётом зон влияния:
  aiUpdateZoneStrategy();
	
	  // Отдельно обновляем и отрисовываем эффекты суперновой
  updateSupernovaEffects(deltaTime);
  renderSupernovaEffects();
	
	frameCounter++;
  if (frameCounter % 30 === 0) {
    updateInfluenceGridByObjects();
  }
  

  
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
// Меню строительства
// Функция, возвращающая HTML-строку для пункта меню с учетом условий
// Функция, которая возвращает HTML для пункта меню, только если здание доступно для строительства
function getMenuItem(buildingType, label) {
  let available = false;
  if (buildingType === "warehouse") {
    // Склады можно строить сколько угодно – условие только по ресурсам
    available = canAfford(WAREHOUSE_COST, "player");
  } else if (buildingType === "repairWorkshop") {
    // Аналогично для мастерских
    available = canAfford(REPAIR_WORKSHOP_COST, "player");
  } else if (buildingType === "barracks") {
    // Казарма уникальна – должна быть только одна
    available = (
      hasBuilding("warehouse", "player") &&
      hasBuilding("repairWorkshop", "player") &&
      !hasBuilding("barracks", "player") &&
      !buildQueue.some(order => order.type === "barracks") &&
      canAfford(BARRACKS_COST, "player")
    );
  } else if (buildingType === "turret") {
    // Турели можно строить многократно, поэтому проверяем только предздания и ресурсы
    available = (
      hasBuilding("warehouse", "player") &&
      hasBuilding("barracks", "player") &&
      hasBuilding("repairWorkshop", "player") &&
      canAfford(TURRET_COST, "player")
    );
  } else if (buildingType === "wall") {
    // Стены можно строить многократно – убираем проверку уникальности
    available = (
      hasBuilding("warehouse", "player") &&
      hasBuilding("barracks", "player") &&
      hasBuilding("repairWorkshop", "player") &&
      canAfford(WALL_COST, "player")
    );
  } else if (buildingType === "beacon") {
    available = (
      hasBuilding("warehouse", "player") &&
      hasBuilding("barracks", "player") &&
      hasBuilding("turret", "player") &&
      hasBuilding("repairWorkshop", "player") &&
      canAfford(BEACON_COST, "player")
    );
  } else if (buildingType === "base2") {
    available = (
      !hasBuilding("base2", "player") &&
      hasBuilding("warehouse", "player") &&
      hasBuilding("barracks", "player") &&
      hasBuilding("turret", "player") &&
      hasBuilding("repairWorkshop", "player") &&
      hasBuilding("beacon", "player") &&
      canAfford(BASE2_COST, "player")
    );
  } else if (buildingType === "barracks2") {
    available = (
      hasBuilding("base2", "player") &&
      !hasBuilding("barracks2", "player") &&
      canAfford(BARRACKS2_COST, "player")
    );
  } else if (buildingType === "turret2") {
    // Убираем уникальность: больше одной можно строить
    available = (
      hasBuilding("barracks2", "player") &&
      canAfford(TURRET2_COST, "player")
    );
  } else if (buildingType === "base3") {
    available = (
      hasBuilding("base2", "player") &&
      hasBuilding("barracks2", "player") &&
      hasBuilding("turret2", "player") &&
      !hasBuilding("base3", "player") &&
      canAfford(BASE3_COST, "player")
    );
  } else if (buildingType === "barracks3") {
    available = (
      hasBuilding("base3", "player") &&
      !hasBuilding("barracks3", "player") &&
      canAfford(BARRACKS3_COST, "player")
    );
  }
  // Если здание недоступно, возвращаем пустую строку (то есть пункт не добавится в меню)
  if (!available) return "";
  // Если доступно, возвращаем пункт с зеленым текстом
  return `<div data-type="${buildingType}" style="color:green;">${label}</div>`;
}

// Функция обновления содержимого меню строительства
function updateBuildMenu(menu, building) {
  let html = "";
  html += getMenuItem("warehouse", "Склад");
  html += getMenuItem("repairWorkshop", "Мастерская");
  // Казарма появляется только если есть склад и мастерская, а сама ещё не построена
  if (hasBuilding("warehouse", "player") && hasBuilding("repairWorkshop", "player")) {
    html += getMenuItem("barracks", "Казарма");
  }
  if (hasBuilding("warehouse", "player") && hasBuilding("barracks", "player") && hasBuilding("repairWorkshop", "player")) {
    html += getMenuItem("turret", "Турель");
    html += getMenuItem("wall", "Стена");
  }
  if (hasBuilding("warehouse", "player") && hasBuilding("barracks", "player") &&
      hasBuilding("turret", "player") && hasBuilding("repairWorkshop", "player")) {
    html += getMenuItem("beacon", "Маяк");
  }
  // Продвинутые постройки
  if (!hasBuilding("base2", "player") &&
      hasBuilding("warehouse", "player") &&
      hasBuilding("barracks", "player") &&
      hasBuilding("turret", "player") &&
      hasBuilding("repairWorkshop", "player") &&
      hasBuilding("beacon", "player")) {
    html += getMenuItem("base2", "База2");
  } else if (hasBuilding("base2", "player")) {
    html += getMenuItem("barracks2", "Казарма2");
    html += getMenuItem("turret2", "Турель2");
    // База появляется, если есть база2/3, а ее ещё нет
    if ((hasBuilding("base2", "player") || hasBuilding("base3", "player")) && !hasBuilding("base", "player")) {
      html += getMenuItem("base", "База");
    }
    html += getMenuItem("base3", "База3");
    html += getMenuItem("barracks3", "Казарма3");
	  
  }
  menu.innerHTML = html;
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
    if (hasBuilding("barracks2", "player")) {
      menuHTML += getMenuItem("turret2", "Турель2");
    }
    // Добавляем базу первого типа, если уже есть база2 или база3 и её нет
    if ((hasBuilding("base2", "player") || hasBuilding("base3", "player")) && !hasBuilding("base", "player")) {
      menuHTML += getMenuItem("base", "База");
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
  // Добавляем обработчик клика для каждого пункта меню
  menu.querySelectorAll("div").forEach(item => {
    item.addEventListener("click", e => {
      const buildingType = e.target.getAttribute("data-type");
      // Дополнительная проверка для первой казармы:
      if (buildingType === "barracks") {
        if (hasBuilding("barracks", "player") || buildQueue.some(order => order.type === "barracks")) {
          showWarning("Казарма уже построена");
          return;
        }
      }
      showBuildZone(building, buildingType);
      menu.remove();
    });
  });
  document.body.appendChild(menu);
  console.log("Зона для здания", building.type, "создана. Экранные координаты:", screenPos);
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
  // Проверка, что объект можно построить (пересечения и т.д.)
  const buildingDimensions = {
    warehouse: { width: 10, height: 10 },
    repairWorkshop: { width: 10, height: 10 },
    barracks: { width: 15, height: 15 },
    turret: { width: 12, height: 12 },
    turret2: { width: 15, height: 17 },
    beacon: { width: 7, height: 20 },
    base: { width: 20, height: 20 },
    base2: { width: 25, height: 30 },
    base3: { width: 30, height: 30 },
    wall: { width: 40, height: 10 }
  };
  
  const dims = buildingDimensions[buildingType] || { width: 20, height: 20 };
  const newRect = { 
    left: x - dims.width / 2, 
    top: y - dims.height / 2, 
    right: x + dims.width / 2, 
    bottom: y + dims.height / 2 
  };
  for (let b of gameState.buildings) {
    const bRect = { 
      left: b.x - b.width / 2 - 5, 
      top: b.y - b.height / 2 - 5, 
      right: b.x + b.width / 2 + 5, 
      bottom: b.y + b.height / 2 + 5 
    };
    if (rectsOverlap(newRect, bRect)) { 
      showWarning("Нельзя строить здания, накладывая их друг на друга"); 
      return;
    }
  }
  
  // Списание ресурсов – для игрока
  if (owner === "player") {
    let cost;
    switch(buildingType) {
      case "warehouse":
        cost = WAREHOUSE_COST;
        break;
      case "repairWorkshop":
        cost = REPAIR_WORKSHOP_COST;
        break;
      case "barracks":
        cost = BARRACKS_COST;
        break;
      case "turret":
        cost = TURRET_COST;
        break;
      case "turret2":
        cost = TURRET2_COST;
        break;
      case "beacon":
        cost = BEACON_COST;
        break;
      case "base":
        cost = BASE_COST;
        break;
      case "base2":
        cost = BASE2_COST;
        break;
      case "base3":
        cost = BASE3_COST;
        break;
      case "wall":
        cost = WALL_COST;
        break;
      default:
        cost = { gold: 0, silicon: 0, plasma: 0 };
    }
    
    if (gameState.playerResources.gold < cost.gold ||
        gameState.playerResources.silicon < cost.silicon ||
        gameState.playerResources.plasma < cost.plasma) {
      showWarning("Недостаточно ресурсов для строительства");
      return;
    }
    gameState.playerResources.gold -= cost.gold;
    gameState.playerResources.silicon -= cost.silicon;
    gameState.playerResources.plasma -= cost.plasma;
    updateResourceUI();
  }
  
  // Создаем здание и добавляем его в gameState
  const building = new Building(buildingType, owner, x, y);
  building.width = dims.width;
  building.height = dims.height;
  gameState.buildings.push(building);
  
  console.log(`Здание ${buildingType} построено ${owner} в координатах:`, { x, y });
  
  // Если игрок строит турель, можно также запустить цикл автоматической стрельбы:
  if ((buildingType === "turret" || buildingType === "turret2") && owner === "player") {
    startTurretCycle(building);
  }
  
  // Обновляем меню построек: если оно открыто, удаляем его,
  // чтобы в нем сразу отразилось актуальное состояние (например, казарма исчезает).
  if (owner === "player") {
    const menu = document.getElementById("buildMenu");
    if (menu) {
      menu.remove();
    }
  }
  
  return building;
}
