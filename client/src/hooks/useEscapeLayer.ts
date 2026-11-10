import { useEffect, useRef } from "react";

type Layer = { current: () => void };

/** Open layers, oldest first. Only the last one answers Escape. */
const layers: Layer[] = [];

function onKeyDown(e: KeyboardEvent) {
  if (e.key !== "Escape" || e.defaultPrevented || e.isComposing) return;
  const top = layers[layers.length - 1];
  if (!top) return;
  e.preventDefault();
  top.current();
}

/**
 * Registers a dismissible layer (language menu, drawer, modal). Escape closes
 * only the most recently opened one, so a modal on top of a drawer closes
 * first and the drawer stays put.
 *
 * The layer's position is fixed when `active` turns true; re-renders with a
 * new `onEscape` update the handler without changing the stacking order.
 */
export function useEscapeLayer(active: boolean, onEscape: () => void) {
  const handler = useRef(onEscape);
  handler.current = onEscape;

  useEffect(() => {
    if (!active) return;
    if (layers.length === 0) window.addEventListener("keydown", onKeyDown);
    layers.push(handler);
    return () => {
      layers.splice(layers.indexOf(handler), 1);
      if (layers.length === 0) window.removeEventListener("keydown", onKeyDown);
    };
  }, [active]);
}
