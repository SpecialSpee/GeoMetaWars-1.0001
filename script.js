function triggerSale(building) {
  // Проверяем, что здание всё ещё существует
  if (!gameState.buildings.includes(building)) return;
  
  // Если здание является турелью, останавливаем её цикл
  if (building.type === "turret" || building.type === "turret2") {
    building.active = false;
    if (building.turretCycleId) {
      cancelAnimationFrame(building.turretCycleId);
      building.turretCycleId = null;
    }
  }
  
  // Удаляем здание из gameState
  gameState.buildings = gameState.buildings.filter(b => b !== building);
  
  // Очищаем ссылки на здание у юнитов
  gameState.units.forEach(unit => {
    if (unit.target === building) {
      unit.target = null;
    }
    if (unit.commandQueue && unit.commandQueue.length > 0) {
      unit.commandQueue = unit.commandQueue.filter(cmd => !(cmd.type === "attack" && cmd.target === building));
    }
  });
  
  // Запускаем эффект разрушения и возврат части ресурсов
  spawnDestructionFragments(building.x, building.y, building.width, building.height, building.type);
  const refundPercent = 0.2;
  const refundGold = building.buildCost.gold * refundPercent;
  const refundSilicon = building.buildCost.silicon * refundPercent;
  const refundPlasma = building.buildCost.plasma * refundPercent;
  gameState.playerResources.gold += refundGold;
  gameState.playerResources.silicon += refundSilicon;
  gameState.playerResources.plasma += refundPlasma;
  updateResourceUI();
  showWarning(`Здание продано! Возврат: Gold ${Math.round(refundGold)}, Silicon ${Math.round(refundSilicon)}, Plasma ${Math.round(refundPlasma)}`);
  
  // Добавляем координаты проданного здания в soldBuildings
  soldBuildings.push({ x: building.x, y: building.y });
  
  // Обновляем квадродерево
  cleanUpBuildingReferences();
}



// Функция для обновления квадродерева (и других структур, если необходимо)
function cleanUpBuildingReferences() {
  if (typeof quadtree !== 'undefined' && quadtree !== null) {
    quadtree.clear();
    // Вставляем обновлённые объекты: здания, юниты, ресурсы
    gameState.buildings.forEach(b => quadtree.insert(b));
    gameState.units.forEach(u => quadtree.insert(u));
    gameState.resources.forEach(r => quadtree.insert(r));
  }
}


function createSaleIndicator() {
  let indicator = document.getElementById("saleIndicator");
  if (!indicator) {
    indicator = document.createElement("div");
    indicator.id = "saleIndicator";
    indicator.style.position = "absolute";
    indicator.style.height = "5px";
    indicator.style.backgroundColor = "green";
    indicator.style.borderRadius = "2px";
    indicator.style.zIndex = "1001"; // выше canvas
    document.body.appendChild(indicator);
  }
}

function clearSaleIndicator() {
  const indicator = document.getElementById("saleIndicator");
  if (indicator) {
    indicator.remove();
  }
}

function checkAndSellUnprofitableBuildings() {
  gameState.buildings.forEach(building => {
    if (building.owner !== "ai") return;
    if (["base", "base2", "base3"].includes(building.type)) return;
    if (building.health < building.maxHealth * 0.5) {
      const nearbyRepairmen = getObjectsInRange({ x: building.x, y: building.y }, 100)
                                .filter(u => u.owner === "ai" && u.type === "repairman");
      const resourcesLow = (
        gameState.aiResources.gold < 100 ||
        gameState.aiResources.silicon < 100 ||
        gameState.aiResources.plasma < 50
      );
      if (nearbyRepairmen.length === 0 || resourcesLow) {
        console.log("ИИ инициирует продажу здания:", building.type);
        queueSale(building);
      }
    }
  });
}

