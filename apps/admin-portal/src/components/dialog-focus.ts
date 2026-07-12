export function focusTrapTarget<Element>(
  controls: readonly Element[],
  activeElement: Element | null,
  shiftKey: boolean,
): Element | undefined {
  const first = controls[0];
  const last = controls[controls.length - 1];
  if (first === undefined || last === undefined) return undefined;
  if (shiftKey && activeElement === first) return last;
  if (!shiftKey && activeElement === last) return first;
  return undefined;
}
