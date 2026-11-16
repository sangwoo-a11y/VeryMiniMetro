import test from "node:test";
import assert from "node:assert/strict";
import { readableLineColor } from "../theme.js";
import { MAPS } from "../maps.js";

function luminance(hex) {
  return [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
}
test("light surfaces retain original line colours", () => {
  assert.equal(readableLineColor("#19375a", false), "#19375a");
});
test("dark surfaces retain bright hues and lift dark lines", () => {
  assert.equal(readableLineColor("#f8cc26", true), "#f8cc26");
  assert.notEqual(readableLineColor("#222222", true), "#222222");
});
test("every city line remains distinguishable from the graphite map", () => {
  for (const map of MAPS)
    for (const color of map.colors) {
      const lifted = readableLineColor(color, true);
      assert.ok(
        (luminance(lifted) + 0.05) / (luminance("#1c1c1c") + 0.05) >= 3,
        `${map.id}: ${color}`,
      );
    }
});
