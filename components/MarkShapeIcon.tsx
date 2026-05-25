"use client";

export type MarkShape = "tick" | "half" | "cross" | "circle" | "underline" | "dot";

export const MARK_SHAPES: { key: MarkShape; label: string }[] = [
  { key: "tick",      label: "Full mark" },
  { key: "half",      label: "Half mark" },
  { key: "cross",     label: "Cross" },
  { key: "circle",    label: "Circle" },
  { key: "underline", label: "Underline" },
  { key: "dot",       label: "Dot" },
];

interface Props {
  shape: MarkShape;
  color: string;
  size?: number;
}

export default function MarkShapeIcon({ shape, color, size = 22 }: Props) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: color,
    strokeWidth: 2.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  switch (shape) {
    case "tick":
      return (
        <svg {...common}>
          <path d="M5 13l4 4L19 6" />
        </svg>
      );
    case "half":
      // A tick + a slash through it — reads as "half a mark"
      return (
        <svg {...common}>
          <path d="M4 14l3.5 3.5L16 7" />
          <path d="M19 4L9 21" strokeWidth={2} />
        </svg>
      );
    case "cross":
      return (
        <svg {...common}>
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      );
    case "circle":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="7.5" />
        </svg>
      );
    case "underline":
      return (
        <svg {...common}>
          <path d="M5 18h14" />
          <path d="M8 6v5a4 4 0 008 0V6" strokeWidth={2} />
        </svg>
      );
    case "dot":
      return (
        <svg {...common} fill={color}>
          <circle cx="12" cy="12" r="4.5" stroke="none" />
        </svg>
      );
    default:
      return null;
  }
}
