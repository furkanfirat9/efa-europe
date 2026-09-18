function getMonotoneCubicPath(points) {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  if (points.length === 2) {
    return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  }

  const n = points.length;
  const dX = [];
  const dY = [];
  const slopes = [];

  for (let i = 0; i < n - 1; i++) {
    const dx = points[i + 1].x - points[i].x;
    const dy = points[i + 1].y - points[i].y;
    dX.push(dx);
    dY.push(dy);
    slopes.push(dx === 0 ? 0 : dy / dx);
  }

  const tangents = [slopes[0]];
  for (let i = 1; i < n - 1; i++) {
    if (slopes[i - 1] * slopes[i] <= 0) {
      tangents.push(0);
    } else {
      tangents.push((slopes[i - 1] + slopes[i]) / 2);
    }
  }
  tangents.push(slopes[n - 2]);

  for (let i = 0; i < n - 1; i++) {
    if (dY[i] === 0) {
      tangents[i] = 0;
      tangents[i + 1] = 0;
    } else if (slopes[i] !== 0) {
      const alpha = tangents[i] / slopes[i];
      const beta = tangents[i + 1] / slopes[i];
      const dist = Math.sqrt(alpha * alpha + beta * beta);
      if (dist > 3) {
        const tau = 3 / dist;
        tangents[i] = tau * alpha * slopes[i];
        tangents[i + 1] = tau * beta * slopes[i];
      }
    }
  }

  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < n - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const dx = dX[i];
    const cp1x = p0.x + dx / 3;
    const cp1y = p0.y + (tangents[i] * dx) / 3;
    const cp2x = p1.x - dx / 3;
    const cp2y = p1.y - (tangents[i + 1] * dx) / 3;
    path += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`;
  }

  return path;
}

const testPoints = [
  { x: 0, y: 150 },
  { x: 100, y: 150 },
  { x: 200, y: 80 },
  { x: 300, y: 80 },
  { x: 400, y: 30 },
  { x: 500, y: 150 },
  { x: 600, y: 150 },
];

const pathStr = getMonotoneCubicPath(testPoints);
console.log('Path result:', pathStr);
console.log('Contains NaN?', pathStr.includes('NaN'));
