// Функция отрисовки постоянного тумана (показывает, что участок уже был открыт)
// Здесь мы можем, например, затемнять его слегка (например, прозрачный серый цвет),
// чтобы скрыть ресурсы, но не затемнять полностью текущую динамику.
function initFogOfWar() {
  const cols = Math.ceil(worldWidth / FOG_CELL_SIZE);
  const rows = Math.ceil(worldHeight / FOG_CELL_SIZE);
  fogMap = [];
  persistentFogMap = []; // Обязательно инициализируем здесь!	
  for (let r = 0; r < rows; r++) {
    fogMap[r] = new Array(cols).fill(0); // 0 – ячейка покрыта туманом, 1 – видна
	persistentFogMap[r] = new Array(cols).fill(0); // 0 – ячейка не открыта ранее, 1 – уже была открыта
  }
}
 //Функция обновления тумана войны: сбрасывает fogMap и отмечает ячейки, находящиеся в зоне видимости юнитов игрока
function updateFogOfWar() {
  // Сброс всех ячеек до состояния "туман" (0)
  for (let r = 0; r < fogMap.length; r++) {
    for (let c = 0; c < fogMap[r].length; c++) {
      fogMap[r][c] = 0;
    }
  }
  
  // Собираем все объекты, от которых должен сниматься туман:
  // юниты игрока и здания игрока.
  let visionSources = gameState.units.filter(u => u.owner === "player")
    .concat(gameState.buildings.filter(b => b.owner === "player"));
  
  visionSources.forEach(source => {
    // Если объект задаёт свой радиус видимости, можно использовать его,
    // иначе - общий VISION_RADIUS.
    const visionRadius = source.visionRadius || VISION_RADIUS;
    
    const startCol = Math.max(0, Math.floor((source.x - visionRadius) / FOG_CELL_SIZE));
    const endCol = Math.min(fogMap[0].length - 1, Math.floor((source.x + visionRadius) / FOG_CELL_SIZE));
    const startRow = Math.max(0, Math.floor((source.y - visionRadius) / FOG_CELL_SIZE));
    const endRow = Math.min(fogMap.length - 1, Math.floor((source.y + visionRadius) / FOG_CELL_SIZE));
    
    for (let r = startRow; r <= endRow; r++) {
      for (let c = startCol; c <= endCol; c++) {
        // Вычисляем центр ячейки в мировых координатах
        const cellCenterX = c * FOG_CELL_SIZE + FOG_CELL_SIZE / 2;
        const cellCenterY = r * FOG_CELL_SIZE + FOG_CELL_SIZE / 2;
        // Если дистанция между источником и центром ячейки меньше радиуса видимости – отмечаем её как видимую (1)
        if (Math.hypot(source.x - cellCenterX, source.y - cellCenterY) <= visionRadius) {
          fogMap[r][c] = 1;
			 // Обновляем persistentFogMap: если ячейка видима, то она считается открытой навсегда
          persistentFogMap[r][c] = 1;
        }
      }
    }
  });
  
  //console.log("Пример fogMap (первая строка):", fogMap[0]);
}
//Функция отрисовки тумана войны: накладывает полупрозрачный слой на невидимые ячейки
function renderFogOfWar() {
	//console.log("renderFogOfWar called, fogMap:", fogMap);
  ctx.save();
  const cellScreenSize = FOG_CELL_SIZE * camera.scale;
  for (let r = 0; r < fogMap.length; r++) {
    for (let c = 0; c < fogMap[r].length; c++) {
      if (fogMap[r][c] < 1) {
        const worldX = c * FOG_CELL_SIZE;
        const worldY = r * FOG_CELL_SIZE;
        const screenPos = worldToScreen(worldX, worldY);
        // Вычисляем непрозрачность: для полностью невидимой ячейки alpha = 0.7
        const alpha = 0.1 * (1 - fogMap[r][c]);
        ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
        ctx.fillRect(screenPos.x, screenPos.y, cellScreenSize, cellScreenSize);
      }
    }
  }
  ctx.restore();
}
// Функция отрисовки постоянного тумана (показывает, что участок уже был открыт)
// Здесь мы можем, например, затемнять его слегка (например, прозрачный серый цвет),
// чтобы скрыть ресурсы, но не затемнять полностью текущую динамику.
function renderPersistentFog() {
  ctx.save();
  const cellScreenSize = FOG_CELL_SIZE * camera.scale;
  for (let r = 0; r < persistentFogMap.length; r++) {
    for (let c = 0; c < persistentFogMap[r].length; c++) {
      // Если ячейка не была открыта ранее (persistentFogMap == 0), рисуем затемнение (полностью закрываем)
      // Если ячейка открыта (== 1) – можно рисовать полупрозрачный слой, чтобы скрыть ресурсы.
      if (persistentFogMap[r][c] === 0) {
        // Ячейка не открыта: рисуем сплошное затемнение (черный)
        const worldX = c * FOG_CELL_SIZE;
        const worldY = r * FOG_CELL_SIZE;
        const screenPos = worldToScreen(worldX, worldY);
        ctx.fillStyle = "rgba(0,0,0,1)"; // полное затемнение
        ctx.fillRect(screenPos.x, screenPos.y, cellScreenSize, cellScreenSize);
      } else if (fogMap[r][c] < 1) {
        // Ячейка была открыта ранее, но сейчас не видна: затемняем её слегка (например, 0.5)
        const worldX = c * FOG_CELL_SIZE;
        const worldY = r * FOG_CELL_SIZE;
        const screenPos = worldToScreen(worldX, worldY);
        ctx.fillStyle = "rgba(0,0,0,0.1)";
        ctx.fillRect(screenPos.x, screenPos.y, cellScreenSize, cellScreenSize);
      }
      // Если динамически видна (fogMap[r][c] === 1), ничего не рисуем – игрок видит детали.
    }
  }
  ctx.restore();
}

