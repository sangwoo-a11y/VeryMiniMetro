import test from "node:test";
import assert from "node:assert/strict";
import { MAPS, getMap } from "../maps.js";
import {
  RULES,
  BASIC,
  SPECIAL,
  createGame,
  tick,
  connect,
  insertStation,
  removeStation,
  clearLine,
  openLoop,
  addStation,
  addTrain,
  addCarriage,
  moveTrain,
  moveCarriage,
  upgradeStation,
  chooseUpgrade,
  continueAs,
  serviceStation,
  journey,
  demandOptions,
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
  validSavedGame,
  waterAt,
} from "../simulation.js";
function rng(seed = 42) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
function quiet(mode = "normal", mapId = "london") {
  const g = createGame(mode, rng(), mapId);
  g.nextStation = 1e9;
  g.nextUpgrade = 1e9;
  g.stock.tunnels = 100;
  g.stations.forEach((s, i) => {
    s.x = 120 + i * 150;
    s.y = 100;
    s.nextSpawn = 1e9;
  });
  return g;
}
function line(g, id, stations) {
  for (const s of stations) assert.equal(connect(g, id, s).ok, true);
}
function count(g) {
  return (
    g.score +
    g.discarded +
    g.stations.reduce((n, s) => n + s.waiting.length, 0) +
    g.trains.reduce((n, t) => n + t.passengers.length, 0)
  );
}
function run(g, seconds) {
  for (let t = 0; t < seconds; t += 0.1) tick(g, 0.1, rng(5));
}

