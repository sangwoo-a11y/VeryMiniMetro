import { readableLineColor } from "./theme.js?v=11";
import { smoothAngle, cameraAt, samplePath, easePath } from "./motion.js?v=11";
import {
  MAPS,
  getMap,
  INITIAL_UNLOCKS,
  CHALLENGES,
  PREVIEWS,
  cityUnlocked,
  canStartCity,
  cityRequirement,
} from "./maps.js?v=11";
import {
  BASIC,
  SPECIAL,
  RULES,
  createGame,
  continueAs,
  recordProgress,
  tick,
  drawRoute,
  reshapeTrack,
  insertStation,
  removeStation,
  replaceStation,
  clearLine,
  openLoop,
  addTrain,
  addCarriage,
  moveTrain,
  moveCarriage,
  upgradeStation,
  chooseUpgrade,
  lineEdges,
  edgePoints,
  edgeLength,
  pointOnEdge,
  needsTunnel,
  tunnelsUsed,
  capacity,
  trainCapacity,
  placeStation,
  editStation,
  deleteStation,
  challengeValid,
  challengeComplete,
  validSavedGame,
  launchDesign,
  moveStation,
  canDesign,
} from "./simulation.js?v=11";

const $ = (id) => document.getElementById(id);
const NS = "http://www.w3.org/2000/svg";
const SAVE = "very-mini-metro-save-v2",
  PROFILE = "very-mini-metro-profile-v2";
const MODE_NAMES = {
  normal: "일반",
  extreme: "익스트림",
  endless: "무한",
  creative: "크리에이티브",
};
let profile = {
  unlocked: [...INITIAL_UNLOCKS],
  extreme: [],
  vintage: [],
  best: {},
  settings: { night: true, accessible: false, sound: false, volume: 30 },
};
let game,
  selected = 0,
  paused = false,
  speed = 1,
  tool = "connect",
  pendingInsert = null,
  endpoint = "back";
let challengeRun = false;
let cityMode = "normal",
  tutorialActive = false;
let menuMap = "london",
  gesture = null,
  selectedTrain = null,
  moveId = null;
let view = { x: 0, y: 0, w: 1100, h: 570 },
  manualView = false,
  audio,
  last = 0,
  visual = 0,
  savedAt = 0;
const trainNodes = new Map(),
  stationNodes = new Map();
let routeSignature = "",
  lineSignature = "",
  previewSignature = "",
  endpointSignature = "",
  cameraTween = null,
  pendingPointerMove = null,
  previewMotion = null;
const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
const reducedMotion = () => motionPreference.matches;
let viewGestureDirty = false,
  pinch = null,
  pinchSuppressed = false;
const touchPoints = new Map();
let storageAvailable = true,
  overShown = false,
  hasSaved = false;
try {
  const stored = JSON.parse(localStorage.getItem(PROFILE));
  if (
    stored &&
    Array.isArray(stored.unlocked) &&
    Array.isArray(stored.extreme) &&
    stored.settings &&
    stored.best
  ) {
    profile = {
      ...profile,
      ...stored,
      settings: { ...profile.settings, ...stored.settings },
    };
    profile.best =
      typeof stored.best === "object" && !Array.isArray(stored.best)
        ? stored.best
        : {};
    profile.vintage = Array.isArray(stored.vintage) ? stored.vintage : [];
    profile.unlocked = [
      ...new Set([
        ...INITIAL_UNLOCKS,
        ...profile.unlocked.filter((id) => MAPS.some((m) => m.id === id)),
      ]),
    ];
  }
  const saved = JSON.parse(localStorage.getItem(SAVE));
  if (validSavedGame(saved)) {
    game = saved;
    game.events = [];
    hasSaved = true;
    menuMap = game.mapId;
  }
} catch {
  /* Missing, old or malformed local data starts a clean game. */
}
if (profile.settings.paletteVersion !== "graphite-v1") {
  profile.settings.night = true;
  profile.settings.paletteVersion = "graphite-v1";
}
game ??= createGame("normal", Math.random, "london");

function svg(tag, attributes = {}, parent) {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attributes))
    node.setAttribute(key, value);
  parent?.append(node);
  return node;
}
function shape(type, x, y, size, parent, attributes = {}) {
  if (type === "circle")
    return svg("circle", { cx: x, cy: y, r: size, ...attributes }, parent);
  if (type === "square")
    return svg(
      "rect",
      {
        x: x - size,
        y: y - size,
        width: size * 2,
        height: size * 2,
        rx: 1,
        ...attributes,
      },
      parent,
    );
  if (type === "oval")
    return svg(
      "ellipse",
      {
        cx: x,
        cy: y,
        rx: size * 1.25,
        ry: size * 0.65,
        transform: `rotate(-45 ${x} ${y})`,
        ...attributes,
      },
      parent,
    );
  if (type === "sector")
    return svg(
      "path",
      {
        d: `M${x - size},${y - size * 0.4} L${x + size},${y - size * 0.4} A${size},${size} 0 0 1 ${x - size},${y - size * 0.4} Z`,
        ...attributes,
      },
      parent,
    );
  let points;
  if (type === "triangle")
    points = [
      [0, -1.15],
      [1.1, 0.9],
      [-1.1, 0.9],
    ];
  if (type === "rhombus")
    points = [
      [0, -1.15],
      [1.05, 0],
      [0, 1.15],
      [-1.05, 0],
    ];
  if (type === "diamond")
    points = [
      [-0.6, -0.7],
      [0.6, -0.7],
      [1.1, -0.15],
      [0, 1.15],
      [-1.1, -0.15],
    ];
  if (type === "cross")
    points = [
      [-0.35, -1],
      [0.35, -1],
      [0.35, -0.35],
      [1, -0.35],
      [1, 0.35],
      [0.35, 0.35],
      [0.35, 1],
      [-0.35, 1],
      [-0.35, 0.35],
      [-1, 0.35],
      [-1, -0.35],
      [-0.35, -0.35],
    ];
  if (type === "star" || type === "pentagon") {
    const count = type === "star" ? 10 : 5;
    points = Array.from({ length: count }, (_, i) => {
      const angle = -Math.PI / 2 + (i * Math.PI * 2) / count,
        radius = type === "star" && i % 2 ? 0.48 : 1.15;
      return [Math.cos(angle) * radius, Math.sin(angle) * radius];
    });
  }
  return svg(
    "polygon",
    {
      points: points
        .map(([a, b]) => `${x + a * size},${y + b * size}`)
        .join(" "),
      ...attributes,
    },
    parent,
  );
}
function toast(message) {
  $("toast").textContent = message;
  $("toast").classList.add("visible");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => $("toast").classList.remove("visible"), 4200);
}
function notify(outcome) {
  if (outcome.message) toast(outcome.message);
  if (outcome.ok) {
    tone();
    save();
  }
  render();
  return outcome.ok;
}
function tone() {
  if (!profile.settings.sound) return;
  try {
    audio ??= new AudioContext();
    if (audio.state === "suspended") audio.resume();
    const oscillator = audio.createOscillator(),
      gain = audio.createGain();
    oscillator.connect(gain);
    gain.connect(audio.destination);
    oscillator.frequency.value = 460;
    gain.gain.setValueAtTime(profile.settings.volume / 2500, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.12);
    oscillator.start();
    oscillator.stop(audio.currentTime + 0.13);
  } catch {
    /* Audio is optional. */
  }
}
function save() {
  if (document.body.classList.contains("at-home") && !hasSaved) return;
  try {
    localStorage.setItem(SAVE, JSON.stringify(game));
    localStorage.setItem(PROFILE, JSON.stringify(profile));
    hasSaved = true;
  } catch {
    storageAvailable = false;
    $("storage-status").textContent =
      "브라우저 저장 공간을 사용할 수 없습니다. 이 탭을 닫으면 진행 상황이 사라집니다.";
  }
}
let paletteKey = "",
  paletteValue = [];