function renderDynamicFog() {
  ctx.save();
  const cellScreenSize = FOG_CELL_SIZE * camera.scale;
  for (let r = 0; r < fogMap.length; r++) {
    for (let c = 0; c < fogMap[r].length; c++) {
      if (fogMap[r][c] < 1) { // если не видна сейчас
        const worldX = c * FOG_CELL_SIZE;
        const worldY = r * FOG_CELL_SIZE;
        const screenPos = worldToScreen(worldX, worldY);
        // Для полностью невидимых ячеек — затемняем их (alpha = 0.7)
        const alpha = 0.1;
        ctx.fillStyle = `rgba(0,0,0,${alpha})`;
        ctx.fillRect(screenPos.x, screenPos.y, cellScreenSize, cellScreenSize);
      }
    }
  }
  ctx.restore();
}
// Функция изменения размеров canvas и виртуального мира!!!
function resizeCanvas() {
  // Сохраняем старые размеры
  const oldWidth = canvas.width;
  const oldHeight = canvas.height;

  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  worldWidth = canvas.width * 3;
  worldHeight = canvas.height * 3;
  starField.init();
  initFogOfWar();

  // Определяем изменение центра canvas
  const dx = canvas.width / 2 - oldWidth / 2;
  const dy = canvas.height / 2 - oldHeight / 2;
  // Корректируем смещение камеры, чтобы сохранить относительный вид
  camera.offsetX += dx;
  camera.offsetY += dy;
}


window.addEventListener("resize", resizeCanvas);

resizeCanvas();
/* === Спавн баз игрока и ИИ === */
function getRandomBasePosition(margin) {
  const side = Math.floor(Math.random() * 4);
  let x, y;
  switch (side) {
    case 0:
      x = margin + Math.random() * (worldWidth - 2 * margin);
      y = margin;
      break;
    case 1:
      x = worldWidth - margin;
      y = margin + Math.random() * (worldHeight - 2 * margin);
      break;
    case 2:
      x = margin + Math.random() * (worldWidth - 2 * margin);
      y = worldHeight - margin;
      break;
    case 3:
      x = margin;
      y = margin + Math.random() * (worldHeight - 2 * margin);
      break;
  }
  return { x, y };
}
const margin = 100;
const playerPos = getRandomBasePosition(margin);
const aiPos = getRandomBasePosition(margin);
const playerBase = new Building("base", "player", playerPos.x, playerPos.y);
let aiBase = new Building("base", "ai", aiPos.x, aiPos.y);
gameState.buildings.push(playerBase, aiBase);
camera.offsetX = canvas.width / 2 - playerBase.x * camera.scale;
camera.offsetY = canvas.height / 2 - playerBase.y * camera.scale;
// Ограничение зума
const MAX_SCALE = 2;
function setZoom(newScale, zoomCenterX, zoomCenterY) {
  if (newScale > MAX_SCALE) { newScale = MAX_SCALE; }
  const worldPoint = screenToWorld(zoomCenterX, zoomCenterY);
  camera.scale = newScale;
  const newScreenPoint = worldToScreen(worldPoint.x, worldPoint.y);
  camera.offsetX += zoomCenterX - newScreenPoint.x;
  camera.offsetY += zoomCenterY - newScreenPoint.y;
  clearBuildZones();
}
canvas.addEventListener("wheel", e => {
  e.preventDefault();
  const zoomFactor = 1.02;
  let newScale = camera.scale;
  newScale = e.deltaY < 0 ? newScale * zoomFactor : newScale / zoomFactor;
  setZoom(newScale, e.clientX, e.clientY);
});
// Функция показа предупреждений
function showWarning(message) {
  const warningDiv = document.createElement("div");
  warningDiv.innerText = message;
  warningDiv.style.position = "fixed";
  warningDiv.style.top = "20px";
  warningDiv.style.right = "20px";
  warningDiv.style.background = "rgba(255, 0, 0, 0.8)";
  warningDiv.style.color = "white";
  warningDiv.style.padding = "10px 15px";
  warningDiv.style.borderRadius = "5px";
  warningDiv.style.zIndex = 10000;
  document.body.appendChild(warningDiv);
  setTimeout(() => warningDiv.remove(), 2000);
}
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

