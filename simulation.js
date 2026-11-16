import { getMap, INITIAL_UNLOCKS } from "./maps.js?v=7";
// Seoul rules. Timing and demand rates not specified by the reference are tuned here.
export const COLORS = [
  "#de6657",
  "#528caf",
  "#d5b44d",
  "#729867",
  "#a078ae",
  "#dc9858",
  "#5aa5a0",
];
export const BASIC = ["circle", "triangle", "square"];
export const SPECIAL = [
  "star",
  "pentagon",
  "rhombus",
  "cross",
  "sector",
  "diamond",
  "oval",
];
export const RULES = {
  day: 30,
  week: 210,
  stationCapacity: 5,
  crowdSeconds: 45,
  seats: 6,
  maxTrains: 4,
  maxCarriages: 65,
  maxLines: 7,
};
export const DEMAND = {
  weekday: {
    circle: ["triangle", "square", "cross", "diamond"],
    triangle: ["circle"],
    square: ["circle", "triangle", "rhombus", "pentagon"],
    star: ["triangle"],
    pentagon: ["triangle", "square"],
    rhombus: ["square"],
    cross: ["circle"],
    sector: ["circle"],
    diamond: [],
    oval: [],
  },
  weekend: {
    circle: [
      "triangle",
      "star",
      "rhombus",
      "cross",
      "sector",
      "diamond",
      "oval",
    ],
    triangle: ["circle", "pentagon", "star"],
    square: [],
    star: ["circle"],
    pentagon: [],
    rhombus: [],
    cross: ["circle"],
    sector: ["circle"],
    diamond: [],
    oval: ["circle"],
  },
};
const NAMES = [
  "종로",
  "서울역",
  "동대문",
  "서대문",
  "성수",
  "용산",
  "강남",
  "여의도",
  "마포",
  "잠실",
  "서초",
  "을지로",
  "홍대입구",
  "왕십리",
  "이태원",
  "사당",
  "신촌",
  "건대입구",
  "노량진",
  "청량리",
];
const result = (ok, message = "") => ({ ok, message });
const clampRandom = (random) => Math.min(0.999999, Math.max(0, random()));
const pick = (items, random) =>
  items[Math.floor(clampRandom(random) * items.length)];
export function createGame(
  mode = "normal",
  random = Math.random,
  mapId = "seoul",
) {
  if (!["normal", "extreme", "endless", "creative"].includes(mode))
    mode = "normal";
  const map = getMap(mapId);
  const game = {
    version: 2,
    mode,
    mapId: map.id,
    stations: [],
    lines: COLORS.map(() => ({ stations: [], loop: false })),
    trains: [],
    stock: {
      locomotives: map.id === "tokyo" ? 2 : map.startLines,
      shinkansen: map.id === "tokyo" ? 1 : 0,
      carriages: map.startCarriages,
      tunnels: map.tunnels,
      interchanges: 0,
    },
    unlocked: mode === "creative" ? map.maxLines : map.startLines,
    score: 0,
    elapsed: 0,
    nextStation: 24,
    nextUpgrade: 180,
    upgradeCount: 0,
    nextEfficiency: 30,
    deliveredToday: 0,
    efficiency: 0,
    pendingUpgrade: null,
    gameOver: false,
    failedStation: null,
    nextTrainId: 1,
    events: [],
    totalSpawned: 0,
    discarded: 0,
    preview: null,
  };
  const positions =
    map.id === "seoul"
      ? [
          [450, 190],
          [680, 190],
          [440, 325],
        ]
      : [
          [425, 175],
          [565, 125],
          [700, 190],
        ];
  BASIC.forEach((shape, id) => {
    let x = positions[id][0] + (clampRandom(random) - 0.5) * 45;
    let y = positions[id][1] + (clampRandom(random) - 0.5) * 25;
    if (map.id === "stockholm" && id === 2) {
      x = 410;
      y = 375;
    }
    if (map.id === "lagos" && id === 2) {
      x = 935;
      y = 420;
    }
    if (map.id === "seoul" && id === 2) {
      x = 440;
      y = 325;
    }
    if (waterAt(x, y, 4, game)) {
      outer: for (let gy = 100; gy < 460; gy += 55)
        for (let gx = 250; gx < 850; gx += 65) {
          if (
            !waterAt(gx, gy, 8, game) &&
            game.stations.every((s) => Math.hypot(s.x - gx, s.y - gy) > 80)
          ) {
            x = gx;
            y = gy;
            break outer;
          }
        }
    }
    addStation(game, shape, x, y);
  });
  if (map.id === "seoul") game.stations[2].name = "여의도";
  if (map.id === "shanghai") {
    addStation(game, "circle", 300, 220);
    addStation(game, "triangle", 320, 115);
  }
  return game;
}
export const creative = (game) => game.mode === "creative";
export const weekend = (game) => Math.floor(game.elapsed / RULES.day) % 7 >= 5;
export const capacity = (station) =>
  (station.limit ?? RULES.stationCapacity) * (station.interchange ? 2 : 1);
export const trainCapacity = (train) =>
  (train.seats ?? RULES.seats) * (1 + train.carriages);
