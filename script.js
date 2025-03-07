function spawnExplosionEffect(x, y) {
  // Вспышка: крупная белая частица с коротким временем жизни
  const flashParticle = {
    x: x,
    y: y,
    vx: 0,
    vy: 0,
    life: 0.1,      // очень короткое время жизни
    maxLife: 0.1,
    radius: 30,     // большой радиус вспышки
    color: "white",
    flash: true     // флаг, что это вспышка
  };
  gameState.particles.push(flashParticle);

  // Остальные частицы взрыва (например, оранжевые)
  const particleCount = 15 + Math.floor(Math.random() * 10);
  for (let i = 0; i < particleCount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 80 + Math.random() * 80;
    const life = 0.5 + Math.random() * 0.5;
    const explosionParticle = {
      x: x,
      y: y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: life,
      maxLife: life,
      radius: 2,
      color: "orange",
      flash: false
    };
    gameState.particles.push(explosionParticle);
  }
}

// Функция создания эффекта искр при попадании пули
function spawnSparkEffect(x, y) {
  const sparkCount = 5 + Math.floor(Math.random() * 5);
  for (let i = 0; i < sparkCount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 50 + Math.random() * 50;
    const life = 0.3 + Math.random() * 0.3;
    const spark = {
      x: x,
      y: y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: life,
      maxLife: life,
      radius: 2,
      color: "yellow",
      flash: false
    };
    gameState.particles.push(spark);
  }
}

// Функция обновления частиц (для вспышек, взрыва, искр и т.д.)
function updateParticles(deltaTime) {
  for (let i = gameState.particles.length - 1; i >= 0; i--) {
    const p = gameState.particles[i];
    p.x += p.vx * deltaTime;
    p.y += p.vy * deltaTime;
    if (p.flash) {
      // Для вспышки можно уменьшать радиус, чтобы эффект быстрее затухал
      p.radius *= 0.8;
    }
    p.life -= deltaTime;
    if (p.life <= 0) {
      gameState.particles.splice(i, 1);
    }
  }
}