// Функция, реализующая эффект ударной волны, которая отталкивает юнитов от центра взрыва
function applyShockwave(x, y, radius, force) {
  gameState.units.forEach(unit => {
    if (unit.health > 0) { // применяем только к живым юнитам
      const dx = unit.x - x;
      const dy = unit.y - y;
      const dist = Math.hypot(dx, dy);
      if (dist < radius && dist > 0) {
        const impact = (1 - dist / radius) * force;
        unit.vx += (dx / dist) * impact;
        unit.vy += (dy / dist) * impact;
      }
    }
  });
}


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
  // Количество пучков искр (от 2 до 4)
  const clusterCount = 2 + Math.floor(Math.random() * 3);
  
  for (let c = 0; c < clusterCount; c++) {
    // Центральный угол пучка (в радианах)
    const clusterCenter = Math.random() * 2 * Math.PI;
    // Узкий диапазон для пучка (от 0.1 до 0.4 радиана)
    const clusterSpread = 0.1 + Math.random() * 0.3;
    // Количество искр в пучке (от 3 до 5)
    const sparksInCluster = 1 + Math.floor(Math.random() * 2);
    
    for (let i = 0; i < sparksInCluster; i++) {
      // Выбираем угол в пределах пучка
      const angle = clusterCenter + (Math.random() - 0.5) * clusterSpread;
      // Устанавливаем скорость (меньше, чтобы искры выглядели тонкими)
      const speed = 20 + Math.random() * 30;
      // Время жизни искры
      const life = 0.2 + Math.random() * 0.3;
      // Длина искры – от 5 до 15 пикселей
      const length = 3 + Math.random() * 7;
      // Толщина – небольшая (например, 1 пиксель)
      const thickness = 0.5;
      
      const spark = {
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: life,
        maxLife: life,
        length: length,
        thickness: thickness,
        angle: angle,        // угол, по которому будет отрисована линия
        color: "rgba(255,255,255,1)", // можно изменить по вкусу
        type: "sparkLine"    // тип частицы – "sparkLine" для отрисовки как линия
      };
      gameState.particles.push(spark);
    }
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
  // Применяем преобразования камеры
  ctx.translate(camera.offsetX, camera.offsetY);
  ctx.scale(camera.scale, camera.scale);
  
  gameState.particles.forEach(p => {
    const alpha = p.life / p.maxLife;
    ctx.globalAlpha = alpha;
    
    if (p.type === "sparkLine") {
      // Рисуем тонкую линию
      ctx.strokeStyle = p.color;
      ctx.lineWidth = p.thickness;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + Math.cos(p.angle) * p.length, p.y + Math.sin(p.angle) * p.length);
      ctx.stroke();
    } else {
      // Для остальных частиц рисуем как обычно (например, круги)
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  
  ctx.globalAlpha = 1;
  ctx.restore();
}


function updateBullets(deltaTime) {
  for (let i = gameState.bullets.length - 1; i >= 0; i--) {
    let bullet = gameState.bullets[i];

    // Обновляем позицию пули
    bullet.x += Math.cos(bullet.angle) * bullet.speed * deltaTime;
    bullet.y += Math.sin(bullet.angle) * bullet.speed * deltaTime;

    // Проверяем попадание по целям
    const hitTargets = getObjectsInRange({ x: bullet.x, y: bullet.y }, 10)
        .filter(target => target.owner !== bullet.shooter.owner && target.health > 0);
    if (hitTargets.length > 0) {
      hitTargets.forEach(target => {
        // Наносим прямой урон
        target.health -= bullet.damage;
        // Если пуля - ракета или артиллерия, создаём эффект взрыва, splash-урон и ударную волну
        if (bullet.isMissile || bullet.isArtillery) {
          spawnExplosionEffect(bullet.x, bullet.y);
          // Выполняем splash-урон по всем целям в пределах splashRadius
          const splashTargets = gameState.units.concat(gameState.buildings).filter(obj =>
            obj.owner !== bullet.shooter.owner &&
            obj.health > 0 &&
            Math.hypot(obj.x - bullet.x, obj.y - bullet.y) <= bullet.splashRadius
          );
          splashTargets.forEach(splashTarget => {
            splashTarget.health -= bullet.splashDamage;
            if (splashTarget.health <= 0) {
              spawnDestructionFragments(splashTarget.x, splashTarget.y, splashTarget.width, splashTarget.height, splashTarget.type);
            }
          });
          // Применяем эффект ударной волны
          applyShockwave(bullet.x, bullet.y, bullet.splashRadius, 150);
        } else {
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
        const targets = gameState.units.concat(gameState.buildings).filter(target =>
          target.owner !== bullet.shooter.owner &&
          target.health > 0 &&
          Math.hypot(target.x - bullet.x, target.y - bullet.y) <= bullet.splashRadius
        );
        targets.forEach(target => {
          target.health -= bullet.splashDamage;
          if (target.health <= 0) {
            spawnDestructionFragments(target.x, target.y, target.width, target.height, target.type);
          }
        });
        applyShockwave(bullet.x, bullet.y, bullet.splashRadius, 400);
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



// В constants.js добавляем новые константы для расчёта влияния объектов:

//// Вес для зданий
//const BUILDING_INFLUENCE_WEIGHTS = {
//  beacon: 3,           // Маяк – самый высокий вклад
//  turret: 2.5,         // Турели (основные и улучшенные) – чуть ниже
//  turret2: 2.5,
//  warehouse: 1,        // Склады – базовый вес
//  repairWorkshop: 1    // Мастерские ремонта – базовый вес
//};
//
//// Вес для юнитов
//const UNIT_INFLUENCE_WEIGHTS = {
//  fighter: 0.5,        // Истребитель – небольшой вклад
//  assault: 1,          // Штурмовик – средний вклад
//  elite: 1.5           // Элита – самый высокий вклад среди юнитов
//};

// Если удобно, можно объединить в один объект:
const INFLUENCE_WEIGHTS = {
  // Здания игрока
  beacon: 3,
  // Здания ИИ
  base: 2,
  barracks: 1.5,
  base2: 2,
  base3: 2.5,
  barracks3: 1.5,
  wall: 1,
  turret: 2.5,
  turret2: 2.5,
  warehouse: 1,
  repairWorkshop: 1,
  // Юниты
  fighter: 0.5,
  assault: 1,
  elite: 1.5
};



let fogMap = [];               // двумерный массив для хранения состояния видимости (0 – туман, 1 – видимость)
let persistentFogMap = [];
let influenceGrid = [];

// Глобальная переменная для отслеживания количества зданий при последнем обновлении кэша
let cachedBuildingsCount = 0;

function updateInfluenceGridByObjects() {
  const cols = Math.ceil(worldWidth / FOG_CELL_SIZE);
  const rows = Math.ceil(worldHeight / FOG_CELL_SIZE);
  
  // Очищаем всю сетку влияния
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      influenceGrid[r][c].influence = 0;
    }
  }
  
  // Если количество зданий изменилось (новые здания или удаление),
  // сбрасываем кэш для всех зданий, чтобы влияние пересчиталось заново.
  if (gameState.buildings.length !== cachedBuildingsCount) {
    gameState.buildings.forEach(building => {
      building.dirty = true;
      building.lastInfluenceCache = null;
    });
    cachedBuildingsCount = gameState.buildings.length;
  }
  
  // Обработка зданий с кэшированием
  gameState.buildings.forEach(obj => {
    const weight = getInfluenceWeight(obj);
    const sign = (obj.owner === "player") ? 1 : (obj.owner === "ai" ? -1 : 0);
    const radius = influenceQueryRadius;
    
    // Вычисляем диапазон ячеек, в которые попадает влияние здания
    const startCol = Math.max(0, Math.floor((obj.x - radius) / FOG_CELL_SIZE));
    const endCol = Math.min(cols - 1, Math.floor((obj.x + radius) / FOG_CELL_SIZE));
    const startRow = Math.max(0, Math.floor((obj.y - radius) / FOG_CELL_SIZE));
    const endRow = Math.min(rows - 1, Math.floor((obj.y + radius) / FOG_CELL_SIZE));
    
    const gridWidth = endCol - startCol + 1;
    const gridHeight = endRow - startRow + 1;
    
    // Если здание не изменялось (dirty === false) и у него есть кэш нужного размера, используем его
    if (!obj.dirty && obj.lastInfluenceCache &&
        obj.lastInfluenceCache.length === gridHeight &&
        obj.lastInfluenceCache[0].length === gridWidth) {
      for (let r = 0; r < gridHeight; r++) {
        for (let c = 0; c < gridWidth; c++) {
          influenceGrid[startRow + r][startCol + c].influence += obj.lastInfluenceCache[r][c];
        }
      }
    } else {
      // Пересчитываем вклад для каждой затронутой ячейки и сохраняем в кэш
      let footprint = [];
      for (let r = startRow; r <= endRow; r++) {
        let rowArr = [];
        const cellCenterY = r * FOG_CELL_SIZE + FOG_CELL_SIZE / 2;
        for (let c = startCol; c <= endCol; c++) {
          const cellCenterX = c * FOG_CELL_SIZE + FOG_CELL_SIZE / 2;
          const dx = obj.x - cellCenterX;
          const dy = obj.y - cellCenterY;
          const distance = Math.hypot(dx, dy);
          let contribution = 0;
          if (distance <= radius) {
            const decay = Math.exp(- (distance * distance) / (2 * sigma * sigma));
            contribution = weight * decay * sign;
          }
          rowArr.push(contribution);
          influenceGrid[r][c].influence += contribution;
        }
        footprint.push(rowArr);
      }
      obj.lastInfluenceCache = footprint;
      obj.dirty = false;
    }
  });
  
  // Обработка динамичных объектов (юнитов) без кэширования
  gameState.units.forEach(obj => {
    const weight = getInfluenceWeight(obj);
    const sign = (obj.owner === "player") ? 1 : (obj.owner === "ai" ? -1 : 0);
    const radius = influenceQueryRadius;
    
    const startCol = Math.max(0, Math.floor((obj.x - radius) / FOG_CELL_SIZE));
    const endCol = Math.min(cols - 1, Math.floor((obj.x + radius) / FOG_CELL_SIZE));
    const startRow = Math.max(0, Math.floor((obj.y - radius) / FOG_CELL_SIZE));
    const endRow = Math.min(rows - 1, Math.floor((obj.y + radius) / FOG_CELL_SIZE));
    
    for (let r = startRow; r <= endRow; r++) {
      const cellCenterY = r * FOG_CELL_SIZE + FOG_CELL_SIZE / 2;
      for (let c = startCol; c <= endCol; c++) {
        const cellCenterX = c * FOG_CELL_SIZE + FOG_CELL_SIZE / 2;
        const dx = obj.x - cellCenterX;
        const dy = obj.y - cellCenterY;
        const distance = Math.hypot(dx, dy);
        if (distance <= radius) {
          const decay = Math.exp(- (distance * distance) / (2 * sigma * sigma));
          const contribution = weight * decay * sign;
          influenceGrid[r][c].influence += contribution;
        }
      }
    }
  });
}


// Пример вызова новой функции в игровом цикле:
// Можно обновлять зоны влияния не каждый кадр, а, например, раз в 5 кадров
let frameCounter = 0;  
// Задаём радиус запроса – можно настраивать (например, 200 единиц)  
const influenceQueryRadius = 200;
 // Параметр затухания (σ) – регулирует, как быстро вклад объекта уменьшается с расстоянием
 const sigma = 200;



// Пример функции, возвращающей вес объекта – если её ещё нет, можно использовать её из шага 2.
function getInfluenceWeight(object) {
  if (object instanceof Building || object instanceof Unit) {
    return INFLUENCE_WEIGHTS[object.type] || 0;
  }
  // Игнорируем все остальные объекты (например, туман)
  return 0;
}


// Функция сглаживания сетки влияния с использованием 3x3 гауссова ядра
function smoothInfluenceGrid() {
  const rows = influenceGrid.length;
  if (rows === 0) return;
  const cols = influenceGrid[0].length;
  if (cols === 0) return;

  // Пример ядра для сглаживания 3x3
  const kernel = [0.25, 0.5, 0.25];

  // 1) Создаем временную сетку для горизонтального прохода
  let tempGrid = [];
  for (let r = 0; r < rows; r++) {
    tempGrid[r] = [];
    for (let c = 0; c < cols; c++) {
      tempGrid[r][c] = { influence: 0 };
    }
  }

  // 2) Горизонтальное сглаживание
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let sum = 0;
      for (let k = -1; k <= 1; k++) {
        const cc = Math.min(Math.max(c + k, 0), cols - 1);
        sum += influenceGrid[r][cc].influence * kernel[k + 1];
      }
      tempGrid[r][c].influence = sum;
    }
  }

  // 3) Вертикальное сглаживание (результат пишем обратно в influenceGrid)
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      let sum = 0;
      for (let k = -1; k <= 1; k++) {
        const rr = Math.min(Math.max(r + k, 0), rows - 1);
        sum += tempGrid[rr][c].influence * kernel[k + 1];
      }
      influenceGrid[r][c].influence = sum;
    }
  }
}


// Функция нормализации сетки влияния в диапазон от -1 до 1
function normalizeInfluenceGrid() {
  const rows = influenceGrid.length;
  const cols = influenceGrid[0].length;
  let hasPositive = false;
  let hasNegative = false;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const val = influenceGrid[r][c].influence;
      if (val > 0) hasPositive = true;
      if (val < 0) hasNegative = true;
    }
  }
  // Если в мире нет отрицательных (или положительных) значений – не нормализуем
  if (!hasNegative || !hasPositive) return;
  
  let minVal = Infinity, maxVal = -Infinity;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const val = influenceGrid[r][c].influence;
      if (val < minVal) minVal = val;
      if (val > maxVal) maxVal = val;
    }
  }
  if (maxVal === minVal) return;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const val = influenceGrid[r][c].influence;
      const normalized = 2 * (val - minVal) / (maxVal - minVal) - 1;
      influenceGrid[r][c].influence = normalized;
    }
  }
}