function getBuilding(type, owner) {
  return gameState.buildings.find(b => b.type === type && b.owner === owner);
}
// Функция для генерации формы золота (самородка)
function createGoldShape() {
  const numPoints = 8;
  const baseRadius = 10;
  const points = [];
  for (let i = 0; i < numPoints; i++) {
    const angle = (i / numPoints) * Math.PI * 2;
    const offset = (Math.random() - 0.5) * 4;
    const r = baseRadius + offset;
    points.push({ x: r * Math.cos(angle), y: r * Math.sin(angle) });
  }
  return { points, baseRadius };
}
// Функция линейной интерполяции угла с учётом краткости
function lerpAngle(a, b, t) {
  let diff = ((b - a + Math.PI) % (2 * Math.PI)) - Math.PI;
  return a + diff * t;
}
// Функция динамичного перемещения с элементом случайного "виляния"
function dynamicMove(unit, target, deltaTime) {
  const desiredAngle = Math.atan2(target.y - unit.y, target.x - unit.x);
  unit.angle = lerpAngle(unit.angle, desiredAngle, TURN_SPEED * deltaTime);
  const wanderX = (Math.random() - 0.5) * WANDER_STRENGTH;
  const wanderY = (Math.random() - 0.5) * WANDER_STRENGTH;
  const vx = Math.cos(unit.angle) * BASE_SPEED + wanderX;
  const vy = Math.sin(unit.angle) * BASE_SPEED + wanderY;
  unit.x += vx * deltaTime;
  unit.y += vy * deltaTime;
}
// Функция атаки для штурмовика (assault) – два режима: пулемётный огонь и ракетный выстрел
function dynamicAttackAssault(unit, target, deltaTime) {
  if (!target || target.health <= 0) {
    unit.target = null;
    return;
  }
  
  const currentDistance = Math.hypot(target.x - unit.x, target.y - unit.y);
  const now = performance.now();
  
  // 1. Пулемётный огонь: если цель в пределах machineGunRange и прошёл интервал стрельбы
  if (currentDistance <= unit.machineGunRange && (now - unit.lastMachineGunFireTime >= unit.machineGunFireRate)) {
    // Используем стандартную функцию fireBullet для пулемётного огня
    fireBullet(unit, target);
    unit.lastMachineGunFireTime = now;
  }
  
  // 2. Ракетный выстрел: если цель в пределах rocketRange и кулдаун истёк
  if (currentDistance <= unit.rocketRange && (now - unit.lastRocketFireTime >= unit.rocketCooldown)) {
    let rocket = new Bullet(unit.x, unit.y, unit.angle, MISSILE_CONFIG.speed, unit, target);
    rocket.lifetime = MISSILE_CONFIG.lifetime;
    rocket.damage = MISSILE_CONFIG.damage;
    rocket.splashRadius = MISSILE_CONFIG.splashRadius;
    rocket.splashDamage = MISSILE_CONFIG.splashDamage;
    rocket.isMissile = true;
    rocket.target = target;
    rocket.color = "255,0,0"; // Цвет ракет (можно изменить)
    gameState.bullets.push(rocket);
    unit.lastRocketFireTime = now;
  }
  
  // Независимое движение, чтобы штурмовик продолжал маневрировать
  dynamicMove(unit, target, deltaTime);
}
// Вызов в основной функции атаки
function dynamicAttack(unit, target, deltaTime) {
  if (unit.type === "elite") {
    dynamicAttackElite(unit, target, deltaTime);
    return;
  }
  if (unit.type === "assault") {
    dynamicAttackAssault(unit, target, deltaTime);
    return;
  }
  
  // Логика для fighter и других типов:
  if (!target || target.health <= 0) {
    unit.target = null;
    return;
  }
  
  const currentDistance = Math.hypot(target.x - unit.x, target.y - unit.y);
  if (currentDistance > unit.range) {
    unit.target = null;
    return;
  }
  
  const now = performance.now();
  
  if (unit.type === "fighter") {
    if (now - unit.lastFireTime >= unit.fireRate) {
      fireBullet(unit, target);
      unit.lastFireTime = now;
    }
    dynamicMove(unit, target, deltaTime);
  }
}

