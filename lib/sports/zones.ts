// Shot-chart geometry (Noah, Nov 14). Shots are placed by NAMED ZONE, never by exact position: the camera pans and
// zooms, so an exact spot would be a guess (CLAUDE.md section 3, rule 1). Each sport draws one half of its surface
// (the end a team attacks). Plain data only; components/game/shot-chart.tsx draws it.

export type ZoneShape = { t: "rect"; x: number; y: number; w: number; h: number; r?: number } | { t: "circle"; cx: number; cy: number; r: number } | { t: "path"; d: string };

export type ZoneGeometry = {
  /** Fill/outline shapes, drawn in order (later shapes sit on top). */
  shapes: ZoneShape[];
  /** Where the zone's dots are laid out (one or two clusters) and how many dots per row. */
  anchors: { x: number; y: number }[];
  cols: number;
  /** Where the zone's name and its made-attempts text go. */
  label: { x: number; y: number };
};

export type SurfaceLayout = {
  width: number;
  height: number;
  /** Background shape(s) for the whole surface. */
  surface: ZoneShape[];
  /** Lines drawn on top (key lines, circles, goal), purely decorative. */
  lines: ZoneShape[];
  /** The zone drawn as the background (everything not covered by another zone). */
  backgroundZone: string;
  zones: Record<string, ZoneGeometry>;
};

// Basketball half court: baseline at the top, hoop at (250, 62). 10 px = 1 ft, so the paint is 16 ft wide and 19 ft long,
// the 3-point arc is 23.75 ft and the corner 3 is 22 ft from the hoop.
const basketball: SurfaceLayout = {
  width: 500,
  height: 470,
  surface: [{ t: "rect", x: 0, y: 0, w: 500, h: 470 }],
  backgroundZone: "above-the-break 3",
  zones: {
    "above-the-break 3": { shapes: [], anchors: [{ x: 250, y: 360 }], cols: 8, label: { x: 250, y: 330 } },
    "mid-range": { shapes: [{ t: "path", d: "M30,0 L30,150 A237,237 0 0 0 470,150 L470,0 Z" }], anchors: [{ x: 250, y: 276 }], cols: 8, label: { x: 250, y: 228 } },
    paint: { shapes: [{ t: "rect", x: 170, y: 0, w: 160, h: 200 }], anchors: [{ x: 250, y: 100 }], cols: 6, label: { x: 250, y: 22 } },
    "corner 3": {
      shapes: [
        { t: "rect", x: 0, y: 0, w: 30, h: 150 },
        { t: "rect", x: 470, y: 0, w: 30, h: 150 },
      ],
      anchors: [
        { x: 15, y: 50 },
        { x: 485, y: 50 },
      ],
      cols: 1,
      label: { x: 98, y: 52 },
    },
  },
  lines: [
    { t: "rect", x: 170, y: 0, w: 160, h: 200 },
    { t: "circle", cx: 250, cy: 200, r: 60 },
    { t: "circle", cx: 250, cy: 62, r: 7.5 },
    { t: "path", d: "M30,0 L30,150 A237,237 0 0 0 470,150 L470,0" },
  ],
};

// Hockey, the attacking end: goal line near the top, net at (250, 70).
const hockey: SurfaceLayout = {
  width: 500,
  height: 440,
  surface: [{ t: "rect", x: 0, y: 0, w: 500, h: 440, r: 40 }],
  backgroundZone: "behind net / outside",
  zones: {
    "behind net / outside": { shapes: [], anchors: [{ x: 250, y: 50 }], cols: 14, label: { x: 250, y: 18 } },
    point: { shapes: [{ t: "rect", x: 30, y: 270, w: 440, h: 130 }], anchors: [{ x: 250, y: 345 }], cols: 10, label: { x: 250, y: 305 } },
    "left circle": { shapes: [{ t: "rect", x: 30, y: 80, w: 160, h: 190, r: 14 }], anchors: [{ x: 110, y: 180 }], cols: 6, label: { x: 110, y: 112 } },
    "right circle": { shapes: [{ t: "rect", x: 310, y: 80, w: 160, h: 190, r: 14 }], anchors: [{ x: 390, y: 180 }], cols: 6, label: { x: 390, y: 112 } },
    slot: { shapes: [{ t: "rect", x: 190, y: 80, w: 120, h: 190 }], anchors: [{ x: 250, y: 185 }], cols: 5, label: { x: 250, y: 112 } },
  },
  lines: [
    { t: "path", d: "M0,70 L500,70" },
    { t: "circle", cx: 110, cy: 190, r: 52 },
    { t: "circle", cx: 390, cy: 190, r: 52 },
    { t: "path", d: "M0,400 L500,400" },
  ],
};

// Lacrosse, the attacking end: goal at (250, 90) with the crease around it.
const lacrosse: SurfaceLayout = {
  width: 500,
  height: 420,
  surface: [{ t: "rect", x: 0, y: 0, w: 500, h: 420 }],
  backgroundZone: "outside",
  zones: {
    outside: { shapes: [], anchors: [{ x: 250, y: 350 }], cols: 10, label: { x: 250, y: 316 } },
    wing: {
      shapes: [
        { t: "rect", x: 20, y: 30, w: 130, h: 250 },
        { t: "rect", x: 350, y: 30, w: 130, h: 250 },
      ],
      anchors: [
        { x: 85, y: 150 },
        { x: 415, y: 150 },
      ],
      cols: 4,
      label: { x: 85, y: 60 },
    },
    inside: { shapes: [{ t: "rect", x: 150, y: 30, w: 200, h: 250 }], anchors: [{ x: 250, y: 215 }], cols: 7, label: { x: 250, y: 178 } },
    crease: { shapes: [{ t: "circle", cx: 250, cy: 90, r: 52 }], anchors: [{ x: 250, y: 114 }], cols: 5, label: { x: 250, y: 74 } },
  },
  lines: [
    { t: "circle", cx: 250, cy: 90, r: 52 },
    { t: "path", d: "M0,30 L500,30" },
  ],
};

export const SURFACE_LAYOUTS: Record<string, SurfaceLayout> = {
  basketball,
  "ice-hockey": hockey,
  lacrosse,
};