// Функция отрисовки наложения зон влияния
function renderInfluenceOverlay() {
  const cellSize = FOG_CELL_SIZE;
  // Устанавливаем стиль линий для плавных (закруглённых) краёв
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  // Эффект мерцания: значение меняется от 0 до 1
  const timeFactor = (Math.sin(performance.now() / 500) + 1) / 2;
  const baseAlpha = 0.5;
  
  const rows = influenceGrid.length;
  const cols = influenceGrid[0].length;
  
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = influenceGrid[r][c];
      if (cell.owner === "neutral") continue;
      
      // Определяем базовый цвет в зависимости от владельца
      let colorBase = cell.owner === "player" ? "0,255,0" : "255,165,0";
      
      // Рассчитываем "соседский" фактор – чем больше соседей с таким же владельцем, тем менее заметен контур
      let neighborCount = 0, directions = 0;
      if (r > 0) {
        directions++;
        if (influenceGrid[r - 1][c].owner === cell.owner) neighborCount++;
      }
      if (r < rows - 1) {
        directions++;
        if (influenceGrid[r + 1][c].owner === cell.owner) neighborCount++;
      }
      if (c > 0) {
        directions++;
        if (influenceGrid[r][c - 1].owner === cell.owner) neighborCount++;
      }
      if (c < cols - 1) {
        directions++;
        if (influenceGrid[r][c + 1].owner === cell.owner) neighborCount++;
      }
      const neighborFactor = directions > 0 ? neighborCount / directions : 0;
      const finalAlpha = baseAlpha * (0.5 + 0.5 * neighborFactor) * (0.5 + 0.5 * timeFactor);
      
      const strokeStyle = `rgba(${colorBase}, ${finalAlpha.toFixed(2)})`;
      ctx.strokeStyle = strokeStyle;
      ctx.lineWidth = 2;
      
      const x = c * cellSize;
      const y = r * cellSize;
      
      ctx.beginPath();
      // Верхняя граница: рисуем, если ячейка на верхнем краю или соседняя сверху другого владельца
      if (r === 0 || influenceGrid[r - 1][c].owner !== cell.owner) {
        ctx.moveTo(x, y);
        ctx.lineTo(x + cellSize, y);
      }
      // Правая граница
      if (c === cols - 1 || influenceGrid[r][c + 1].owner !== cell.owner) {
        ctx.moveTo(x + cellSize, y);
        ctx.lineTo(x + cellSize, y + cellSize);
      }
      // Нижняя граница
      if (r === rows - 1 || influenceGrid[r + 1][c].owner !== cell.owner) {
        ctx.moveTo(x + cellSize, y + cellSize);
        ctx.lineTo(x, y + cellSize);
      }
      // Левая граница
      if (c === 0 || influenceGrid[r][c - 1].owner !== cell.owner) {
        ctx.moveTo(x, y + cellSize);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }
}