test("34 maps have distinct terrain and valid initial assets, limits and stations", () => {
  assert.equal(MAPS.length, 34);
  assert.equal(new Set(MAPS.map((m) => m.id)).size, 34);
  for (const map of MAPS) {
    const g = createGame("normal", rng(3), map.id);
    assert.equal(g.unlocked, map.startLines);
    assert.equal(g.stock.tunnels, map.tunnels);
    assert.equal(g.stock.locomotives + g.stock.shinkansen, map.startLines);
    assert.equal(validSavedGame(g), true, map.id);
    assert.ok(
      g.stations.every((s) => !waterAt(s.x, s.y, 0, g)),
      `${map.id} starts on water`,
    );
    assert.equal(g.stations.length, map.id === "shanghai" ? 5 : 3);
  }
  const seoul = createGame();
  assert.equal(seoul.stations[2].shape, "square");
  assert.equal(seoul.stations[2].name, "여의도");
  assert.equal(capacity(seoul.stations[0]), 5);
  assert.equal(getMap("mumbai").seats, 4);
  assert.equal(getMap("lisbon").maxTrains, 6);
});
test("starts unconnected and automatically allocates one of the limited trains", () => {
  const g = quiet();
  assert.equal(g.trains.length, 0);
  line(g, 0, [0, 1, 2]);
  assert.equal(g.trains.length, 1);
  assert.equal(g.stock.locomotives, 2);
  assert.equal(trainCapacity(g.trains[0]), 6);
});
test("distance-based routing finds transfers and rejects disconnected destinations", () => {
  const g = quiet();
  line(g, 0, [0, 1]);
  line(g, 1, [1, 2]);
  assert.deepEqual(journey(g, 0, "square").next, 1);
  assert.equal(journey(g, 1, "square", 0).line, 1);
  clearLine(g, 1);
  assert.equal(journey(g, 0, "square"), null);
});
test("boarding respects travel direction and passengers reach a destination through a transfer", () => {
  const g = quiet();
  line(g, 0, [0, 1]);
  line(g, 1, [1, 2]);
  g.stations[0].waiting = ["square"];
  run(g, 30);
  assert.equal(g.score, 1);
  assert.equal(count(g), 1);
  const h = quiet();
  line(h, 0, [0, 1, 2]);
  const train = h.trains[0];
  train.from = 1;
  h.stations[1].waiting = ["circle"];
  serviceStation(h, train, 2);
  assert.equal(train.passengers.length, 0);
  serviceStation(h, train, 0);
  assert.equal(train.passengers.length, 1);
});
test("six seats per car, no passenger loss when carriages are returned", () => {
  const g = quiet();
  line(g, 0, [0, 1, 2]);
  const t = g.trains[0];
  g.stock.carriages = 1;
  assert.equal(addCarriage(g, t.id).ok, true);
  assert.equal(trainCapacity(t), 12);
  g.stations[0].waiting = Array(12).fill("square");
  run(g, 1);
  assert.equal(t.passengers.length, 12);
  assert.equal(moveCarriage(g, t.id).ok, true);
  run(g, 10);
  assert.equal(g.stock.carriages, 1);
  assert.equal(t.carriages, 0);
  assert.equal(count(g), 12);
});
test("loops close only at endpoints and trains maintain direction around the loop", () => {
  const g = quiet();
  line(g, 0, [0, 1, 2]);
  assert.equal(connect(g, 0, 1).ok, false);
  assert.equal(connect(g, 0, 0).ok, true);
  assert.equal(g.lines[0].loop, true);
  const t = g.trains[0];
  t.from = 2;
  t.direction = 1;
  t.dwell = 0;
  tick(g, 0.05);
  assert.equal(t.to, 0);
  run(g, 10);
  assert.equal(t.direction, 1);
  assert.equal(openLoop(g, 0).ok, true);
});
test("edits preserve a moving train and its passengers until the next station", () => {
  const g = quiet();
  line(g, 0, [0, 1, 2]);
  g.stations[0].waiting = ["square"];
  run(g, 1.2);
  const t = g.trains[0],
    destination = t.to;
  assert.notEqual(destination, null);
  assert.equal(clearLine(g, 0).ok, true);
  assert.equal(g.trains.length, 1);
  assert.equal(t.to, destination);
  assert.equal(count(g), 1);
  run(g, 10);
  assert.equal(g.trains.length, 0);
  assert.equal(g.stock.locomotives, 3);
  assert.equal(count(g), 1);
});
test("train redeployment waits for arrival and moves attached carriages", () => {
  const g = quiet();
  line(g, 0, [0, 1]);
  line(g, 1, [1, 2]);
  g.stock.carriages = 1;
  const t = g.trains[0];
  addCarriage(g, t.id);
  g.stations[0].waiting = ["square"];
  run(g, 1);
  const old = t.from;
  assert.equal(moveTrain(g, t.id, 1, 2).ok, true);
  assert.equal(t.from, old);
  assert.equal(t.line, 0);
  run(g, 8);
  assert.equal(t.line, 1);
  assert.equal(t.carriages, 1);
  assert.equal(count(g), 1);
});
test("removing or inserting a station never teleports an in-transit train", () => {
  const g = quiet();
  line(g, 0, [0, 2]);
  run(g, 1);
  const t = g.trains[0],
    progress = t.progress;
  assert.equal(insertStation(g, 0, 0, 1).ok, true);
  assert.equal(t.to, 2);
  assert.equal(t.progress, progress);
  assert.equal(removeStation(g, 0, 2).ok, true);
  run(g, 10);
  assert.ok(g.trains.every((t) => Number.isFinite(t.progress)));
});
test("tunnels cost one per water-crossing interstation section, and edits return them", () => {
  const g = createGame("normal", rng(), "seoul");
  line(g, 0, [0, 1]);
  const before = tunnelsUsed(g);
  assert.equal(connect(g, 0, 2).ok, true);
  assert.ok(tunnelsUsed(g) > before);
  assert.equal(needsTunnel(g.stations[1], g.stations[2], g), true);
  clearLine(g, 0);
  assert.equal(tunnelsUsed(g), 0);
  g.stock.tunnels = 0;
  line(g, 0, [0, 1]);
  assert.equal(connect(g, 0, 2).ok, false);
  assert.equal(g.lines[0].stations.length, 2);
});
test("eight-direction paths have identical geometry in reverse", () => {
  const a = { id: 0, x: 10, y: 20 },
    b = { id: 1, x: 200, y: 80 };
  assert.deepEqual(edgePoints(a, b), edgePoints(b, a).reverse());
  assert.equal(edgeLength(a, b), edgeLength(b, a));
  const f = pointOnEdge(a, b, 0.4),
    r = pointOnEdge(b, a, 0.6);
  assert.ok(Math.abs(f.x - r.x) < 1e-8 && Math.abs(f.y - r.y) < 1e-8);
});
test("Seoul crowd threshold is five, warning recedes gradually, and a full timer ends the game", () => {
  const g = quiet("normal", "seoul"),
    s = g.stations[0];
  s.waiting = Array(5).fill("square");
  run(g, 5);
  assert.equal(s.crowded, 0);
  s.waiting.push("square");
  run(g, 10);
  assert.ok(s.crowded >= 9.9);
  s.waiting.pop();
  run(g, 4);
  assert.ok(s.crowded > 5 && s.crowded < 7);
  s.waiting.push("square");
  run(g, 45);
  assert.equal(g.gameOver, true);
  const elapsed = g.elapsed;
  tick(g, 1);
  assert.equal(g.elapsed, elapsed);
});
test("interchanges double station capacity and cannot be applied twice or used in San Francisco", () => {
  const g = quiet("normal", "seoul");
  g.stock.interchanges = 1;
  assert.equal(upgradeStation(g, 0).ok, true);
  assert.equal(capacity(g.stations[0]), 10);
  assert.equal(upgradeStation(g, 0).ok, false);
  const h = quiet("creative", "sanfrancisco");
  assert.equal(upgradeStation(h, 0).ok, false);
});
test("weekday/weekend demand exactly excludes unavailable types and special-to-special travel", () => {
  const g = quiet("creative");
  for (const type of SPECIAL) addStation(g, type, 800, 100);
  assert.deepEqual(demandOptions(g, g.stations[0]), [
    "triangle",
    "square",
    "cross",
    "diamond",
  ]);
  assert.deepEqual(demandOptions(g, g.stations[1]), ["circle"]);
  g.elapsed = 150;
  assert.equal(demandOptions(g, g.stations[2]).length, 0);
  assert.ok(demandOptions(g, g.stations[0]).includes("star"));
  assert.ok(!demandOptions(g, g.stations[0]).includes("pentagon"));
  for (const s of g.stations.filter((s) => SPECIAL.includes(s.shape)))
    assert.ok(demandOptions(g, s).every((p) => BASIC.includes(p)));
});
test("Sunday pauses for two distinct random rewards, plus the city-specific locomotive grant", () => {
  const g = quiet("normal", "hongkong");
  g.elapsed = 179.9;
  g.nextUpgrade = 180;
  tick(g, 1, rng());
  assert.equal(g.pendingUpgrade.length, 2);
  assert.notEqual(...g.pendingUpgrade);
  assert.equal(g.stock.locomotives, 5);
  const elapsed = g.elapsed;
  tick(g, 5);
  assert.equal(g.elapsed, elapsed);
  assert.equal(chooseUpgrade(g, "invalid").ok, false);
  assert.equal(chooseUpgrade(g, g.pendingUpgrade[0]).ok, true);
  tick(g, 0.1);
  assert.ok(g.elapsed > elapsed);
});
test("Osaka chooses between two regular trains or one shinkansen; Tokyo starts with a shinkansen", () => {
  const g = quiet("normal", "osaka");
  g.elapsed = 179.9;
  g.nextUpgrade = 180;
  tick(g, 1, rng());
  assert.equal(g.stock.locomotives, 3);
  chooseUpgrade(g, g.pendingUpgrade[0], "shinkansen");
  assert.equal(g.stock.shinkansen, 1);
  assert.equal(g.stock.locomotives, 3);
  const h = quiet("normal", "tokyo");
  h.stock.locomotives = 0;
  line(h, 0, [0, 1]);
  assert.equal(h.trains[0].type, "shinkansen");
});
test("extreme permits extensions but blocks destructive edits and redeployment; provides previews", () => {
  const g = quiet("extreme");
  line(g, 0, [0, 1, 2]);
  assert.equal(clearLine(g, 0).ok, false);
  assert.equal(removeStation(g, 0, 1).ok, false);
  assert.equal(insertStation(g, 0, 0, 1).ok, false);
  assert.equal(moveTrain(g, g.trains[0].id).ok, false);
  assert.equal(moveCarriage(g, g.trains[0].id).ok, false);
  assert.equal(connect(g, 0, 0).ok, true);
  const h = createGame("extreme", rng(), "london");
  h.nextStation = 10;
  tick(h, 1, rng());
  assert.ok(h.preview);
});
test("endless caps waiting queues and awards by efficiency, not the Sunday calendar", () => {
  const g = quiet("endless");
  g.stations[0].waiting = Array(100).fill("square");
  tick(g, 0.1);
  assert.equal(g.gameOver, false);
  assert.equal(g.stations[0].crowded, 0);
  assert.equal(count(g), 100);
  assert.equal(g.stations[0].waiting.length, 24);
  g.elapsed = 29.9;
  g.nextEfficiency = 30;
  g.deliveredToday = 10;
  tick(g, 1, rng());
  assert.equal(g.upgradeCount, 1);
  assert.equal(g.efficiency, 10);
  const h = quiet("endless");
  h.elapsed = 179.9;
  h.nextUpgrade = 180;
  tick(h, 1);
  assert.equal(h.pendingUpgrade, null);
});
test("creative has unlimited assets, no auto stations, and unique special types", () => {
  const g = quiet("creative");
  g.nextStation = 0;
  line(g, 0, [0, 1, 2]);
  for (let i = 0; i < 3; i++) assert.equal(addTrain(g, 0).ok, true);
  assert.equal(addTrain(g, 0).ok, false);
  for (let i = 0; i < 65; i++)
    assert.equal(addCarriage(g, g.trains[0].id).ok, true);
  assert.equal(addCarriage(g, g.trains[0].id).ok, false);
  const countBefore = g.stations.length;
  run(g, 30);
  assert.equal(g.stations.length, countBefore);
  assert.equal(placeStation(g, "star", 800, 110).ok, true);
  assert.equal(placeStation(g, "star", 900, 110).ok, false);
  assert.equal(editStation(g, 0, "star").ok, false);
  assert.equal(deleteStation(g, 3).ok, true);
  assert.equal(g.stations.length, countBefore);
});
test("game-over can continue with the same network in endless or creative", () => {
  const g = quiet();
  line(g, 0, [0, 1]);
  g.gameOver = true;
  const ids = [...g.lines[0].stations];
  continueAs(g, "endless");
  assert.equal(g.gameOver, false);
  assert.deepEqual(g.lines[0].stations, ids);
  continueAs(g, "creative");
  assert.equal(g.unlocked, 7);
});
test("save validation accepts an actual round trip and rejects corrupt saves", () => {
  const g = quiet();
  line(g, 0, [0, 1]);
  run(g, 4);
  assert.equal(validSavedGame(JSON.parse(JSON.stringify(g))), true);
  g.trains[0].to = 800;
  assert.equal(validSavedGame(g), false);
  assert.equal(validSavedGame({ version: 1 }), false);
});
test("challenge mode stops time on a rule violation and resumes when repaired", () => {
  const g = quiet("normal", "saopaulo");
  g.challengeMode = true;
  line(g, 0, [0, 1, 2]);
  assert.equal(challengeValid(g), false);
  tick(g, 1);
  assert.equal(g.elapsed, 0);
  connect(g, 0, 0);
  assert.equal(challengeValid(g), true);
  tick(g, 1);
  assert.ok(g.elapsed > 0);
});
test("generated game conserves every passenger through extended play and rewards", () => {
  const random = rng(123),
    g = createGame("endless", random, "london");
  line(g, 0, [0, 1, 2]);
  for (let i = 0; i < 6000; i++) {
    if (g.pendingUpgrade) chooseUpgrade(g, g.pendingUpgrade[0]);
    tick(g, 0.1, random);
    assert.equal(count(g), g.totalSpawned, `passenger loss at ${i}`);
  }
  assert.ok(g.score > 0);
  assert.ok(g.stations.length > 3);
  const specials = g.stations
    .filter((s) => SPECIAL.includes(s.shape))
    .map((s) => s.shape);
  assert.equal(new Set(specials).size, specials.length);
});

