(function (root) {
  // Runtime alpha mask: discard near-transparent export noise and isolated specks.
  function cleanSprite(data, width, height) {
    const count = width * height, seen = new Uint8Array(count), labels = new Int32Array(count), queue = new Int32Array(count);
    let largest = 0, largestSize = 0, label = 0;
    const valid = i => data[i * 4 + 3] >= 235 && !(data[i * 4] > 170 && data[i * 4 + 2] > 170 && data[i * 4 + 1] < 110);
    for (let i = 0; i < count; i++) {
      if (seen[i] || !valid(i)) continue;
      label++; let begin = 0, end = 1; queue[0] = i; seen[i] = 1;
      while (begin < end) {
        const p = queue[begin++]; labels[p] = label;
        const x = p % width, y = Math.floor(p / width);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx, ny = y + dy, next = ny * width + nx;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height || seen[next] || !valid(next)) continue;
          seen[next] = 1; queue[end++] = next;
        }
      }
      if (end > largestSize) { largestSize = end; largest = label; }
    }
    for (let i = 0; i < count; i++) if (!largest || labels[i] !== largest) data[i * 4 + 3] = 0;
    return data;
  }
  if (typeof module !== 'undefined') module.exports = { cleanSprite };
  else root.PetSprite = { cleanSprite };
})(typeof window !== 'undefined' ? window : globalThis);