function drawRoundedRectOutline(ctx, x, y, width, height, radius, strokeStyle, lineWidth) {
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  ctx.stroke();
}


// Вспомогательная функция для рисования закруглённого прямоугольника
function drawRoundedRect(ctx, x, y, width, height, radius, fillStyle) {
  ctx.fillStyle = fillStyle;
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  ctx.fill();
}


// Функция обновления UI зон контроля и проверки условия победы
function updateZoneControlUI() {
  const cellSize = FOG_CELL_SIZE;
  const cols = Math.ceil(worldWidth / cellSize);
  const rows = Math.ceil(worldHeight / cellSize);
  let playerCells = 0;
  let aiCells = 0;
  let neutralCells = 0;

  // Первый проход: назначаем owner для каждой ячейки (код не изменён)
  influenceGrid = [];
  for (let r = 0; r < rows; r++) {
    influenceGrid[r] = [];
    for (let c = 0; c < cols; c++) {
      const left = c * cellSize;
      const top = r * cellSize;
      const right = left + cellSize;
      const bottom = top + cellSize;
      let cellOwner = "neutral";

      gameState.buildings.forEach(b => {
        if (b.x >= left && b.x < right && b.y >= top && b.y < bottom) {
          if (b.owner === "player") {
            cellOwner = "player";
          } else if (cellOwner !== "player" && b.owner === "ai") {
            cellOwner = "ai";
          }
        }
      });

      influenceGrid[r][c] = {
        owner: cellOwner,
        center: {
          x: left + cellSize / 2,
          y: top + cellSize / 2
        }
      };
    }
  }
  
  // Второй проход: для внутренних ячеек, если ячейка нейтральна, но все четыре прямых соседа не нейтральны и принадлежат одному владельцу,
  // то присваиваем этой ячейке тот же owner
  for (let r = 1; r < rows - 1; r++) {
    for (let c = 1; c < cols - 1; c++) {
      if (influenceGrid[r][c].owner === "neutral") {
        const topOwner = influenceGrid[r - 1][c].owner;
        const bottomOwner = influenceGrid[r + 1][c].owner;
        const leftOwner = influenceGrid[r][c - 1].owner;
        const rightOwner = influenceGrid[r][c + 1].owner;
        if (
          topOwner !== "neutral" &&
          topOwner === bottomOwner &&
          topOwner === leftOwner &&
          topOwner === rightOwner
        ) {
          influenceGrid[r][c].owner = topOwner;
        }
      }
    }
  }
  
  // Подсчитываем ячейки по владельцам
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const owner = influenceGrid[r][c].owner;
      if (owner === "player") playerCells++;
      else if (owner === "ai") aiCells++;
      else neutralCells++;
    }
  }
  
  // Обновляем UI-счётчик (если требуется)
  let zoneControlCounter = document.getElementById("zoneControlCounter");
  if (!zoneControlCounter) {
    zoneControlCounter = document.createElement("div");
    zoneControlCounter.id = "zoneControlCounter";
    zoneControlCounter.style.position = "fixed";
    zoneControlCounter.style.top = "0px";  // Изменено с "0px" на "40px"
    zoneControlCounter.style.left = "50%";
    zoneControlCounter.style.width = "50%";
    zoneControlCounter.style.padding = "5px";
    zoneControlCounter.style.background = "#333";
    zoneControlCounter.style.color = "#fff";
    zoneControlCounter.style.fontSize = "14px";
    zoneControlCounter.style.textAlign = "center";
    zoneControlCounter.style.zIndex = "100";
    document.body.appendChild(zoneControlCounter);
  }
  zoneControlCounter.innerHTML =
    `Клеток: Игрок: ${playerCells} | ИИ: ${aiCells} | Нейтральных: ${neutralCells} (Всего: ${rows * cols})`;
}