function colors() {
  const key = `${game.mapId}:${profile.settings.accessible}:${profile.settings.night}`;
  if (key !== paletteKey) {
    paletteKey = key;
    const values = profile.settings.accessible
      ? [
          "#0072b2",
          "#d55e00",
          "#009e73",
          "#cc79a7",
          "#e6ab02",
          "#6b62a1",
          "#444444",
        ]
      : getMap(game.mapId).colors;
    paletteValue = values.map((color) =>
      readableLineColor(color, profile.settings.night),
    );
  }
  return paletteValue;
}
function applySettings() {
  document.body.classList.toggle("night", Boolean(profile.settings.night));
  document.body.classList.toggle("day", !profile.settings.night);
  $("night-mode").checked = Boolean(profile.settings.night);
  $("accessible-colors").checked = Boolean(profile.settings.accessible);
  $("sound-setting").checked = Boolean(profile.settings.sound);
  $("volume").value = profile.settings.volume;
}
function chooseLine(id) {
  if (id >= game.unlocked) {
    toast("주간 보상에서 새 노선을 얻으면 열립니다.");
    return;
  }
  selected = id;
  endpoint = "back";
  pendingInsert = null;
  if (!["move-train", "move-carriage"].includes(tool)) tool = "connect";
  updateTools();
  render();
}
function setTool(next) {
  tool = next;
  moveId = null;
  pendingInsert = null;
  updateTools();
  render();
}
const TOOL_HINTS = {
  "move-station":
    "역을 드래그해 위치를 조정하세요. 운행 전까지만 이동할 수 있습니다.",
  connect: "역 사이를 드래그 · 선로를 빈 곳에 끌어 굽힘 조절 · 역 위에 놓아 삽입",
  train: "열차를 선로 위로 드래그하거나, 선택 노선의 역을 누르세요.",
  fast: "신칸센을 배치할 선택 노선의 역을 누르세요.",
  carriage: "객차를 열차 위로 드래그하거나 열차를 누르세요.",
  interchange: "교차역으로 확장할 역을 누르세요. 적용 후 회수 불가.",
  erase: "선택한 노선에서 제거할 역을 누르세요.",
  place: "빈 땅에 역을 배치하거나 기존 역을 눌러 모양을 바꾸세요.",
  delete: "삭제할 미연결 역을 누르세요.",
  "move-train": "아래에서 대상 노선을 선택하고 배치할 역을 누르세요.",
  "move-carriage": "객차를 받을 다른 열차를 누르세요.",
};
function updateTools() {
  document
    .querySelectorAll("[data-tool]")
    .forEach((b) => b.classList.toggle("selected", b.dataset.tool === tool));
  $("hint").textContent =
    pendingInsert !== null
      ? "삽입할 역을 클릭하세요. Esc로 취소."
      : TOOL_HINTS[tool];
  $("hint").style.borderLeft = `3px solid ${colors()[selected]}`;
}
function renderTerrain(
  target = $("terrain"),
  map = getMap(game.mapId),
  miniature = false,
) {
  target.replaceChildren();
  for (const feature of map.features)
    svg(
      feature.polygon ? "polygon" : "polyline",
      {
        points: feature.points
          .map(([x, y]) => `${x * 11},${y * 5.7}`)
          .join(" "),
        fill: feature.polygon ? "var(--water)" : "none",
        stroke: "var(--water)",
        "stroke-width": feature.polygon ? 0 : feature.width * 5.7,
        "stroke-linejoin": "round",
        "stroke-linecap": "round",
      },
      target,
    );
  for (const island of map.islands)
    svg(
      "polygon",
      {
        points: island.map(([x, y]) => `${x * 11},${y * 5.7}`).join(" "),
        fill: "var(--map)",
        stroke: "var(--map)",
        "stroke-width": 2,
      },
      target,
    );
  if (!miniature && map.id === "seoul") {
    const label = svg("text", { x: 810, y: 302, class: "river-label" }, target);
    label.textContent = "H A N   R I V E R";
  }
}
function fitMap(animate = false) {
  const xs = game.stations.map((s) => s.x),
    ys = game.stations.map((s) => s.y);
  const minX = Math.min(-60, ...xs.map((x) => x - 80)),
    maxX = Math.max(1160, ...xs.map((x) => x + 80));
  const minY = Math.min(-35, ...ys.map((y) => y - 75)),
    maxY = Math.max(605, ...ys.map((y) => y + 75));
  const target = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  if (animate) animateCamera(target);
  else {
    cameraTween = null;
    view = target;
    applyView();
  }
}
function applyView() {
  $("map").setAttribute("viewBox", `${view.x} ${view.y} ${view.w} ${view.h}`);
}
function renderRoutes() {
  const key = JSON.stringify([
    game.mapId,
    game.lines,
    game.stations.map((s) => [s.x, s.y, s.trackBends]),
    game.trains.map((t) => [t.id, t.from, t.to]),
    selected,
    tool,
    colors(),
  ]);
  if (routeSignature === key) return;
  routeSignature = key;
  $("routes").replaceChildren();
  $("ghost-routes").replaceChildren();
  const palette = colors();
  game.lines.forEach((line, lineId) => {
    lineEdges(line).forEach(([a, b], index) => {
      const offset = trackOffset(lineId, a, b);
      const points = edgePoints(game.stations[a], game.stations[b])
        .map((p) => `${p.x + offset.x},${p.y + offset.y}`)
        .join(" ");
      const group = svg(
        "g",
        { "data-line": lineId, "data-edge": index, class: "route-segment" },
        $("routes"),
      );
      svg(
        "polyline",
        {
          points,
          fill: "none",
          stroke: "transparent",
          "stroke-width": 22,
          "pointer-events": "stroke",
        },
        group,
      );
      svg(
        "polyline",
        {
          points,
          fill: "none",
          stroke: palette[lineId],
          "stroke-width": selected === lineId ? 6 : 5,
          "stroke-linecap": "round",
          "stroke-linejoin": "round",
          opacity: tool === "connect" && selected !== lineId ? 0.72 : 1,
          "stroke-dasharray": "none",
          "pointer-events": "none",
        },
        group,
      );
      if (needsTunnel(game.stations[a], game.stations[b], game))
        svg(
          "polyline",
          {
            points,
            fill: "none",
            stroke: "var(--water)",
            "stroke-width": 8,
            "stroke-dasharray": "3 9",
            mask: "url(#tunnel-water)",
            "pointer-events": "none",
          },
          group,
        );
    });
    if (!line.loop && line.stations.length >= 2) {
      for (const [id, end] of [
        [line.stations[0], "front"],
        [line.stations.at(-1), "back"],
      ]) {
        const s = game.stations[id],
          handle = svg(
            "g",
            {
              "data-station": id,
              "data-end": end,
              "data-handle-line": lineId,
              class: "endpoint",
              transform: `translate(${s.x} ${s.y}) scale(${symbolScale()}) translate(${-s.x} ${-s.y})`,
            },
            $("routes"),
          );
        const neighbor =
          game.stations[
            end === "front" ? line.stations[1] : line.stations.at(-2)
          ];
        const near = edgePoints(s, neighbor)[1];
        const dx = near.x - s.x,
          dy = near.y - s.y,
          len = Math.hypot(dx, dy) || 1;
        const x = s.x - (dx / len) * 26,
          y = s.y - (dy / len) * 26;
        svg(
          "circle",
          { cx: x, cy: y, r: 12, fill: "transparent", "pointer-events": "all" },
          handle,
        );
        svg(
          "line",
          {
            x1: x - (dy / len) * 7,
            y1: y + (dx / len) * 7,
            x2: x + (dy / len) * 7,
            y2: y - (dx / len) * 7,
            stroke: palette[lineId],
            "stroke-width": 3,
          },
          handle,
        );
        svg(
          "line",
          {
            x1: s.x - (dx / len) * 14,
            y1: s.y - (dy / len) * 14,
            x2: x,
            y2: y,
            stroke: palette[lineId],
            "stroke-width": 2,
          },
          handle,
        );
      }
    }
  });
  for (const train of game.trains)
    if (
      train.to !== null &&
      !lineEdges(game.lines[train.line]).some(
        ([a, b]) =>
          (a === train.from && b === train.to) ||
          (a === train.to && b === train.from),
      )
    ) {
      svg(
        "polyline",
        {
          points: edgePoints(game.stations[train.from], game.stations[train.to])
            .map((p) => `${p.x},${p.y}`)
            .join(" "),
          fill: "none",
          stroke: palette[train.line],
          "stroke-width": 4,
          "stroke-dasharray": "3 5",
          opacity: 0.3,
        },
        $("ghost-routes"),
      );
    }
}
function symbolScale() {
  return Math.max(1, 0.7 / ($("map").getScreenCTM()?.a || 1));
}
function renderStations() {
  const previewKey = JSON.stringify(game.preview);
  if (previewKey !== previewSignature) {
    previewSignature = previewKey;
    $("previews").replaceChildren();
    if (game.preview)
      shape(
        game.preview.shape,
        game.preview.x,
        game.preview.y,
        12,
        $("previews"),
        {
          class: "station-shape",
          opacity: 0.25,
          fill: "var(--map)",
          stroke: "var(--ink)",
          "stroke-width": 2,
        },
      );
  }
  const alive = new Set();
  for (const s of game.stations) {
    alive.add(s.id);
    const key = JSON.stringify([
      game.mapId,
      s.name,
      s.shape,
      s.x,
      s.y,
      s.interchange,
    ]);
    let entry = stationNodes.get(s.id);
    if (!entry?.node.isConnected) {
      entry = {
        node: svg(
          "g",
          {
            class: "station",
            "data-station": s.id,
            role: "button",
            tabindex: 0,
          },
          $("stations"),
        ),
      };
      stationNodes.set(s.id, entry);
    }
    const g = entry.node;
    if (entry.key !== key) {
      entry.key = key;
      entry.waitingKey = null;
      entry.crowded = undefined;
      entry.scale = undefined;
      g.replaceChildren();
      svg(
        "circle",
        {
          cx: s.x,
          cy: s.y,
          r: 24,
          fill: "transparent",
          "pointer-events": "all",
        },
        g,
      );
      const radius = s.interchange ? 24 : 21;
      entry.track = svg(
        "circle",
        {
          cx: s.x,
          cy: s.y,
          r: radius,
          fill: "none",
          class: "crowd-track",
          stroke: "var(--crowd-track)",
          "stroke-width": 5,
          visibility: "hidden",
        },
        g,
      );
      entry.ring = svg(
        "circle",
        {
          cx: s.x,
          cy: s.y,
          r: radius,
          fill: "none",
          class: "crowd-progress",
          stroke: "#db6354",
          "stroke-width": 5,
          transform: `rotate(-90 ${s.x} ${s.y})`,
          visibility: "hidden",
        },
        g,
      );
      if (s.interchange)
        svg(
          "circle",
          {
            cx: s.x,
            cy: s.y,
            r: 18,
            fill: "var(--station)",
            stroke: "var(--ink)",
            "stroke-width": 2,
          },
          g,
        );
      shape(s.shape, s.x, s.y, s.interchange ? 12 : 10, g, {
        class: "station-shape",
        fill: "var(--station)",
        stroke: "var(--ink)",
        "stroke-width": 2.5,
      });
      const label = svg(
        "text",
        {
          x: s.x,
          y: s.y + 33,
          "text-anchor": "middle",
          class: "station-label",
        },
        g,
      );
      label.textContent = s.name;
      entry.passengers = svg("g", { class: "waiting-passengers" }, g);
    }
    const waitingKey = JSON.stringify(s.waiting);
    if (entry.waitingKey !== waitingKey) {
      entry.waitingKey = waitingKey;
      g.setAttribute(
        "aria-label",
        `${s.name} ${s.shape}, 대기 ${s.waiting.length}명, 정원 ${capacity(s)}명`,
      );
      entry.passengers.replaceChildren();
      s.waiting
        .slice(0, 24)
        .forEach((p, i) =>
          shape(
            p,
            s.x + 23 + (i % 6) * 8,
            s.y - 12 + Math.floor(i / 6) * 9,
            2.5,
            entry.passengers,
            { class: "passenger" },
          ),
        );
      if (s.waiting.length > 24) {
        const count = svg(
          "text",
          { x: s.x + 25, y: s.y + 34, "font-size": 8, fill: "#db6354" },
          entry.passengers,
        );
        count.textContent = `+${s.waiting.length - 24}`;
      }
    }
  }
  for (const [id, entry] of stationNodes)
    if (!alive.has(id)) {
      entry.node.remove();
      stationNodes.delete(id);
    }
  updateCrowding();
}
function trainPoint(train) {
  const a = game.stations[train.from];
  const p =
    train.to === null
      ? { x: a.x, y: a.y, angle: 0 }
      : pointOnEdge(a, game.stations[train.to], train.progress);
  if (train.to !== null) {
    const offset = trackOffset(train.line, train.from, train.to);
    p.x += offset.x;
    p.y += offset.y;
  }
  return p;
}
function drawTrains(now = performance.now()) {
  const alive = new Set(),
    palette = colors(),
    scale = symbolScale();
  for (const train of game.trains) {
    alive.add(train.id);
    let entry = trainNodes.get(train.id);
    if (!entry || !entry.node.isConnected) {
      entry = {
        node: svg(
          "g",
          {
            "data-train": train.id,
            class: "train",
            role: "button",
            tabindex: 0,
          },
          $("trains"),
        ),
        angle: NaN,
        last: now,
        key: null,
      };
      trainNodes.set(train.id, entry);
    }
    const point = trainPoint(train);
    entry.angle = smoothAngle(
      entry.angle,
      point.angle,
      Math.min(0.1, Math.max(0, (now - entry.last) / 1000)),
      reducedMotion(),
    );
    entry.last = now;
    entry.node.setAttribute(
      "transform",
      `translate(${point.x} ${point.y}) rotate(${entry.angle}) scale(${scale})`,
    );
    const key = JSON.stringify([
      train.line,
      train.type,
      train.carriages,
      train.seats,
      train.passengers,
      palette[train.line],
      train.pendingMove?.line,
    ]);
    if (entry.key === key) continue;
    entry.key = key;
    entry.node.replaceChildren();
    entry.node.setAttribute(
      "aria-label",
      `열차 ${train.id}, ${train.passengers.length}/${trainCapacity(train)}명, 객차 ${train.carriages}개`,
    );
    for (let car = Math.min(train.carriages, 11); car >= 0; car--) {
      const body = svg(
        "g",
        { transform: `translate(${-car * 23} 0)` },
        entry.node,
      );
      const attrs = {
        fill: palette[train.line],
        stroke: "var(--station)",
        "stroke-width": 1.3,
        opacity: train.pendingMove?.line === null ? 0.55 : 1,
      };
      if (car === 0 && train.type === "shinkansen")
        svg("path", { d: "M-11 -6 L6 -6 L15 0 L6 6 L-11 6 Z", ...attrs }, body);
      else
        svg(
          "rect",
          { x: -11, y: -6, width: 22, height: 12, rx: 2.5, ...attrs },
          body,
        );
      train.passengers
        .slice(car * train.seats, (car + 1) * train.seats)
        .forEach((p, i) =>
          shape(p, -6 + (i % 3) * 6, -2 + Math.floor(i / 3) * 5, 1.65, body, {
            fill: "#fff",
            stroke: "none",
          }),
        );
    }
    svg(
      "circle",
      { cx: 0, cy: 0, r: 15, fill: "transparent", "pointer-events": "all" },
      entry.node,
    );
    if (train.carriages > 11) {
      const label = svg(
        "text",
        { x: 17, y: -12, "font-size": 9, fill: "var(--ink)" },
        entry.node,
      );
      label.textContent = `+${train.carriages - 11}`;
    }
  }
  for (const [id, entry] of trainNodes)
    if (!alive.has(id)) {
      entry.node.remove();
      trainNodes.delete(id);
    }
}
function updateCrowding() {
  const scale = symbolScale(),
    endpointKey = routeSignature + ":" + scale;
  if (endpointKey !== endpointSignature) {
    endpointSignature = endpointKey;
    for (const node of $("routes").querySelectorAll(
      ".endpoint[data-station]",
    )) {
      const station = game.stations[Number(node.dataset.station)];
      if (station)
        node.setAttribute(
          "transform",
          `translate(${station.x} ${station.y}) scale(${scale}) translate(${-station.x} ${-station.y})`,
        );
    }
  }
  for (const station of game.stations) {
    const entry = stationNodes.get(station.id);
    if (!entry) continue;
    if (entry.scale !== scale) {
      entry.scale = scale;
      entry.node.setAttribute(
        "transform",
        `translate(${station.x} ${station.y}) scale(${scale}) translate(${-station.x} ${-station.y})`,
      );
    }
    if (entry.crowded === station.crowded) continue;
    entry.crowded = station.crowded;
    const circumference = 2 * Math.PI * (station.interchange ? 24 : 21);
    entry.track.style.visibility = entry.ring.style.visibility =
      station.crowded > 0 ? "visible" : "hidden";
    entry.ring.setAttribute(
      "stroke-dasharray",
      `${(circumference * station.crowded) / RULES.crowdSeconds} ${circumference}`,
    );
  }
}
function render() {
  const map = getMap(game.mapId);
  renderRoutes();
  renderStations();
  drawTrains();
  $("score").textContent = String(game.score).padStart(3, "0");
  $("best").textContent =
    game.mode === "creative"
      ? "자산 무제한 · 자유 편집"
      : `최고 기록 ${profile.best[`${game.mapId}:${game.mode}${game.customLayout ? ":custom" : ""}`] ?? 0}`;
  const day = Math.floor(game.elapsed / RULES.day) % 7;
  $("day").textContent = [
    "월요일",
    "화요일",
    "수요일",
    "목요일",
    "금요일",
    "토요일",
    "일요일",
  ][day];
  $("week").textContent =
    `WEEK ${String(Math.floor(game.elapsed / RULES.week) + 1).padStart(2, "0")}`;
  const minutes = Math.floor(((game.elapsed % RULES.day) / RULES.day) * 1440);
  $("clock").textContent = paused ? "일시 정지" : `${speed}×`;
  $("weekend-label").textContent = day >= 5 ? " · 주말 수요" : "";
  $("network-count").textContent = `${game.stations.length} STATIONS`;
  $("efficiency").textContent =
    game.mode === "endless"
      ? `효율 ${game.efficiency} / 보상 ${game.upgradeCount}/14`
      : "";
  document.body.classList.toggle("planning", Boolean(game.planning));
  document.body.classList.toggle(
    "editing-stations",
    ["place", "delete", "move-station"].includes(tool),
  );
  $("workspace-title").textContent = game.planning
    ? "나의 도시 설계"
    : "도시의 하루";
  $("design-banner").hidden = !game.planning;
  $("move-station-tool").hidden = !game.planning;
  $("plan-connect").hidden = !game.planning;
  $("plan-erase").hidden = !game.planning;
  const counts = BASIC.map(
    (type) => game.stations.filter((s) => s.shape === type).length,
  );
  $("design-progress").textContent =
    `○ ${counts[0]}  ·  △ ${counts[1]}  ·  □ ${counts[2]}  /  ${game.stations.length}개 역 · ${game.lines.filter((l) => l.stations.length > 1).length}개 노선`;
  $("launch-design").disabled = !counts.every((n) => n > 0);
  $("creative-tools").hidden = !canDesign(game);
  $("station-editor-toggle").hidden =
    !canDesign(game) || Boolean(game.planning);
  $("map-details").textContent =
    `최대 ${map.maxLines}개 노선 · 역 정원 ${map.stationCapacity}명`;
  const lineKey = JSON.stringify([
    game.mapId,
    game.unlocked,
    selected,
    game.lines.map((l) => l.stations.length),
    colors(),
  ]);
  if (lineSignature !== lineKey) {
    lineSignature = lineKey;
    $("lines").replaceChildren();
    for (let i = 0; i < map.maxLines; i++) {
      const b = document.createElement("button");
      b.className = `line-button${i === selected ? " selected" : ""}${i >= game.unlocked ? " locked" : ""}`;
      b.style.setProperty("--line", colors()[i]);
      b.textContent = i < game.unlocked ? String(i + 1) : "·";
      b.title =
        i < game.unlocked
          ? `${i + 1}호선 · ${game.lines[i].stations.length}개 역`
          : "주간 보상으로 해금";
      b.setAttribute(
        "aria-label",
        `${i + 1}호선${i >= game.unlocked ? " 잠김" : ""}`,
      );
      b.setAttribute("aria-pressed", String(i === selected));
      b.onclick = () => chooseLine(i);
      $("lines").append(b);
    }
  }
  const count = (key) => (game.mode === "creative" ? "∞" : game.stock[key]);
  $("stock-trains").textContent = count("locomotives");
  $("stock-carriages").textContent = count("carriages");
  $("stock-interchanges").textContent = count("interchanges");
  $("stock-fast").textContent = count("shinkansen");
  $("crossing-title").replaceChildren(
    document.createTextNode(`${map.crossing === "bridge" ? "다리" : "터널"} `),
  );
  const tunnelCount = document.createElement("b");
  tunnelCount.id = "stock-tunnels";
  tunnelCount.textContent =
    game.mode === "creative" ? "∞" : game.stock.tunnels - tunnelsUsed(game);
  $("crossing-title").append(tunnelCount);
  const small = document.createElement("small");
  small.textContent = "남은 수량 · 횡단 시 자동 사용";
  $("crossing-title").append(small);
  $("tool-interchange").hidden = map.noInterchange;
  $("tool-fast").hidden = !["tokyo", "osaka"].includes(map.id);
  $("clear").disabled = game.mode === "extreme" && !game.planning;
  $("open-loop").hidden = !game.lines[selected].loop;
  $("open-loop").disabled = game.mode === "extreme" && !game.planning;

  const violated =
    game.challengeMode && !challengeValid(game) && game.mode === "normal";
  $("challenge-banner").hidden = !violated;
  $("challenge-banner").textContent =
    `도전 조건 위반으로 일시 정지 · ${CHALLENGES[map.challenge]}. 노선을 수정하면 계속됩니다.`;
  $("network-status").textContent = game.planning
    ? "설계 중"
    : paused
      ? "일시 정지"
      : violated
        ? "CHALLENGE PAUSED"
        : "운행 중";
  $("footer-message").textContent = game.planning
    ? "설계 중 · 역과 노선을 완성한 뒤 운행을 시작하세요."
    : game.mode === "extreme"
      ? "한 번 그은 노선은 연장만 가능합니다."
      : game.trains.some((t) => t.pendingMove)
        ? "열차 재배치 대기 중 · 다음 역에서 승객을 내립니다."
        : game.lines.every((l) => l.stations.length < 2)
          ? "두 역을 연결하면 남은 열차가 자동 배치됩니다."
          : `${game.trains.length}대 운행 중 · 열차를 눌러 이동·객차를 관리하세요.`;
  updateTools();
  renderCoach();
}
function selectStation(id) {
  if (game.gameOver) return;
  if (tool === "train" || tool === "fast") {
    notify(
      addTrain(game, selected, id, tool === "fast" ? "shinkansen" : "normal"),
    );
    return;
  }
  if (tool === "carriage") {
    const t = game.trains.find(
      (t) => t.from === id && (t.to === null || t.progress === 0),
    );
    if (t) notify(addCarriage(game, t.id));
    else toast("운행 중인 열차를 눌러 객차를 연결하세요.");
    return;
  }
  if (tool === "interchange") {
    notify(upgradeStation(game, id));
    return;
  }
  if (tool === "erase") {
    notify(removeStation(game, selected, id));
    return;
  }
  if (tool === "place") {
    notify(editStation(game, id, $("station-shape").value));
    return;
  }
  if (tool === "delete") {
    notify(deleteStation(game, id));
    return;
  }
  if (tool === "move-train") {
    const ok = notify(moveTrain(game, moveId, selected, id));
    if (ok) {
      tool = "connect";
      moveId = null;
      updateTools();
    }
    return;
  }
  if (tool !== "connect") return;
  const line = game.lines[selected];
  if (line.stations[0] === id) endpoint = "front";
  else if (line.stations.at(-1) === id) endpoint = "back";
}
function mapPoint(event) {
  const p = $("map").createSVGPoint();
  p.x = event.clientX;
  p.y = event.clientY;
  return p.matrixTransform($("map").getScreenCTM().inverse());
}
function nearestStation(p) {
  return (
    game.stations
      .map((s) => ({ id: s.id, d: Math.hypot(s.x - p.x, s.y - p.y) }))
      .filter((s) => s.d < 26 * symbolScale())
      .sort((a, b) => a.d - b.d)[0]?.id ?? null
  );
}
$("map").addEventListener(
  "pointerdown",
  (event) => {
    if (event.pointerType !== "touch") return;
    touchPoints.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (touchPoints.size < 2) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    pendingPointerMove = null;
    cameraTween = null;
    gesture = { pinch: true };
    $("drag-preview").replaceChildren();
    manualView = true;
    const [a, b] = [...touchPoints.values()];
    pinch = {
      distance: Math.hypot(a.x - b.x, a.y - b.y),
      view: { ...view },
      anchor: mapPoint({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 }),
    };
    pinchSuppressed = true;
  },
  { capture: true, passive: false },
);
window.addEventListener(
  "pointermove",
  (event) => {
    if (!touchPoints.has(event.pointerId)) return;
    touchPoints.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (!pinch && !pinchSuppressed) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!pinch || touchPoints.size < 2) return;
    const [a, b] = [...touchPoints.values()],
      distance = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
    const w = Math.min(
      Math.max(1700, pinch.view.w * 3),
      Math.max(250, (pinch.view.w * pinch.distance) / distance),
    );
    view = { ...pinch.view, w, h: (pinch.view.h * w) / pinch.view.w };
    applyView();
    const under = mapPoint({
      clientX: (a.x + b.x) / 2,
      clientY: (a.y + b.y) / 2,
    });
    view.x += pinch.anchor.x - under.x;
    view.y += pinch.anchor.y - under.y;
    applyView();
    viewGestureDirty = true;
  },
  { capture: true, passive: false },
);
function finishTouch(event) {
  if (!touchPoints.has(event.pointerId)) return;
  touchPoints.delete(event.pointerId);
  if (!pinch && !pinchSuppressed) return;
  event.stopImmediatePropagation();
  if (touchPoints.size < 2) {
    pinch = null;
    gesture = null;
    pendingPointerMove = null;
  }
  if (!touchPoints.size) {
    pinchSuppressed = false;
    render();
  }
}
window.addEventListener("pointerup", finishTouch, true);
window.addEventListener("pointercancel", finishTouch, true);
$("map").addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  cameraTween = null;
  const station = event.target.closest("[data-station]"),
    train = event.target.closest("[data-train]"),
    edge = event.target.closest("[data-edge]");
  if (train) {
    event.preventDefault();
    gesture = {
      train: Number(train.dataset.train),
      point: mapPoint(event),
      clientX: event.clientX,
      clientY: event.clientY,
    };
    return;
  }
  const p = mapPoint(event);
  if (station) {
    event.preventDefault();
    if (station.dataset.handleLine !== undefined) {
      selected = Number(station.dataset.handleLine);
      tool = "connect";
      pendingInsert = null;
    }
    const origin = Number(station.dataset.station);
    if (tool === "connect" && !station.dataset.end) {
      const line = game.lines[selected],
        index = line.stations.indexOf(origin);
      if (
        index >= 0 &&
        (line.loop || (index > 0 && index < line.stations.length - 1))
      ) {
        if (game.mode === "extreme" && !game.planning) {
          toast("익스트림에서는 중간 노선을 수정할 수 없습니다.");
          return;
        }
        gesture = {
          editStation: origin,
          line: selected,
          point: p,
          clientX: event.clientX,
          clientY: event.clientY,
        };
        return;
      }
    }
    if (tool === "connect" && !station.dataset.end) {
      const line = game.lines[selected];
      if (
        line.stations.length &&
        (line.loop ||
          ![line.stations[0], line.stations.at(-1)].includes(origin))
      ) {
        const available = game.lines.findIndex(
          (l, i) => i < game.unlocked && !l.stations.length,
        );
        if (available >= 0) selected = available;
      }
    }
    gesture = {
      path: [origin],
      lastPoint: p,
      station: origin,
      point: p,
      clientX: event.clientX,
      clientY: event.clientY,
      end: station.dataset.end,
    };
    return;
  }
  if (edge && tool === "connect") {
    const line = Number(edge.dataset.line);
    if (line < game.unlocked) {
      selected = line;
      if (game.mode === "extreme" && !game.planning) {
        toast("익스트림에서는 끝부분의 연장만 가능합니다.");
        return;
      }
      const route = game.lines[line];
      const internal = (
        route.loop ? route.stations : route.stations.slice(1, -1)
      )
        .map((id) => ({
          id,
          d: Math.hypot(game.stations[id].x - p.x, game.stations[id].y - p.y),
        }))
        .filter((hit) => hit.d <= 36)
        .sort((a, b) => a.d - b.d)[0];
      if (internal) {
        gesture = {
          editStation: internal.id,
          line,
          point: p,
          clientX: event.clientX,
          clientY: event.clientY,
        };
        return;
      }
      const edgeIndex = Number(edge.dataset.edge);
      pendingInsert = null;
      gesture = {
        edge: edgeIndex,
        line,
        point: p,
        clientX: event.clientX,
        clientY: event.clientY,
      };
      updateTools();
    }
    return;
  }
  if (tool === "place") {
    notify(
      placeStation(
        game,
        $("station-shape").value,
        Math.round(p.x / 14) * 14,
        Math.round(p.y / 14) * 14,
      ),
    );
    return;
  }
  gesture = {
    pan: true,
    point: p,
    view: { ...view },
    clientX: event.clientX,
    clientY: event.clientY,
  };
});
function updateDragPreview(event) {
  if (!gesture) return;
  const p = mapPoint(event);
  if (gesture.editStation !== undefined) {
    const target = nearestStation(p),
      line = game.lines[gesture.line],
      ids = [...line.stations],
      index = ids.indexOf(gesture.editStation);
    if (target === null) ids.splice(index, 1);
    else {
      const other = ids.indexOf(target);
      ids[index] = target;
      if (other >= 0 && other !== index) ids[other] = gesture.editStation;
    }
    const stops = ids.map((id) => game.stations[id]);
    if (line.loop && stops.length >= 3) stops.push(stops[0]);
    const points = [];
    for (let i = 1; i < stops.length; i++)
      points.push(...edgePoints(stops[i - 1], stops[i]));
    setDragPath(points, {
      fill: "none",
      stroke: colors()[selected],
      "stroke-width": 7,
      opacity: 0.7,
      "stroke-linejoin": "round",
    });
    let text = $("drag-preview").querySelector("text");
    if (!text)
      text = svg(
        "text",
        { x: p.x + 18, y: p.y - 18, "font-size": 11, fill: "var(--ink)" },
        $("drag-preview"),
      );
    text.setAttribute("x", p.x + 18);
    text.setAttribute("y", p.y - 18);
    text.textContent =
      target === null
        ? "노선에서 제외"
        : target === gesture.editStation
          ? "편집 취소"
          : "이 역으로 연결 변경";
    return;
  }
  if (gesture.edge !== undefined) {
    const edge = lineEdges(game.lines[gesture.line])[gesture.edge];
    if (!edge) return;
    const id = nearestStation(p),
      middle = id === null ? { ...p, id: 9999 } : game.stations[id];
    const a = game.stations[edge[0]], b = game.stations[edge[1]];
    const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const limit = Math.min(100, Math.hypot(b.x - a.x, b.y - a.y) * .4);
    const ratio = Math.min(1, limit / (Math.hypot(p.x - midpoint.x, p.y - midpoint.y) || 1));
    const points = id === null ? [a, { x: midpoint.x + (p.x - midpoint.x) * ratio,
      y: midpoint.y + (p.y - midpoint.y) * ratio }, b] : [
      ...edgePoints(a, middle), ...edgePoints(middle, b),
    ];
    setDragPath(points, {
      fill: "none",
      stroke: colors()[gesture.line],
      "stroke-width": 6,
      "stroke-linejoin": "round",
      opacity: 0.7,
    });
    return;
  }
  if (gesture.train !== undefined || gesture.resource) {
    $("drag-preview").replaceChildren();
    svg(
      "circle",
      {
        cx: p.x,
        cy: p.y,
        r: 14,
        fill: "var(--station)",
        stroke: colors()[selected],
        "stroke-width": 3,
        opacity: 0.8,
      },
      $("drag-preview"),
    );
    return;
  }
  if (gesture.pan) {
    if (
      Math.hypot(
        event.clientX - gesture.clientX,
        event.clientY - gesture.clientY,
      ) > 3
    ) {
      manualView = true;
      view.x += gesture.point.x - p.x;
      view.y += gesture.point.y - p.y;
      applyView();
    }
    return;
  }
  if (tool === "connect" && gesture.station !== undefined) {
    const stops = gesture.path.map((id) => game.stations[id]);
    const target = nearestStation(p);
    const finish = target !== null ? game.stations[target] : { ...p, id: 9999 };
    const points = [];
    for (let i = 1; i < stops.length; i++)
      points.push(...edgePoints(stops[i - 1], stops[i]));
    points.push(...edgePoints(stops.at(-1), finish));
    setDragPath(points, {
      fill: "none",
      stroke: colors()[selected],
      "stroke-width": 6,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      opacity: 0.65,
    });
  } else if (tool === "move-station") {
    $("drag-preview").replaceChildren();
    shape(
      game.stations[gesture.station].shape,
      p.x,
      p.y,
      10,
      $("drag-preview"),
      { fill: "var(--station)", stroke: "var(--ink)", "stroke-width": 2 },
    );
  }
}

