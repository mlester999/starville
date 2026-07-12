export function stableDepthTieBreaker(id: string): number {
  let hash = 0;
  for (const character of id) {
    hash = (hash * 31 + character.codePointAt(0)!) % 997;
  }
  return hash;
}

export function depthForFootPosition(x: number, y: number, id: string): number {
  return Math.round((x + y) * 1_000) * 1_000 + stableDepthTieBreaker(id);
}
