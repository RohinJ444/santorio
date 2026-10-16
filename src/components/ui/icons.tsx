import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };

const base = (size = 20): SVGProps<SVGSVGElement> => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
});

export const ChevronLeft = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M15 5l-7 7 7 7" />
  </svg>
);

export const ChevronRight = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M9 5l7 7-7 7" />
  </svg>
);

export const Gear = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </svg>
);

export const Trend = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M3 20h18" />
    <path d="M4 16l5-5 4 3 7-8" />
    <path d="M16 6h4v4" />
  </svg>
);

export const Plus = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const Minus = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M5 12h14" />
  </svg>
);

export const Close = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

export const Pin = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" />
    <circle cx="12" cy="9.5" r="2.4" />
  </svg>
);

/** Mini figure: the "back to body" button. */
export const Figure = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <circle cx="12" cy="4.6" r="2.2" />
    <path d="M12 7.6v7.2M7 9.8l5 1.2 5-1.2M12 14.8l-2.6 6.4M12 14.8l2.6 6.4" />
  </svg>
);

export const Drop = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M12 3s6 6.4 6 11a6 6 0 0 1-12 0c0-4.6 6-11 6-11z" />
  </svg>
);

export const Lock = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <rect x="5" y="11" width="14" height="9.5" rx="2.2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </svg>
);