window.addEventListener("pointermove", (event) => {
  if (!gesture) return;
  if (tool === "connect" && gesture.station !== undefined && gesture.path)
    collectDragStations(gesture, mapPoint(event));
  pendingPointerMove = event;
});
function flushDragPreview() {
  if (pendingPointerMove) {
    const event = pendingPointerMove;
    pendingPointerMove = null;
    updateDragPreview(event);
  }
}
window.addEventListener("pointerup", (event) => {
  flushDragPreview();
  if (!gesture) return;
  const old = gesture;
  gesture = null;
  $("drag-preview").replaceChildren();
  if (old.pan) return;
  const released = mapPoint(event),
    distance = Math.hypot(
      event.clientX - old.clientX,
      event.clientY - old.clientY,
    );
  if (old.editStation !== undefined) {
    if (distance < 5) return;
    const rect = $("map").getBoundingClientRect();
    if (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    )
      return;
    const target = nearestStation(released);
    notify(
      target === null
        ? removeStation(game, old.line, old.editStation)
        : replaceStation(game, old.line, old.editStation, target),
    );
    return;
  }
  if (old.resource) {
    if (distance < 5) {
      setTool(old.resource);
      return;
    }
    const target = nearestStation(released),
      edge = closestRoute(released);
    if (old.resource === "train" || old.resource === "fast") {
      if (edge)
        notify(
          addTrain(
            game,
            edge.line,
            edge.station,
            old.resource === "fast" ? "shinkansen" : "normal",
            edge.position,
          ),
        );
      else toast("노선 위에 열차를 놓으세요.");
    } else if (old.resource === "carriage") {
      const train = closestTrain(released);
      if (train) notify(addCarriage(game, train.id));
      else toast("객차를 열차 위에 놓으세요.");
    } else if (old.resource === "interchange" && target !== null)
      notify(upgradeStation(game, target));
    return;
  }
  if (old.train !== undefined) {
    if (distance < 5) {
      handleTrain(old.train);
      return;
    }
    const route = closestRoute(released);
    if (route)
      notify(
        moveTrain(game, old.train, route.line, route.station, route.position),
      );
    else toast("옮길 노선 위에 열차를 놓으세요. 취소되었습니다.");
    return;
  }
  if (old.edge !== undefined) {
    if (distance > 5) {
      const target = nearestStation(released);
      if (target !== null)
        notify(insertStation(game, old.line, old.edge, target));
      else notify(reshapeTrack(game, old.line, old.edge, released));
      pendingInsert = null;
      updateTools();
    }
    return;
  }
  if (tool === "move-station") {
    const p = mapPoint(event);
    notify(
      moveStation(
        game,
        old.station,
        Math.round(p.x / 14) * 14,
        Math.round(p.y / 14) * 14,
      ),
    );
    return;
  }
  const target = nearestStation(mapPoint(event)),
    moved =
      Math.hypot(event.clientX - old.clientX, event.clientY - old.clientY) > 5;
  if (tool === "connect" && moved) {
    if (target === null || (target === old.station && old.path.length < 3)) {
      render();
      return;
    }
    collectDragStations(old, released);
    if (old.path.at(-1) !== target) old.path.push(target);
    if (notify(drawRoute(game, selected, old.path))) {
      if (!matchMedia("(prefers-reduced-motion: reduce)").matches)
        $("routes").querySelectorAll(`[data-line="${selected}"] > polyline:nth-child(2)`).forEach((node) =>
          node.animate([{ strokeWidth: "6px" }, { strokeWidth: "9px", offset: .35 },
            { strokeWidth: "5px", offset: .7 }, { strokeWidth: "6px" }], { duration: 420 }));
      for (const id of old.path) {
        const node = $("stations").querySelector(`[data-station="${id}"]`);
        if (node && !matchMedia("(prefers-reduced-motion: reduce)").matches)
          for (const child of node.children) {
            const origin = `${game.stations[id].x}px ${game.stations[id].y}px`;
            child.animate([{ scale: "1", transformOrigin: origin },
              { scale: "1.28", transformOrigin: origin, offset: .35 },
              { scale: ".94", transformOrigin: origin, offset: .7 },
              { scale: "1", transformOrigin: origin }],
              { duration: 420, easing: "ease-out" });
          }
      }
    }
  } else if (!moved) {
    if (old.end) endpoint = old.end;
    selectStation(old.station);
  }
});
window.addEventListener("pointercancel", () => {
  pendingPointerMove = null;
  gesture = null;
  $("drag-preview").replaceChildren();
});
$("map").addEventListener("keydown", (event) => {
  if (!["Enter", " "].includes(event.key)) return;
  const station = event.target.closest("[data-station]"),
    train = event.target.closest("[data-train]");
  if (station || train) {
    event.preventDefault();
    event.stopPropagation();
    station
      ? selectStation(Number(station.dataset.station))
      : handleTrain(Number(train.dataset.train));
  }
});
function handleTrain(id) {
  if (tool === "carriage") {
    notify(addCarriage(game, id));
    return;
  }
  if (tool === "move-carriage") {
    const ok = notify(moveCarriage(game, moveId, id));
    if (ok) {
      tool = "connect";
      moveId = null;
      updateTools();
    }
    return;
  }
  selectedTrain = id;
  const t = game.trains.find((t) => t.id === id);
  if (!t) return;
  $("train-title").textContent =
    `${t.line + 1}호선 · ${t.type === "shinkansen" ? "신칸센" : "열차"} ${t.id}`;
  $("train-description").textContent =
    `탑승 ${t.passengers.length}/${trainCapacity(t)}명 · 객차 ${t.carriages}개${t.pendingMove ? " · 이동 대기 중" : ""}`;
  for (const id of [
    "train-move",
    "train-remove",
    "carriage-move",
    "carriage-remove",
  ])
    $(id).disabled = game.mode === "extreme" && !game.planning;
  $("train-reverse").hidden = !game.lines[t.line].loop;
  $("train-reverse").disabled = game.mode === "extreme" && !game.planning;
  $("train-dialog").showModal();
}
function trainAction(action) {
  $("train-dialog").close();
  notify(action());
}
$("train-add-carriage").onclick = () =>
  trainAction(() => addCarriage(game, selectedTrain));