function dynamicAttackElite(unit, target, deltaTime) {
  if (!target || target.health <= 0) {
    unit.target = null;
    return;
  }
  
  const currentDistance = Math.hypot(target.x - unit.x, target.y - unit.y);
  // Если цель выходит за общий радиус поражения, прекращаем атаку
  if (currentDistance > unit.range) {
    unit.target = null;
    return;
  }
  
  const now = performance.now();
  
  // 1. Меле атака с использованием дроби (пеллетов)
if (currentDistance <= unit.meleeRange && now - unit.lastMeleeAttack >= unit.meleeCooldown) {
  const pelletCount = 7; // количество пеллетов
  const spreadAngle = 30 * Math.PI / 180; // общий разброс, например, 30 градусов в радианах
  for (let i = 0; i < pelletCount; i++) {
    // Вычисляем смещение угла для каждой пеллеты
    const angleOffset = -spreadAngle/2 + (spreadAngle * i) / (pelletCount - 1);
    const bulletAngle = unit.angle + angleOffset;
    // Создаем новую пулю для melee атаки
    let pellet = new Bullet(unit.x, unit.y, bulletAngle, MELEE_BULLET_CONFIG.speed, unit, target);
    pellet.lifetime = MELEE_BULLET_CONFIG.lifetime;
    pellet.damage = MELEE_BULLET_CONFIG.damage;
    pellet.isMelee = true; // Флаг, чтобы отличить эти пули, если понадобится
    pellet.color = "255,165,0"; // Например, оранжевый цвет для дроби
    gameState.bullets.push(pellet);
  }
  unit.lastMeleeAttack = now;
}

  
  // 2.  залп (используя логику, аналогичную артиллерии)
  if (currentDistance <= unit.artilleryRange && now - unit.lastArtilleryAttack >= unit.artilleryCooldown) {
  const artilleryCount = 5 + Math.floor(Math.random() * 6); // от 5 до 10 артиллерийских снарядов
  for (let i = 0; i < artilleryCount; i++) {
    const artilleryAngle = unit.angle + (Math.random() - 0.5) * 0.2;
    let artillery = new Bullet(unit.x, unit.y, artilleryAngle, ARTILLERY_BULLET_CONFIG.speed, unit, target);
    artillery.lifetime = ARTILLERY_BULLET_CONFIG.lifetime;
    artillery.damage = ARTILLERY_BULLET_CONFIG.damage;
    artillery.splashRadius = ARTILLERY_BULLET_CONFIG.splashRadius;
    artillery.splashDamage = ARTILLERY_BULLET_CONFIG.splashDamage;
    artillery.color = "0,255,0";
    gameState.bullets.push(artillery);
  }
  unit.lastArtilleryAttack = now;
}

  
  // 3. Лазерный выстрел
  if (currentDistance <= unit.laserRange && now - unit.lastLaserAttack >= unit.laserCooldown) {
    const laserLength = unit.laserRange;
    const laserDamage = 50;
    const penetrations = 4;
    // Сохраняем параметры лазерного луча для отрисовки
    unit.laserBeam = {
      startX: unit.x,
      startY: unit.y,
      endX: unit.x + Math.cos(unit.angle) * laserLength,
      endY: unit.y + Math.sin(unit.angle) * laserLength,
      timestamp: now
    };
    
    let hits = 0;
    // Получаем список потенциальных целей, отсортированный по расстоянию вдоль направления атаки
    const enemyCandidates = gameState.units.concat(gameState.buildings)
      .filter(e => e.owner !== unit.owner && e.health > 0);
    enemyCandidates.sort((a, b) => {
      const da = ((a.x - unit.x) * Math.cos(unit.angle) + (a.y - unit.y) * Math.sin(unit.angle));
      const db = ((b.x - unit.x) * Math.cos(unit.angle) + (b.y - unit.y) * Math.sin(unit.angle));
      return da - db;
    });
    for (let enemy of enemyCandidates) {
      const proj = ((enemy.x - unit.x) * Math.cos(unit.angle) + (enemy.y - unit.y) * Math.sin(unit.angle));
      if (proj > 0 && proj < laserLength) {
        const perp = Math.abs(-Math.sin(unit.angle) * (enemy.x - unit.x) + Math.cos(unit.angle) * (enemy.y - unit.y));
        if (perp < 20) {
          enemy.health -= laserDamage;
          if (enemy.health <= 0) {
            if (enemy instanceof Building) {
              spawnParticles(enemy.x, enemy.y, "red");
              gameState.buildings = gameState.buildings.filter(b => b !== enemy);
            } else if (enemy instanceof Unit) {
              gameState.units = gameState.units.filter(u => u !== enemy);
              selectedUnits = selectedUnits.filter(u => u !== enemy);
            }
          }
          hits++;
          if (hits >= penetrations) break;
        }
      }
    }
    unit.lastLaserAttack = now;
  }
  
  // Независимое маневрирование: вызываем общую функцию движения, чтобы юнит не стоял на месте во время атаки
  dynamicMove(unit, target, deltaTime);
}
// Функция анимации перемещения и масштабирования
function animateMoveAndScale(unit, targetX, targetY, targetScale, duration, callback) {
  const startTime = performance.now();
  const startX = unit.x, startY = unit.y, startScale = unit.scale;
  function step() {
    const now = performance.now();
    const t = Math.min((now - startTime) / duration, 1);
    unit.x = startX + t * (targetX - startX);
    unit.y = startY + t * (targetY - startY);
    unit.scale = startScale + t * (targetScale - startScale);
    if (t < 1) {
      requestAnimationFrame(step);
    } else {
      if (callback) callback();
    }
  }
  step();
}
// Обновление UI ресурсов
function updateResourceUI() {
  document.getElementById("playerGold").innerText = gameState.playerResources.gold;
  document.getElementById("playerSilicon").innerText = gameState.playerResources.silicon;
  document.getElementById("playerPlasma").innerText = gameState.playerResources.plasma;
  document.getElementById("aiGold").innerText = gameState.aiResources.gold;
  document.getElementById("aiSilicon").innerText = gameState.aiResources.silicon;
  document.getElementById("aiPlasma").innerText = gameState.aiResources.plasma;
}
// Функция вычисления позиции спавна возле здания
function spawnAtBoundary(building, offset = 10) {
  const edge = Math.floor(Math.random() * 4);
  let spawn = { x: building.x, y: building.y };
  let target = { x: building.x, y: building.y };
  if (edge === 0) {
    spawn.x = building.x + (Math.random() - 0.5) * building.width;
    spawn.y = building.y - building.height / 2;
    target.x = spawn.x; target.y = spawn.y - offset;
  } else if (edge === 1) {
    spawn.x = building.x + building.width / 2;
    spawn.y = building.y + (Math.random() - 0.5) * building.height;
    target.x = spawn.x + offset; target.y = spawn.y;
  } else if (edge === 2) {
    spawn.x = building.x + (Math.random() - 0.5) * building.width;
    spawn.y = building.y + building.height / 2;
    target.x = spawn.x; target.y = spawn.y + offset;
  } else if (edge === 3) {
    spawn.x = building.x - building.width / 2;
    spawn.y = building.y + (Math.random() - 0.5) * building.height;
    target.x = spawn.x - offset; target.y = spawn.y;
  }
  return { spawn, target };
}
// Пространственный индекс для поиска целей
function buildSpatialIndex() {
  const index = {};
  function addToIndex(obj) {
    const cellX = Math.floor(obj.x / GRID_SIZE);
    const cellY = Math.floor(obj.y / GRID_SIZE);
    const key = cellX + "_" + cellY;
    if (!index[key]) index[key] = [];
    index[key].push(obj);
  }
  gameState.units.forEach(u => addToIndex(u));
  gameState.buildings.forEach(b => addToIndex(b));
  return index;
}