function endGame(winner) {
  // Устанавливаем флаг окончания игры, чтобы ИИ не продолжал принимать решения,
  // но не останавливаем полностью игровой цикл, если это необходимо для анимации
  gameState.gameEnded = true;
  
  // Обновляем элемент DOM для вывода сообщения
  let endMessage = document.getElementById("gameEndMessage");
  if (!endMessage) {
    endMessage = document.createElement("div");
    endMessage.id = "gameEndMessage";
    endMessage.style.position = "fixed";
    endMessage.style.top = "50%";
    endMessage.style.left = "50%";
    endMessage.style.transform = "translate(-50%, -50%)";
    endMessage.style.background = "rgba(0, 0, 0, 0.8)";
    endMessage.style.color = "#fff";
    endMessage.style.padding = "20px 40px";
    endMessage.style.fontSize = "24px";
    endMessage.style.borderRadius = "8px";
    endMessage.style.zIndex = "10000";
    document.body.appendChild(endMessage);
  }
  
  endMessage.innerHTML = (winner === "player")
    ? "Победа игрока!"
    : "Победа ИИ!";
  
  // Можно также добавить кнопку для перезапуска игры или другие опции.
}


// Функция анализа сетки зон влияния.
function analyzeInfluenceGrid() {
  const vulnerableZones = [];
  const defensiveZones = [];
  const positiveThreshold = 0.3;
  const negativeThreshold = -0.3;
  
  for (let r = 0; r < influenceGrid.length; r++) {
    for (let c = 0; c < influenceGrid[r].length; c++) {
      const cell = influenceGrid[r][c];
      if (cell.influence > positiveThreshold) {
        vulnerableZones.push(cell);
      } else if (cell.influence < negativeThreshold) {
        defensiveZones.push(cell);
      }
    }
  }
  
  return { vulnerableZones, defensiveZones };
}