$("train-remove").onclick = () =>
  trainAction(() => moveTrain(game, selectedTrain));
$("carriage-remove").onclick = () =>
  trainAction(() => moveCarriage(game, selectedTrain));
$("train-move").onclick = () => {
  $("train-dialog").close();
  tool = "move-train";
  moveId = selectedTrain;
  updateTools();
};
$("carriage-move").onclick = () => {
  $("train-dialog").close();
  tool = "move-carriage";
  moveId = selectedTrain;
  updateTools();
};
$("train-reverse").onclick = () =>
  trainAction(() => {
    const t = game.trains.find((t) => t.id === selectedTrain);
    if (!t || !game.lines[t.line].loop || game.mode === "extreme")
      return { ok: false };
    // Reversal happens at the next stop, never halfway along a segment.
    t.direction *= -1;
    return { ok: true, message: "다음 역부터 순환 방향이 반전됩니다." };
  });
$("close-train").onclick = () => $("train-dialog").close();

function updateRecords() {
  for (const event of recordProgress(profile, game)) {
    if (event.type === "city")
      toast(`${getMap(event.id).name} 도시가 열렸습니다!`);
    if (event.type === "extreme")
      toast(`${getMap(event.id).name} 익스트림 모드가 열렸습니다!`);
    if (event.type === "medal") toast("1000명 수송 메달 달성");
  }
}
async function selectionMotion(node) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  await node.animate([
    { transform: "scale(1)", opacity: 1 },
    { transform: "scale(.94)", opacity: .8, offset: .25 },
    { transform: "scale(1.035)", opacity: 1, offset: .7 },
    { transform: "scale(1)", opacity: 1 },
  ], { duration: 280, easing: "ease-out" }).finished.catch(() => {});
}
function showUpgrade() {
  const map = getMap(game.mapId);
  $("upgrade-trains").textContent =
    map.id === "osaka"
      ? "기본 보상으로 열차 2대 또는 신칸센 1대를 선택하세요."
      : `${map.trainReward}대의 ${map.id === "melbourne" ? "전차" : "열차"}가 지급되었습니다. 추가 자산 하나를 선택하세요.`;
  $("engine-options").hidden = map.id !== "osaka";
  $("upgrade-options").replaceChildren();
  document.querySelector('input[name="engine"][value="normal"]').checked = true;
  const labels = {
    line: ["◉", "새 노선", "노선 1개 개방"],
    carriage: [
      "▱",
      "객차",
      `${map.id === "mumbai" ? 2 : 1}개 · 한 칸당 ${map.seats}명 추가`,
    ],
    tunnels: [
      "≋",
      map.crossing === "bridge" ? "다리" : "터널",
      `${map.tunnelReward}개 · 강을 건너는 연결`,
    ],
    interchange: ["◎", "교차역", `1개 · 역 정원 ${map.stationCapacity * 2}명`],
    shinkansen: ["➤", "신칸센", "1대 · 최고속도 2.5배"],
  };
  for (const choice of game.pendingUpgrade) {
    const b = document.createElement("button");
    b.className = "upgrade-card";
    const [icon, title, description] = labels[choice];
    b.innerHTML = `<span>${icon}</span><strong>${title}</strong><small>${description}</small>`;
    b.onclick = async () => {
      if (b.disabled) return;
      $("upgrade-options").querySelectorAll("button").forEach((button) => { button.disabled = true; });
      await selectionMotion(b);
      const engine = document.querySelector(
        'input[name="engine"]:checked',
      ).value;
      chooseUpgrade(game, choice, engine);
      $("upgrade-dialog").close();
      save();
      render();
    };
    $("upgrade-options").append(b);
  }
  if (!$("upgrade-dialog").open) $("upgrade-dialog").showModal();
}
function showOver() {
  if (overShown) return;
  overShown = true;
  updateRecords();
  save();
  $("over-description").textContent =
    `${game.stations[game.failedStation]?.name ?? "역"}의 혼잡을 제때 해소하지 못했습니다. ${Math.floor(game.elapsed / RULES.day) + 1}일 동안 도시를 연결했습니다.`;
  $("final-score").textContent = game.score;
  $("over-dialog").showModal();
}
function syncStateDialogs() {
  if (game.pendingUpgrade && !$("upgrade-dialog").open) {
    render();
    showUpgrade();
  } else if (game.gameOver && !overShown) {
    render();
    showOver();
  }
}
function startGame() {
  if (!canStartCity(profile, menuMap, cityMode)) {
    renderCities();
    return;
  }
  const firstPlay = !hasSaved && !profile.tutorialSeen;
  document.querySelectorAll("dialog[open]").forEach((d) => d.close());
  document.body.classList.remove("at-home", "station-panel-open");
  $("home-screen").hidden = true;
  game = createGame(cityMode, Math.random, menuMap);
  tutorialActive = firstPlay;
  game.tutorial = firstPlay;
  game.challengeMode = challengeRun && cityMode === "normal";
  challengeRun = false;
  profile.lastCity = menuMap;
  selected = 0;
  paused = false;
  speed = 1;
  tool = game.planning ? "place" : "connect";
  pendingInsert = null;
  endpoint = "back";
  gesture = null;
  overShown = false;
  manualView = false;
  moveId = null;
  save();
  initializeMap();
  render();
  toast(
    game.planning
      ? "모양을 선택하고 빈 땅을 눌러 첫 역을 놓으세요."
      : `${getMap(menuMap).name} · 두 역을 연결하면 첫 열차가 출발합니다.`,
  );
}
function initializeMap() {
  const map = getMap(game.mapId);
  $("city-en").textContent = map.en;
  $("city-ko").textContent = map.name;
  $("city-name").textContent = map.en;
  $("mode-label").textContent = MODE_NAMES[game.mode];
  $("city-number").textContent =
    `${String(MAPS.indexOf(map) + 1).padStart(2, "0")} / ${map.en}`;
  renderTerrain();
  renderWaterMask();
  if (!manualView) fitMap();
  applySettings();
}
$("station-shape").onchange = () => {
  tool = "place";
  pendingInsert = null;
  updateTools();
};
$("menu").onclick = showHome;
$("home-new").onclick = showCities;
$("home-continue").onclick = () => {
  $("home-screen").hidden = true;
  document.body.classList.remove("at-home");
  tutorialActive = Boolean(game.tutorial && !profile.tutorialSeen);
  initializeMap();
  render();
  syncStateDialogs();
};
$("launch-design").onclick = () => {
  if (notify(launchDesign(game))) {
    tool = "connect";
    paused = false;
    render();
  }
};
function showHome() {
  tutorialActive = false;
  overShown = false;
  save();
  document.querySelectorAll("dialog[open]").forEach((d) => d.close());
  $("home-screen").hidden = false;
  document.body.classList.add("at-home");
  $("home-continue").hidden = !hasSaved;
}

