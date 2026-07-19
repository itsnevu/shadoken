// ============================================================================
// Seeded endless chamber generator.
//
// Produces a forward-scrolling (+x) enclosed tunnel: a continuous floor and
// ceiling, plus a MIDDLE boundary "rib" wall at every chamber edge. The rib
// leaves a gap at the floor and at the ceiling (so you can walk forward whether
// gravity points down OR up) while its solid middle gives SIDEWAYS gravity a
// vertical face to cling to — so all four orientations always have a surface.
//
// Generation is fully deterministic from the seed: chambers are built in
// ascending index order using one RandomDataGenerator, and never regenerated
// (no backtracking), so every client sharing a seed builds the identical world.
// ============================================================================

import Phaser from 'phaser';
import { CONST, CEIL_BOT } from '../constants';

export type HazardKind = 'saw' | 'smasher' | 'lava' | 'bounce' | 'shooter';
export type PickupKind = 'coin' | 'nitro' | 'normous' | 'normal' | 'new' | 'mystery';

interface Shooter {
  x: number;
  y: number;
  dx: number;
  dy: number;
  timer: number;
}

interface Smasher {
  img: Phaser.Physics.Arcade.Sprite;
  baseY: number;
  range: number;
  speed: number;
  phase: number;
}

interface Chamber {
  index: number;
  x0: number;
  width: number;
  entered: boolean;
  objects: Phaser.GameObjects.GameObject[];
  waters: Phaser.Geom.Rectangle[];
  saws: Phaser.Physics.Arcade.Sprite[];
  smashers: Smasher[];
  shooters: Shooter[];
}

const AHEAD = CONST.CHAMBER_W * 2 + 500;
const BEHIND = CONST.CHAMBER_W;
const ENTRY_OFFSET = 60;

export class ChamberManager {
  /** Chambers entered beyond the first (drives scoring). */
  enteredCount = 0;
  /** Live water rectangles (world space) — PlayScene tests ninjas against these. */
  readonly waterRects: Phaser.Geom.Rectangle[] = [];