function getEnemiesInRange(pos, range) {
  const index = buildSpatialIndex();
  const gridRadius = Math.ceil(range / GRID_SIZE);
  const cellX = Math.floor(pos.x / GRID_SIZE);
  const cellY = Math.floor(pos.y / GRID_SIZE);
  let candidates = [];
  for (let dx = -gridRadius; dx <= gridRadius; dx++) {
    for (let dy = -gridRadius; dy <= gridRadius; dy++) {
      const key = (cellX + dx) + "_" + (cellY + dy);
      if (index[key]) candidates = candidates.concat(index[key]);
    }
  }
  return candidates;
}
// Функция поиска ближайшей базы/склада для доставки ресурсов
function findNearestDeliveryBuilding(x, y, owner) {
  let buildings = gameState.buildings.filter(b =>
    b.owner === owner && (b.type === "warehouse" || b.type === "base" || b.type === "base2" || b.type === "base3")
  );
  let nearest = null, minDist = Infinity;
  buildings.forEach(b => {
    const d = Math.hypot(b.x - x, b.y - y);
    if (d < minDist) { minDist = d; nearest = b; }
  });
  return nearest;
}
// Функция обновления ресурсов (вращение золота)
function updateResources(deltaTime) {
  gameState.resources.forEach(resource => {
    if (resource.type === "gold") {
      resource.rotation += resource.rotationSpeed * deltaTime;
    }
  });
}
// Функция проверки видимости базы
function isBaseVisible(base) {
  const screenPos = worldToScreen(base.x, base.y);
  return (
    screenPos.x >= 0 && screenPos.x <= canvas.width &&
    screenPos.y >= 0 && screenPos.y <= canvas.height
  );
}
// Обновление кнопки навигации по базе
function updateBase3NavButton() {
  const playerBase3 = gameState.buildings.find(b => b.owner === "player" && b.type === "base3");
  if (!playerBase3) {
    const existing = document.getElementById("base3NavButton");
    if (existing) existing.remove();
    return;
  }
  let btn = document.getElementById("base3NavButton");
  if (!isBaseVisible(playerBase3)) {
    if (!btn) {
      btn = document.createElement("button");
      btn.id = "base3NavButton";
      btn.innerText = "База3";
      btn.style.position = "fixed";
      btn.style.bottom = "20px";
      btn.style.left = "220px";
      btn.style.opacity = "0.7";
      btn.style.zIndex = "1000";
      btn.addEventListener("click", () => {
        camera.offsetX = canvas.width / 2 - playerBase3.x * camera.scale;
        camera.offsetY = canvas.height / 2 - playerBase3.y * camera.scale;
      });
      document.body.appendChild(btn);
    }
  } else {
    if (btn) btn.remove();
  }
}