$("retry-game").onclick = () => {
  menuMap = game.mapId;
  cityMode = game.mode;
  startGame();
};
$("over-menu").onclick = () => {
  showHome();
  showCities();
};
for (const id of ["upgrade-dialog", "over-dialog"])
  $(id).addEventListener("cancel", (e) => e.preventDefault());
$("clock-button").onclick = () => {
  if (paused) {
    paused = false;
    speed = 1;
  } else if (speed === 1) speed = 2;
  else paused = true;
  render();
};
$("clear").onclick = () => notify(clearLine(game, selected));
$("open-loop").onclick = () => notify(openLoop(game, selected));
document
  .querySelectorAll("[data-tool]")
  .forEach((b) => (b.onclick = () => setTool(b.dataset.tool)));

$("settings").onclick = () => $("settings-dialog").showModal();
$("close-settings").onclick = () => $("settings-dialog").close();
for (const [id, key] of [
  ["night-mode", "night"],
  ["accessible-colors", "accessible"],
  ["sound-setting", "sound"],
])
  $(id).onchange = (e) => {
    profile.settings[key] = e.target.checked;
    applySettings();
    render();
    save();
  };
$("volume").oninput = (e) => {
  profile.settings.volume = Number(e.target.value);
  save();
};
$("fullscreen").onclick = async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    toast("이 브라우저에서는 전체 화면을 사용할 수 없습니다.");
  }
};
function zoom(factor) {
  const base = cameraTween?.to ?? view;
  const w = Math.max(250, Math.min(1700, base.w * factor)),
    h = (base.h * w) / base.w;
  manualView = true;
  animateCamera({
    x: base.x + (base.w - w) / 2,
    y: base.y + (base.h - h) / 2,
    w,
    h,
  });
}
$("zoom-in").onclick = () => zoom(0.85);
$("zoom-out").onclick = () => zoom(1 / 0.85);
$("zoom-fit").onclick = () => {
  manualView = false;
  fitMap(true);
};
window.addEventListener("keydown", (e) => {
  if (
    document.body.classList.contains("at-home") ||
    document.querySelector("dialog[open]") ||
    ["INPUT", "SELECT", "BUTTON"].includes(document.activeElement?.tagName)
  )
    return;
  if (e.code === "Space") {
    e.preventDefault();
    paused = !paused;
    render();
  }
  if (/^[1-7]$/.test(e.key)) chooseLine(Number(e.key) - 1);
  if (e.key.toLowerCase() === "d") setTool("connect");
  if (e.key === "Escape") {
    tool = "connect";
    pendingInsert = null;
    moveId = null;
    gesture = null;
    $("drag-preview").replaceChildren();
    updateTools();
  }
});
window.addEventListener("resize", () => {
  if (!manualView) fitMap();
  if (!gesture) render();
});
window.addEventListener("beforeunload", save);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) save();
  last = performance.now();
});
function frame(now) {
  const cameraMoved = advanceCamera(now) || viewGestureDirty;
  viewGestureDirty = false;
  let sceneUpdated = false;
  flushDragPreview();
  animateDragPreview(now);
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  if (
    !document.body.classList.contains("at-home") &&
    !paused &&
    !document.hidden &&
    !document.querySelector("dialog[open]")
  ) {
    const score = game.score,
      week = Math.floor(game.elapsed / RULES.week);
    if (!gesture && !(tutorialActive && !game.trains.length))
      tick(game, dt * speed);
    if (game.score > score) {
      tone();
      updateRecords();
      if (tutorialActive) {
        tutorialActive = false;
        game.tutorial = false;
        profile.tutorialSeen = true;
        toast("첫 승객이 도착했습니다. 이제 새 역과 혼잡을 확인해 보세요.");
      }
    }
    if (Math.floor(game.elapsed / RULES.week) !== week) updateRecords();
    renderCoach();
    for (const event of game.events) {
      if (event.type === "station") {
        if (!manualView) fitMap(true);
        toast(
          `${game.stations[event.id]?.name ?? "새 역"} 개통 · 노선을 연결하세요.`,
        );
      }
      if (event.type === "conversion")
        toast(
          `${game.stations[event.id].name}의 모양이 바뀌었습니다. 목적지 수요를 확인하세요.`,
        );
    }
    game.events = [];
    syncStateDialogs();
    visual += dt;
    if (visual > 0.25 && !gesture) {
      render();
      visual = 0;
    } else drawTrains();
    updateCrowding();
    sceneUpdated = true;
    if (now - savedAt > 3000) {
      save();
      savedAt = now;
    }
  }
  if (cameraMoved && !sceneUpdated) {
    drawTrains(now);
    updateCrowding();
  }
  requestAnimationFrame(frame);
}
$("design-banner").after($("creative-tools"));
if (hasSaved) {
  updateRecords();
  save();
}
initializeMap();
render();
applySettings();
$("home-continue").hidden = !hasSaved;
if (game.planning) tool = "place";
updateTools();
$("home-new").disabled = false;
$("load-error").hidden = true;
requestAnimationFrame(frame);