  private readonly rng: Phaser.Math.RandomDataGenerator;
  private readonly chambers: Chamber[] = [];
  private nextIndex = 0;
  private builtToX = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    seed: number,
    private readonly platforms: Phaser.Physics.Arcade.StaticGroup,
    private readonly hazards: Phaser.Physics.Arcade.StaticGroup,
    private readonly pickups: Phaser.Physics.Arcade.StaticGroup,
    private readonly arrows: Phaser.Physics.Arcade.Group,
  ) {
    this.rng = new Phaser.Math.RandomDataGenerator([String(seed)]);
  }

  /** Farthest generated x (used to place initial camera / spawn). */
  get farthestX(): number {
    return this.builtToX;
  }

  update(dt: number, leaderX: number): void {
    while (this.builtToX < leaderX + AHEAD) this.buildNextChamber();

    while (
      this.chambers.length > 0 &&
      this.chambers[0]!.x0 + this.chambers[0]!.width < leaderX - BEHIND
    ) {
      this.destroyChamber(this.chambers.shift()!);
    }

    for (const c of this.chambers) {
      if (!c.entered && leaderX >= c.x0 + ENTRY_OFFSET) {
        c.entered = true;
        if (c.index > 0) this.enteredCount++;
      }
    }

    const now = this.scene.time.now;
    const spin = Phaser.Math.DegToRad(CONST.SAW_SPIN) * dt;
    for (const c of this.chambers) {
      if (Math.abs(c.x0 + c.width / 2 - leaderX) > CONST.CHAMBER_W * 1.4) continue;
      for (const saw of c.saws) saw.rotation += spin;
      for (const sm of c.smashers) {
        sm.img.y = sm.baseY + Math.sin((now / 1000) * sm.speed + sm.phase) * sm.range;
        (sm.img.body as Phaser.Physics.Arcade.StaticBody).updateFromGameObject();
      }
      for (const sh of c.shooters) {
        sh.timer += dt;
        if (sh.timer >= CONST.ARROW_FIRE) {
          sh.timer = 0;
          this.fireArrow(sh, now);
        }
      }
    }

    // Expire arrows past their lifespan.
    for (const a of this.arrows.getChildren()) {
      const arrow = a as Phaser.Physics.Arcade.Image;
      if (now >= (arrow.getData('die') as number)) arrow.destroy();
    }
  }

  private fireArrow(sh: Shooter, now: number): void {
    const arrow = this.scene.physics.add.image(sh.x, sh.y, 'arrow');
    arrow.setDepth(18);
    arrow.setData('die', now + CONST.ARROW_LIFE * 1000);
    const body = arrow.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setSize(14, 5);
    arrow.setVelocity(sh.dx * CONST.ARROW_SPEED * CONST.SCALE, sh.dy * CONST.ARROW_SPEED * CONST.SCALE);
    arrow.setRotation(Math.atan2(sh.dy, sh.dx));
    this.arrows.add(arrow);
  }

  // ---- construction --------------------------------------------------------

  private buildNextChamber(): void {
    const i = this.nextIndex++;
    const x0 = i * CONST.CHAMBER_W;
    const w = CONST.CHAMBER_W;
    const c: Chamber = {
      index: i,
      x0,
      width: w,
      entered: false,
      objects: [],
      waters: [],
      saws: [],
      smashers: [],
      shooters: [],
    };

    const floorTop = CONST.FLOOR_TOP;
    const ceilBot = CEIL_BOT;

    // Optional floor gap (with lava) for i >= 2.
    let gapA = 0;
    let gapB = 0;
    const hasGap = i >= 2 && this.rng.frac() < 0.26;
    if (hasGap) {
      const gw = this.rng.between(90, 150);
      const gcx = x0 + this.rng.between(Math.floor(w * 0.35), Math.floor(w * 0.65));
      gapA = gcx - gw / 2;
      gapB = gcx + gw / 2;
      this.addLava(c, gapA, gapB);
    }

    // Floor (one or two segments around the gap).
    if (hasGap) {
      this.addSolid(c, x0, gapA, floorTop, floorTop + CONST.FLOOR_THICK);
      this.addSolid(c, gapB, x0 + w, floorTop, floorTop + CONST.FLOOR_THICK);
    } else {
      this.addSolid(c, x0, x0 + w, floorTop, floorTop + CONST.FLOOR_THICK);
    }

    // Ceiling (continuous).
    this.addSolid(c, x0, x0 + w, ceilBot - CONST.FLOOR_THICK, ceilBot);

    // Left cap for the very first chamber so nobody spills out the start.
    if (i === 0) {
      this.addSolid(c, x0 - CONST.WALL_THICK, x0, ceilBot, floorTop);
    }

    // Right boundary rib (solid middle, gaps at floor & ceiling).
    const rx = x0 + w;
    const ribTop = ceilBot + 110;
    const ribBot = floorTop - 110;
    this.addSolid(c, rx - CONST.WALL_THICK / 2, rx + CONST.WALL_THICK / 2, ribTop, ribBot);

    if (i === 0) {
      // Friendly starting cap — a couple of coins, no hazards.
      this.addPickup(c, x0 + w * 0.55, floorTop - 40, 'coin');
      this.addPickup(c, x0 + w * 0.7, floorTop - 40, 'coin');
    } else {
      this.populate(c);
    }

    this.chambers.push(c);
    this.builtToX = x0 + w;
  }

  private populate(c: Chamber): void {
    const { x0, width: w } = c;
    const floorTop = CONST.FLOOR_TOP;
    const midX = x0 + w / 2;
    const midY = floorTop - CONST.CORRIDOR_H / 2;

    // A floating platform sometimes.
    if (this.rng.frac() < 0.45) {
      const px = x0 + this.rng.between(Math.floor(w * 0.3), Math.floor(w * 0.7));
      const py = floorTop - this.rng.between(120, 200);
      const pw = this.rng.between(90, 160);
      this.addSolid(c, px - pw / 2, px + pw / 2, py, py + 22);
    }

    // A water pool sometimes.
    if (this.rng.frac() < 0.3) {
      const pw = this.rng.between(120, 220);
      const pcx = x0 + this.rng.between(Math.floor(w * 0.35), Math.floor(w * 0.65));
      this.addWater(c, pcx - pw / 2, pcx + pw / 2, floorTop - 90, floorTop);
    }

    // One hazard.
    const hazard = this.rng.pick<HazardKind>(['saw', 'shooter', 'smasher', 'bounce', 'saw']);
    switch (hazard) {
      case 'saw':
        this.addSaw(c, midX, floorTop - this.rng.between(30, 120));
        break;
      case 'smasher':
        this.addSmasher(c, midX, floorTop);
        break;
      case 'bounce':
        this.addBounce(c, midX, floorTop);
        break;
      case 'shooter':
        this.addShooter(c, x0 + 70, midY, 1, 0);
        break;
      case 'lava':
        break;
    }

    // One pickup.
    const kind = this.rng.weightedPick<PickupKind>(['coin', 'coin', 'nitro', 'normous', 'normal', 'new', 'mystery']);
    this.addPickup(c, midX + this.rng.between(-120, 120), floorTop - this.rng.between(40, 150), kind);
  }

  // ---- object factories ----------------------------------------------------

  /** Solid collidable slab spanning [ax..bx] x [ay..by]. */
  private addSolid(c: Chamber, ax: number, bx: number, ay: number, by: number): void {
    const cx = (ax + bx) / 2;
    const cy = (ay + by) / 2;
    const obj = this.platforms.create(cx, cy, 'tile') as Phaser.Physics.Arcade.Sprite;
    obj.setDisplaySize(bx - ax, by - ay);
    obj.setDepth(4);
    (obj.body as Phaser.Physics.Arcade.StaticBody).updateFromGameObject();
    c.objects.push(obj);
  }

  private addLava(c: Chamber, ax: number, bx: number): void {
    const cx = (ax + bx) / 2;
    const cy = CONST.FLOOR_TOP + 24;
    const obj = this.hazards.create(cx, cy, 'lava') as Phaser.Physics.Arcade.Sprite;
    obj.setDisplaySize(bx - ax, 90);
    obj.setDepth(5);
    obj.setData('kind', 'lava' as HazardKind);
    (obj.body as Phaser.Physics.Arcade.StaticBody).updateFromGameObject();
    c.objects.push(obj);
  }

  private addSaw(c: Chamber, x: number, y: number): void {
    const obj = this.hazards.create(x, y, 'saw') as Phaser.Physics.Arcade.Sprite;
    obj.setDepth(12);
    obj.setData('kind', 'saw' as HazardKind);
    const body = obj.body as Phaser.Physics.Arcade.StaticBody;
    body.setCircle(obj.width / 2);
    body.updateFromGameObject();
    c.objects.push(obj);
    c.saws.push(obj);
  }

  private addSmasher(c: Chamber, x: number, floorTop: number): void {
    const baseY = floorTop - CONST.CORRIDOR_H / 2;
    const obj = this.hazards.create(x, baseY, 'smasher') as Phaser.Physics.Arcade.Sprite;
    obj.setDepth(11);
    obj.setData('kind', 'smasher' as HazardKind);
    (obj.body as Phaser.Physics.Arcade.StaticBody).updateFromGameObject();
    c.objects.push(obj);
    c.smashers.push({ img: obj, baseY, range: CONST.CORRIDOR_H / 2 - 60, speed: 2.4, phase: this.rng.frac() * Math.PI * 2 });
  }

  private addBounce(c: Chamber, x: number, floorTop: number): void {
    const obj = this.hazards.create(x, floorTop - 8, 'bounce') as Phaser.Physics.Arcade.Sprite;
    obj.setDisplaySize(80, 18);
    obj.setDepth(6);
    obj.setData('kind', 'bounce' as HazardKind);
    (obj.body as Phaser.Physics.Arcade.StaticBody).updateFromGameObject();
    c.objects.push(obj);
  }

  private addShooter(c: Chamber, x: number, y: number, dx: number, dy: number): void {
    const obj = this.hazards.create(x, y, 'shooter') as Phaser.Physics.Arcade.Sprite;
    obj.setDepth(7);
    obj.setData('kind', 'shooter' as HazardKind);
    (obj.body as Phaser.Physics.Arcade.StaticBody).updateFromGameObject();
    c.objects.push(obj);
    c.shooters.push({ x: x + dx * 20, y: y + dy * 20, dx, dy, timer: this.rng.frac() * CONST.ARROW_FIRE });
  }

  private addWater(c: Chamber, ax: number, bx: number, ay: number, by: number): void {
    const rect = new Phaser.Geom.Rectangle(ax, ay, bx - ax, by - ay);
    this.waterRects.push(rect);
    c.waters.push(rect);
    const vis = this.scene.add.tileSprite((ax + bx) / 2, (ay + by) / 2, bx - ax, by - ay, 'water');
    vis.setAlpha(0.55);
    vis.setDepth(8);
    c.objects.push(vis);
  }

  private addPickup(c: Chamber, x: number, y: number, kind: PickupKind): void {
    const tex =
      kind === 'coin' ? 'pu_coin'
      : kind === 'nitro' ? 'pu_nitro'
      : kind === 'normous' ? 'pu_normous'
      : kind === 'normal' ? 'pu_normal'
      : kind === 'mystery' ? 'pu_mystery'
      : 'pu_new';
    const obj = this.pickups.create(x, y, tex) as Phaser.Physics.Arcade.Sprite;
    obj.setDepth(14);
    obj.setData('kind', kind);
    const body = obj.body as Phaser.Physics.Arcade.StaticBody;
    body.setCircle(obj.width / 2);
    body.updateFromGameObject();
    this.scene.tweens.add({ targets: obj, y: y - 8, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    c.objects.push(obj);
  }

  private destroyChamber(c: Chamber): void {
    for (const rect of c.waters) {
      const idx = this.waterRects.indexOf(rect);
      if (idx >= 0) this.waterRects.splice(idx, 1);
    }
    for (const o of c.objects) o.destroy();
  }
}
