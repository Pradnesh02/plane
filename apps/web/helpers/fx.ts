/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Pointer-driven 3D tilt for `.fx-card` elements (styles in styles/globals.css).
// One delegated listener for the whole app; off for touch devices and reduced motion.
export function initFx(): () => void {
  if (typeof window === "undefined") return () => {};
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return () => {};
  if (!window.matchMedia("(pointer: fine)").matches) return () => {};

  let active: HTMLElement | null = null;
  const onMove = (e: PointerEvent) => {
    const card = e.target instanceof Element ? e.target.closest<HTMLElement>(".fx-card") : null;
    if (active && active !== card) for (const v of ["--fx-rx", "--fx-ry"]) active.style.removeProperty(v);
    active = card;
    if (!card) return;
    const r = card.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    card.style.setProperty("--fx-rx", `${(0.5 - y) * 6}deg`);
    card.style.setProperty("--fx-ry", `${(x - 0.5) * 8}deg`);
    card.style.setProperty("--fx-gx", `${x * 100}%`);
    card.style.setProperty("--fx-gy", `${y * 100}%`);
  };
  document.addEventListener("pointermove", onMove, { passive: true });
  return () => document.removeEventListener("pointermove", onMove);
}
