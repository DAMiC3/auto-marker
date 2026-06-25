"use client";

import { SHAPE_GEOMETRY, shapeWeight, type MarkShape, type ShapePrimitive } from "@/lib/markShapes";

// Re-exported so existing importers (SettingsPanel) keep working unchanged.
export { MARK_SHAPES, type MarkShape } from "@/lib/markShapes";

// SVG canvas: 24×24 viewBox, origin at the centre (12,12). Unit coords are
// scaled by SCALE and the y-axis is flipped (SVG is y-down, our geometry y-up).
const VIEW = 24;
const C = VIEW / 2;
const SCALE = 10; // keeps the widest shape (underline, ±1) inside the viewBox
const BASE_STROKE = 2.5;

const px = (ux: number) => C + ux * SCALE;
const py = (uy: number) => C - uy * SCALE;

interface Props {
  shape: MarkShape;
  color: string;
  size?: number;
}

function Primitive({ p, i, color }: { p: ShapePrimitive; i: number; color: string }) {
  switch (p.kind) {
    case "line":
      return (
        <line
          key={i}
          x1={px(p.from[0])} y1={py(p.from[1])}
          x2={px(p.to[0])}   y2={py(p.to[1])}
          strokeWidth={BASE_STROKE * shapeWeight(p)}
        />
      );
    case "ellipse":
      return (
        <ellipse
          key={i}
          cx={px(p.cx)} cy={py(p.cy)}
          rx={p.rx * SCALE} ry={p.ry * SCALE}
          strokeWidth={BASE_STROKE * shapeWeight(p)}
        />
      );
    case "disc":
      return <circle key={i} cx={px(p.cx)} cy={py(p.cy)} r={p.r * SCALE} fill={color} stroke="none" />;
  }
}

export default function MarkShapeIcon({ shape, color, size = 22 }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${VIEW} ${VIEW}`}
      fill="none"
      stroke={color}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {(SHAPE_GEOMETRY[shape] ?? []).map((p, i) => (
        <Primitive key={i} p={p} i={i} color={color} />
      ))}
    </svg>
  );
}
