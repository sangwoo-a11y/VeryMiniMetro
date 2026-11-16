import { MAPS, getMap, INITIAL_UNLOCKS, CHALLENGES } from "./maps.js?v=5";
import {
  BASIC,
  SPECIAL,
  RULES,
  createGame,
  tick,
  drawRoute,
  insertStation,
  removeStation,
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
} from "./simulation.js?v=5";

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
  settings: { night: false, accessible: false, sound: false, volume: 30 },
};
let game,
  selected = 0,
  paused = false,
  speed = 1,
  tool = "connect",
  pendingInsert = null,
  endpoint = "back";
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
    game.challengeMode = false;
    game.events = [];
    hasSaved = true;
    menuMap = game.mapId;
  }
} catch {
  /* Missing, old or malformed local data starts a clean game. */
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
function colors() {
  return profile.settings.accessible
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
}
function applySettings() {
  document.body.classList.toggle("night", Boolean(profile.settings.night));
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
  connect: "역 사이를 드래그 · 선로를 새 역으로 드래그하면 중간에 삽입",
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
function fitMap() {
  if (
    !game.stations.length ||
    (game.planning && !manualView) ||
    (game.mode === "creative" && window.innerWidth > 700)
  )
    view = { x: 0, y: 0, w: 1100, h: 570 };
  else {
    const xs = game.stations.map((s) => s.x),
      ys = game.stations.map((s) => s.y);
    const minX = Math.min(...xs) - 100,
      maxX = Math.max(...xs) + 100,
      minY = Math.min(...ys) - 90,
      maxY = Math.max(...ys) + 90;
    const w = Math.max(window.innerWidth < 700 ? 420 : 540, maxX - minX),
      h = Math.max(310, maxY - minY);
    view = { x: (maxX + minX - w) / 2, y: (maxY + minY - h) / 2, w, h };
  }
  applyView();
}
function applyView() {
  $("map").setAttribute("viewBox", `${view.x} ${view.y} ${view.w} ${view.h}`);
}
function renderRoutes() {
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
function renderStations() {
  $("stations").replaceChildren();
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
  for (const s of game.stations) {
    const g = svg(
      "g",
      {
        class: "station",
        "data-station": s.id,
        role: "button",
        tabindex: 0,
        "aria-label": `${s.name} ${s.shape}, 대기 ${s.waiting.length}명, 정원 ${capacity(s)}명`,
      },
      $("stations"),
    );
    svg(
      "circle",
      { cx: s.x, cy: s.y, r: 24, fill: "transparent", "pointer-events": "all" },
      g,
    );
    if (s.crowded > 0) {
      const radius = s.interchange ? 24 : 21,
        circumference = 2 * Math.PI * radius;
      svg(
        "circle",
        {
          cx: s.x,
          cy: s.y,
          r: radius,
          fill: "none",
          stroke: "var(--crowd-track)",
          "stroke-width": 5,
        },
        g,
      );
      svg(
        "circle",
        {
          cx: s.x,
          cy: s.y,
          r: radius,
          fill: "none",
          stroke: "#db6354",
          "stroke-width": 5,
          "stroke-dasharray": `${(circumference * s.crowded) / RULES.crowdSeconds} ${circumference}`,
          transform: `rotate(-90 ${s.x} ${s.y})`,
        },
        g,
      );
    }
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
      { x: s.x, y: s.y + 33, "text-anchor": "middle", class: "station-label" },
      g,
    );
    label.textContent = s.name;
    s.waiting
      .slice(0, 24)
      .forEach((p, i) =>
        shape(
          p,
          s.x + 23 + (i % 6) * 8,
          s.y - 12 + Math.floor(i / 6) * 9,
          2.5,
          g,
          { class: "passenger" },
        ),
      );
    if (s.waiting.length > 24) {
      const count = svg(
        "text",
        { x: s.x + 25, y: s.y + 34, "font-size": 8, fill: "#db6354" },
        g,
      );
      count.textContent = `+${s.waiting.length - 24}`;
    }
  }
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
function drawTrains() {
  $("trains").replaceChildren();
  for (const train of game.trains) {
    const point = trainPoint(train),
      g = svg(
        "g",
        {
          "data-train": train.id,
          class: "train",
          role: "button",
          tabindex: 0,
          "aria-label": `열차 ${train.id}, ${train.passengers.length}/${trainCapacity(train)}명, 객차 ${train.carriages}개`,
        },
        $("trains"),
      );
    const angle = (point.angle * Math.PI) / 180;
    // Long creative trains show the first 12 cars and an explicit remaining-car count.
    for (let car = Math.min(train.carriages, 11); car >= 0; car--) {
      const x = point.x - Math.cos(angle) * car * 23,
        y = point.y - Math.sin(angle) * car * 23;
      const body = svg(
        "g",
        { transform: `translate(${x} ${y}) rotate(${point.angle})` },
        g,
      );
      const attrs = {
        fill: colors()[train.line],
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
      {
        cx: point.x,
        cy: point.y,
        r: 15,
        fill: "transparent",
        "pointer-events": "all",
      },
      g,
    );
    if (train.carriages > 11) {
      const text = svg(
        "text",
        {
          x: point.x + 17,
          y: point.y - 12,
          "font-size": 9,
          fill: "var(--ink)",
        },
        g,
      );
      text.textContent = `+${train.carriages - 11}`;
    }
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
    game.stations.find((s) => Math.hypot(s.x - p.x, s.y - p.y) < 26)?.id ?? null
  );
}
$("map").addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
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
window.addEventListener("pointermove", (event) => {
  if (!gesture) return;
  const p = mapPoint(event);
  if (
    gesture.train !== undefined ||
    gesture.edge !== undefined ||
    gesture.resource
  ) {
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
    collectDragStations(gesture, p);
    $("drag-preview").replaceChildren();
    const stops = gesture.path.map((id) => game.stations[id]);
    const target = nearestStation(p);
    const finish = target !== null ? game.stations[target] : { ...p, id: 9999 };
    const points = [];
    for (let i = 1; i < stops.length; i++)
      points.push(...edgePoints(stops[i - 1], stops[i]));
    points.push(...edgePoints(stops.at(-1), finish));
    svg(
      "polyline",
      {
        points: points.map((q) => `${q.x},${q.y}`).join(" "),
        fill: "none",
        stroke: colors()[selected],
        "stroke-width": 6,
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
        opacity: 0.65,
      },
      $("drag-preview"),
    );
    for (const stop of stops)
      svg(
        "circle",
        {
          cx: stop.x,
          cy: stop.y,
          r: 18,
          fill: "none",
          stroke: colors()[selected],
          "stroke-width": 2,
          opacity: 0.5,
        },
        $("drag-preview"),
      );
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
});
window.addEventListener("pointerup", (event) => {
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
    notify(drawRoute(game, selected, old.path));
  } else if (!moved) {
    if (old.end) endpoint = old.end;
    selectStation(old.station);
  }
});
window.addEventListener("pointercancel", () => {
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
  if (game.mode === "creative") return;
  const key = `${game.mapId}:${game.mode}${game.customLayout ? ":custom" : ""}`;
  profile.best[key] = Math.max(profile.best[key] ?? 0, game.score);
  if (game.mode !== "normal" || game.customLayout) return;
  const map = getMap(game.mapId);
  if (game.score >= map.goal)
    for (const id of map.next)
      if (!profile.unlocked.includes(id)) {
        profile.unlocked.push(id);
        toast(`${getMap(id).name} 도시가 열렸습니다!`);
      }
  if (challengeComplete(game) && !profile.extreme.includes(game.mapId)) {
    profile.extreme.push(game.mapId);
    toast(`${map.name} 익스트림 모드 해금!`);
  }
  if (
    INITIAL_UNLOCKS.includes(game.mapId) &&
    game.score >= 1000 &&
    !profile.vintage.includes(game.mapId)
  ) {
    profile.vintage.push(game.mapId);
    toast("1000명 수송 메달 달성!");
  }
}
function showUpgrade() {
  const map = getMap(game.mapId);
  $("upgrade-trains").textContent =
    map.id === "osaka"
      ? "기본 보상으로 열차 2대 또는 신칸센 1대를 선택하세요."
      : `${map.trainReward}대의 ${map.id === "melbourne" ? "전차" : "열차"}가 지급되었습니다. 추가 자산 하나를 선택하세요.`;
  $("engine-options").hidden = map.id !== "osaka";
  $("upgrade-options").replaceChildren();
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
    b.onclick = () => {
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
  document.querySelectorAll("dialog[open]").forEach((d) => d.close());
  document.body.classList.remove("at-home", "station-panel-open");
  $("home-screen").hidden = true;
  game = createGame("normal", Math.random, menuMap);
  game.challengeMode = false;
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
$("home-new").onclick = () => {
  menuMap = getMap($("city-select").value).id;
  startGame();
};
$("home-continue").onclick = () => {
  $("home-screen").hidden = true;
  document.body.classList.remove("at-home");
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
  save();
  document.querySelectorAll("dialog[open]").forEach((d) => d.close());
  $("home-screen").hidden = false;
  document.body.classList.add("at-home");
  $("home-continue").hidden = !hasSaved;
}

$("retry-game").onclick = () => {
  menuMap = game.mapId;
  startGame();
};
$("over-menu").onclick = showHome;
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
  const w = Math.max(250, Math.min(1700, view.w * factor)),
    h = (view.h * w) / view.w;
  view = { x: view.x + (view.w - w) / 2, y: view.y + (view.h - h) / 2, w, h };
  manualView = true;
  applyView();
}
$("zoom-in").onclick = () => zoom(0.85);
$("zoom-out").onclick = () => zoom(1 / 0.85);
$("zoom-fit").onclick = () => {
  manualView = false;
  fitMap();
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
});
window.addEventListener("beforeunload", save);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) save();
  last = performance.now();
});
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  if (
    !document.body.classList.contains("at-home") &&
    !paused &&
    !document.hidden &&
    !document.querySelector("dialog[open]")
  ) {
    const score = game.score;
    if (!gesture) tick(game, dt * speed);
    if (game.score > score) {
      tone();
      updateRecords();
    }
    for (const event of game.events) {
      if (event.type === "station") {
        if (!manualView) fitMap();
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
    if (
      visual > 0.25 &&
      !gesture &&
      !$("map").contains(document.activeElement)
    ) {
      render();
      visual = 0;
    } else drawTrains();
    if (now - savedAt > 3000) {
      save();
      savedAt = now;
    }
  }
  requestAnimationFrame(frame);
}
$("design-banner").after($("creative-tools"));
initializeMap();
render();
applySettings();
$("home-continue").hidden = !hasSaved;
if (game.planning) tool = "place";
updateTools();
const citySelect = $("city-select");
for (const map of MAPS) {
  const option = document.createElement("option");
  option.value = map.id;
  option.textContent = map.name;
  citySelect.append(option);
}
citySelect.value = getMap(profile.lastCity ?? menuMap).id;
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
    .filter((hit) => hit.d < 22)
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