// Функция отрисовки частиц с учетом камеры
function renderParticles() {
  ctx.save();
  // Применяем преобразования камеры, чтобы частицы отрисовывались в мировых координатах
  ctx.translate(camera.offsetX, camera.offsetY);
  ctx.scale(camera.scale, camera.scale);
  
  gameState.particles.forEach(p => {
    const alpha = p.life / p.maxLife;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
  ctx.restore();
}

// Обновленная функция обработки пуль
function updateBullets(deltaTime) {
  for (let i = gameState.bullets.length - 1; i >= 0; i--) {
    let bullet = gameState.bullets[i];

    if (bullet.isMissile && bullet.target && bullet.target.health > 0) {
      const desiredAngle = Math.atan2(bullet.target.y - bullet.y, bullet.target.x - bullet.x);
      bullet.angle = lerpAngle(bullet.angle, desiredAngle, 0.2);
    }

    bullet.x += Math.cos(bullet.angle) * bullet.speed * deltaTime;
    bullet.y += Math.sin(bullet.angle) * bullet.speed * deltaTime;

    const hitTargets = getObjectsInRange({ x: bullet.x, y: bullet.y }, 10)
      .filter(target => target.owner !== bullet.shooter.owner && target.health > 0);
    if (hitTargets.length > 0) {
      hitTargets.forEach(target => {
        target.health -= bullet.damage;
        // Если это обычная пуля (не ракета и не артиллерия) – создаем эффект искр
        if (!bullet.isMissile && !bullet.isArtillery) {
          spawnSparkEffect(bullet.x, bullet.y);
        }
        if (target.health <= 0) {
          spawnDestructionFragments(target.x, target.y, target.width, target.height, target.type);
        }
      });
      gameState.bullets.splice(i, 1);
      continue;
    }

    bullet.lifetime -= deltaTime;
    if (bullet.lifetime <= 0) {
      if (bullet.isMissile || bullet.isArtillery) {
        spawnExplosionEffect(bullet.x, bullet.y);
        const targets = gameState.units.concat(gameState.buildings).filter(target => {
          return target.owner !== bullet.shooter.owner &&
                 target.health > 0 &&
                 Math.hypot(target.x - bullet.x, target.y - bullet.y) <= bullet.splashRadius;
        });
        targets.forEach(target => {
          target.health -= bullet.splashDamage;
          if (target.health <= 0) {
            spawnDestructionFragments(target.x, target.y, target.width, target.height, target.type);
          }
        });
      }
      gameState.bullets.splice(i, 1);
    }
  }
}

// Пример обновления пуль с вызовом эффекта попадания (искры)
// При попадании пули создается эффект искр (spawnSparkEffect) и/или взрыв, если это ракета.
function updateBullets(deltaTime) {
  for (let i = gameState.bullets.length - 1; i >= 0; i--) {
    let bullet = gameState.bullets[i];

    if (bullet.isMissile && bullet.target && bullet.target.health > 0) {
      const desiredAngle = Math.atan2(bullet.target.y - bullet.y, bullet.target.x - bullet.x);
      bullet.angle = lerpAngle(bullet.angle, desiredAngle, 0.2);
    }

    bullet.x += Math.cos(bullet.angle) * bullet.speed * deltaTime;
    bullet.y += Math.sin(bullet.angle) * bullet.speed * deltaTime;

    const hitTargets = getObjectsInRange({ x: bullet.x, y: bullet.y }, 10)
      .filter(target => target.owner !== bullet.shooter.owner && target.health > 0);
    if (hitTargets.length > 0) {
      hitTargets.forEach(target => {
        target.health -= bullet.damage;
        // Если это обычная пуля (не ракета и не артиллерия) – создаем эффект искр
        if (!bullet.isMissile && !bullet.isArtillery) {
          spawnSparkEffect(bullet.x, bullet.y);
        }
        if (target.health <= 0) {
          spawnDestructionFragments(target.x, target.y, target.width, target.height, target.type);
        }
      });
      gameState.bullets.splice(i, 1);
      continue;
    }

    bullet.lifetime -= deltaTime;
    if (bullet.lifetime <= 0) {
      // Для ракет и артиллерийских снарядов вызываем эффект взрыва с вспышкой
      if (bullet.isMissile || bullet.isArtillery) {
        spawnExplosionEffect(bullet.x, bullet.y);
        const targets = gameState.units.concat(gameState.buildings).filter(target => {
          return target.owner !== bullet.shooter.owner &&
                 target.health > 0 &&
                 Math.hypot(target.x - bullet.x, target.y - bullet.y) <= bullet.splashRadius;
        });
        targets.forEach(target => {
          target.health -= bullet.splashDamage;
          if (target.health <= 0) {
            spawnDestructionFragments(target.x, target.y, target.width, target.height, target.type);
          }
        });
      }
      gameState.bullets.splice(i, 1);
    }
  }
}

// ============================
// ==== Класс Quadtree ========
// ============================




function addUnit(unit) {
  // Добавляем в общий список
  gameState.units.push(unit);

  // Если это боевой юнит, добавляем в attackers
  if (unit.type === "fighter" || unit.type === "assault" || unit.type === "elite") {
    gameState.attackers.push(unit);
  }

  // Если это ремонтник, добавляем в repairmen
  if (unit.type === "repairman") {
    gameState.repairmen.push(unit);
  }

  // Если у юнита уже установлен флаг защиты, можно сразу добавить его в defenders
  if (unit.defending) {
    gameState.defenders.push(unit);
  }
}

// Функция удаления юнита
function removeUnit(unit) {
  gameState.units = gameState.units.filter(u => u !== unit);
  if (unit.type === "fighter" || unit.type === "assault" || unit.type === "elite") {
    gameState.attackers = gameState.attackers.filter(u => u !== unit);
  }
  if (unit.type === "repairman") {
    gameState.repairmen = gameState.repairmen.filter(u => u !== unit);
  }
  if (unit.defending) {
    gameState.defenders = gameState.defenders.filter(u => u !== unit);
  }
}

class Quadtree {
  constructor(bounds, capacity = 4) {
    this.bounds = bounds; // { x, y, width, height }
    this.capacity = capacity;
    this.objects = [];
    this.divided = false;
  }
  
  insert(object) {
    if (!this.contains(this.bounds, object)) return false;

    if (this.objects.length < this.capacity) {
      this.objects.push(object);
      return true;
    }

    if (!this.divided) this.subdivide();

    return (
      this.northwest.insert(object) ||
      this.northeast.insert(object) ||
      this.southwest.insert(object) ||
      this.southeast.insert(object)
    );
  }

  subdivide() {
    const { x, y, width, height } = this.bounds;
    const halfW = width / 2;
    const halfH = height / 2;

    this.northwest = new Quadtree({ x, y, width: halfW, height: halfH }, this.capacity);
    this.northeast = new Quadtree({ x: x + halfW, y, width: halfW, height: halfH }, this.capacity);
    this.southwest = new Quadtree({ x, y: y + halfH, width: halfW, height: halfH }, this.capacity);
    this.southeast = new Quadtree({ x: x + halfW, y: y + halfH, width: halfW, height: halfH }, this.capacity);

    this.divided = true;
  }

  query(range, found = []) {
    if (!this.intersects(this.bounds, range)) return found;

    for (const obj of this.objects) {
      if (this.contains(range, obj)) {
        found.push(obj);
      }
    }

    if (this.divided) {
      this.northwest.query(range, found);
      this.northeast.query(range, found);
      this.southwest.query(range, found);
      this.southeast.query(range, found);
    }

    return found;
  }

  contains(rect, object) {
    return (
      object.x >= rect.x &&
      object.x <= rect.x + rect.width &&
      object.y >= rect.y &&
      object.y <= rect.y + rect.height
    );
  }

  intersects(rect1, rect2) {
    return !(
      rect1.x > rect2.x + rect2.width ||
      rect1.x + rect1.width < rect2.x ||
      rect1.y > rect2.y + rect2.height ||
      rect1.y + rect1.height < rect2.y
    );
  }

  clear() {
    this.objects = [];
    if (this.divided) {
      this.northwest.clear();
      this.northeast.clear();
      this.southwest.clear();
      this.southeast.clear();
      this.divided = false;
    }
  }
}


// Вспомогательные переменные для долгого тапа
let longTapTimeout;
let longTapFired = false;
const longTapDuration = 600; // время в мс, по истечении которого считается long tap

// Обработчик для touchstart
canvas.addEventListener("touchstart", e => {
  if (e.touches.length === 1) {
    longTapFired = false; // сбрасываем флаг
    const touch = e.touches[0];
    longTapTimeout = setTimeout(() => {
      processLongTap(touch);
      longTapFired = true;
    }, longTapDuration);
  }
}, { passive: false });

// Если происходит движение – отменяем long tap
canvas.addEventListener("touchmove", e => {
  clearTimeout(longTapTimeout);
}, { passive: false });

// Обработчик для touchend
canvas.addEventListener("touchend", e => {
  clearTimeout(longTapTimeout);
  // Если долгий тап уже сработал – не вызываем обычный обработчик
  if (longTapFired) {
    e.preventDefault();
    return;
  }
  // Если это обычное касание, обрабатываем как клик
  if (e.changedTouches.length === 1 && !document.querySelector(".selectionBox")) {
    const touch = e.changedTouches[0];
    processCanvasClick({ x: touch.clientX, y: touch.clientY });
  }
}, { passive: false });

function processLongTap(touch) {
  const pos = screenToWorld(touch.clientX, touch.clientY);
  const unitRadius = 5;
  // Ищем юнит, на котором произошло долгого нажатие
  const tappedUnit = gameState.units.find(u =>
    u.owner === "player" && Math.hypot(u.x - pos.x, u.y - pos.y) < unitRadius
  );
  if (tappedUnit) {
    // Выделяем все юниты того же типа
    selectedUnits = gameState.units.filter(u => u.owner === "player" && u.type === tappedUnit.type);
  }
}



// Добавляем новое свойство для хранения фрагментов в состоянии игры:
gameState.fragments = [];

// Функция для генерации фрагментов при разрушении объекта (юнита или здания)
// Функция для генерации фрагментов разрушения в виде нерегулярных многоугольников

function spawnDestructionFragments(x, y, width, height, unitType) {
  // Если unitType начинается с "#", предполагаем, что это уже цвет
  // Иначе ищем соответствующий цвет в объекте fragmentColors
  const color = (typeof unitType === "string" && unitType.startsWith("#"))
    ? unitType
    : (fragmentColors[unitType] || "gray"); // Если не найден, используем gray

  // Количество фрагментов можно задавать как случайное число
  const numFragments = Math.floor(Math.random() * 4) + 4;
  const avgRadius = (width + height) / 6;

  for (let i = 0; i < numFragments; i++) {
    const numVertices = Math.floor(Math.random() * 4) + 4;
    const points = [];
    for (let j = 0; j < numVertices; j++) {
      const baseAngle = (j / numVertices) * 2 * Math.PI;
      const angleOffset = (Math.random() - 0.5) * (Math.PI / numVertices);
      const angle = baseAngle + angleOffset;
      const radius = avgRadius * (0.7 + Math.random() * 0.6);
      points.push({
        x: radius * Math.cos(angle),
        y: radius * Math.sin(angle)
      });
    }
    const fragment = {
      x: x,
      y: y,
      vx: (Math.random() - 0.5) * 100,
      vy: (Math.random() - 0.5) * 100,
      angle: Math.random() * Math.PI * 4,
      angularVelocity: (Math.random() - 1) * 4,
      points: points,
      life: 3 + Math.random() * 2,
      maxLife: 3 + Math.random() * 2,
      color: color
    };
    gameState.fragments.push(fragment);
  }
}





// Функция обновления фрагментов (вызывается каждый кадр, deltaTime в секундах)
function updateFragments(deltaTime) {
  // Проходим по фрагментам в обратном порядке, чтобы безопасно удалять просроченные
  for (let i = gameState.fragments.length - 1; i >= 0; i--) {
    const frag = gameState.fragments[i];
    // Обновление позиции по скорости
    frag.x += frag.vx * deltaTime;
    frag.y += frag.vy * deltaTime;
    // Обновление угла поворота
    frag.angle += frag.angularVelocity * deltaTime;
    // Если гравитация не нужна – убираем её (иначе можно раскомментировать следующую строку)
    // frag.vy += 300 * deltaTime;
    // Немного затухания скорости для сохранения импульса
    frag.vx *= 0.99;
    frag.vy *= 0.99;
    // Уменьшаем оставшееся время жизни
    frag.life -= deltaTime;
    if (frag.life <= 0) {
      gameState.fragments.splice(i, 1);
    }
  }
}

// Функция отрисовки фрагментов с учетом камеры (зум, смещение)
function drawFragments() {
  ctx.save();
  // Применяем текущие смещения и масштаб камеры
  ctx.translate(camera.offsetX, camera.offsetY);
  ctx.scale(camera.scale, camera.scale);
  gameState.fragments.forEach(frag => {
    ctx.save();
    ctx.translate(frag.x, frag.y);
    ctx.rotate(frag.angle);
    // Прозрачность зависит от оставшегося времени жизни
    const alpha = Math.max(0, frag.life / frag.maxLife);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = frag.color;
    // Рисуем фрагмент как многоугольник, если заданы вершины
    if (frag.points && frag.points.length > 0) {
      ctx.beginPath();
      ctx.moveTo(frag.points[0].x, frag.points[0].y);
      for (let j = 1; j < frag.points.length; j++) {
        ctx.lineTo(frag.points[j].x, frag.points[j].y);
      }
      ctx.closePath();
      ctx.fill();
    } else {
      // Если по какой-то причине не заданы вершины, рисуем квадрат
      ctx.fillRect(-5, -5, 10, 10);
    }
    ctx.restore();
  });
  ctx.restore();
}



//ctx.restore()
// Инициализация тумана войны с расширением persistentFogMap без полного сброса
function initFogOfWar() {
  const cols = Math.ceil(worldWidth / FOG_CELL_SIZE);
  const rows = Math.ceil(worldHeight / FOG_CELL_SIZE);

  // Пересоздаём fogMap полностью
  fogMap = [];
  for (let r = 0; r < rows; r++) {
    fogMap[r] = new Array(cols).fill(0);
  }
  
  // Если persistentFogMap ещё не создан, создаём его полностью
  if (!persistentFogMap || persistentFogMap.length === 0) {
    persistentFogMap = [];
    for (let r = 0; r < rows; r++) {
      persistentFogMap[r] = new Array(cols).fill(0);
    }
  } else {
    // Если уже существует, расширяем (или обрезаем) его до новых размеров, сохраняя уже открытые ячейки
    const currentRows = persistentFogMap.length;
    const currentCols = persistentFogMap[0].length;
    // Расширяем или обрезаем строки
    for (let r = 0; r < rows; r++) {
      if (r < currentRows) {
        // Расширяем текущую строку, если нужно
        while (persistentFogMap[r].length < cols) {
          persistentFogMap[r].push(0);
        }
        // Если строка стала длиннее, обрезаем её
        persistentFogMap[r] = persistentFogMap[r].slice(0, cols);
      } else {
        // Добавляем новые строки
        persistentFogMap[r] = new Array(cols).fill(0);
      }
    }
    // Если новых строк меньше, чем было раньше, обрезаем массив строк
    persistentFogMap = persistentFogMap.slice(0, rows);
  }
}

// Функция обновления тумана войны (не изменена логика, но добавлена проверка)
function updateFogOfWar() {
  if (!fogMap || fogMap.length === 0 || !fogMap[0]) return;
  
  // Сброс всех ячеек fogMap до состояния "туман" (0)
  for (let r = 0; r < fogMap.length; r++) {
    for (let c = 0; c < fogMap[r].length; c++) {
      fogMap[r][c] = 0;
    }
  }
  
  // Источники видимости: юниты и здания игрока
  let visionSources = gameState.units.filter(u => u.owner === "player")
    .concat(gameState.buildings.filter(b => b.owner === "player"));
  
  visionSources.forEach(source => {
    const visionRadius = source.visionRadius || VISION_RADIUS;
    const startCol = Math.max(0, Math.floor((source.x - visionRadius) / FOG_CELL_SIZE));
    const endCol = Math.min(fogMap[0].length - 1, Math.floor((source.x + visionRadius) / FOG_CELL_SIZE));
    const startRow = Math.max(0, Math.floor((source.y - visionRadius) / FOG_CELL_SIZE));
    const endRow = Math.min(fogMap.length - 1, Math.floor((source.y + visionRadius) / FOG_CELL_SIZE));
    
    for (let r = startRow; r <= endRow; r++) {
      for (let c = startCol; c <= endCol; c++) {
        const cellCenterX = c * FOG_CELL_SIZE + FOG_CELL_SIZE / 2;
        const cellCenterY = r * FOG_CELL_SIZE + FOG_CELL_SIZE / 2;
        if (Math.hypot(source.x - cellCenterX, source.y - cellCenterY) <= visionRadius) {
          fogMap[r][c] = 1;
          persistentFogMap[r][c] = 1;
        }
      }
    }
  });
}

// Функция отрисовки динамичного тумана (на текущем участке)
function renderFogOfWar() {
  ctx.save();
  const cellScreenSize = FOG_CELL_SIZE * camera.scale;
  for (let r = 0; r < fogMap.length; r++) {
    for (let c = 0; c < fogMap[r].length; c++) {
      if (fogMap[r][c] < 1) {
        const worldX = c * FOG_CELL_SIZE;
        const worldY = r * FOG_CELL_SIZE;
        const screenPos = worldToScreen(worldX, worldY);
        const alpha = 0.1 * (1 - fogMap[r][c]);
        ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
        ctx.fillRect(screenPos.x, screenPos.y, cellScreenSize, cellScreenSize);
      }
    }
  }
  ctx.restore();
}

// Функция отрисовки постоянного тумана (показывает, что участок уже был открыт)
function renderPersistentFog() {
  ctx.save();
  const cellScreenSize = FOG_CELL_SIZE * camera.scale;
  for (let r = 0; r < persistentFogMap.length; r++) {
    for (let c = 0; c < persistentFogMap[r].length; c++) {
      if (persistentFogMap[r][c] === 0) {
        // Если ячейка никогда не была открыта – полностью затемняем
        const worldX = c * FOG_CELL_SIZE;
        const worldY = r * FOG_CELL_SIZE;
        const screenPos = worldToScreen(worldX, worldY);
        ctx.fillStyle = "rgba(0,0,0,0.1)";
        ctx.fillRect(screenPos.x, screenPos.y, cellScreenSize, cellScreenSize);
      } else if (fogMap[r][c] < 1) {
        // Если ячейка была открыта ранее, но сейчас не видна – слегка затемняем
        const worldX = c * FOG_CELL_SIZE;
        const worldY = r * FOG_CELL_SIZE;
        const screenPos = worldToScreen(worldX, worldY);
        ctx.fillStyle = "rgba(0,0,0,0.1)";
        ctx.fillRect(screenPos.x, screenPos.y, cellScreenSize, cellScreenSize);
      }
      // Если fogMap[r][c] === 1, ничего не рисуем – участок полностью виден
    }
  }
  ctx.restore();
}

// Функция отрисовки дополнительного динамичного тумана
function renderDynamicFog() {
  ctx.save();
  const cellScreenSize = FOG_CELL_SIZE * camera.scale;
  for (let r = 0; r < fogMap.length; r++) {
    for (let c = 0; c < fogMap[r].length; c++) {
      if (fogMap[r][c] < 1) {
        const worldX = c * FOG_CELL_SIZE;
        const worldY = r * FOG_CELL_SIZE;
        const screenPos = worldToScreen(worldX, worldY);
        const alpha = 0.1; // фиксированная степень затемнения
        ctx.fillStyle = `rgba(0,0,0,${alpha})`;
        ctx.fillRect(screenPos.x, screenPos.y, cellScreenSize, cellScreenSize);
      }
    }
  }
  ctx.restore();
}

// Функция изменения размеров canvas и виртуального мира с сохранением текущего вида
function resizeCanvas() {
  const oldWidth = canvas.width;
  const oldHeight = canvas.height;
  
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  // Размеры виртуального мира – в 3 раза больше видимой области
  worldWidth = canvas.width * 2;
  worldHeight = canvas.height * 2;
  console.log("worldWidth:", worldWidth, "worldHeight:", worldHeight);
  
  starField.init();
  // Вместо полного сброса persistentFogMap, расширяем его через initFogOfWar
  initFogOfWar();
  
  // Корректируем смещение камеры, чтобы сохранить текущий вид относительно центра
  const dx = canvas.width / 2 - oldWidth / 2;
  const dy = canvas.height / 2 - oldHeight / 2;
  camera.offsetX += dx;
  camera.offsetY += dy;
	
	// Инициализируем квадродерево с размерами мира
  quadtree = new Quadtree({ x: 0, y: 0, width: worldWidth, height: worldHeight });

  console.log("Квадродерево обновлено с размерами:", worldWidth, worldHeight);
}
window.addEventListener("resize", resizeCanvas);

resizeCanvas();
/* === Спавн баз игрока и ИИ === */
function getRandomBasePosition(margin, minDistance, existingBase = null) {
  let pos;
  let valid = false;
  while (!valid) {
    // Выбираем случайную сторону (0 – верх, 1 – правый, 2 – низ, 3 – левый)
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
    pos = { x, y };

    // Если уже есть существующая база, проверяем расстояние
    if (existingBase) {
      const dist = Math.hypot(pos.x - existingBase.x, pos.y - existingBase.y);
      if (dist >= minDistance) {
        valid = true;
      }
    } else {
      valid = true;
    }
  }
  return pos;
}

const margin = 200;
const minBaseDistance = 1000; // минимальное расстояние между базами

// Сначала генерируем позицию для базы игрока
const playerPos = getRandomBasePosition(margin, minBaseDistance);
const playerBase = new Building("base", "player", playerPos.x, playerPos.y);

// Для базы ИИ передаем позицию базы игрока, чтобы гарантировать нужное расстояние
let aiPos = getRandomBasePosition(margin, minBaseDistance, playerPos);
const aiBase = new Building("base", "ai", aiPos.x, aiPos.y);

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




// Функция динамичного перемещения с физической моделью (ускорение, инерция, орбитальное маневрирование)
function dynamicMove(unit, target, deltaTime) {
  const dx = target.x - unit.x;
  const dy = target.y - unit.y;
  const distance = Math.hypot(dx, dy);
  if (distance === 0) return;
  
  // Вычисляем желаемый угол движения (направление к цели)
  const desiredAngle = Math.atan2(dy, dx);
  
  // Плавное приближение к нужному углу (можно настроить скорость поворота)
  const maxTurnSpeed = 0.5;
  unit.angle = lerpAngle(unit.angle, desiredAngle, maxTurnSpeed);
  
  // Определяем направление "носа"
  const frontDirX = Math.cos(unit.angle);
  const frontDirY = Math.sin(unit.angle);
  
  // Если цель – здание, желаемая дистанция – граница здания, иначе значение из unit или стандартное 100
  const desiredDistance = target instanceof Building 
    ? (Math.max(target.width, target.height) / 2) + 10 
    : (unit.desiredDistance || 100);
  
  // Определяем ошибку дистанции
  const distanceError = distance - desiredDistance;
  
  // Коэффициенты для прямого приближения и орбитального манёвра
  const approachStrength = 1.1;
  const orbitStrength = 1.1;
  
  // Тангенциальный вектор (перпендикулярен направлению "носа")
  const tanX = -frontDirY;
  const tanY = frontDirX;
  
  // Если ошибка мала, не обнуляем скорость, а добавляем небольшой орбитальный импульс
  let ax, ay;
  if (Math.abs(distanceError) < 1) {
    ax = tanX * orbitStrength;
    ay = tanY * orbitStrength;
  } else {
    ax = frontDirX * distanceError * approachStrength + tanX * orbitStrength;
    ay = frontDirY * distanceError * approachStrength + tanY * orbitStrength;
  }
  
  if (typeof unit.vx !== 'number') unit.vx = 0;
  if (typeof unit.vy !== 'number') unit.vy = 0;
  
  // Применяем затухание, чтобы сохранить плавность движения
  const damping = 0.995;
  unit.vx = unit.vx * damping + ax * deltaTime;
  unit.vy = unit.vy * damping + ay * deltaTime;
  
  // Ограничиваем максимальную скорость
  const maxSpeed = 50;
  const currentSpeed = Math.hypot(unit.vx, unit.vy);
  if (currentSpeed > maxSpeed) {
    unit.vx = (unit.vx / currentSpeed) * maxSpeed;
    unit.vy = (unit.vy / currentSpeed) * maxSpeed;
  }
  
  unit.x += unit.vx * deltaTime;
  unit.y += unit.vy * deltaTime;
}

function dynamicMoveAdvanced(unit, target, deltaTime) {
  const dx = target.x - unit.x;
  const dy = target.y - unit.y;
  const distance = Math.hypot(dx, dy);
  if (distance === 0) return;

  // Основной желаемый угол движения к цели
  const desiredAngle = Math.atan2(dy, dx);

  // Плавное приближение к нужному углу
  const baseTurnSpeed = 0.05;
  unit.angle = lerpAngle(unit.angle, desiredAngle, baseTurnSpeed);

  // Направление "носа"
  const frontDirX = Math.cos(unit.angle);
  const frontDirY = Math.sin(unit.angle);

  // Желаемая дистанция: для зданий — граница, для юнитов — заданное значение или 100
  const desiredDistance = target instanceof Building 
    ? (Math.max(target.width, target.height) / 2) + 10 
    : (unit.desiredDistance || 100);

  const distanceError = distance - desiredDistance;

  // Базовое ускорение, направленное по линии к цели
  const approachStrength = 1.1;
  const ax_base = frontDirX * distanceError * approachStrength;
  const ay_base = frontDirY * distanceError * approachStrength;

  // Дополнительное ускорение (тактическая составляющая)
  let tacticAx = 0, tacticAy = 0;
  if (unit.tactic === "orbit") {
    // Орбитальное движение: постоянное тангенциальное ускорение, направленное перпендикулярно линии к цели
    const orbitStrength = 100; // настройте по желанию
    // Перпендикуляр к desiredAngle
    const perpX = -Math.sin(desiredAngle);
    const perpY = Math.cos(desiredAngle);
    tacticAx = perpX * orbitStrength;
    tacticAy = perpY * orbitStrength;
  } else if (unit.tactic === "figure8") {
    // Атака по "восьмерке": периодическое изменение направления тангенциального ускорения
    const figure8Strength = 100; // настройте по желанию
    // Частота, например, 1 циклов в секунду
    const t = performance.now() / 1000;
    const factor = Math.sin(t * 2 * Math.PI);
    const perpX = -Math.sin(desiredAngle);
    const perpY = Math.cos(desiredAngle);
    tacticAx = perpX * figure8Strength * factor;
    tacticAy = perpY * figure8Strength * factor;
  }

  // Итоговое ускорение – сумма базового и тактического
  const ax = ax_base + tacticAx;
  const ay = ay_base + tacticAy;

  if (typeof unit.vx !== 'number') unit.vx = 0;
  if (typeof unit.vy !== 'number') unit.vy = 0;
  
  // Применяем затухание, чтобы сохранить плавность движения
  const damping = 0.995;
  unit.vx = unit.vx * damping + ax * deltaTime;
  unit.vy = unit.vy * damping + ay * deltaTime;

  // Ограничиваем максимальную скорость – увеличьте, если хотите сильный импульс
  const maxSpeed = 60;
  const currentSpeed = Math.hypot(unit.vx, unit.vy);
  if (currentSpeed > maxSpeed) {
    unit.vx = (unit.vx / currentSpeed) * maxSpeed;
    unit.vy = (unit.vy / currentSpeed) * maxSpeed;
  }

  unit.x += unit.vx * deltaTime;
  unit.y += unit.vy * deltaTime;
  
  // Для отладки можно вывести текущую скорость:
  console.log("DynamicMoveAdvanced, current speed:", Math.hypot(unit.vx, unit.vy));
}
// Функция атаки для штурмовика (assault)
// Сначала выполняется стрельба, затем юнит продолжает маневрировать, используя новую физическую модель движения
function dynamicAttackAssault(unit, target, deltaTime) {
  if (unit.health <= 0) return;
  if (!target || target.health <= 0) {
    unit.target = null;
    return;
  }
  
  // Добавляем проверку расстояния как у fighter:
  const currentDistance = Math.hypot(target.x - unit.x, target.y - unit.y);
  if (currentDistance > unit.range) {
    unit.target = null;
    return;
  }
  
  const now = performance.now();
  
  // 1. Пулемётный огонь
  if (currentDistance <= unit.machineGunRange && (now - unit.lastMachineGunFireTime >= unit.machineGunFireRate)) {
    fireBullet(unit, target);
    unit.lastMachineGunFireTime = now;
  }
  
  // 2. Ракетный выстрел
  if (currentDistance <= unit.rocketRange && (now - unit.lastRocketFireTime >= unit.rocketCooldown)) {
    let rocket = new Bullet(unit.x, unit.y, unit.angle, MISSILE_CONFIG.speed, unit, target);
    rocket.lifetime = MISSILE_CONFIG.lifetime;
    rocket.damage = MISSILE_CONFIG.damage;
    rocket.splashRadius = MISSILE_CONFIG.splashRadius;
    rocket.splashDamage = MISSILE_CONFIG.splashDamage;
    rocket.isMissile = true;
    rocket.target = target;
    rocket.color = "255,0,0";
    gameState.bullets.push(rocket);
    gameState.bullets.push(rocket);
    unit.lastRocketFireTime = now;
  }
  
  // Маневрируем, используя динамическое движение
  dynamicMove(unit, target, deltaTime);
}
// Функция атаки для элитного юнита
function dynamicAttackElite(unit, target, deltaTime) {
  if (unit.health <= 0 || !target || target.health <= 0) {
    unit.target = null;
    return;
  }

  const currentDistance = Math.hypot(target.x - unit.x, target.y - unit.y);
  const preferredRange = unit.artilleryPreferredRange || unit.artilleryRange || 300;
  const now = performance.now();
  
  // Если цель слишком близко – может потребоваться отступить, чтобы обеспечить оптимальную дистанцию для артиллерии/лазера.
  if (currentDistance < preferredRange * 0.8) {
    const angleAway = Math.atan2(unit.y - target.y, unit.x - target.x);
    const retreatX = target.x + Math.cos(angleAway) * preferredRange;
    const retreatY = target.y + Math.sin(angleAway) * preferredRange;
    dynamicMove(unit, { x: retreatX, y: retreatY }, deltaTime);
  } else if (currentDistance > preferredRange * 1.2) {
    // Если цель слишком далеко – подлетаем.
    dynamicMove(unit, target, deltaTime);
  }

  // Отдельно обрабатываем melee-атаку
  if (currentDistance <= unit.meleeRange && now - unit.lastMeleeAttack >= unit.meleeCooldown) {
    // Выполнение melee-атаки
    const desiredAngle = Math.atan2(target.y - unit.y, target.x - unit.x);
    const pelletCount = 7;
    const spreadAngle = 30 * Math.PI / 180;
    for (let i = 0; i < pelletCount; i++) {
      const angleOffset = -spreadAngle / 2 + (spreadAngle * i) / (pelletCount - 1);
      const bulletAngle = desiredAngle + angleOffset;
      let pellet = new Bullet(unit.x, unit.y, bulletAngle, MELEE_BULLET_CONFIG.speed, unit, target);
      pellet.lifetime = MELEE_BULLET_CONFIG.lifetime;
      pellet.damage = MELEE_BULLET_CONFIG.damage;
      pellet.isMelee = true;
      pellet.color = "255,165,0";
      gameState.bullets.push(pellet);
    }
    unit.lastMeleeAttack = now;
  }

  // Отдельно обрабатываем артиллерию, если цель в пределах
  if (currentDistance <= unit.artilleryRange && now - unit.lastArtilleryAttack >= unit.artilleryCooldown) {
  const desiredAngle = Math.atan2(target.y - unit.y, target.x - unit.x);
  const artilleryCount = 5 + Math.floor(Math.random() * 6);
  for (let i = 0; i < artilleryCount; i++) {
    const artilleryAngle = desiredAngle + (Math.random() - 0.5) * 0.2;
    let artillery = new Bullet(unit.x, unit.y, artilleryAngle, ARTILLERY_BULLET_CONFIG.speed, unit, target);
    artillery.lifetime = ARTILLERY_BULLET_CONFIG.lifetime;
    artillery.damage = ARTILLERY_BULLET_CONFIG.damage;
    artillery.splashRadius = ARTILLERY_BULLET_CONFIG.splashRadius;
    artillery.splashDamage = ARTILLERY_BULLET_CONFIG.splashDamage;
    artillery.color = "0,255,0";
    artillery.isArtillery = true; // Отмечаем, что это артиллерийский снаряд
    gameState.bullets.push(artillery);
  }
  unit.lastArtilleryAttack = now;
}


  // Отдельно обрабатываем лазерный выстрел, если цель в пределах
  if (currentDistance <= unit.laserRange && now - unit.lastLaserAttack >= unit.laserCooldown) {
  // Вычисляем угол от юнита до цели
  const laserAngle = Math.atan2(target.y - unit.y, target.x - unit.x);
  const laserLength = unit.laserRange;
  const laserDamage = 50;
  const penetrations = 4;
  unit.laserBeam = {
    startX: unit.x,
    startY: unit.y,
    endX: unit.x + Math.cos(laserAngle) * laserLength,
    endY: unit.y + Math.sin(laserAngle) * laserLength,
    timestamp: now
  };

  let hits = 0;
  const enemyCandidates = gameState.units.concat(gameState.buildings)
    .filter(e => e.owner !== unit.owner && e.health > 0);
  enemyCandidates.sort((a, b) => {
    const da = ((a.x - unit.x) * Math.cos(laserAngle) + (a.y - unit.y) * Math.sin(laserAngle));
    const db = ((b.x - unit.x) * Math.cos(laserAngle) + (b.y - unit.y) * Math.sin(laserAngle));
    return da - db;
  });
  for (let enemy of enemyCandidates) {
    const proj = ((enemy.x - unit.x) * Math.cos(laserAngle) + (enemy.y - unit.y) * Math.sin(laserAngle));
    if (proj > 0 && proj < laserLength) {
      const perp = Math.abs(-Math.sin(laserAngle) * (enemy.x - unit.x) + Math.cos(laserAngle) * (enemy.y - unit.y));
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

}

// Основная функция атаки, распределяющая вызовы в зависимости от типа юнита
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
      //console.log("animateMoveAndScale завершена для юнита", unit);
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

function getObjectsInRange(pos, range) {
  const queryRect = {
    x: pos.x - range,
    y: pos.y - range,
    width: range * 2,
    height: range * 2
  };
  return quadtree.query(queryRect);
}


function getEnemiesInRange(pos, range, shooterOwner) {
  return getObjectsInRange(pos, range)
    .filter(obj =>
      // Фильтруем только объекты, у которых есть здоровье (т.е. юниты или здания)
      (obj.health !== undefined) &&
      (obj.owner !== shooterOwner) &&
      Math.hypot(obj.x - pos.x, obj.y - pos.y) < range
    );
}


// Функция поиска ближайшей базы/склада для доставки ресурсов
function findNearestDeliveryBuilding(x, y, owner) {
  const pos = { x, y };
  // Здесь используем фиксированный радиус поиска, например, 200 единиц
  const candidates = getObjectsInRange(pos, 1000)
    .filter(b => b.owner === owner && (b.type === "warehouse" || b.type.startsWith("base")));
  
  let nearest = null;
  let minDist = Infinity;
  candidates.forEach(b => {
    const d = Math.hypot(b.x - x, b.y - y);
    if (d < minDist) {
      minDist = d;
      nearest = b;
    }
  });
  return nearest;
}


// Функция обновления ресурсов (вращение золота)
function updateResources(deltaTime) {
  gameState.resources.forEach(resource => {
    // Обновление, например, для вращения золота
    if (resource.type === "gold" && resource.rotationSpeed) {
      resource.rotation += resource.rotationSpeed * deltaTime;
    }
    // Если ресурс исчерпан, помечаем его как depleted
    if (resource.amount <= 0) {
      resource.depleted = true;
    }
  });
  
  // Удаляем исчерпанные ресурсы из массива
  cleanupResources();
}

function cleanupResources() {
  gameState.resources = gameState.resources.filter(resource => resource.amount > 0);
}

// Функция проверки видимости базы
function isBaseVisible(base) {
  const screenPos = worldToScreen(base.x, base.y);
  return (
    screenPos.x >= 0 &&
    screenPos.x <= canvas.width &&
    screenPos.y >= 0 &&
    screenPos.y <= canvas.height
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
  if (!command.target || command.target.health <= 0 ||
      (!gameState.buildings.includes(command.target) && !gameState.units.includes(command.target))) {
    // Если цель недействительна, сбрасываем команду
    unit.commandQueue = [];
    unit.target = null;
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
}
 else if (command.type === "gather") {
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
  //console.log("Ремонтник выходит из мастерской в точку:", { exitX, exitY });
  animateMoveAndScale(unit, exitX, exitY, 1, 1000, () => {
    unit.hidden = false;
    unit.inWorkshop = null;
    moveUnit(unit, command.target.x, command.target.y, () => {
      startRepairProcess(unit, command);
    });
  });
}
 else {
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
    for (let i = 0; i < 100; i++) {
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




