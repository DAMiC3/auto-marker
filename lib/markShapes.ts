// Single source of truth for mark-shape geometry (P3-4).
//
// Two renderers consume this: the on-screen legend icon
// (`components/MarkShapeIcon.tsx`, SVG in the browser) and the PDF stamper
// (`drawShape()` in `lib/markPaper.ts`, pdf-lib in the worker). Before this
// module they each hard-coded their own coordinates and silently drifted — a
// shape could look one way in the Settings legend and stamp differently on the
// paper. Now both map these primitives onto their own backend, so changing a
// shape changes it in both places at once.
//
// Geometry is defined in a normalized unit space:
//   - centered at the origin (0, 0),
//   - y points UP (PDF / maths convention — the SVG renderer flips it),
//   - extents roughly within [-1, 1] on each axis.
// A renderer reproduces a shape by scaling each coordinate by its own size `s`
// and offsetting to the draw position. (PDF already does exactly `unit * s`, so
// existing stamps are pixel-identical to before.)
//
// This file is intentionally framework-free (no React, no pdf-lib) so it can be
// imported by both client components and worker code.

export type MarkShape = "tick" | "half" | "cross" | "circle" | "underline" | "dot";

export const MARK_SHAPES: { key: MarkShape; label: string }[] = [
  { key: "tick",      label: "Full mark" },
  { key: "half",      label: "Half mark" },
  { key: "cross",     label: "Cross" },
  { key: "circle",    label: "Circle" },
  { key: "underline", label: "Underline" },
  { key: "dot",       label: "Dot" },
];

// `weight` is a multiplier on the renderer's base stroke thickness (default 1).
export type ShapePrimitive =
  | { kind: "line"; from: [number, number]; to: [number, number]; weight?: number }
  | { kind: "ellipse"; cx: number; cy: number; rx: number; ry: number; weight?: number }
  | { kind: "disc"; cx: number; cy: number; r: number };

/** Relative stroke weight of a primitive (filled discs have none). */
export function shapeWeight(p: ShapePrimitive): number {
  return "weight" in p && p.weight != null ? p.weight : 1;
}

export const SHAPE_GEOMETRY: Record<MarkShape, ShapePrimitive[]> = {
  // A check mark: short down-stroke into a long up-stroke.
  tick: [
    { kind: "line", from: [-0.5, 0], to: [-0.1, -0.5] },
    { kind: "line", from: [-0.1, -0.5], to: [0.6, 0.6] },
  ],
  // The tick, with a thinner slash through it — reads as "half a mark".
  half: [
    { kind: "line", from: [-0.5, 0], to: [-0.1, -0.5] },
    { kind: "line", from: [-0.1, -0.5], to: [0.6, 0.6] },
    { kind: "line", from: [0.55, 0.7], to: [-0.2, -0.7], weight: 0.75 },
  ],
  cross: [
    { kind: "line", from: [-0.5, 0.5], to: [0.5, -0.5] },
    { kind: "line", from: [-0.5, -0.5], to: [0.5, 0.5] },
  ],
  circle: [
    { kind: "ellipse", cx: 0, cy: 0, rx: 0.7, ry: 0.7 },
  ],
  underline: [
    { kind: "line", from: [-1, -0.6], to: [1, -0.6] },
  ],
  dot: [
    { kind: "disc", cx: 0, cy: 0, r: 0.35 },
  ],
};
