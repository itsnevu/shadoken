// ============================================================================
// RemoteGhost — a translucent representation of another player's ninja, driven
// by PlayerSnapshot updates from the net layer. Position is interpolated toward
// the latest snapshot so movement stays smooth between ~15Hz updates.
// ============================================================================

import Phaser from 'phaser';
import type { PlayerSnapshot } from '../../types';
import { CONST } from '../constants';

export class RemoteGhost {
  readonly sessionId: string;
  private readonly scene: Phaser.Scene;
  private readonly sprite: Phaser.Physics.Arcade.Sprite | Phaser.GameObjects.Sprite;
  private readonly label: Phaser.GameObjects.Text;
  private targetX: number;
  private targetY: number;
  private targetAngle: number;
  private facing: 1 | -1 = 1;
  private alive = true;
  private trailTimer = 0;

  constructor(scene: Phaser.Scene, snap: PlayerSnapshot, tint: number, scale: number) {
    this.sessionId = snap.sessionId;
    this.scene = scene;
    this.targetX = snap.x;
    this.targetY = snap.y;
    this.targetAngle = Phaser.Math.DegToRad(snap.angle);

    const s = scene.add.sprite(snap.x, snap.y, 'ninja');
    s.setOrigin(0.5, 0.55);
    s.setScale(scale);
    s.setTint(tint);
    s.setAlpha(0.5);
    s.setDepth(15);
    this.sprite = s;

    this.label = scene.add
      .text(snap.x, snap.y, snap.name, {
        fontFamily: 'Trebuchet MS, system-ui, sans-serif',
        fontSize: '11px',
        color: '#b6bfc9',
      })
      .setOrigin(0.5, 1.6)
      .setDepth(16)
      .setAlpha(0.85);
  }

  update(snap: PlayerSnapshot): void {
    this.targetX = snap.x;
    this.targetY = snap.y;
    this.targetAngle = Phaser.Math.DegToRad(snap.angle);
    this.facing = snap.facing;
    if (this.alive !== snap.alive) {
      this.alive = snap.alive;
      this.sprite.setAlpha(snap.alive ? 0.5 : 0.12);
    }
    this.label.setText(snap.name);
  }

  /** Smoothly interpolate toward the latest target. */
  interpolate(dt: number): void {
    const t = Math.min(1, dt * CONST.CAM_FOLLOW_LERP * 1.5);
    const x = Phaser.Math.Linear(this.sprite.x, this.targetX, t);
    const y = Phaser.Math.Linear(this.sprite.y, this.targetY, t);
    this.sprite.setPosition(x, y);
    this.sprite.setRotation(Phaser.Math.Angle.RotateTo(this.sprite.rotation, this.targetAngle, dt * 9));
    this.sprite.setFlipX(this.facing === -1);
    this.label.setPosition(x, y);

    // Spawn afterimage trails if moving
    const dx = Math.abs(x - this.targetX);
    const dy = Math.abs(y - this.targetY);
    if (dx > 0.1 || dy > 0.1) {
      this.trailTimer += dt;
      if (this.trailTimer >= 0.08) {
        this.trailTimer = 0;
        this.spawnTrailAfterimage();
      }
    } else {
      this.trailTimer = 0;
    }
  }

  private spawnTrailAfterimage(): void {
    try {
      if (!this.alive) return;
      const afterimage = this.scene.add.sprite(this.sprite.x, this.sprite.y, 'ninja');
      afterimage.setScale(this.sprite.scaleX, this.sprite.scaleY);
      afterimage.setOrigin(this.sprite.originX, this.sprite.originY);
      afterimage.setRotation(this.sprite.rotation);
      afterimage.setFlipX(this.sprite.flipX);
      afterimage.setTint(this.sprite.tintTopLeft || this.sprite.tint);
      afterimage.setAlpha(0.18); // Faded transluscent ghost trail
      afterimage.setDepth(this.sprite.depth - 1);

      this.scene.tweens.add({
        targets: afterimage,
        alpha: 0,
        duration: 320,
        onComplete: () => afterimage.destroy()
      });
    } catch (e) {
      /* ignore */
    }
  }

  destroy(): void {
    this.sprite.destroy();
    this.label.destroy();
  }
}