// Функция, которая принимает стратегические решения ИИ на основе зон влияния.
function aiUpdateZoneStrategy() {
  const { vulnerableZones, defensiveZones } = analyzeInfluenceGrid();
  
  // Если обнаружены уязвимые зоны, инициируем захват.
  if (vulnerableZones.length > 0) {
    // Выбираем зону с максимальным положительным влиянием.
    let targetZone = vulnerableZones.reduce((max, cell) => (cell.influence > max.influence ? cell : max), vulnerableZones[0]);
    
    // Пример: если есть возможность, строим турель для усиления контроля в этой зоне.
    if (canAfford(TURRET_COST, "ai")) {
      const built = aiPlaceBuilding("turret", targetZone.center.x, targetZone.center.y);
      if (built) {
        console.log(`ИИ строит турель для захвата уязвимой зоны в (${targetZone.center.x}, ${targetZone.center.y})`);
      }
    }
  }
  
  // Если обнаружены зоны, контролируемые ИИ, усиливаем оборону.
  if (defensiveZones.length > 0) {
    let safeZone = defensiveZones.reduce((min, cell) => (cell.influence < min.influence ? cell : min), defensiveZones[0]);
    
    // Используем уже реализованную функцию для поиска ближайшей базы ИИ.
    const nearestBase = findNearestAIBuilding(safeZone.center.x, safeZone.center.y);
    if (nearestBase && canAfford(FIGHTER_COST, "ai")) {
      aiHireMilitaryUnits("fighter", nearestBase);
      console.log(`ИИ усиливает защиту в зоне (${safeZone.center.x}, ${safeZone.center.y})`);
    }
  }
}

