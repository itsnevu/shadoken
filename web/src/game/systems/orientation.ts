// ============================================================================
// Strategy A orientation helpers.
//
// The physics world stays axis-aligned forever. We track a single integer
// orientation 0..3 (quarter turns) and remap the ninja's LOCAL reference frame
// (right / up) to WORLD axes ourselves. Gravity is applied as a constant
// velocity along -localUp; movement is applied along localRight.
//
// Screen/Phaser coordinates are Y-DOWN, so this table is the Phaser-adapted
// form of the Unity-convention formulas in GAMEPLAY_SPEC.md. It is derived so
// that the grounding side matches the spec exactly:
//   o=0 -> gravity down  (blocked.down)
//   o=1 -> gravity left  (blocked.left)
//   o=2 -> gravity up    (blocked.up)
//   o=3 -> gravity right (blocked.right)
// ============================================================================

import type { Orientation } from '../../types';

export interface Vec2 {
  x: number;
  y: number;
}

/** localUp per orientation (points AWAY from gravity), Y-down screen space. */
const UP: Record<Orientation, Vec2> = {
  0: { x: 0, y: -1 },
  1: { x: 1, y: 0 },
  2: { x: 0, y: 1 },
  3: { x: -1, y: 0 },
};

/** localRight per orientation = (-up.y, up.x). */
const RIGHT: Record<Orientation, Vec2> = {
  0: { x: 1, y: 0 },
  1: { x: 0, y: 1 },
  2: { x: -1, y: 0 },
  3: { x: 0, y: -1 },
};

/** Convert a LOCAL velocity/offset (lx along right, ly along up) to WORLD. */
export function toWorld(lx: number, ly: number, o: Orientation): Vec2 {
  const r = RIGHT[o];
  const u = UP[o];
  return { x: lx * r.x + ly * u.x, y: lx * r.y + ly * u.y };
}

/** Convert a WORLD velocity/offset to the LOCAL frame (inverse of toWorld). */
export function toLocal(wx: number, wy: number, o: Orientation): Vec2 {
  const r = RIGHT[o];
  const u = UP[o];
  // Orthonormal basis => inverse is the transpose (dot products).
  return { x: wx * r.x + wy * r.y, y: wx * u.x + wy * u.y };
}

/** World-space unit vector gravity pulls along for this orientation. */
export function gravityDir(o: Orientation): Vec2 {
  const u = UP[o];
  return { x: -u.x, y: -u.y };
}

type BlockSide = 'up' | 'down' | 'left' | 'right';

/** The arcade body side that counts as "ground" for this orientation. */
export function groundSide(o: Orientation): BlockSide {
  switch (o) {
    case 0:
      return 'down';
    case 1:
      return 'left';
    case 2:
      return 'up';
    case 3:
      return 'right';
  }
}

/** Advance orientation by dir (+1 / -1) and wrap into 0..3. */
export function rotateOrientation(o: Orientation, dir: number): Orientation {
  const n = (((o + Math.sign(dir)) % 4) + 4) % 4;
  return n as Orientation;
}

/** Target camera / sprite render angle (radians) for an orientation. */
export function renderAngleFor(o: Orientation): number {
  return o * (Math.PI / 2);
}