test("a one-direction loop boards passengers even when the reverse path would be shorter", () => {
  const g = quiet();
  line(g, 0, [0, 1, 2]);
  connect(g, 0, 0);
  const t = g.trains[0];
  g.stations[0].waiting = ["square"];
  assert.equal(journey(g, 0, "square").next, 1);
  serviceStation(g, t, 1);
  assert.deepEqual(t.passengers, ["square"]);
  run(g, 15);
  assert.equal(g.score, 1);
});
test("identical overlapping lines both accept passengers on equally short paths", () => {
  const g = quiet();
  line(g, 0, [0, 1, 2]);
  line(g, 1, [0, 1, 2]);
  g.stations[0].waiting = ["square"];
  serviceStation(g, g.trains[1], 1);
  assert.deepEqual(g.trains[1].passengers, ["square"]);
});
test("changing a creative station shape fulfils matching waiting passengers without losing any", () => {
  const g = quiet("creative");
  g.stations[0].waiting = ["star", "square"];
  assert.equal(editStation(g, 0, "star").ok, true);
  assert.equal(g.score, 1);
  assert.equal(count(g), 2);
});

test("a design starts empty, stays frozen, and can be saved before the first station", async () => {
  const { createDesign } = await import("../simulation.js");
  const g = createDesign("normal", rng(), "london");
  assert.equal(g.stations.length, 0);
  assert.equal(g.planning, true);
  tick(g, 50);
  assert.equal(g.elapsed, 0);
  assert.equal(g.totalSpawned, 0);
  assert.equal(validSavedGame(JSON.parse(JSON.stringify(g))), true);
});
test("design requires all three station shapes and a fully connected network before launch", async () => {
  const { createDesign, launchDesign } = await import("../simulation.js");
  const g = createDesign("normal", rng(), "london");
  assert.equal(launchDesign(g).ok, false);
  for (const [shape, x] of [
    ["circle", 150],
    ["triangle", 300],
    ["square", 450],
  ])
    assert.equal(placeStation(g, shape, x, 120).ok, true);
  assert.equal(launchDesign(g).ok, false);
  line(g, 0, [0, 1, 2]);
  assert.equal(launchDesign(g).ok, true);
  assert.equal(g.planning, false);
  tick(g, 6);
  assert.ok(g.totalSpawned > 0);
  assert.equal(g.stations.length, 3);
});
test("station movement validates land, spacing, tunnels and the planning boundary", async () => {
  const { createDesign, launchDesign, moveStation } =
    await import("../simulation.js");
  const g = createDesign("normal", rng(), "london");
  for (const [shape, x] of [
    ["circle", 150],
    ["triangle", 300],
    ["square", 450],
  ])
    placeStation(g, shape, x, 120);
  assert.equal(moveStation(g, 0, 200, 180).ok, true);
  assert.equal(moveStation(g, 0, 305, 120).ok, false);
  assert.equal(moveStation(g, 0, -10, 100).ok, false);
  assert.equal(g.stations[0].x, 200);
  line(g, 0, [0, 1, 2]);
  launchDesign(g);
  assert.equal(moveStation(g, 0, 180, 170).ok, false);
});
test("planning permits removal back to an empty canvas, including extreme designs", async () => {
  const { createDesign } = await import("../simulation.js");
  const g = createDesign("extreme", rng(), "london");
  placeStation(g, "circle", 150, 120);
  placeStation(g, "triangle", 300, 120);
  line(g, 0, [0, 1]);
  assert.equal(clearLine(g, 0).ok, true);
  assert.equal(deleteStation(g, 1).ok, true);
  assert.equal(deleteStation(g, 0).ok, true);
  assert.equal(validSavedGame(g), true);
});

