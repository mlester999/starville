export function isTextEntryElement(element: Element | null): boolean {
  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement ||
    (element instanceof HTMLElement &&
      (element.isContentEditable === true ||
        (element.hasAttribute('contenteditable') &&
          element.getAttribute('contenteditable') !== 'false')))
  );
}

export function isGameplayInputAllowed(blocked: boolean, activeElement: Element | null): boolean {
  return !blocked && !isTextEntryElement(activeElement) && document.visibilityState !== 'hidden';
}