function closestTrain(p) {
  return game.trains
    .map((train) => ({
      train,
      d: Math.hypot(trainPoint(train).x - p.x, trainPoint(train).y - p.y),
    }))
    .filter((x) => x.d < 30)
    .sort((a, b) => a.d - b.d)[0]?.train;
}
function closestRoute(p) {
  const hits = [];
  game.lines.forEach((line, lineId) =>
    lineEdges(line).forEach(([a, b]) => {
      const points = edgePoints(game.stations[a], game.stations[b]);
      let travelled = 0;
      for (let i = 1; i < points.length; i++) {
        const u = points[i - 1],
          v = points[i],
          dx = v.x - u.x,
          dy = v.y - u.y;
        const t = Math.max(
          0,
          Math.min(
            1,
            ((p.x - u.x) * dx + (p.y - u.y) * dy) / (dx * dx + dy * dy || 1),
          ),
        );
        const d = Math.hypot(p.x - u.x - t * dx, p.y - u.y - t * dy);
        if (d < 24)
          hits.push({
            line: lineId,
            position: {
              from: a,
              to: b,
              progress:
                (travelled + t * Math.hypot(dx, dy)) /
                (edgeLength(game.stations[a], game.stations[b]) || 1),
            },
            station:
              Math.hypot(p.x - game.stations[a].x, p.y - game.stations[a].y) <
              Math.hypot(p.x - game.stations[b].x, p.y - game.stations[b].y)
                ? a
                : b,
            d,
          });
        travelled += Math.hypot(dx, dy);
      }
    }),
  );
  return hits.sort((a, b) => a.d - b.d)[0];
}
for (const name of ["train", "fast", "carriage", "interchange"])
  $("tool-" + name).addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    gesture = {
      resource: name,
      clientX: event.clientX,
      clientY: event.clientY,
    };
  });

