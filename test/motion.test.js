import test from "node:test";
import assert from "node:assert/strict";
import { smoothAngle, cameraAt } from "../motion.js";

test("train heading takes the shortest turn through the 180 degree boundary", () => {
  const value = smoothAngle(179, -179, 1 / 60);
  assert.ok(value > 179 && value < 181);
  assert.equal(smoothAngle(NaN, 45, 0.016), 45);
  assert.ok(smoothAngle(1080, 45, 1 / 60) > 1080);
  assert.ok(smoothAngle(1080, 45, 1 / 60) < 1125);
  assert.ok(smoothAngle(-1080, -45, 1 / 60) < -1080);
  assert.ok(smoothAngle(-1080, -45, 1 / 60) > -1125);
});
test("rotation smoothing has the same timing at 60Hz and 144Hz", () => {
  let a = 0,
    b = 0;
  for (let i = 0; i < 60; i++) a = smoothAngle(a, 90, 1 / 60);
  for (let i = 0; i < 144; i++) b = smoothAngle(b, 90, 1 / 144);
  assert.ok(Math.abs(a - b) < 1e-9);
  assert.ok(a > 89.9 && a <= 90);
});
test("reduced motion uses the actual heading immediately", () =>
  assert.equal(smoothAngle(0, 90, 0.016, true), 90));
test("camera interpolation reaches exact endpoints, is monotonic and does not overshoot", () => {
  const from = { x: 0, y: 0, w: 1000, h: 600 },
    to = { x: 200, y: 80, w: 600, h: 360 };
  assert.deepEqual(cameraAt(from, to, 0), from);
  assert.deepEqual(cameraAt(from, to, 1), to);
  assert.deepEqual(cameraAt(from, to, 2), to);
  let previous = 0;
  for (let i = 0; i <= 100; i++) {
    const p = cameraAt(from, to, i / 100);
    assert.ok(p.x >= previous && p.x <= 200);
    assert.ok(p.w >= 600 && p.w <= 1000);
    previous = p.x;
  }
});
