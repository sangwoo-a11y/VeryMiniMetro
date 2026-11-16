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

// Matching samples let a dragged line ease between eight-direction bend layouts.
export function samplePath(points, count = 48) {
  const distances = [0];
  for (let i = 1; i < points.length; i++) {
    distances.push(
      distances.at(-1) +
        Math.hypot(
          points[i].x - points[i - 1].x,
          points[i].y - points[i - 1].y,
        ),
    );
  }
  const length = distances.at(-1);
  let segment = 1;
  return Array.from({ length: count }, (_, i) => {
    if (!length) return { ...points[0] };
    const distance = (length * i) / (count - 1);
    while (segment < points.length - 1 && distances[segment] < distance)
      segment++;
    const a = points[segment - 1],
      b = points[segment];
    const ratio =
      (distance - distances[segment - 1]) /
      (distances[segment] - distances[segment - 1] || 1);
    return { x: a.x + (b.x - a.x) * ratio, y: a.y + (b.y - a.y) * ratio };
  });
}

export function easePath(current, target, seconds, reduced = false) {
  const amount = reduced ? 1 : 1 - Math.exp(-Math.max(0, seconds) / 0.035);
  return target.map((point, i) => ({
    x: current[i].x + (point.x - current[i].x) * amount,
    y: current[i].y + (point.y - current[i].y) * amount,
  }));
}
