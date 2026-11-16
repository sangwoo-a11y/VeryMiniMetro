// Retain line hues while lifting very dark lines above the charcoal map background.
export function readableLineColor(hex, dark) {
  if (!dark) return hex;
  const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const luminance = (values) =>
    values
      .map((v) => {
        const c = v / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      })
      .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
  const background = luminance([28, 28, 28]);
  for (let mix = 0; mix <= 1; mix += 0.05) {
    const lifted = rgb.map((v) => Math.round(v + (255 - v) * mix));
    if ((luminance(lifted) + 0.05) / (background + 0.05) >= 3)
      return "#" + lifted.map((v) => v.toString(16).padStart(2, "0")).join("");
  }
  return "#ffffff";
}
