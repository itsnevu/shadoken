// ============================================================================
// Ninja (Biped) — arcade sprite with the Strategy A rotated-frame movement.
//
// The body NEVER uses engine gravity (setAllowGravity(false)). Every frame we
// read the world velocity into the ninja's local frame, rewrite localVx/localVy
// (movement + constant gravity + decaying jump/bounce), and write it back out.
// ============================================================================

import Phaser from 'phaser';
import { CONST } from '../constants';
import type { NinjaState, Orientation } from '../../types';
import { groundSide, toWorld } from '../systems/orientation';

export class Ninja extends Phaser.Physics.Arcade.Sprite {
  jumpVelocity = 0;
  bounceVelocity = 0;
  /** 1 normally, 0.43 while submerged (scales the whole local velocity). */
  moveScale = 1;
  submerged = false;
  private wasSubmerged = false;

  nitro = false;
  normous = false;
  alive = true;
  isLeader = false;

  facing: 1 | -1 = 1;
  ninjaState: NinjaState = 'idle';

  private readonly baseScale: number;

  constructor(scene: Phaser.Scene, x: number, y: number, tint: number, scale: number) {
    super(scene, x, y, 'ninja');
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.baseScale = scale;
    this.setScale(scale);
    this.setOrigin(0.5, 0.55);
    this.setTint(tint);
    this.setDepth(20);

    const body = this.arcadeBody;
    body.setAllowGravity(false);
    body.setSize(2.2 * CONST.SCALE, 2.0 * CONST.SCALE);
    body.setBounce(0, 0);
    body.setCollideWorldBounds(false);
  }

  get arcadeBody(): Phaser.Physics.Arcade.Body {
    return this.body as Phaser.Physics.Arcade.Body;
  }

  /** Pop the ninja upward on spawn (spawnUpwardVelocity). */
  spawnPop(o: Orientation): void {
    const w = toWorld(0, CONST.SPAWN_UP, o);
    this.arcadeBody.setVelocity(w.x * CONST.SCALE, w.y * CONST.SCALE);
  }

  isGrounded(o: Orientation): boolean {
    const b = this.arcadeBody;
    const side = groundSide(o);
    return b.blocked[side] || b.touching[side];
  }

  /** Attempt a jump / swim-up. Only when grounded or submerged. */
  tryJump(o: Orientation, rng: Phaser.Math.RandomDataGenerator): void {
    if (!this.alive) return;
    if (!(this.isGrounded(o) || this.submerged)) return;
    const force = rng.realInRange(CONST.JUMP_MIN, CONST.JUMP_MAX) + CONST.GRAVITY;
    if (this.bounceVelocity > force) return;
    this.jumpVelocity = force;
  }

  /** Machine bounce surface — no kill, decaying upward impulse. */
  applyBounce(): void {
    if (!this.alive) return;
    this.bounceVelocity = CONST.BOUNCE;
  }

  /** Set submerged state; brakes velocity once on entry (splash). */
  setSubmerged(now: boolean): void {
    if (now && !this.wasSubmerged) {
      const b = this.arcadeBody;
      b.setVelocity(b.velocity.x * CONST.WATER_BRAKE, b.velocity.y * CONST.WATER_BRAKE);
    }
    this.submerged = now;
    this.moveScale = now ? CONST.SUBMERGED : 1;
    this.wasSubmerged = now;
  }

  kill(): void {
    if (!this.alive) return;
    this.alive = false;
    this.ninjaState = 'dead';
    const b = this.arcadeBody;
    b.setVelocity(0, 0);
    b.enable = false;
    this.setActive(false);
    this.setAlpha(0);
  }

  revive(x: number, y: number, o: Orientation): void {
    this.alive = true;
    this.ninjaState = 'idle';
    this.jumpVelocity = 0;
    this.bounceVelocity = 0;
    this.setPosition(x, y);
    this.setActive(true);
    this.setAlpha(1);
    const b = this.arcadeBody;
    b.enable = true;
    b.reset(x, y);
    this.spawnPop(o);
  }

  setNormous(on: boolean): void {
    this.normous = on;
    this.setScale(this.baseScale * (on ? CONST.NORMOUS : 1));
  }

  /** Core per-frame integration in the rotated local frame. */
  tick(dt: number, o: Orientation, moveDir: number, renderAngle: number): void {
    if (!this.alive) return;
    const b = this.arcadeBody;
    const grounded = this.isGrounded(o);

    // Decay jump / bounce scalars at JUMP_DECAY units/sec.
    this.jumpVelocity = Math.max(0, this.jumpVelocity - dt * CONST.JUMP_DECAY);
    this.bounceVelocity = Math.max(0, this.bounceVelocity - dt * CONST.JUMP_DECAY);

    const moveSpeed = (grounded ? CONST.MOVE_GROUND : CONST.MOVE_AIR) + (this.nitro ? CONST.NITRO : 0);

    // No acceleration, no friction: snap the horizontal component.
    let localVx = moveSpeed * moveDir;
    // Gravity is a constant fall (localVy = -GRAVITY at rest) plus jump/bounce.
    let localVy = this.jumpVelocity - CONST.GRAVITY + this.bounceVelocity;

    // Water slows the whole vector.
    localVx *= this.moveScale;
    localVy *= this.moveScale;

    const world = toWorld(localVx, localVy, o);
    b.setVelocity(world.x * CONST.SCALE, world.y * CONST.SCALE);

    // Visual: keep the ninja upright relative to the rotating camera.
    this.setRotation(renderAngle);
    this.setFlipX(this.facing === -1);

    // State machine.
    if (this.submerged) {
      this.ninjaState = 'swim';
    } else if (grounded) {
      this.ninjaState = moveDir !== 0 ? 'run' : 'idle';
    } else {
      this.ninjaState = localVy > 0 ? 'jump' : 'fall';
    }
    if (moveDir > 0) this.facing = 1;
    else if (moveDir < 0) this.facing = -1;
  }
}