function updateBase2NavButton() {
  const playerBase2 = gameState.buildings.find(b => b.owner === "player" && b.type === "base2");
  if (!playerBase2) {
    const existing = document.getElementById("base2NavButton");
    if (existing) existing.remove();
    return;
  }
  let btn = document.getElementById("base2NavButton");
  if (!isBaseVisible(playerBase2)) {
    if (!btn) {
      btn = document.createElement("button");
      btn.id = "base2NavButton";
      btn.innerText = "База2";
      btn.style.position = "fixed";
      btn.style.bottom = "20px";
      btn.style.left = "120px";
      btn.style.opacity = "0.7";
      btn.style.zIndex = "1000";
      btn.addEventListener("click", () => {
        camera.offsetX = canvas.width / 2 - playerBase2.x * camera.scale;
        camera.offsetY = canvas.height / 2 - playerBase2.y * camera.scale;
      });
      document.body.appendChild(btn);
    }
  } else {
    if (btn) btn.remove();
  }
}

function updateBaseNavButton() {
  const base = playerBase;
  let btn = document.getElementById("baseNavButton");
  if (!isBaseVisible(base)) {
    if (!btn) {
      btn = document.createElement("button");
      btn.id = "baseNavButton";
      btn.innerText = "База";
      btn.style.position = "fixed";
      btn.style.bottom = "20px";
      btn.style.left = "20px";
      btn.style.opacity = "0.7";
      btn.style.zIndex = "1000";
      btn.addEventListener("click", () => {
        camera.offsetX = canvas.width / 2 - playerBase.x * camera.scale;
        camera.offsetY = canvas.height / 2 - playerBase.y * camera.scale;
      });
      document.body.appendChild(btn);
    }
  } else {
    if (btn) btn.remove();
  }
}