$("station-editor-toggle").onclick = () =>
  document.body.classList.toggle("station-panel-open");

function trackOffset(lineId, a, b) {
  const shared = game.lines
    .map((line, id) =>
      lineEdges(line).some(
        ([x, y]) => (x === a && y === b) || (x === b && y === a),
      )
        ? id
        : -1,
    )
    .filter((id) => id >= 0);
  if (shared.length < 2) return { x: 0, y: 0 };
  const u = game.stations[Math.min(a, b)],
    v = game.stations[Math.max(a, b)],
    len = Math.hypot(v.x - u.x, v.y - u.y) || 1;
  const shift = (shared.indexOf(lineId) - (shared.length - 1) / 2) * 6;
  return { x: (-(v.y - u.y) / len) * shift, y: ((v.x - u.x) / len) * shift };
}

function renderWaterMask() {
  const defs = $("map").querySelector("defs");
  defs.querySelector("#tunnel-water")?.remove();
  const mask = svg(
    "mask",
    {
      id: "tunnel-water",
      maskUnits: "userSpaceOnUse",
      x: -2000,
      y: -2000,
      width: 6000,
      height: 6000,
    },
    defs,
  );
  svg(
    "rect",
    { x: -2000, y: -2000, width: 6000, height: 6000, fill: "black" },
    mask,
  );
  const map = getMap(game.mapId);
  for (const feature of map.features)
    svg(
      feature.polygon ? "polygon" : "polyline",
      {
        points: feature.points
          .map(([x, y]) => `${x * 11},${y * 5.7}`)
          .join(" "),
        fill: feature.polygon ? "white" : "none",
        stroke: "white",
        "stroke-width": feature.polygon ? 0 : feature.width * 5.7,
        "stroke-linejoin": "round",
        "stroke-linecap": "round",
      },
      mask,
    );
  for (const island of map.islands)
    svg(
      "polygon",
      {
        points: island.map(([x, y]) => `${x * 11},${y * 5.7}`).join(" "),
        fill: "black",
        stroke: "black",
        "stroke-width": 2,
      },
      mask,
    );
}

function collectDragStations(drag, p) {
  const a = drag.lastPoint ?? drag.point,
    dx = p.x - a.x,
    dy = p.y - a.y,
    length = dx * dx + dy * dy;
  const hits = game.stations
    .map((s) => {
      const t = length
        ? Math.max(
            0,
            Math.min(1, ((s.x - a.x) * dx + (s.y - a.y) * dy) / length),
          )
        : 1;
      return {
        id: s.id,
        t,
        d: Math.hypot(s.x - a.x - t * dx, s.y - a.y - t * dy),
      };
    })
    .filter((hit) => hit.d < 18 * symbolScale())
    .sort((x, y) => x.t - y.t);
  for (const hit of hits) {
    if (hit.id === drag.path.at(-1)) continue;
    if (hit.id === drag.path.at(-2)) {
      drag.path.pop();
      continue;
    }
    if (drag.path.includes(hit.id) && hit.id !== drag.path[0]) continue;
    drag.path.push(hit.id);
  }
  drag.lastPoint = p;
}

function showCities() {
  menuMap = cityUnlocked(profile, profile.lastCity)
    ? profile.lastCity
    : cityUnlocked(profile, game.mapId)
      ? game.mapId
      : "london";
  cityMode = "normal";
  challengeRun = false;
  renderCities();
  $("city-dialog").showModal();
}
function renderCities() {
  const cards = $("city-cards");
  cards.replaceChildren();
  for (const map of MAPS) {
    const unlocked = cityUnlocked(profile, map.id),
      button = document.createElement("button");
    button.className = `map-card${map.id === menuMap ? " selected" : ""}${unlocked ? "" : " map-locked"}`;
    button.dataset.city = map.id;
    button.setAttribute("aria-pressed", String(map.id === menuMap));
    button.setAttribute("aria-label", `${map.name}${unlocked ? "" : " 잠김"}`);
    const preview = svg("svg", {
      viewBox: "0 0 1100 570",
      "aria-hidden": true,
    });
    preview.classList.add("map-thumbnail");
    svg("rect", { width: 1100, height: 570, fill: "var(--map)" }, preview);
    const land = svg("g", {}, preview);
    renderTerrain(land, map, true);
    const nodes = new Map();
    (PREVIEWS[map.id] ?? []).forEach((points, i) => {
      svg(
        "polyline",
        {
          points: points.map(([x, y]) => `${x * 11},${y * 5.7}`).join(" "),
          fill: "none",
          stroke: readableLineColor(map.colors[i], profile.settings.night),
          "stroke-width": 14,
        },
        preview,
      );
      for (const point of [points[0], points.at(-1)])
        nodes.set(point.join(","), point);
    });
    let n = 0;
    for (const [x, y] of nodes.values())
      shape(
        n++ % 3 === 0 ? "triangle" : "circle",
        x * 11,
        y * 5.7,
        17,
        preview,
        { fill: "var(--station)", stroke: "var(--ink)", "stroke-width": 6 },
      );
    button.append(preview);
    const title = document.createElement("strong");
    title.textContent = map.name;
    button.append(title);
    const detail = document.createElement("small");
    detail.textContent = unlocked
      ? `${map.maxLines}개 노선 · 최고 ${profile.best[`${map.id}:normal`] ?? 0}명`
      : "잠김";
    button.append(detail);
    button.onclick = async () => {
      if (cards.dataset.selecting === "true") return;
      cards.dataset.selecting = "true";
      await selectionMotion(button);
      cards.dataset.selecting = "false";
      menuMap = map.id;
      if (!canStartCity(profile, menuMap, cityMode)) cityMode = "normal";
      renderCities();
    };
    cards.append(button);
  }
  const map = getMap(menuMap),
    unlocked = cityUnlocked(profile, map.id);
  $("selected-city-name").textContent = `${map.name} · ${map.en}`;
  $("city-assets").textContent =
    `시작 노선 ${map.startLines}개 · 열차 ${map.startLines}대 · ${map.crossing === "bridge" ? "다리" : "터널"} ${map.tunnels}개 · 역 정원 ${map.stationCapacity}명`;
  $("city-unlock-condition").textContent = unlocked
    ? `${map.goal}명 수송${map.next.length ? ` → ${map.next.map((id) => getMap(id).name).join(", ")} 해금` : ""}`
    : `해금 조건: ${cityRequirement(map.id)}`;
  $("city-challenge").textContent =
    `익스트림: ${CHALLENGES[map.challenge]}${map.challengeScore ? ` · ${map.challengeScore}명 수송` : ""}${profile.extreme.includes(map.id) ? " · 달성" : ""}`;
  $("city-best").textContent =
    cityMode === "creative"
      ? "크리에이티브는 기록과 해금에 반영하지 않습니다."
      : `이 모드 최고 기록: ${profile.best[`${map.id}:${cityMode}`] ?? 0}명`;
  const descriptions = {
    normal: "혼잡을 해소하며 승객을 수송합니다. 일요일마다 자산이 지급됩니다.",
    extreme:
      "노선 끝의 연장만 허용합니다. 노선 단축·폐쇄와 열차·객차 재배치는 불가능합니다.",
    endless:
      "혼잡으로 게임이 끝나지 않습니다. 하루 수송 효율에 따라 최대 14번 보상받습니다.",
    creative:
      "자산은 무제한이며, 역을 직접 편집합니다. 역은 자동으로 생성되지 않습니다.",
  };
  const extremeLocked =
    cityMode === "extreme" && !profile.extreme.includes(map.id);
  $("city-mode-description").textContent = extremeLocked
    ? `익스트림은 잠겨 있습니다. 일반 모드에서 ${CHALLENGES[map.challenge]}${map.challengeScore ? ` 조건으로 ${map.challengeScore}명 수송` : ""}을 달성하면 열립니다.`
    : descriptions[cityMode];
  $("challenge-start").hidden = !unlocked || !extremeLocked;
  const terrain = $("city-map-preview");
  terrain.replaceChildren();
  svg(
    "rect",
    { x: -60, y: -35, width: 1220, height: 640, fill: "var(--map)" },
    terrain,
  );
  const land = svg("g", {}, terrain);
  renderTerrain(land, map, true);

  document.querySelectorAll("[data-city-mode]").forEach((button) => {
    const mode = button.dataset.cityMode;
    button.classList.toggle("selected", mode === cityMode);
    button.disabled = !unlocked;
    button.setAttribute(
      "aria-label",
      `${MODE_NAMES[mode]}${mode === "extreme" && !profile.extreme.includes(map.id) ? " 잠김" : ""}`,
    );
    button.title =
      mode === "extreme" && !profile.extreme.includes(map.id)
        ? "이 도시의 익스트림 챌린지를 먼저 달성하세요."
        : "";
  });
  $("city-start").disabled = !canStartCity(profile, menuMap, cityMode);
}
$("city-start").onclick = () => {
  challengeRun = false;
  startGame();
};
$("challenge-start").onclick = () => {
  cityMode = "normal";
  challengeRun = true;
  startGame();
};
$("city-close").onclick = () => $("city-dialog").close();
document.querySelectorAll("[data-city-mode]").forEach(
  (button) =>
    (button.onclick = () => {
      cityMode = button.dataset.cityMode;
      renderCities();
    }),
);
for (const [id, mode] of [
  ["continue-endless", "endless"],
  ["continue-creative", "creative"],
])
  $(id).onclick = () => {
    continueAs(game, mode);
    $("over-dialog").close();
    overShown = false;
    tutorialActive = false;
    initializeMap();
    render();
    save();
  };

