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

// Регулярная адаптация
setInterval(analyzePlayerBehavior, 30000); 
setInterval(adaptDefenses, 45000);

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
  // Сначала очищаем устаревшие записи
  cleanupFailedClusters();

  // Если целевая точка находится в зоне неудачного строительства, выходим
  const failureRadius = 10; // настройте по необходимости
  if (failedClusters.some(pt => Math.hypot(pt.x - target.x, pt.y - target.y) < failureRadius)) {
    console.log("Зона", target, "помечена как неудачная — пропускаем строительство.");
    return;
  }

  // Если можно построить, планируем строительство
  if (!canAfford(BEACON_COST, "ai")) return;
  scheduleAIBuilding("beacon", target.x, target.y, 0);
  
  // Далее можно запланировать последующее строительство объектов кластера
  setTimeout(() => { 
    if (canAfford(WAREHOUSE_COST, "ai")) scheduleAIBuilding("warehouse", target.x - 40, target.y, 0); 
  }, 500);
  // ...и так далее по логике построения кластера
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
    console.log("Постройка", type, "не планируется, так как зона", {x, y}, "помечена как неудачная.");
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

