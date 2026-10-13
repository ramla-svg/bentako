export function shouldFocusPosSearch(
  event: Pick<
    KeyboardEvent,
    "key" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey" | "repeat" | "isComposing"
  >,
  editing: boolean,
  overlayOpen: boolean,
) {
  if (editing || overlayOpen || event.repeat || event.isComposing || event.altKey) return false;
  return (
    ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") ||
    (event.key === "/" && !event.ctrlKey && !event.metaKey && !event.shiftKey)
  );
}