export function addStation(game, shape, x, y) {
  const id = game.stations.length;
  const station = {
    id,
    shape,
    x,
    y,
    name:
      game.mapId === "seoul"
        ? (NAMES[id] ?? `서울 ${id + 1}`)
        : `역 ${String(id + 1).padStart(2, "0")}`,
    waiting: [],
    crowded: 0,
    limit: getMap(game.mapId).stationCapacity,
    interchange: false,
    nextSpawn: game.elapsed + 5 + id * 1.1,
  };
  game.stations.push(station);
  return station;
}
function inPolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [ax, ay] = points[i],
      [bx, by] = points[j];
    if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax)
      inside = !inside;
  }
  return inside;
}
export function waterAt(x, y, margin = 0, game = { mapId: "seoul" }) {
  const map = getMap(game.mapId),
    px = x / 11,
    py = y / 5.7;
  if (map.islands.some((points) => inPolygon(px, py, points))) return false;
  return map.features.some((feature) => {
    if (feature.polygon) return inPolygon(px, py, feature.points);
    return feature.points.slice(1).some(([qx, qy], i) => {
      const [ax, ay] = feature.points[i],
        dx = (qx - ax) * 11,
        dy = (qy - ay) * 5.7;
      const t = Math.max(
        0,
        Math.min(
          1,
          ((x - ax * 11) * dx + (y - ay * 5.7) * dy) / (dx * dx + dy * dy),
        ),
      );
      return (
        Math.hypot(x - (ax * 11 + t * dx), y - (ay * 5.7 + t * dy)) <
        (feature.width * 5.7) / 2 + margin
      );
    });
  });
}
export function edgePoints(a, b) {
  if (a.id > b.id) return edgePoints(b, a).reverse();
  const dx = b.x - a.x,
    dy = b.y - a.y,
    diagonal = Math.min(Math.abs(dx), Math.abs(dy));
  const bend = {
    x: a.x + Math.sign(dx) * diagonal,
    y: a.y + Math.sign(dy) * diagonal,
  };
  return [a, bend, b].filter(
    (p, i, arr) =>
      !i || Math.hypot(p.x - arr[i - 1].x, p.y - arr[i - 1].y) > 0.01,
  );
}
export function edgeLength(a, b) {
  const points = edgePoints(a, b);
  return points
    .slice(1)
    .reduce(
      (sum, p, i) => sum + Math.hypot(p.x - points[i].x, p.y - points[i].y),
      0,
    );
}
export function pointOnEdge(a, b, progress) {
  const points = edgePoints(a, b);
  let left = edgeLength(a, b) * Math.max(0, Math.min(1, progress));
  for (let i = 1; i < points.length; i++) {
    const p = points[i - 1],
      q = points[i],
      length = Math.hypot(q.x - p.x, q.y - p.y);
    if (left <= length || i === points.length - 1) {
      const f = Math.min(1, left / (length || 1));
      return {
        x: p.x + (q.x - p.x) * f,
        y: p.y + (q.y - p.y) * f,
        angle: (Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI,
      };
    }
    left -= length;
  }
  return { x: a.x, y: a.y, angle: 0 };
}
export function needsTunnel(a, b, game) {
  const length = edgeLength(a, b);
  for (let d = 0; d <= length; d += 4) {
    const p = pointOnEdge(a, b, d / (length || 1));
    if (waterAt(p.x, p.y, 0, game)) return true;
  }
  return false;
}
export function lineEdges(line) {
  const edges = line.stations.slice(1).map((id, i) => [line.stations[i], id]);
  if (line.loop && line.stations.length > 2)
    edges.push([line.stations.at(-1), line.stations[0]]);
  return edges;
}
export function tunnelsUsed(game, replacement = null, lineId = -1) {
  return game.lines.reduce(
    (sum, old, i) =>
      sum +
      lineEdges(i === lineId ? replacement : old).filter(([a, b]) =>
        needsTunnel(game.stations[a], game.stations[b], game),
      ).length,
    0,
  );
}
function validateLine(game, id, candidate) {
  if (game.gameOver) return result(false, "게임이 종료되었습니다.");
  if (id < 0 || id >= game.unlocked)
    return result(false, "아직 열리지 않은 노선입니다.");
  if (
    new Set(candidate.stations).size !== candidate.stations.length ||
    candidate.stations.some((id) => !game.stations[id])
  )
    return result(false, "한 노선에서 중간역을 두 번 연결할 수 없습니다.");
  if (candidate.loop && candidate.stations.length < 3)
    return result(false, "순환선에는 최소 3개 역이 필요합니다.");
  if (!creative(game) && tunnelsUsed(game, candidate, id) > game.stock.tunnels)
    return result(
      false,
      "터널이 부족합니다. 강을 건너는 역 사이 구간마다 1개가 필요합니다.",
    );
  // A station can have at most three tracks leaving in any one of eight directions.
  const slots = new Map();
  for (const [i, original] of game.lines.entries()) {
    const line = i === id ? candidate : original;
    for (const [a, b] of lineEdges(line))
      for (const [from, to] of [
        [a, b],
        [b, a],
      ]) {
        const points = edgePoints(game.stations[from], game.stations[to]);
        const p = points[1],
          s = points[0];
        if (!p) continue;
        const key = `${from}:${Math.sign(p.x - s.x)},${Math.sign(p.y - s.y)}`;
        slots.set(key, (slots.get(key) ?? 0) + 1);
        if (slots.get(key) > 3)
          return result(
            false,
            "역의 같은 방향에는 최대 3개 노선만 연결할 수 있습니다.",
          );
      }
  }
  return result(true);
}
function commitLine(game, id, candidate) {
  const validation = validateLine(game, id, candidate);
  if (!validation.ok) return validation;
  game.lines[id] = candidate;
  game.routeVersion = (game.routeVersion ?? 0) + 1;
  for (const train of [...game.trains])
    if (
      train.line === id &&
      train.to === null &&
      (candidate.stations.length < 2 ||
        !candidate.stations.includes(train.from))
    )
      rehomeTrain(game, train);
  if (
    candidate.stations.length >= 2 &&
    !game.trains.some((t) => t.line === id && !t.pendingMove)
  )
    addTrain(game, id);
  return result(true);
}
export function connect(game, lineId, stationId, end = "back") {
  const line = game.lines[lineId];
  if (!line || !game.stations[stationId])
    return result(false, "역을 선택하세요.");
  if (line.loop)
    return result(false, "순환선을 먼저 열어야 확장할 수 있습니다.");
  const ids = [...line.stations];
  if (ids.includes(stationId)) {
    const opposite = end === "front" ? ids.at(-1) : ids[0];
    if (stationId !== opposite || ids.length < 3)
      return result(
        false,
        "끝역끼리 연결하면 순환선이 됩니다. 중간역은 중복할 수 없습니다.",
      );
    return commitLine(game, lineId, { stations: ids, loop: true });
  }
  end === "front" ? ids.unshift(stationId) : ids.push(stationId);
  return commitLine(game, lineId, { stations: ids, loop: false });
}
export function insertStation(game, lineId, edgeIndex, stationId) {
  if (game.mode === "extreme" && !game.planning)
    return result(false, "익스트림에서는 끝역 연장만 가능합니다.");
  const line = game.lines[lineId];
  if (!line || !lineEdges(line)[edgeIndex])
    return result(false, "편집할 구간을 선택하세요.");
  if (line.stations.includes(stationId))
    return result(false, "이미 이 노선에 포함된 역입니다.");
  const ids = [...line.stations];
  ids.splice(edgeIndex + 1, 0, stationId);
  return commitLine(game, lineId, { stations: ids, loop: line.loop });
}
export function removeStation(game, lineId, stationId) {
  if (game.mode === "extreme" && !game.planning)
    return result(
      false,
      "익스트림에서는 노선을 단축하거나 수정할 수 없습니다.",
    );
  const line = game.lines[lineId];
  if (!line?.stations.includes(stationId))
    return result(false, "선택한 노선에 없는 역입니다.");
  const ids = line.stations.filter((id) => id !== stationId);
  return commitLine(game, lineId, {
    stations: ids,
    loop: line.loop && ids.length >= 3,
  });
}
export function clearLine(game, id) {
  if (game.mode === "extreme" && !game.planning)
    return result(false, "익스트림에서는 노선을 폐쇄할 수 없습니다.");
  return commitLine(game, id, { stations: [], loop: false });
}
export function openLoop(game, id) {
  if (game.mode === "extreme" && !game.planning)
    return result(false, "익스트림에서는 순환선을 해제할 수 없습니다.");
  return commitLine(game, id, {
    stations: [...game.lines[id].stations],
    loop: false,
  });
}
function neighbors(game, id) {
  const edges = [];
  game.lines.forEach((line, lineId) => {
    const trains = game.trains.filter(
      (t) => t.line === lineId && !t.pendingMove,
    );
    const forward =
      !line.loop || !trains.length || trains.some((t) => t.direction > 0);
    const backward = !line.loop || trains.some((t) => t.direction < 0);
    for (const [a, b] of lineEdges(line)) {
      if (forward && a === id) edges.push({ to: b, line: lineId });
      if (backward && b === id) edges.push({ to: a, line: lineId });
    }
  });
  return edges;
}
// Distance-weighted routing, with an interchange penalty, not a count of station hops.
export function journey(
  game,
  start,
  targetShape,
  currentLine = -1,
  firstStep = null,
) {
  const queue = [{ id: start, line: currentLine, cost: 0, first: null }],
    best = new Map();
  while (queue.length) {
    queue.sort((a, b) => a.cost - b.cost);
    const item = queue.shift(),
      key = `${item.id}:${item.line}`;
    if ((best.get(key) ?? Infinity) <= item.cost) continue;
    best.set(key, item.cost);
    if (item.id !== start && game.stations[item.id].shape === targetShape)
      return { ...item.first, cost: item.cost };
    for (const edge of neighbors(game, item.id)) {
      if (
        !item.first &&
        firstStep &&
        (edge.to !== firstStep.next || edge.line !== firstStep.line)
      )
        continue;
      const transfer =
        item.line >= 0 && item.line !== edge.line
          ? game.stations[item.id].interchange
            ? 1
            : 5
          : 0;
      const cost =
        item.cost +
        edgeLength(game.stations[item.id], game.stations[edge.to]) / 85 +
        0.6 +
        transfer;
      queue.push({
        id: edge.to,
        line: edge.line,
        cost,
        first: item.first ?? { next: edge.to, line: edge.line },
      });
    }
  }
  return null;
}
export const nextHop = (game, id, shape) =>
  journey(game, id, shape)?.next ?? null;
function nextStop(game, train) {
  const line = game.lines[train.line],
    ids = line.stations,
    index = ids.indexOf(train.from);
  if (index < 0 || ids.length < 2) return null;
  if (line.loop)
    return ids[(index + train.direction + ids.length) % ids.length];
  if (index + train.direction < 0 || index + train.direction >= ids.length)
    train.direction *= -1;
  return ids[index + train.direction];
}
export function addTrain(
  game,
  lineId,
  stationId = null,
  type = "normal",
  position = null,
) {
  if (game.gameOver) return result(false, "게임이 종료되었습니다.");
  const line = game.lines[lineId];
  if (lineId >= game.unlocked || !line || line.stations.length < 2)
    return result(false, "먼저 2개 이상의 역을 연결하세요.");
  const map = getMap(game.mapId);
  if (
    game.trains.filter(
      (t) => t.line === lineId || t.pendingMove?.line === lineId,
    ).length >= map.maxTrains
  )
    return result(
      false,
      `한 노선에는 열차를 최대 ${map.maxTrains}대 배치할 수 있습니다.`,
    );
  if (
    type === "normal" &&
    game.stock.locomotives < 1 &&
    game.stock.shinkansen > 0
  )
    type = "shinkansen";
  const stockKey = type === "shinkansen" ? "shinkansen" : "locomotives";
  if (!creative(game) && game.stock[stockKey] < 1)
    return result(false, "남은 열차가 없습니다. 주간 보상을 기다리세요.");
  if (stationId !== null && !line.stations.includes(stationId))
    return result(false, "이 노선의 역에 배치하세요.");
  if (position && !validTrackPosition(game, lineId, position))
    return result(false, "배치할 선로가 변경되었습니다.");
  if (!creative(game)) game.stock[stockKey]--;
  const train = {
    id: game.nextTrainId++,
    line: lineId,
    from: stationId ?? line.stations[0],
    to: null,
    direction: 1,
    progress: 0,
    passengers: [],
    carriages: 0,
    seats: map.seats,
    type,
    dwell: 0.2,
    pendingMove: null,
    pendingCarriage: null,
  };
  if (position) {
    train.from = position.from;
    train.to = position.to;
    train.progress = position.progress;
    train.dwell = 0;
  }
  game.trains.push(train);
  return result(true);
}
export function addCarriage(game, trainId) {
  const train = game.trains.find((t) => t.id === trainId);
  if (!train || train.pendingMove)
    return result(false, "운행 중인 열차를 선택하세요.");
  if (train.carriages >= RULES.maxCarriages)
    return result(false, "객차는 최대 65개까지 연결할 수 있습니다.");
  if (!creative(game) && game.stock.carriages < 1)
    return result(false, "남은 객차가 없습니다.");
  train.carriages++;
  if (!creative(game)) game.stock.carriages--;
  return result(true);
}
function unload(game, train) {
  const station = game.stations[train.from];
  for (const passenger of train.passengers) {
    if (passenger === station.shape) {
      game.score++;
      game.deliveredToday++;
    } else station.waiting.push(passenger);
  }
  train.passengers = [];
}
function releaseTrain(game, train) {
  applyPendingCarriage(game, train);
  unload(game, train);
  if (!creative(game)) {
    game.stock[train.type === "shinkansen" ? "shinkansen" : "locomotives"]++;
    game.stock.carriages += train.carriages;
  }
  game.trains.splice(game.trains.indexOf(train), 1);
}
export function moveTrain(
  game,
  trainId,
  lineId = null,
  stationId = null,
  position = null,
) {
  if (game.mode === "extreme" && !game.planning)
    return result(
      false,
      "익스트림에서는 열차를 재배치하거나 회수할 수 없습니다.",
    );
  const train = game.trains.find((t) => t.id === trainId);
  if (!train) return result(false, "이동할 열차를 선택하세요.");
  if (lineId !== null) {
    const line = game.lines[lineId];
    if (
      lineId >= game.unlocked ||
      !line ||
      line.stations.length < 2 ||
      !line.stations.includes(stationId)
    )
      return result(false, "배치할 노선의 역을 선택하세요.");
    if (
      game.trains.filter(
        (t) =>
          t.id !== trainId &&
          (t.line === lineId || t.pendingMove?.line === lineId),
      ).length >= getMap(game.mapId).maxTrains
    )
      return result(
        false,
        `대상 노선의 열차 한도는 ${getMap(game.mapId).maxTrains}대입니다.`,
      );
  }
  if (position && !validTrackPosition(game, lineId, position))
    return result(false, "배치할 선로가 변경되었습니다.");
  train.pendingMove = { line: lineId, station: stationId, position };
  if (train.to === null) applyPendingMove(game, train);
  return result(true, "다음 역에 승객을 내린 후 열차와 객차를 함께 옮깁니다.");
}
function applyPendingMove(game, train) {
  const move = train.pendingMove;
  if (!move) return;
  if (
    move.line === null ||
    !game.lines[move.line].stations.includes(move.station)
  ) {
    releaseTrain(game, train);
    return;
  }
  unload(game, train);
  train.line = move.line;
  train.from = move.station;
  train.to = null;
  train.progress = 0;
  train.pendingMove = null;
  train.previous = undefined;
  train.direction = 1;
  train.dwell = 0.5;
  if (move.position && validTrackPosition(game, move.line, move.position)) {
    train.from = move.position.from;
    train.to = move.position.to;
    train.progress = move.position.progress;
    train.dwell = 0;
  }
}
export function moveCarriage(game, fromId, toId = null) {
  if (game.mode === "extreme" && !game.planning)
    return result(
      false,
      "익스트림에서는 객차를 재배치하거나 회수할 수 없습니다.",
    );
  const from = game.trains.find((t) => t.id === fromId),
    to = game.trains.find((t) => t.id === toId);
  if (!from || !from.carriages || from.pendingCarriage)
    return result(false, "회수할 객차가 없습니다.");
  if (
    toId !== null &&
    (!to || from === to || to.carriages >= RULES.maxCarriages)
  )
    return result(false, "다른 열차를 선택하세요.");
  from.pendingCarriage = { toId };
  if (from.to === null) applyPendingCarriage(game, from);
  return result(true, "다음 역에서 승객을 내린 후 객차 1개를 옮깁니다.");
}
function applyPendingCarriage(game, train) {
  if (!train.pendingCarriage) return;
  unload(game, train);
  const target = game.trains.find((t) => t.id === train.pendingCarriage.toId);
  train.carriages--;
  if (target && target !== train && target.carriages < RULES.maxCarriages)
    target.carriages++;
  else if (!creative(game)) game.stock.carriages++;
  train.pendingCarriage = null;
}
export function upgradeStation(game, id) {
  if (getMap(game.mapId).noInterchange)
    return result(false, "이 도시에서는 교차역을 사용할 수 없습니다.");
  const station = game.stations[id];
  if (!station || station.interchange)
    return result(false, "아직 교차역이 아닌 역을 선택하세요.");
  if (!creative(game) && game.stock.interchanges < 1)
    return result(false, "남은 교차역 자산이 없습니다.");
  station.interchange = true;
  if (!creative(game)) game.stock.interchanges--;
  return result(
    true,
    `교차역: 혼잡 한도 ${capacity(station)}명, 승하차 시간 단축. 회수할 수 없습니다.`,
  );
}
export function serviceStation(game, train, next) {
  const station = game.stations[train.from];
  let handled = 0;
  train.passengers = train.passengers.filter((p) => {
    if (p === station.shape) {
      game.score++;
      game.deliveredToday++;
      handled++;
      return false;
    }
    const plan = journey(game, station.id, p, train.line);
    if (!plan || plan.line !== train.line) {
      station.waiting.push(p);
      handled++;
      return false;
    }
    return true;
  });
  station.waiting = station.waiting.filter((p) => {
    if (train.passengers.length >= trainCapacity(train)) return true;
    const plan = journey(game, station.id, p);
    const candidate =
      plan && journey(game, station.id, p, -1, { next, line: train.line });
    if (candidate && candidate.cost <= plan.cost + 1e-6) {
      train.passengers.push(p);
      handled++;
      return false;
    }
    return true;
  });
  return handled;
}
export function demandOptions(game, station) {
  const existing = new Set(game.stations.map((s) => s.shape));
  return DEMAND[weekend(game) ? "weekend" : "weekday"][station.shape].filter(
    (shape) => existing.has(shape),
  );
}
function generateLocation(game, random) {
  // Keep enough land available as the network grows instead of filling a fixed rectangle.
  const growth = Math.max(
    Math.min(1, 0.28 + game.elapsed / 650),
    Math.sqrt(game.stations.length / 24),
  );
  for (let band = 0; band < 4; band++)
    for (let attempt = 0; attempt < 120; attempt++) {
      const radius = growth * (1 + band * 0.35);
      const x = 550 + (clampRandom(random) * 2 - 1) * 450 * radius;
      const y = 285 + (clampRandom(random) * 2 - 1) * 210 * radius;
      if (
        !waterAt(x, y, 20, game) &&
        game.stations.every((s) => Math.hypot(s.x - x, s.y - y) > 65)
      )
        return { x, y };
    }
  return null;
}
function newStation(game, random) {
  const location = generateLocation(game, random);
  if (!location) return null;
  const available = SPECIAL.filter(
    (shape) => !game.stations.some((s) => s.shape === shape),
  );
  const special =
    game.stations.length >= 7 && available.length && clampRandom(random) < 0.22;
  const n = clampRandom(random),
    shape = special
      ? pick(available, random)
      : n < 0.6
        ? "circle"
        : n < 0.9
          ? "triangle"
          : "square";
  const type =
    ["osaka", "lagos"].includes(game.mapId) &&
    shape === "square" &&
    game.stations.some((s) => s.shape === "square")
      ? "circle"
      : shape;
  return { ...location, shape: type };
}
function generateUpgrade(game, random) {
  const map = getMap(game.mapId);
  if (map.id !== "osaka") game.stock.locomotives += map.trainReward;
  game.upgradeCount++;
  const pool = ["carriage", "tunnels"];
  if (!map.noInterchange) pool.push("interchange");
  if (map.id === "tokyo" && clampRandom(random) < 0.18) pool.push("shinkansen");
  if (game.unlocked < map.maxLines) pool.push("line");
  const first = pick(pool, random),
    second = pick(
      pool.filter((x) => x !== first),
      random,
    );
  game.pendingUpgrade = [first, second];
  game.events.push({ type: "upgrade" });
}
export function chooseUpgrade(game, choice, engine = "normal") {
  if (!game.pendingUpgrade?.includes(choice))
    return result(false, "표시된 보상 중 하나를 선택하세요.");
  const map = getMap(game.mapId);
  if (map.id === "osaka")
    game.stock[engine === "shinkansen" ? "shinkansen" : "locomotives"] +=
      engine === "shinkansen" ? 1 : 2;
  if (choice === "line") game.unlocked++;
  if (choice === "shinkansen") game.stock.shinkansen++;
  if (choice === "carriage")
    game.stock.carriages += map.id === "mumbai" ? 2 : 1;
  if (choice === "tunnels") game.stock.tunnels += map.tunnelReward;
  if (choice === "interchange") game.stock.interchanges++;
  game.pendingUpgrade = null;
  return result(true);
}
// At a non-station crossing, both tracks pay a speed penalty; tracks that share a stop do not.
function crossingCount(game, train) {
  const a = game.stations[train.from],
    b = game.stations[train.to],
    own = edgePoints(a, b);
  const cross = (a, b, c, d) => {
    const orient = (p, q, r) =>
      (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
    return (
      orient(a, b, c) * orient(a, b, d) < -1e-6 &&
      orient(c, d, a) * orient(c, d, b) < -1e-6
    );
  };
  let count = 0;
  game.lines.forEach((line, id) => {
    if (id === train.line) return;
    for (const [c, d] of lineEdges(line)) {
      if (
        [train.from, train.to].includes(c) ||
        [train.from, train.to].includes(d)
      )
        continue;
      const other = edgePoints(game.stations[c], game.stations[d]);
      if (
        own
          .slice(1)
          .some((p, i) =>
            other.slice(1).some((q, j) => cross(own[i], p, other[j], q)),
          )
      )
        count++;
    }
  });
  return count;
}
function turnDelay(game, train, next) {
  if (train.previous === undefined) return 0;
  const a = game.stations[train.previous],
    b = game.stations[train.from],
    c = game.stations[next];
  const u = { x: a.x - b.x, y: a.y - b.y },
    v = { x: c.x - b.x, y: c.y - b.y };
  return u.x * v.x + u.y * v.y > 0 ? 0.8 : 0;
}
function step(game, dt, random) {
  const map = getMap(game.mapId);
  game.elapsed += dt;
  if (game.mode === "normal" && game.score > 0 && !challengeValid(game))
    game.challengeViolated = true;
  for (const station of game.stations) {
    if (game.elapsed >= station.nextSpawn) {
      const choices = demandOptions(game, station);
      if (choices.length) {
        // Cross stations have particularly high demand; weekends favour leisure destinations.
        const weighted = choices.flatMap((shape) =>
          Array(
            shape === "cross"
              ? 4
              : weekend(game) && SPECIAL.includes(shape)
                ? 3
                : 1,
          ).fill(shape),
        );
        station.waiting.push(pick(weighted, random));
        game.totalSpawned++;
      }
      station.nextSpawn =
        game.elapsed +
        (Math.max(1.8, 10 - game.elapsed / 160) *
          (0.65 + clampRandom(random) * 0.7)) /
          map.demand;
    }
  }
  for (const train of [...game.trains]) {
    if (train.to !== null) {
      if (train.dwell > 0) {
        train.dwell = Math.max(0, train.dwell - dt);
        continue;
      }
      const a = game.stations[train.from],
        b = game.stations[train.to];
      if (train.crossVersion !== game.routeVersion) {
        train.crossings = crossingCount(game, train);
        train.crossVersion = game.routeVersion;
      }
      const velocity =
        (85 * map.speed * (train.type === "shinkansen" ? 2.5 : 1)) /
        (1 + (train.crossings ?? 0) * 0.7);
      train.progress += (dt * velocity) / (edgeLength(a, b) || 1);
      if (train.progress < 1) continue;
      train.previous = train.from;
      train.from = train.to;
      train.to = null;
      train.progress = 0;
      applyPendingCarriage(game, train);
      if (train.pendingMove) {
        applyPendingMove(game, train);
        continue;
      }
    }
    if (nextStop(game, train) === null) {
      rehomeTrain(game, train);
      continue;
    }
    if (train.dwell > 0) {
      train.dwell = Math.max(0, train.dwell - dt);
      continue;
    }
    const next = nextStop(game, train);
    const handled = serviceStation(game, train, next);
    train.to = next;
    train.progress = 0;
    train.dwell =
      0.25 +
      handled *
        (game.stations[train.from].interchange
          ? map.service / 4
          : map.service) +
      turnDelay(game, train, next);
    train.crossings = crossingCount(game, train);
    train.crossVersion = game.routeVersion;
  }
  for (const station of game.stations) {
    if (game.mode === "endless") {
      const maximum = capacity(station) * 4;
      if (station.waiting.length > maximum)
        game.discarded += station.waiting.splice(
          0,
          station.waiting.length - maximum,
        ).length;
      station.crowded = 0;
    } else if (creative(game)) station.crowded = 0;
    else {
      station.crowded = Math.max(
        0,
        Math.min(
          RULES.crowdSeconds,
          station.crowded +
            (station.waiting.length > capacity(station) ? dt : -dt),
        ),
      );
      if (station.crowded >= RULES.crowdSeconds) {
        game.gameOver = true;
        game.failedStation = station.id;
        game.events.push({ type: "gameover", station: station.id });
        return;
      }
    }
  }
  if (!creative(game) && game.elapsed >= game.nextStation) {
    const station = game.preview ?? newStation(game, random);
    if (station) {
      const convertible = game.stations.filter(
        (s) =>
          BASIC.includes(s.shape) &&
          game.stations.filter((t) => t.shape === s.shape).length > 1,
      );
      if (
        map.id === "seoul" &&
        SPECIAL.includes(station.shape) &&
        convertible.length &&
        clampRandom(random) < 0.5
      ) {
        const changed = pick(convertible, random);
        changeShape(game, changed, station.shape);
        game.events.push({ type: "conversion", id: changed.id });
      } else addStation(game, station.shape, station.x, station.y);
      game.events.push({ type: "station", id: game.stations.length - 1 });
    }
    game.preview = null;
    game.nextStation = game.elapsed + (station ? map.stationInterval : 1);
  }
  if (
    game.mode === "extreme" &&
    !game.preview &&
    game.nextStation - game.elapsed < 10
  )
    game.preview = newStation(game, random);
  if (game.mode === "normal" || game.mode === "extreme") {
    if (game.elapsed >= game.nextUpgrade) {
      game.nextUpgrade += RULES.week;
      generateUpgrade(game, random);
    }
  }
  if (game.elapsed >= game.nextEfficiency) {
    game.efficiency = game.deliveredToday;
    game.deliveredToday = 0;
    game.nextEfficiency += RULES.day;
    if (
      game.mode === "endless" &&
      game.upgradeCount < 14 &&
      game.efficiency >= 4 + game.upgradeCount * 3
    )
      generateUpgrade(game, random);
  }
}
export function tick(game, dt, random = Math.random) {
  if (game.planning) return;
  if (
    game.gameOver ||
    game.pendingUpgrade ||
    (game.challengeMode && !challengeValid(game)) ||
    !Number.isFinite(dt) ||
    dt <= 0
  )
    return;
  // Fixed-size substeps make all supported speeds behave identically.
  let left = Math.min(dt, 60);
  while (left > 1e-7 && !game.gameOver && !game.pendingUpgrade) {
    const slice = Math.min(0.05, left);
    step(game, slice, random);
    left -= slice;
  }
}
export function continueAs(game, mode) {
  if (!["endless", "creative"].includes(mode))
    return result(false, "지원하지 않는 모드입니다.");
  game.mode = mode;
  game.gameOver = false;
  game.pendingUpgrade = null;
  if (mode === "creative") game.unlocked = getMap(game.mapId).maxLines;
  for (const station of game.stations) station.crowded = 0;
  return result(true);
}
function changeShape(game, station, shape) {
  station.shape = shape;
  // A newly converted platform already fulfils matching waiting passengers' journeys.
  station.waiting = station.waiting.filter((p) => {
    if (p !== shape) return true;
    game.score++;
    game.deliveredToday++;
    return false;
  });
}
export function editStation(game, id, shape) {
  if (!canDesign(game))
    return result(false, "역 편집은 크리에이티브에서만 가능합니다.");
  if (![...BASIC, ...SPECIAL].includes(shape))
    return result(false, "지원하지 않는 모양입니다.");
  if (
    SPECIAL.includes(shape) &&
    game.stations.some((s) => s.id !== id && s.shape === shape)
  )
    return result(false, "특수역은 모양별로 하나만 만들 수 있습니다.");
  const station = game.stations[id];
  if (!station) return result(false, "역을 선택하세요.");
  changeShape(game, station, shape);
  return result(true);
}
export function placeStation(game, shape, x, y) {
  if (!canDesign(game))
    return result(false, "역 배치는 크리에이티브에서만 가능합니다.");
  if (![...BASIC, ...SPECIAL].includes(shape))
    return result(false, "지원하지 않는 모양입니다.");
  if (SPECIAL.includes(shape) && game.stations.some((s) => s.shape === shape))
    return result(false, "특수역은 모양별로 하나만 만들 수 있습니다.");
  if (x < 60 || x > 1040 || y < 70 || y > 500 || waterAt(x, y, 5, game))
    return result(false, "물 밖의 지도 안쪽에 배치하세요.");
  if (game.stations.some((s) => Math.hypot(s.x - x, s.y - y) < 55))
    return result(false, "다른 역과 간격을 55 이상 띄워주세요.");
  addStation(game, shape, x, y);
  return result(true);
}
export function deleteStation(game, id) {
  if (!canDesign(game))
    return result(false, "역 삭제는 크리에이티브에서만 가능합니다.");
  if (!game.planning && game.stations.length <= 3)
    return result(false, "최소 3개 역은 남겨주세요.");
  // Only delete unserved stations: avoids invalidating physical trains in transit.
  if (
    game.lines.some((l) => l.stations.includes(id)) ||
    game.trains.some((t) => t.from === id || t.to === id)
  )
    return result(false, "먼저 이 역의 노선과 열차를 제거하세요.");
  const station = game.stations[id];
  game.discarded += station.waiting.length;
  game.stations.splice(id, 1);
  game.stations.forEach((s, i) => {
    s.id = i;
  });
  game.lines.forEach((l) => {
    l.stations = l.stations.map((s) => (s > id ? s - 1 : s));
  });
  game.trains.forEach((t) => {
    if (t.from > id) t.from--;
    if (t.to > id) t.to--;
    if (t.previous > id) t.previous--;
    if (t.pendingMove?.station > id) t.pendingMove.station--;
  });
  return result(true);
}

export function challengeValid(game) {
  const map = getMap(game.mapId),
    active = game.lines.filter((l) => l.stations.length >= 2);
  const waterLines = game.lines.filter((l) =>
    lineEdges(l).some(([a, b]) =>
      needsTunnel(game.stations[a], game.stations[b], game),
    ),
  );
  switch (map.challenge) {
    case "tunnel1":
      return tunnelsUsed(game) <= 1;
    case "tunnel2":
      return tunnelsUsed(game) <= 2;
    case "lines3":
      return active.length <= 3;
    case "lines4":
      return active.length <= 4;
    case "square2":
      return (
        game.lines.filter((l) =>
          l.stations.some((id) => game.stations[id].shape === "square"),
        ).length <= 2
      );
    case "loop1":
      return active.filter((l) => l.loop).length <= 1;
    case "tunnelLine1":
      return waterLines.length <= 1;
    case "stations8":
      return active.every((l) => l.stations.length <= 8);
    case "train1":
      return game.lines.every(
        (l, id) => game.trains.filter((t) => t.line === id).length <= 1,
      );
    case "carriage1":
      return game.lines.every(
        (l, id) =>
          game.trains
            .filter((t) => t.line === id)
            .reduce((n, t) => n + t.carriages, 0) <= 1,
      );
    case "loopsOnly":
      return active.every((l) => l.loop);
    case "connected":
    case "week8connected":
      return (
        active.length > 1 &&
        active.every((l, i) =>
          active.some(
            (other, j) =>
              i !== j && l.stations.some((s) => other.stations.includes(s)),
          ),
        )
      );
    default:
      return true;
  }
}
export function challengeComplete(game) {
  const map = getMap(game.mapId),
    week = Math.floor(game.elapsed / RULES.week) + 1;
  if (game.mode !== "normal" || game.challengeViolated || !challengeValid(game))
    return false;
  if (map.challenge === "week10") return week >= 10;
  if (map.challenge === "week9") return week >= 9;
  if (map.challenge === "week8connected") return week >= 8;
  return game.score >= map.challengeScore;
}
export function validSavedGame(game) {
  // Reject incompatible or malformed local saves instead of crashing the render loop.
  if (
    game?.version !== 2 ||
    !["normal", "extreme", "endless", "creative"].includes(game.mode) ||
    getMap(game.mapId).id !== game.mapId
  )
    return false;
  if (
    !Array.isArray(game.stations) ||
    (game.stations.length < 3 && !(game.customLayout && game.planning)) ||
    !Array.isArray(game.lines) ||
    game.lines.length !== 7 ||
    !Array.isArray(game.trains) ||
    game.trains.length > 42
  )
    return false;
  if (
    ![
      game.score,
      game.elapsed,
      game.unlocked,
      game.nextTrainId,
      game.nextStation,
      game.nextUpgrade,
      game.nextEfficiency,
    ].every(Number.isFinite) ||
    game.unlocked < 2 ||
    game.unlocked > getMap(game.mapId).maxLines
  )
    return false;
  if (
    !game.stock ||
    ![
      "locomotives",
      "shinkansen",
      "carriages",
      "tunnels",
      "interchanges",
    ].every((k) => Number.isFinite(game.stock[k]) && game.stock[k] >= 0)
  )
    return false;
  const passenger = (p) => [...BASIC, ...SPECIAL].includes(p);
  const id = (n) => Number.isInteger(n) && n >= 0 && n < game.stations.length;
  if (
    !game.stations.every(
      (s, i) =>
        s.id === i &&
        passenger(s.shape) &&
        [s.x, s.y, s.crowded, s.nextSpawn, s.limit].every(Number.isFinite) &&
        Array.isArray(s.waiting) &&
        s.waiting.every(passenger),
    )
  )
    return false;
  if (
    !game.lines.every(
      (l) =>
        Array.isArray(l.stations) &&
        l.stations.every(id) &&
        new Set(l.stations).size === l.stations.length &&
        typeof l.loop === "boolean",
    )
  )
    return false;
  if (
    !game.trains.every(
      (t) =>
        id(t.from) &&
        (t.to === null || id(t.to)) &&
        Number.isInteger(t.line) &&
        t.line >= 0 &&
        t.line < game.unlocked &&
        [t.progress, t.carriages, t.dwell, t.id, t.seats].every(
          Number.isFinite,
        ) &&
        t.carriages >= 0 &&
        t.carriages <= 65 &&
        Array.isArray(t.passengers) &&
        t.passengers.every(passenger) &&
        (!t.pendingMove ||
          t.pendingMove.line === null ||
          (Number.isInteger(t.pendingMove.line) &&
            t.pendingMove.line >= 0 &&
            t.pendingMove.line < game.unlocked &&
            id(t.pendingMove.station))),
    )
  )
    return false;
  if (
    game.pendingUpgrade !== null &&
    (!Array.isArray(game.pendingUpgrade) ||
      game.pendingUpgrade.length !== 2 ||
      !game.pendingUpgrade.every((x) =>
        ["line", "carriage", "tunnels", "interchange", "shinkansen"].includes(
          x,
        ),
      ))
  )
    return false;
  return Array.isArray(game.events);
}

export const canDesign = (game) =>
  creative(game) ||
  game.planning ||
  (game.customLayout && game.mode !== "extreme");
export function createDesign(
  mode = "normal",
  random = Math.random,
  mapId = "seoul",
) {
  const game = createGame(mode, random, mapId);
  game.stations = [];
  game.customLayout = true;
  game.planning = true;
  return game;
}
export function launchDesign(game) {
  if (!game.planning) return result(false, "이미 운행 중입니다.");
  if (!BASIC.every((shape) => game.stations.some((s) => s.shape === shape)))
    return result(false, "원·세모·네모 역을 각각 1개 이상 배치하세요.");
  const seen = new Set([0]),
    queue = [0];
  while (queue.length)
    for (const edge of neighbors(game, queue.shift())) {
      if (!seen.has(edge.to)) {
        seen.add(edge.to);
        queue.push(edge.to);
      }
    }
  if (seen.size !== game.stations.length)
    return result(
      false,
      "모든 역을 노선으로 연결하세요. 환승으로 이어도 됩니다.",
    );
  if (!game.trains.length)
    return result(false, "노선에 열차를 한 대 이상 배치하세요.");
  game.planning = false;
  game.stations.forEach((s, i) => {
    s.nextSpawn = 5 + i * 1.1;
  });
  return result(true, "설계가 완성되었습니다. 첫 운행을 시작합니다.");
}
export function moveStation(game, id, x, y) {
  if (!game.planning)
    return result(false, "역 위치 이동은 운행 시작 전에 가능합니다.");
  const station = game.stations[id];
  if (!station) return result(false, "이동할 역을 선택하세요.");
  if (x < 60 || x > 1040 || y < 70 || y > 500 || waterAt(x, y, 5, game))
    return result(false, "물 밖의 지도 안쪽으로 옮기세요.");
  if (
    game.stations.some((s) => s.id !== id && Math.hypot(s.x - x, s.y - y) < 55)
  )
    return result(false, "다른 역과 간격을 충분히 띄워주세요.");
  const old = { x: station.x, y: station.y };
  station.x = x;
  station.y = y;
  if (!creative(game) && tunnelsUsed(game) > game.stock.tunnels) {
    Object.assign(station, old);
    return result(false, "이 위치로 이동하면 터널이 부족합니다.");
  }
  game.routeVersion = (game.routeVersion ?? 0) + 1;
  return result(true);
}

function validTrackPosition(game, lineId, p) {
  return (
    Number.isFinite(p.progress) &&
    p.progress >= 0 &&
    p.progress <= 1 &&
    game.lines[lineId]?.stations.includes(p.from) &&
    lineEdges(game.lines[lineId]).some(([a, b]) => a === p.from && b === p.to)
  );
}

export function trimLine(game, lineId, stationId, end = "back") {
  if (game.mode === "extreme" && !game.planning)
    return result(false, "익스트림에서는 노선을 단축할 수 없습니다.");
  const line = game.lines[lineId],
    index = line?.stations.indexOf(stationId) ?? -1;
  if (index < 0 || line.loop)
    return result(false, "왕복 노선의 끝을 역까지 끌어 단축하세요.");
  return commitLine(game, lineId, {
    stations:
      end === "front"
        ? line.stations.slice(index)
        : line.stations.slice(0, index + 1),
    loop: false,
  });
}

// Commit a whole drag at once; an invalid drop never consumes a train or leaves half a line.
export function drawRoute(game, lineId, path) {
  const line = game.lines[lineId];
  if (!line || path.length < 2 || path.some((id) => !game.stations[id]))
    return result(false, "역에서 다른 역까지 드래그하세요.");
  if (line.loop) return result(false, "순환선을 먼저 열어주세요.");
  const ids = [...line.stations];
  const end =
    !ids.length || ids.at(-1) === path[0]
      ? "back"
      : ids[0] === path[0]
        ? "front"
        : null;
  if (!end) return result(false, "노선 끝부분에서 드래그해 연장하세요.");
  if (!ids.length) ids.push(path[0]);
  let loop = false;
  for (let i = 1; i < path.length; i++) {
    const id = path[i],
      index = ids.indexOf(id);
    if (index >= 0) {
      const opposite = end === "back" ? ids[0] : ids.at(-1);
      if (id === opposite && ids.length >= 3 && i === path.length - 1) {
        loop = true;
        continue;
      }
      if (path.length === 2) {
        if (game.mode === "extreme" && !game.planning)
          return result(false, "익스트림에서는 노선을 단축할 수 없습니다.");
        return commitLine(game, lineId, {
          stations: end === "back" ? ids.slice(0, index + 1) : ids.slice(index),
          loop: false,
        });
      }
      return result(false, "한 노선에서 중간역을 중복 연결할 수 없습니다.");
    }
    end === "back" ? ids.push(id) : ids.unshift(id);
  }
  return commitLine(game, lineId, { stations: ids, loop });
}

export function recordProgress(profile, game) {
  const events = [];
  if (game.mode === "creative") return events;
  profile.best ??= {};
  profile.unlocked = [
    ...new Set([...INITIAL_UNLOCKS, ...(profile.unlocked ?? [])]),
  ];
  profile.extreme ??= [];
  profile.vintage ??= [];
  const key = `${game.mapId}:${game.mode}${game.customLayout ? ":custom" : ""}`;
  profile.best[key] = Math.max(profile.best[key] ?? 0, game.score);
  if (game.mode !== "normal" || game.customLayout) return events;
  const map = getMap(game.mapId);
  if (game.score >= map.goal)
    for (const id of map.next)
      if (!profile.unlocked.includes(id)) {
        profile.unlocked.push(id);
        events.push({ type: "city", id });
      }
  if (challengeComplete(game) && !profile.extreme.includes(map.id)) {
    profile.extreme.push(map.id);
    events.push({ type: "extreme", id: map.id });
  }
  if (
    INITIAL_UNLOCKS.includes(map.id) &&
    game.score >= 1000 &&
    !profile.vintage.includes(map.id)
  ) {
    profile.vintage.push(map.id);
    events.push({ type: "medal", id: map.id });
  }
  return events;
}

function rehomeTrain(game, train) {
  const line = game.lines[train.line];
  if (line.stations.length < 2) {
    releaseTrain(game, train);
    return;
  }
  const current = game.stations[train.from];
  unload(game, train);
  train.from = line.stations.reduce(
    (best, id) =>
      Math.hypot(
        game.stations[id].x - current.x,
        game.stations[id].y - current.y,
      ) <
      Math.hypot(
        game.stations[best].x - current.x,
        game.stations[best].y - current.y,
      )
        ? id
        : best,
    line.stations[0],
  );
  train.to = null;
  train.progress = 0;
  train.previous = undefined;
  train.direction = 1;
  train.dwell = 0.5;
}
export function replaceStation(game, lineId, oldId, newId) {
  if (game.mode === "extreme" && !game.planning)
    return result(false, "익스트림에서는 중간 노선을 수정할 수 없습니다.");
  const line = game.lines[lineId],
    index = line?.stations.indexOf(oldId) ?? -1;
  if (index < 0 || !game.stations[newId])
    return result(false, "바꿀 역을 선택하세요.");
  if (oldId === newId) return result(true);
  const ids = [...line.stations],
    other = ids.indexOf(newId);
  ids[index] = newId;
  if (other >= 0) ids[other] = oldId;
  return commitLine(game, lineId, { stations: ids, loop: line.loop });
}