const GUIDE = [
  [
    "승객의 모양이 목적지입니다.",
    "큰 도형은 역이고, 옆의 작은 도형은 기다리는 승객입니다. 작은 세모 승객은 세모 역으로, 작은 네모 승객은 네모 역으로 이동합니다. 도착한 승객 한 명이 1점입니다.",
  ],
  [
    "역에서 역으로 끌어 연결하세요.",
    "마우스나 손가락을 누른 채 역 사이를 드래그합니다. 끝의 T 손잡이로 노선을 연장·단축하고, 선로를 새 역으로 끌면 중간에 삽입합니다. 양 끝을 연결하면 순환선이 됩니다. 중간역 바로 옆의 선로를 잡아 다른 역으로 옮기면 연결을 변경하고, 빈 곳으로 빼면 그 역을 건너뜁니다. 선로 가운데를 잡아 빈 공간에 놓으면 굽힘을 조절합니다. 짧고 곧은 선로일수록 빠릅니다.",
  ],
  [
    "열차와 자산을 배치하세요.",
    "노선을 만들면 남은 열차가 자동 투입됩니다. 열차는 기본 6인승이고, 카이로·뭄바이는 4인승입니다. 객차를 열차에 붙여 정원을 늘리세요. 강을 건너는 역 사이 구간마다 터널·다리 1개가 필요합니다.",
  ],
  [
    "혼잡을 줄이고 다음 주를 준비하세요.",
    "역 정원은 기본 6명, 서울은 5명, 파리·뭄바이는 4명입니다. 한도를 넘으면 원형 혼잡 타이머가 차고, 다 차면 게임이 끝납니다. 승객이 줄면 타이머도 서서히 줄어듭니다. 하루는 30초이며 일요일에는 열차와 두 추가 자산 중 하나를 받습니다.",
  ],
  [
    "도시와 새로운 모드를 해금하세요.",
    "런던·파리·뉴욕은 처음부터 플레이할 수 있습니다. 일반 모드에서 도시의 수송 목표를 달성하면 다음 도시가 열리고, 별도 챌린지를 달성하면 익스트림이 열립니다. 무한은 혼잡 패배가 없고, 크리에이티브는 자산 무제한·수동 지도 편집 모드입니다.",
  ],
];
let guidePage = 0;
function showGuide() {
  guidePage = 0;
  renderGuide();
  $("guide-dialog").showModal();
}
function renderGuide() {
  $("guide-page").textContent = `${guidePage + 1} / ${GUIDE.length}`;
  $("guide-title").textContent = GUIDE[guidePage][0];
  $("guide-text").textContent = GUIDE[guidePage][1];
  $("guide-prev").disabled = guidePage === 0;
  $("guide-next").textContent =
    guidePage === GUIDE.length - 1 ? "닫기" : "다음";
  const picture = $("guide-picture");
  picture.replaceChildren();
  svg(
    "path",
    {
      d: "M65 88 H190 L250 40 H375",
      fill: "none",
      stroke: "#dc6655",
      "stroke-width": 6,
      "stroke-linecap": "round",
    },
    picture,
  );
  shape("circle", 65, 88, 15, picture, {
    fill: "var(--panel)",
    stroke: "var(--ink)",
    "stroke-width": 3,
  });
  shape("triangle", 250, 40, 15, picture, {
    fill: "var(--panel)",
    stroke: "var(--ink)",
    "stroke-width": 3,
  });
  shape("square", 375, 40, 15, picture, {
    fill: "var(--panel)",
    stroke: "var(--ink)",
    "stroke-width": 3,
  });
  if (guidePage === 0) {
    shape("triangle", 96, 65, 5, picture, { fill: "var(--ink)" });
    shape("square", 112, 65, 5, picture, { fill: "var(--ink)" });
  }
  if (guidePage === 1) {
    const text = svg(
      "text",
      { x: 150, y: 118, fill: "var(--muted)", "font-size": 13 },
      picture,
    );
    text.textContent = "누른 채 드래그 →";
  }
  if (guidePage >= 2) {
    svg(
      "rect",
      {
        x: 145,
        y: 81,
        width: 28,
        height: 14,
        rx: 3,
        fill: "#dc6655",
        stroke: "var(--panel)",
        "stroke-width": 2,
      },
      picture,
    );
  }
  if (guidePage === 3)
    svg(
      "circle",
      {
        cx: 65,
        cy: 88,
        r: 25,
        fill: "none",
        stroke: "#dc6655",
        "stroke-width": 5,
        "stroke-dasharray": "105 60",
        transform: "rotate(-90 65 88)",
      },
      picture,
    );
}
$("home-guide").onclick = showGuide;
$("settings-guide").onclick = showGuide;
$("guide-close").onclick = () => $("guide-dialog").close();
$("guide-prev").onclick = () => {
  guidePage = Math.max(0, guidePage - 1);
  renderGuide();
};
$("guide-next").onclick = () => {
  if (guidePage === GUIDE.length - 1) $("guide-dialog").close();
  else {
    guidePage++;
    renderGuide();
  }
};
function renderCoach() {
  $("coach").hidden =
    !tutorialActive ||
    game.gameOver ||
    document.body.classList.contains("at-home");
  if (!tutorialActive) return;
  const text = !game.trains.length
    ? "역을 누른 채 다른 역까지 끌어 첫 노선을 만드세요. 연결하기 전에는 시간이 흐르지 않습니다."
    : game.score === 0
      ? "열차가 승객을 태워 같은 모양의 역으로 데려갑니다. 환승할 수 있도록 노선을 연결해보세요."
      : "첫 승객이 도착했습니다. 시계를 눌러 일시 정지·속도를 조절하고, 새 역과 혼잡을 확인하세요.";
  if ($("coach-text").textContent !== text) $("coach-text").textContent = text;
}
$("coach-close").onclick = () => {
  tutorialActive = false;
  game.tutorial = false;
  profile.tutorialSeen = true;
  $("coach").hidden = true;
  save();
};

function animateCamera(target) {
  if (reducedMotion()) {
    cameraTween = null;
    view = target;
    applyView();
    render();
    return;
  }
  cameraTween = {
    from: { ...view },
    to: target,
    start: performance.now(),
    duration: 320,
  };
}
function advanceCamera(now) {
  if (!cameraTween) return false;
  const progress = (now - cameraTween.start) / cameraTween.duration;
  view = cameraAt(cameraTween.from, cameraTween.to, progress);
  applyView();
  if (progress >= 1) {
    cameraTween = null;
    render();
  }
  return true;
}

function setDragPath(points, attributes) {
  if (!previewMotion?.node.isConnected) {
    $("drag-preview").replaceChildren();
    previewMotion = {
      node: svg("polyline", attributes, $("drag-preview")),
      points: samplePath([points[0], points[0]]),
      last: performance.now(),
    };
  }
  for (const [name, value] of Object.entries(attributes))
    previewMotion.node.setAttribute(name, value);
  previewMotion.target = samplePath(points);
}
function animateDragPreview(now) {
  if (!previewMotion?.node.isConnected) {
    previewMotion = null;
    return;
  }
  const motion = previewMotion;
  motion.points = easePath(
    motion.points,
    motion.target,
    Math.min(0.1, Math.max(0, (now - motion.last) / 1000)),
    reducedMotion(),
  );
  motion.last = now;
  motion.node.setAttribute(
    "points",
    motion.points.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" "),
  );
}