function showBuildZone(building, buildingType) {
  clearBuildZones();
  showSingleBuildZone(building, buildingType);
  if (building.type === "base" || building.type === "base2" || building.type === "base3" || building.type === "beacon") {
    const searchRadius = 150;
    const nearbyBuildings = gameState.buildings.filter(b =>
      b.owner === "player" &&
      (b.type === "warehouse" || b.type === "barracks" || b.type === "base" || b.type === "barracks2" || b.type === "base2" || b.type === "barracks3" || b.type === "base3" || b.type === "beacon" || b.type === "repairWorkshop") &&
      b !== building && Math.hypot(b.x - building.x, b.y - building.y) <= searchRadius
    );
    nearbyBuildings.forEach(b => showSingleBuildZone(b, buildingType));
  }
}

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
    zone.addEventListener("mousedown", e => {
      e.stopPropagation();
      isWallDragging = true;
      wallDragStart = { x: e.clientX, y: e.clientY };
      currentWallDragZone = zone;
    });
    zone.addEventListener("mousemove", e => {
      // Можно добавить визуальный индикатор (например, линию от начала перетаскивания до текущей позиции)
      if (isWallDragging && currentWallDragZone) {
        // Для простоты выводим отладочную информацию в консоль
        const dx = e.clientX - wallDragStart.x;
        const dy = e.clientY - wallDragStart.y;
        console.log("Перетаскивание стены: dx =", dx, "dy =", dy);
      }
    });
    zone.addEventListener("mouseup", e => {
      if (!isWallDragging) return;
      const dragEnd = { x: e.clientX, y: e.clientY };
      const dx = dragEnd.x - wallDragStart.x;
      const dy = dragEnd.y - wallDragStart.y;
      // Вычисляем угол в радианах
      let angle = Math.atan2(dy, dx);
      if (angle < 0) angle += 2 * Math.PI;
      // Округляем до ближайшего кратного 90° (π/2)
      angle = Math.round(angle / (Math.PI / 2)) * (Math.PI / 2);
      // Определяем позицию строительства по точке отпускания мыши
      const worldPos = screenToWorld(e.clientX, e.clientY);
      console.log("Стена будет построена с ориентацией:", angle * 180 / Math.PI, "°");
      // Вызываем функцию установки стены с указанной ориентацией
      placeBuildingWithOrientation(worldPos.x, worldPos.y, buildingType, angle, "player");
      clearBuildZones();
      isWallDragging = false;
      currentWallDragZone = null;
    });
    // Если пользователь отходит с курсором за пределы зоны — сбрасываем перетаскивание
    zone.addEventListener("mouseleave", e => {
      if (isWallDragging) {
        isWallDragging = false;
        currentWallDragZone = null;
      }
    });
  }
	
	
  zone.addEventListener("click", e => {
    e.stopPropagation();
    const worldPos = screenToWorld(e.clientX, e.clientY);
    console.log("Клик по зоне, строим", buildingType, "в", worldPos);
    placeBuilding(worldPos.x, worldPos.y, buildingType, "player");
    clearBuildZones();
  });
  document.body.appendChild(zone);
  console.log("Зона для здания", building.type, "с опцией", buildingType, "создана. Экранные координаты:", screenPos);
}
// Функция для удаления временных DOM-элементов (build zones, меню, рамки выделения)
function clearBuildZones() {
  document.querySelectorAll(".buildZone").forEach(zone => zone.remove());
  const buildMenu = document.getElementById("buildMenu");
  if (buildMenu) buildMenu.remove();
}
// Функция обработки очереди команд
function processCommandQueue(unit) {
  if (unit.commandQueue.length === 0) {
    if (unit.type === "fighter" &&
        getEnemiesInRange({ x: unit.x, y: unit.y }, unit.range)
          .filter(e => e.owner !== unit.owner && e.health > 0).length > 0) {
      requestAnimationFrame(function cycle() {
        if (unit.commandQueue.length === 0 && unit.type === "fighter") {
          if (getEnemiesInRange({ x: unit.x, y: unit.y }, unit.range)
                .filter(e => e.owner !== unit.owner && e.health > 0).length > 0) {
            let newTarget = unit.target;
            if (!newTarget || newTarget.health <= 0) {
              const candidates = getEnemiesInRange({ x: unit.x, y: unit.y }, unit.range)
                                  .filter(e => e.owner !== unit.owner && e.health > 0);
              newTarget = candidates.length > 0 ? candidates[0] : null;
              unit.target = newTarget;
            }
            if (unit.target) dynamicAttack(unit, unit.target, 1/60);
            requestAnimationFrame(cycle);
          }
        }
      });
    }
    return;
  }
  unit.maneuvering = false;
  const command = unit.commandQueue.shift();
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
    if (unit.type === "fighter" || unit.type === "assault") {
      const d = Math.hypot(unit.x - command.target.x, unit.y - command.target.y);
      if (d > unit.range) {
        moveUnit(unit, command.target.x, command.target.y, () => processCommandQueue(unit));
      } else {
        dynamicAttack(unit, command.target, 1/60);
        requestAnimationFrame(() => processCommandQueue(unit));
      }
    } else {
      moveUnit(unit, command.target.x, command.target.y, () => processCommandQueue(unit));
    }
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
          if (resource.amount > 0) unit.commandQueue.unshift({ type: "gather", resource: resource });
          processCommandQueue(unit);
        });
      } else {
        if (resource.amount > 0) unit.commandQueue.unshift({ type: "gather", resource: resource });
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

function generateResources() {
  const resourceTypes = ["gold", "silicon", "plasma"];
  resourceTypes.forEach(type => {
    for (let i = 0; i < 90; i++) {
      const x = Math.random() * (worldWidth - 20) + 10;
      const y = Math.random() * (worldHeight - 20) + 10;
      const max = type === "gold" ? 500 : type === "silicon" ? 500 : 500;
      gameState.resources.push(new Resource(type, x, y, max, max));
    }
  });
}
generateResources();

function hireWorkerForPlayer(warehouse) {
  if (warehouse.workers >= 5) { showWarning("Максимум рабочих для этого склада достигнут"); return; }
  if (gameState.playerResources.gold < WORKER_COST.gold ||
      gameState.playerResources.silicon < WORKER_COST.silicon ||
      gameState.playerResources.plasma < WORKER_COST.plasma) {
    showWarning("Недостаточно ресурсов для найма рабочего");
    return;
  }
  gameState.playerResources.gold -= WORKER_COST.gold;
  gameState.playerResources.silicon -= WORKER_COST.silicon;
  gameState.playerResources.plasma -= WORKER_COST.plasma;
  updateResourceUI();
  warehouse.workers++;
  const { spawn, target } = spawnAtBoundary(warehouse, 10);
  const worker = new Unit("worker", "player", spawn.x, spawn.y);
  worker.homeWarehouse = warehouse;
  gameState.units.push(worker);
  moveUnit(worker, target.x, target.y, () => {
    if (AUTO_COLLECT_ENABLED && worker.commandQueue.length === 0) {
      startWorkerCycle(worker, warehouse);
    }
  });
}

function hireFighterForPlayer(barracks) {
  if (gameState.playerResources.gold < FIGHTER_COST.gold ||
      gameState.playerResources.silicon < FIGHTER_COST.silicon ||
      gameState.playerResources.plasma < FIGHTER_COST.plasma) {
    showWarning("Недостаточно ресурсов для найма истребителя");
    return;
  }
  gameState.playerResources.gold -= FIGHTER_COST.gold;
  gameState.playerResources.silicon -= FIGHTER_COST.silicon;
  gameState.playerResources.plasma -= FIGHTER_COST.plasma;
  updateResourceUI();
  barracks.fighters = (barracks.fighters || 0) + 1;
  const { spawn, target } = spawnAtBoundary(barracks, 10);
  const fighter = new Unit("fighter", "player", spawn.x, spawn.y);
  gameState.units.push(fighter);
  moveUnit(fighter, target.x, target.y, () => startFighterCycle(fighter));
}

function hireEliteForPlayer(barracks3) {
  const ELITE_COST = { 
    gold: FIGHTER_COST.gold * 2, 
    silicon: FIGHTER_COST.silicon * 2, 
    plasma: FIGHTER_COST.plasma * 2 
  };
  if (gameState.playerResources.gold < ELITE_COST.gold ||
      gameState.playerResources.silicon < ELITE_COST.silicon ||
      gameState.playerResources.plasma < ELITE_COST.plasma) {
    showWarning("Недостаточно ресурсов для найма элитного бойца");
    return;
  }
  gameState.playerResources.gold -= ELITE_COST.gold;
  gameState.playerResources.silicon -= ELITE_COST.silicon;
  gameState.playerResources.plasma -= ELITE_COST.plasma;
  updateResourceUI();
  barracks3.fighters = (barracks3.fighters || 0) + 1;
  const { spawn, target } = spawnAtBoundary(barracks3, 10);
  const elite = new Unit("elite", "player", spawn.x, spawn.y);
  gameState.units.push(elite);
  moveUnit(elite, target.x, target.y, () => startFighterCycle(elite));
}