test("a train dropped on a track starts at that position and consumes exactly one locomotive", () => {
  const g = quiet();
  line(g, 0, [0, 1, 2]);
  const stock = g.stock.locomotives;
  assert.equal(
    addTrain(g, 0, 0, "normal", { from: 0, to: 1, progress: 0.5 }).ok,
    true,
  );
  const t = g.trains.at(-1);
  assert.equal(t.from, 0);
  assert.equal(t.to, 1);
  assert.equal(t.progress, 0.5);
  assert.equal(g.stock.locomotives, stock - 1);
  assert.equal(
    addTrain(g, 0, 0, "normal", { from: 0, to: 2, progress: 0.5 }).ok,
    false,
  );
  assert.equal(g.stock.locomotives, stock - 1);
});
test("dragged train waits to unload before being placed at a new track position", () => {
  const g = quiet();
  line(g, 0, [0, 1]);
  line(g, 1, [1, 2]);
  const t = g.trains[0];
  g.stations[0].waiting = ["square"];
  run(g, 1);
  const before = t.from;
  assert.equal(
    moveTrain(g, t.id, 1, 1, { from: 1, to: 2, progress: 0.6 }).ok,
    true,
  );
  assert.equal(t.from, before);
  assert.equal(t.line, 0);
  for (let i = 0; i < 200 && t.line === 0; i++) tick(g, 0.05);
  assert.equal(t.line, 1);
  assert.equal(t.progress, 0.6);
  assert.equal(count(g), 1);
});

test("dragging an endpoint backwards shortens the line and retains in-transit passengers", async () => {
  const { trimLine } = await import("../simulation.js");
  const g = quiet();
  line(g, 0, [0, 1, 2]);
  g.stations[0].waiting = ["square"];
  run(g, 1);
  assert.equal(trimLine(g, 0, 1).ok, true);
  assert.deepEqual(g.lines[0].stations, [0, 1]);
  assert.equal(count(g), 1);
  run(g, 6);
  assert.equal(count(g), 1);
  const h = quiet("extreme");
  line(h, 0, [0, 1, 2]);
  assert.equal(trimLine(h, 0, 1).ok, false);
  assert.equal(h.lines[0].stations.length, 3);
});
