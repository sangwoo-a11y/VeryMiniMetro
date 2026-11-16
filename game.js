import { MAPS, getMap, INITIAL_UNLOCKS, CHALLENGES, PREVIEWS } from "./maps.js";
import {
  BASIC,
  SPECIAL,
  RULES,
  createGame,
  tick,
  connect,
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
  continueAs,
  lineEdges,
  edgePoints,
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
} from "./simulation.js";

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
const MODE_HELP = {
  normal:
    "노선을 설계하고 자산을 배분하세요. 혼잡을 해소하며 더 많은 승객을 수송하는 기본 모드입니다.",
  extreme:
    "끝역 연장만 가능하며 노선 단축·삭제, 열차·객차 재배치가 금지됩니다. 도시별 챌린지로 해금합니다.",
  endless:
    "혼잡에 따른 게임 오버가 없습니다. 하루 수송 효율을 높여 최대 14번 보상을 받으세요.",
  creative:
    "모든 도시를 미리 체험할 수 있습니다. 자산은 무제한이며 역도 직접 배치·변경·삭제합니다. 기록과 해금은 진행되지 않습니다.",
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
  menuMode = "normal",
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
    menuMode = game.mode;
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
  $("sound").textContent = `SOUND ${profile.settings.sound ? "ON" : "OFF"}`;
  $("sound").setAttribute(
    "aria-pressed",
    String(Boolean(profile.settings.sound)),
  );
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
  tool = tool === next && next !== "connect" ? "connect" : next;
  moveId = null;
  pendingInsert = null;
  updateTools();
  render();
}
const TOOL_HINTS = {
  connect: "역 사이를 드래그 · 선로 구간 클릭 후 새 역을 클릭하면 중간 삽입",
  train: "열차를 배치할 선택 노선의 역을 누르세요.",
  fast: "신칸센을 배치할 선택 노선의 역을 누르세요.",
  carriage: "객차를 연결할 열차를 누르세요.",
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
  if (game.mode === "creative" && window.innerWidth > 700)
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
      const points = edgePoints(game.stations[a], game.stations[b])
        .map((p) => `${p.x},${p.y}`)
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
          "stroke-dasharray": needsTunnel(
            game.stations[a],
            game.stations[b],
            game,
          )
            ? "9 5"
            : "none",
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
            { "data-station": id, "data-end": end, class: "endpoint" },
            $("routes"),
          );
        svg(
          "line",
          {
            x1: s.x - 7,
            y1: s.y - 20,
            x2: s.x + 7,
            y2: s.y - 20,
            stroke: palette[lineId],
            "stroke-width": 3,
          },
          handle,
        );
        svg(
          "line",
          {
            x1: s.x,
            y1: s.y - 24,
            x2: s.x,
            y2: s.y - 15,
            stroke: palette[lineId],
            "stroke-width": 2,
          },
          handle,
        );
        if (selected !== lineId) handle.setAttribute("pointer-events", "none");
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
  return train.to === null
    ? { x: a.x, y: a.y, angle: 0 }
    : pointOnEdge(a, game.stations[train.to], train.progress);
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
      : `최고 기록 ${profile.best[`${game.mapId}:${game.mode}`] ?? 0}`;
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
  $("clock").textContent =
    `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  $("weekend-label").textContent = day >= 5 ? " · 주말 수요" : "";
  $("network-count").textContent = `${game.stations.length} STATIONS`;
  $("efficiency").textContent =
    game.mode === "endless"
      ? `효율 ${game.efficiency} / 보상 ${game.upgradeCount}/14`
      : "";
  $("creative-tools").hidden = game.mode !== "creative";
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
  $("clear").disabled = game.mode === "extreme";
  $("open-loop").hidden = !game.lines[selected].loop;
  $("open-loop").disabled = game.mode === "extreme";
  $("tool-erase").disabled = game.mode === "extreme";
  $("pause").textContent = paused ? "▶" : "Ⅱ";
  $("pause").setAttribute("aria-label", paused ? "계속하기" : "일시 정지");
  $("speed").textContent = `${speed}×`;
  const violated =
    game.challengeMode && !challengeValid(game) && game.mode === "normal";
  $("challenge-banner").hidden = !violated;
  $("challenge-banner").textContent =
    `도전 조건 위반으로 일시 정지 · ${CHALLENGES[map.challenge]}. 노선을 수정하면 계속됩니다.`;
  $("network-status").textContent = paused
    ? "PAUSED"
    : violated
      ? "CHALLENGE PAUSED"
      : "LIVE NETWORK";
  $("footer-message").textContent =
    game.mode === "extreme"
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
  if (pendingInsert !== null) {
    const ok = notify(insertStation(game, selected, pendingInsert, id));
    if (ok) pendingInsert = null;
    updateTools();
    return;
  }
  const line = game.lines[selected];
  if (line.stations.includes(id)) {
    const opposite =
      endpoint === "back" ? line.stations[0] : line.stations.at(-1);
    if (id === opposite && line.stations.length >= 3) {
      notify(connect(game, selected, id, endpoint));
      return;
    }
    endpoint = id === line.stations[0] ? "front" : "back";
    toast("연장할 다음 역을 누르거나, 이 끝역에서 드래그하세요.");
    return;
  }
  notify(connect(game, selected, id, endpoint));
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
    handleTrain(Number(train.dataset.train));
    return;
  }
  const p = mapPoint(event);
  if (station) {
    event.preventDefault();
    gesture = {
      station: Number(station.dataset.station),
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
      pendingInsert = Number(edge.dataset.edge);
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
  if (tool === "connect") {
    $("drag-preview").replaceChildren();
    const s = game.stations[gesture.station];
    svg(
      "polyline",
      {
        points: edgePoints(s, { ...p, id: 9999 })
          .map((p) => `${p.x},${p.y}`)
          .join(" "),
        fill: "none",
        stroke: colors()[selected],
        "stroke-width": 4,
        "stroke-dasharray": "5 5",
        opacity: 0.6,
      },
      $("drag-preview"),
    );
  }
});
window.addEventListener("pointerup", (event) => {
  if (!gesture) return;
  const old = gesture;
  gesture = null;
  $("drag-preview").replaceChildren();
  if (old.pan) return;
  const target = nearestStation(mapPoint(event)),
    moved =
      Math.hypot(event.clientX - old.clientX, event.clientY - old.clientY) > 5;
  if (
    tool === "connect" &&
    moved &&
    target !== null &&
    target !== old.station
  ) {
    const line = game.lines[selected];
    if (!line.stations.length) {
      const first = connect(game, selected, old.station);
      if (!first.ok) {
        notify(first);
        return;
      }
    }
    const current = game.lines[selected];
    if (
      old.station !== current.stations[0] &&
      old.station !== current.stations.at(-1)
    ) {
      toast("노선 끝역에서 드래그하세요. 중간 삽입은 선로 구간을 눌러주세요.");
      return;
    }
    endpoint = old.station === current.stations[0] ? "front" : "back";
    notify(connect(game, selected, target, endpoint));
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
    $(id).disabled = game.mode === "extreme";
  $("train-reverse").hidden = !game.lines[t.line].loop;
  $("train-reverse").disabled = game.mode === "extreme";
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
  const key = `${game.mapId}:${game.mode}`;
  profile.best[key] = Math.max(profile.best[key] ?? 0, game.score);
  if (game.mode !== "normal") return;
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
  if (menuMode !== "creative" && !profile.unlocked.includes(menuMap)) {
    toast("아직 잠긴 도시입니다. 크리에이티브에서 미리 체험할 수 있습니다.");
    return;
  }
  if (menuMode === "extreme" && !profile.extreme.includes(menuMap)) {
    toast("먼저 이 도시의 익스트림 챌린지를 달성하세요.");
    return;
  }
  document.querySelectorAll("dialog[open]").forEach((d) => d.close());
  game = createGame(menuMode, Math.random, menuMap);
  game.challengeMode = $("challenge-mode").checked && menuMode === "normal";
  selected = 0;
  paused = false;
  speed = 1;
  tool = "connect";
  pendingInsert = null;
  endpoint = "back";
  gesture = null;
  overShown = false;
  manualView = false;
  moveId = null;
  save();
  initializeMap();
  render();
  toast(`${getMap(menuMap).name} · 두 역을 연결하면 첫 열차가 출발합니다.`);
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
  if (!manualView) fitMap();
  applySettings();
}
function openMenu() {
  save();
  menuMap = game.mapId;
  menuMode = game.mode;
  renderMenu();
  if (!$("menu-dialog").open) $("menu-dialog").showModal();
}
function renderMenu() {
  $("map-cards").replaceChildren();
  $("mode-description").textContent = MODE_HELP[menuMode];
  document
    .querySelectorAll("[data-mode]")
    .forEach((b) =>
      b.classList.toggle("selected", b.dataset.mode === menuMode),
    );
  for (const map of MAPS) {
    const locked = !profile.unlocked.includes(map.id),
      card = document.createElement("button");
    card.className = `map-card${map.id === menuMap ? " selected" : ""}${locked && menuMode !== "creative" ? " map-locked" : ""}`;
    card.dataset.map = map.id;
    card.setAttribute("aria-pressed", String(map.id === menuMap));
    const preview = svg("svg", {
      viewBox: "0 0 1100 570",
      "aria-hidden": true,
    });
    preview.classList.add("map-thumbnail");
    svg("rect", { width: 1100, height: 570, fill: "var(--map)" }, preview);
    const terrain = svg("g", {}, preview);
    renderTerrain(terrain, map, true);
    const nodes = new Map();
    (PREVIEWS[map.id] ?? []).forEach((points, i) => {
      svg(
        "polyline",
        {
          points: points.map(([x, y]) => `${x * 11},${y * 5.7}`).join(" "),
          fill: "none",
          stroke: map.colors[i],
          "stroke-width": 14,
          "stroke-linejoin": "round",
        },
        preview,
      );
      for (const [index, point] of points.entries())
        if (index === 0 || index === points.length - 1) {
          const key = point.join(",");
          nodes.set(key, {
            point,
            connections: (nodes.get(key)?.connections ?? 0) + 1,
          });
        }
    });
    let index = 0;
    for (const {
      point: [x, y],
      connections,
    } of nodes.values()) {
      shape(
        connections > 1 ? "square" : index++ % 3 === 0 ? "triangle" : "circle",
        x * 11,
        y * 5.7,
        17,
        preview,
        { fill: "var(--station)", stroke: "var(--ink)", "stroke-width": 7 },
      );
    }
    card.append(preview);
    const name = document.createElement("strong");
    name.textContent = `${map.name}${locked && menuMode !== "creative" ? " 🔒" : ""}`;
    card.append(name);
    const info = document.createElement("small");
    info.textContent = `${map.maxLines}개 노선 · 정원 ${map.stationCapacity}명`;
    card.append(info);
    card.onclick = () => {
      menuMap = map.id;
      renderMenu();
    };
    $("map-cards").append(card);
  }
  const map = getMap(menuMap),
    locked = menuMode !== "creative" && !profile.unlocked.includes(map.id),
    extremeLocked = menuMode === "extreme" && !profile.extreme.includes(map.id);
  $("selected-map-title").textContent = `${map.name} / ${map.en}`;
  $("selected-map-details").textContent =
    `시작 노선 ${map.startLines}개 · 열차 ${map.startLines}대 · ${map.crossing === "bridge" ? "다리" : "터널"} ${map.tunnels}개${map.startCarriages ? ` · 객차 ${map.startCarriages}개` : ""} / 노선당 최대 열차 ${map.maxTrains}대 · 한 칸 ${map.seats}인승`;
  $("selected-map-challenge").textContent =
    `◈ ${CHALLENGES[map.challenge]}${map.challengeScore ? ` · ${map.challengeScore}명 수송` : ""}${profile.extreme.includes(map.id) ? " ✓ 달성" : ""}`;
  const prerequisites = MAPS.filter((m) => m.next.includes(map.id))
    .map((m) => `${m.name} ${m.goal}명`)
    .join(" 또는 ");
  $("unlock-reason").textContent = locked
    ? `해금 조건: ${prerequisites || "앞 도시의 수송 목표 달성"}. 크리에이티브에서는 미리 체험할 수 있습니다.`
    : extremeLocked
      ? "일반 모드에서 위 챌린지를 달성하면 익스트림이 열립니다."
      : `◇ ${map.goal}명 수송${map.next.length ? ` → ${map.next.map((id) => getMap(id).name).join(", ")} 해금` : ""}`;
  $("start-game").disabled = locked || extremeLocked;
  $("challenge-label").hidden = menuMode !== "normal";
  $("continue-game").hidden = !hasSaved;
}
$("start-game").onclick = startGame;
$("menu").onclick = $("map-menu").onclick = openMenu;
$("close-menu").onclick = $("continue-game").onclick = () => {
  $("menu-dialog").close();
  syncStateDialogs();
};
$("menu-dialog").addEventListener("cancel", () => {
  requestAnimationFrame(syncStateDialogs);
});
$("save-game").onclick = openMenu;
document.querySelectorAll("[data-mode]").forEach(
  (b) =>
    (b.onclick = () => {
      menuMode = b.dataset.mode;
      renderMenu();
    }),
);
$("retry-game").onclick = () => {
  menuMap = game.mapId;
  menuMode = game.mode;
  startGame();
};
$("over-menu").onclick = () => {
  $("over-dialog").close();
  openMenu();
};
for (const [id, mode] of [
  ["continue-endless", "endless"],
  ["continue-creative", "creative"],
])
  $(id).onclick = () => {
    continueAs(game, mode);
    $("over-dialog").close();
    overShown = false;
    tool = "connect";
    initializeMap();
    render();
    save();
  };
for (const id of ["upgrade-dialog", "over-dialog"])
  $(id).addEventListener("cancel", (e) => e.preventDefault());
$("pause").onclick = () => {
  paused = !paused;
  render();
};
$("speed").onclick = () => {
  speed = speed === 1 ? 2 : 1;
  render();
};
$("clock-button").onclick = () => {
  if (paused) {
    paused = false;
    speed = 1;
  } else if (speed === 1) speed = 2;
  else paused = true;
  render();
};
$("restart").onclick = () => {
  openMenu();
  toast("도시와 모드를 확인하고 ‘노선 그리기’를 누르면 새 게임이 시작됩니다.");
};
$("clear").onclick = () => notify(clearLine(game, selected));
$("open-loop").onclick = () => notify(openLoop(game, selected));
document
  .querySelectorAll("[data-tool]")
  .forEach((b) => (b.onclick = () => setTool(b.dataset.tool)));
$("help").onclick = () => $("help-dialog").showModal();
$("close-help").onclick = $("start-playing").onclick = () =>
  $("help-dialog").close();
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
$("sound").onclick = () => {
  profile.settings.sound = !profile.settings.sound;
  applySettings();
  tone();
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
  if (!paused && !document.hidden && !document.querySelector("dialog[open]")) {
    const score = game.score;
    tick(game, dt * speed);
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
initializeMap();
render();
applySettings();
renderMenu();
$("menu-dialog").showModal();
requestAnimationFrame(frame);
