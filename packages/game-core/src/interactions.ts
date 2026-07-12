import type { Point } from './contracts';

export interface WorldInteraction {
  readonly id: string;
  readonly type: 'notice';
  readonly x: number;
  readonly y: number;
  readonly range: number;
  readonly title: string;
  readonly content: string;
}

export function sanitizeInteractionText(value: string): string {
  return value
    .replace(/[<>]/gu, '')
    .replace(/\p{Cc}/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, 280);
}

export function closestInteraction(
  position: Point,
  interactions: readonly WorldInteraction[],
): WorldInteraction | undefined {
  return interactions
    .map((interaction) => ({
      interaction,
      distance: Math.hypot(position.x - interaction.x, position.y - interaction.y),
    }))
    .filter(({ interaction, distance }) => distance <= interaction.range)
    .sort(
      (left, right) =>
        left.distance - right.distance || left.interaction.id.localeCompare(right.interaction.id),
    )[0]?.interaction;
}
