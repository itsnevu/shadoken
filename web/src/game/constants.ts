// ============================================================================
// Tuned gameplay constants — the single source of truth (from GAMEPLAY_SPEC.md).
//
// This module has NO other game imports on purpose: it is loaded first, so any
// module can safely read CONST at top level without hitting a temporal-dead-zone
// through the config -> scenes -> systems import cycle.
// ============================================================================

export const CONST = {
  // Pixels-per-world-unit. Spec constants are unit/sec; multiply by SCALE when
  // converting a velocity or distance into screen pixels.
  SCALE: 8,

  // ---- Ninja tuning (exact spec values) ------------------------------------
  MOVE_GROUND: 58,
  MOVE_AIR: 42,
  GRAVITY: 54,
  JUMP_MIN: 54,
  JUMP_MAX: 64,
  JUMP_DECAY: 108,
  SPAWN_UP: 80,
  SUBMERGED: 0.43,
  WATER_BRAKE: 0.088,
  NITRO: 43,
  NORMOUS: 1.5,

  // ---- Obstacles / projectiles ---------------------------------------------
  ARROW_SPEED: 100,
  ARROW_FIRE: 1.5,
  ARROW_LIFE: 8,
  SAW_SPIN: 200,
  BOUNCE: 120,

  // ---- Swarm ----------------------------------------------------------------
  SCHOOL: 42,
  REVIVE: 7,
  GROUP_DIST: 10,
  GROUP_BOOST: 0.2,
  STRAY_KILL_DIST: 200,

  // ---- Camera / nausea ------------------------------------------------------
  CAM_FOLLOW_LERP: 6,
  CAM_ROT_LERP: 9,
  NAUSEA_PER_ROTATE: 0.4,
  NAUSEA_COOL: 0.7,
  NAUSEA_SPIN: 800,

  // ---- World layout (screen pixels) ----------------------------------------
  TILE: 32,
  CHAMBER_W: 720,
  CORRIDOR_H: 360,
  FLOOR_TOP: 300,
  WALL_THICK: 44,
  FLOOR_THICK: 40,
} as const;

/** Bottom of the ceiling slab (px). */
export const CEIL_BOT = CONST.FLOOR_TOP - CONST.CORRIDOR_H;
