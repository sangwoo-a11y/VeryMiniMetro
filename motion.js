// All smoothing is time-based so 60 Hz and 144 Hz displays use the same timing.
export function smoothAngle(current, target, seconds, reduced = false) {
  if (reduced || !Number.isFinite(current)) return target;
  const difference = ((((target - current) % 360) + 540) % 360) - 180;
  return current + difference * (1 - Math.exp(-Math.max(0, seconds) / 0.075));
}
export function cameraAt(from, to, progress) {
  const t = Math.min(1, Math.max(0, progress));
  const eased = 1 - (1 - t) ** 3;
  return Object.fromEntries(
    ["x", "y", "w", "h"].map((key) => [
      key,
      from[key] + (to[key] - from[key]) * eased,
    ]),
  );
}