function findNearestAIBuilding(x, y) {
  let nearest = null;
  let minDist = Infinity;
  gameState.buildings.forEach(building => {
    if (building.owner === "ai") {
      const d = Math.hypot(building.x - x, building.y - y);
      if (d < minDist) {
        minDist = d;
        nearest = building;
      }
    }
  });
  return nearest;
}





// Новая функция инициализации сетки зон влияния, аналогичная initFogOfWar() *****
function initInfluenceGrid() {
  const cols = Math.ceil(worldWidth / FOG_CELL_SIZE);
  const rows = Math.ceil(worldHeight / FOG_CELL_SIZE);
  influenceGrid = [];
  for (let r = 0; r < rows; r++) {
    influenceGrid[r] = [];
    for (let c = 0; c < cols; c++) {
      influenceGrid[r][c] = {
        influence: 0,  // Начальное нейтральное значение влияния
        owner: null,   // Будет определять, кто доминирует: 'player' или 'ai'
        center: {
          x: c * FOG_CELL_SIZE + FOG_CELL_SIZE / 2,
          y: r * FOG_CELL_SIZE + FOG_CELL_SIZE / 2
        }
      };
    }
  }
}



// Инициализация тумана войны с расширением persistentFogMap без полного сброса ****
function initFogOfWar() {
  const cols = Math.ceil(worldWidth / FOG_CELL_SIZE);
  const rows = Math.ceil(worldHeight / FOG_CELL_SIZE);
  
  // Инициализируем или пересоздаём fogMap полностью
  fogMap = [];
  for (let r = 0; r < rows; r++) {
    fogMap[r] = new Array(cols).fill(0);
  }
  
  // Если persistentFogMap ещё не создана, создаём её
  if (!persistentFogMap || persistentFogMap.length === 0) {
    persistentFogMap = [];
    for (let r = 0; r < rows; r++) {
      persistentFogMap[r] = new Array(cols).fill(0);
    }
  } else {
    // Если persistentFogMap уже существует, расширяем или обрезаем её, сохраняя данные
    // Расширение/обрезка строк:
    for (let r = 0; r < rows; r++) {
      if (r < persistentFogMap.length) {
        // Обновляем каждую строку: если длина меньше, добавляем новые ячейки, если больше – обрезаем
        while (persistentFogMap[r].length < cols) {
          persistentFogMap[r].push(0);
        }
        persistentFogMap[r] = persistentFogMap[r].slice(0, cols);
      } else {
        // Если строк меньше, чем нужно – добавляем новые строки
        persistentFogMap[r] = new Array(cols).fill(0);
      }
    }
    // Если у persistentFogMap больше строк, чем сейчас требуется, обрезаем массив строк
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
        ctx.fillStyle = "rgba(0,0,0,1)";
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

// Функция изменения размеров canvas и виртуального мира с сохранением текущего вида // Пример модификации функции resizeCanvas() для пересчёта размеров мира и вызова новых инициализаций
// Пример модификации функции resizeCanvas() для пересчёта размеров мира и вызова новых инициализаций
function resizeCanvas() {
  const oldWidth = canvas.width;
  const oldHeight = canvas.height;
  
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  
  // Размеры виртуального мира – например, в 3 раза больше видимой области
  worldWidth = canvas.width * 3;
  worldHeight = canvas.height * 3;
  
  // Пересоздаём звездное поле
  starField.init();
  
  // Инициализация тумана войны
  initFogOfWar();
  
  // Инициализация сетки зон влияния, используя те же размеры, что и для тумана
  initInfluenceGrid();
  
  // Корректировка смещения камеры, чтобы сохранить текущий вид
  const dx = canvas.width / 2 - oldWidth / 2;
  const dy = canvas.height / 2 - oldHeight / 2;
  camera.offsetX += dx;
  camera.offsetY += dy;
  
  // Инициализация квадродерева с обновлёнными размерами мира
  const margin = 0.2 * worldWidth;
  quadtree = new Quadtree({ x: -margin, y: -margin, width: worldWidth + 2 * margin, height: worldHeight + 2 * margin });
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
const minBaseDistance = 2000; // минимальное расстояние между базами

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
  const baseRadius = 7;
  const points = [];
  for (let i = 0; i < numPoints; i++) {
    const angle = (i / numPoints) * Math.PI * 2;
    const offset = (Math.random() - 0.5) * 4;
    const r = baseRadius + offset;
    points.push({ x: r * Math.cos(angle), y: r * Math.sin(angle) });
  }
  return { points, baseRadius };
}
// Функция плавной интерполяции угла (если её ещё нет)
function lerpAngle(a, b, t) {
  const diff = Math.atan2(Math.sin(b - a), Math.cos(b - a));
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
  const maxTurnSpeed = 0.01;
  unit.angle = lerpAngle(unit.angle, desiredAngle, maxTurnSpeed);
  
  // Определяем направление "носа"
  const frontDirX = Math.cos(unit.angle);
  const frontDirY = Math.sin(unit.angle);
  
  // Если цель – здание, желаемая дистанция – граница здания, иначе значение из unit или стандартное 100
  const desiredDistance = target instanceof Building 
    ? (Math.max(target.width, target.height) / 2) + 50 
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
  } 
	else {
    ax = frontDirX * distanceError * approachStrength + tanX * orbitStrength;
    ay = frontDirY * distanceError * approachStrength + tanY * orbitStrength;
  }
  
  if (typeof unit.vx !== 'number') unit.vx = 0;
  if (typeof unit.vy !== 'number') unit.vy = 0;
  
  // Применяем затухание, чтобы сохранить плавность движения
  const damping = 0.9;
  unit.vx = unit.vx * damping + ax * deltaTime;
  unit.vy = unit.vy * damping + ay * deltaTime;
  
  // Ограничиваем максимальную скорость
  const maxSpeed = 50;
  const currentSpeed = Math.hypot(unit.vx, unit.vy);
  if (currentSpeed > maxSpeed) {
    unit.vx = (unit.vx / currentSpeed);
    unit.vy = (unit.vy / currentSpeed);
  }
  
  unit.x += unit.vx * deltaTime;
  unit.y += unit.vy * deltaTime;
}

// Функция движения юнитов с анимацией
function moveUnit(unit, targetX, targetY, callback, spreadDone = false) {
  const startX = unit.x, startY = unit.y;
  const dx = targetX - startX, dy = targetY - startY;
  const distance = Math.hypot(dx, dy);
  if (distance < 5) {
    if (callback) callback();
    return;
  }
  unit.angle = Math.atan2(dy, dx);
  // Используем unit.speed, либо, если не задан, WORKER_SPEED (или другой подходящий базовый параметр)
  const speed = unit.speed || WORKER_SPEED;
  const duration = distance / speed; 
  const startTime = performance.now();

  function animate() {
  const currentTime = performance.now();
  const elapsed = (currentTime - startTime) / 1000;
  const progress = Math.min(elapsed / duration, 1);

  // Выполняем проверку на появление врагов только для ИИ-юнитов (не игрока)
  if (unit.owner !== "player" && unit.type !== "worker" && unit.type !== "repairman") {
    const range = unit.range || 150;
    const enemies = getEnemiesInRange({ x: unit.x, y: unit.y }, range)
                      .filter(e => e.owner !== unit.owner);
    if (enemies.length > 0) {
      // Если враги обнаружены, прерываем движение и переключаемся на атаку
      unit.commandQueue = [];
      const nearestEnemy = enemies.reduce((prev, curr) =>
        Math.hypot(curr.x - unit.x, curr.y - unit.y) < Math.hypot(prev.x - unit.x, prev.y - unit.y)
          ? curr : prev
      );
      unit.commandQueue.push({ type: "attack", target: nearestEnemy });
      if (unit.currentMovementAnimation) {
        cancelAnimationFrame(unit.currentMovementAnimation);
        unit.currentMovementAnimation = null;
      }
      return;
    }
  }

  // Обновляем позицию юнита
  unit.x = startX + dx * progress;
  unit.y = startY + dy * progress;

  if (progress < 1) {
    unit.currentMovementAnimation = requestAnimationFrame(animate);
  } else {
    unit.currentMovementAnimation = null;
    if (callback) callback();
  }
}

if (unit.currentMovementAnimation) {
  cancelAnimationFrame(unit.currentMovementAnimation);
  unit.currentMovementAnimation = null;
}
animate();

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
  const preferredRange = unit.artilleryPreferredRange || unit.artilleryRange || 500;
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
  const penetrations = 3;
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
  document.getElementById("playerGold").innerText = Math.round(gameState.playerResources.gold);
  document.getElementById("playerSilicon").innerText = Math.round(gameState.playerResources.silicon);
  document.getElementById("playerPlasma").innerText = Math.round(gameState.playerResources.plasma);


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
    //console.log("Получена команда ремонта для объекта", command.target);
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
    for (let i = 0; i < 80; i++) {
      const x = Math.random() * (worldWidth - 20) + 10;
      const y = Math.random() * (worldHeight - 20) + 10;
      const max = type === "gold" ? 200 : type === "silicon" ? 150 : 100;
      gameState.resources.push(new Resource(type, x, y, max, max));
    }
  });
}
generateResources();



