// ============================================================================
// PlayScene — the core game loop.
//
// A swarm of ninjas (the "school") is controlled in lockstep: Move / Jump /
// Rotate drive every living ninja. Strategy A gravity/rotation: the world stays
// axis-aligned, we track an integer orientation 0..3 and rotate the CAMERA to
// keep gravity looking "down". Endless seeded chambers scroll forward; obstacles
// kill on contact; pickups affect the whole swarm; remote players appear as
// ghosts. Score = alive-count per chamber entered + per powerup.
// ============================================================================

import Phaser from 'phaser';
import { bus } from '../../events';
import { appState } from '../../app-state';
import { VIEW } from '../../config';
import type { GameLaunchOptions, Orientation, RunResult } from '../../types';
import { CONST } from '../constants';
import { ChamberManager, type HazardKind, type PickupKind } from '../systems/chambers';
import { gravityDir, renderAngleFor, rotateOrientation } from '../systems/orientation';
import { Ninja } from '../entities/Ninja';
import { RemoteGhost } from '../entities/RemoteGhost';
import { REG, type HudData, type NetBridge, type VirtualInput } from '../shared';

const SWARM = 24;
const SKINS = [0xffffff, 0xff8a70, 0x9fe0ff, 0xffd27f, 0xc4a0ff, 0x8effb0, 0xff9fd0];
const SNAPSHOT_MS = 66; // ~15 Hz
const FONT = 'Trebuchet MS, system-ui, sans-serif';

export class PlayScene extends Phaser.Scene {
  private opts!: GameLaunchOptions;
  private bridge!: NetBridge;
  private input$!: VirtualInput;
  private rng!: Phaser.Math.RandomDataGenerator;

  private ninjas: Ninja[] = [];
  private leader!: Ninja;
  private orientation: Orientation = 0;

  private platforms!: Phaser.Physics.Arcade.StaticGroup;
  private hazards!: Phaser.Physics.Arcade.StaticGroup;
  private pickups!: Phaser.Physics.Arcade.StaticGroup;
  private arrows!: Phaser.Physics.Arcade.Group;
  private chambers!: ChamberManager;

  // camera
  private camFocus = new Phaser.Math.Vector2();
  private camAngle = 0;
  private targetCamAngle = 0;

  // nausea (rotation limiter)
  private nausea = 0;
  private nauseous = false;

  // scoring / state
  private score = 0;
  private prevChambers = 0;
  private startedAt = 0;
  private over = false;

  // input edges
  private keyLeft?: Phaser.Input.Keyboard.Key;
  private keyRight?: Phaser.Input.Keyboard.Key;
  private keyA?: Phaser.Input.Keyboard.Key;
  private keyD?: Phaser.Input.Keyboard.Key;
  private keyJump?: Phaser.Input.Keyboard.Key;
  private keyRotate?: Phaser.Input.Keyboard.Key;
  private lastMoveDir = 1;

  // multiplayer ghosts
  private ghosts = new Map<string, RemoteGhost>();
  private snapAccum = 0;

  constructor() {
    super('Play');
  }

  create(): void {
    this.opts = this.registry.get(REG.launchOptions) as GameLaunchOptions;
    this.bridge = this.registry.get(REG.netBridge) as NetBridge;

    let input = this.registry.get(REG.input) as VirtualInput | undefined;
    if (!input) {
      input = { left: false, right: false, jump: false, rotate: false };
      this.registry.set(REG.input, input);
    }
    this.input$ = input;
    input.left = input.right = input.jump = input.rotate = false;

    this.rng = new Phaser.Math.RandomDataGenerator([String(this.opts.seed)]);
    this.orientation = 0;
    this.camAngle = 0;
    this.targetCamAngle = 0;
    this.nausea = 0;
    this.nauseous = false;
    this.score = 0;
    this.prevChambers = 0;
    this.over = false;
    this.startedAt = this.time.now;

    // ---- physics groups ----
    this.platforms = this.physics.add.staticGroup();
    this.hazards = this.physics.add.staticGroup();
    this.pickups = this.physics.add.staticGroup();
    this.arrows = this.physics.add.group({ allowGravity: false });

    this.chambers = new ChamberManager(
      this,
      this.opts.seed,
      this.platforms,
      this.hazards,
      this.pickups,
      this.arrows,
    );

    // Build the opening stretch so the floor exists before ninjas drop in.
    const spawnX = 150;
    this.chambers.update(0, spawnX);

    // ---- spawn the swarm ----
    const floorTop = CONST.FLOOR_TOP;
    for (let i = 0; i < SWARM; i++) {
      const nx = spawnX + this.rng.between(-40, 60);
      const ny = floorTop - 40 - this.rng.between(0, 60);
      const tint = SKINS[i % SKINS.length]!;
      const n = new Ninja(this, nx, ny, tint, 1);
      n.facing = 1;
      this.ninjas.push(n);
    }
    this.leader = this.ninjas[0]!;
    this.leader.isLeader = true;
    this.camFocus.set(this.leader.x, this.leader.y);

    // ---- collisions ----
    this.physics.add.collider(this.ninjas, this.platforms);
    this.physics.add.overlap(this.ninjas, this.hazards, this.onHazard, undefined, this);
    this.physics.add.overlap(this.ninjas, this.pickups, this.onPickup, undefined, this);
    this.physics.add.overlap(this.ninjas, this.arrows, this.onArrow, undefined, this);

    // ---- camera ----
    const cam = this.cameras.main;
    cam.setBackgroundColor('#16191d');
    cam.centerOn(this.leader.x, this.leader.y - 40);

    // ---- keyboard ----
    const kb = this.input.keyboard;
    if (kb) {
      this.keyLeft = kb.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT);
      this.keyRight = kb.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT);
      this.keyA = kb.addKey(Phaser.Input.Keyboard.KeyCodes.A);
      this.keyD = kb.addKey(Phaser.Input.Keyboard.KeyCodes.D);
      this.keyJump = kb.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
      this.keyRotate = kb.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
      kb.on('keydown-UP', () => this.requestJump());
      kb.on('keydown-W', () => this.requestJump());
      kb.on('keydown-R', () => this.requestRotate());
      // SHIFT edge
      this.keyRotate.on('down', () => this.requestRotate());
      this.keyJump.on('down', () => this.requestJump());
    }

    this.publishHud();
    this.events.on('shutdown', () => this.cleanup());
  }

  // ---- input edges ----
  private jumpQueued = false;
  private rotateQueued = false;
  private requestJump(): void {
    this.jumpQueued = true;
  }
  private requestRotate(): void {
    this.rotateQueued = true;
  }

  update(_time: number, deltaMs: number): void {
    if (this.over) return;
    const dt = Math.min(deltaMs / 1000, 1 / 30);

    // ----- resolve input -----
    let moveDir = 0;
    if (!this.nauseous) {
      const left = this.input$.left || this.isDown(this.keyLeft) || this.isDown(this.keyA);
      const right = this.input$.right || this.isDown(this.keyRight) || this.isDown(this.keyD);
      moveDir = (right ? 1 : 0) - (left ? 1 : 0);
      if (this.input$.jump) {
        this.jumpQueued = true;
        this.input$.jump = false;
      }
      if (this.input$.rotate) {
        this.rotateQueued = true;
        this.input$.rotate = false;
      }
    } else {
      this.input$.jump = false;
      this.input$.rotate = false;
    }
    if (moveDir !== 0) this.lastMoveDir = moveDir;

    if (this.jumpQueued && !this.nauseous) this.doJump();
    if (this.rotateQueued && !this.nauseous) this.doRotate(this.lastMoveDir);
    this.jumpQueued = false;
    this.rotateQueued = false;

    // ----- world streaming -----
    this.chambers.update(dt, this.leader.x);

    // ----- ninja simulation -----
    const renderAngle = renderAngleFor(this.orientation);
    const centroid = this.centroid();
    const g = gravityDir(this.orientation);
    let alive = 0;
    for (const n of this.ninjas) {
      if (!n.alive) continue;
      alive++;
      this.applyWater(n);
      n.tick(dt, this.orientation, moveDir, renderAngle);
      this.applyGrouping(n, centroid, g);
      // stray culling
      if (Phaser.Math.Distance.Between(n.x, n.y, centroid.x, centroid.y) > CONST.STRAY_KILL_DIST * CONST.SCALE) {
        n.kill();
      }
    }

    // Leader may have died — hand off to any survivor.
    if (!this.leader.alive) {
      const next = this.ninjas.find((n) => n.alive);
      if (next) {
        this.leader.isLeader = false;
        this.leader = next;
        this.leader.isLeader = true;
      }
    }

    // ----- scoring on chamber entry -----
    if (this.chambers.enteredCount > this.prevChambers) {
      const gained = this.chambers.enteredCount - this.prevChambers;
      this.score += gained * Math.max(1, alive);
      this.prevChambers = this.chambers.enteredCount;
    }

    // ----- camera -----
    this.updateCamera(dt);

    // ----- multiplayer -----
    this.updateGhosts(dt);
    this.emitSnapshot(dt, alive);

    // ----- HUD + game over -----
    this.publishHud(alive);
    if (alive === 0) this.gameOver();
  }

  private isDown(k?: Phaser.Input.Keyboard.Key): boolean {
    return !!k && k.isDown;
  }

  private doJump(): void {
    for (const n of this.ninjas) {
      if (n.alive) n.tryJump(this.orientation, this.rng);
    }
    this.playSfx('sfx_ninja', 0.3);
  }

  private doRotate(dir: number): void {
    this.orientation = rotateOrientation(this.orientation, dir);
    this.targetCamAngle += -Math.sign(dir) * (Math.PI / 2);
    this.nausea += CONST.NAUSEA_PER_ROTATE;
    if (this.nausea >= 1) this.nauseous = true;
  }

  // ---- water ----
  private applyWater(n: Ninja): void {
    let inWater = false;
    for (const r of this.chambers.waterRects) {
      if (Phaser.Geom.Rectangle.Contains(r, n.x, n.y)) {
        inWater = true;
        break;
      }
    }
    if (inWater !== n.submerged) {
      n.setSubmerged(inWater);
      if (inWater) this.playSfx('sfx_splash', 0.4);
    }
  }

  // ---- swarm cohesion (spec §1.6) ----
  private applyGrouping(n: Ninja, centroid: Phaser.Math.Vector2, _g: { x: number; y: number }): void {
    if (n.isGrounded(this.orientation)) return;
    const dx = centroid.x - n.x;
    const dy = centroid.y - n.y;
    const distSq = dx * dx + dy * dy;
    const thr = CONST.GROUP_DIST * CONST.SCALE;
    if (distSq < thr * thr) return;
    const d = Math.sqrt(distSq) || 1;
    const b = n.arcadeBody;
    const speedInDir = (b.velocity.x * dx + b.velocity.y * dy) / d;
    const boost = Math.abs(speedInDir) * CONST.GROUP_BOOST;
    b.setVelocity(b.velocity.x + (dx / d) * boost, b.velocity.y + (dy / d) * boost);
  }

  private centroid(): Phaser.Math.Vector2 {
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (const nj of this.ninjas) {
      if (nj.alive) {
        sx += nj.x;
        sy += nj.y;
        n++;
      }
    }
    if (n === 0) return this.camFocus.clone();
    return new Phaser.Math.Vector2(sx / n, sy / n);
  }

  // ---- collision handlers ----
  private onHazard: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (obj1, obj2) => {
    const n = obj1 as Ninja;
    const hz = obj2 as Phaser.Physics.Arcade.Sprite;
    if (!n.alive) return;
    const kind = hz.getData('kind') as HazardKind;
    if (kind === 'bounce') {
      if (n.isGrounded(this.orientation) || true) n.applyBounce();
    } else if (kind === 'shooter') {
      // the emitter block is not itself lethal
    } else {
      n.kill();
      this.onNinjaKilled();
    }
  };

  private onArrow: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (obj1, obj2) => {
    const n = obj1 as Ninja;
    const arrow = obj2 as Phaser.Physics.Arcade.Image;
    if (!n.alive) return;
    n.kill();
    arrow.destroy();
    this.onNinjaKilled();
  };

  private onPickup: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (obj1, obj2) => {
    const n = obj1 as Ninja;
    const pu = obj2 as Phaser.Physics.Arcade.Sprite;
    if (!n.alive || !pu.active) return;
    const kind = pu.getData('kind') as PickupKind;
    this.applyPickup(kind);
    pu.destroy();
  };

  private applyPickup(kind: PickupKind): void {
    switch (kind) {
      case 'nitro':
        for (const n of this.ninjas) n.nitro = true;
        break;
      case 'normous':
        for (const n of this.ninjas) n.setNormous(true);
        break;
      case 'normal':
        for (const n of this.ninjas) {
          n.nitro = false;
          n.setNormous(false);
        }
        break;
      case 'new':
        this.reviveNinjas(CONST.REVIVE);
        break;
      case 'coin':
        break;
    }
    if (kind !== 'coin') {
      const alive = this.ninjas.filter((n) => n.alive).length;
      this.score += Math.max(1, alive);
    }
    this.playSfx('sfx_ninja', 0.25);
  }

  private reviveNinjas(count: number): void {
    let revived = 0;
    for (const n of this.ninjas) {
      if (revived >= count) break;
      if (!n.alive) {
        n.revive(this.leader.x + this.rng.between(-20, 20), this.leader.y - 20, this.orientation);
        revived++;
      }
    }
  }

  private onNinjaKilled(): void {
    this.cameras.main.shake(180, 0.004);
    this.playSfx('sfx_smasher', 0.2);
  }

  // ---- camera ----
  private updateCamera(dt: number): void {
    const cam = this.cameras.main;
    const target = this.centroid();
    const tf = Math.min(1, dt * CONST.CAM_FOLLOW_LERP);
    this.camFocus.x = Phaser.Math.Linear(this.camFocus.x, target.x, tf);
    this.camFocus.y = Phaser.Math.Linear(this.camFocus.y, target.y, tf);
    cam.centerOn(this.camFocus.x, this.camFocus.y);

    if (this.nauseous) {
      this.camAngle += Phaser.Math.DegToRad(CONST.NAUSEA_SPIN) * dt * Math.sign(this.lastMoveDir || 1);
      this.nausea = Math.max(0, this.nausea - CONST.NAUSEA_COOL * dt);
      if (this.nausea <= 0) {
        this.nauseous = false;
        // snap the render angle back onto the orientation grid
        this.targetCamAngle = -this.orientation * (Math.PI / 2);
        this.camAngle = this.targetCamAngle;
      }
    } else {
      this.nausea = Math.max(0, this.nausea - CONST.NAUSEA_COOL * dt);
      this.camAngle = Phaser.Math.Angle.RotateTo(this.camAngle, this.targetCamAngle, dt * CONST.CAM_ROT_LERP);
    }
    cam.setRotation(this.camAngle);
  }

  // ---- multiplayer ----
  private updateGhosts(dt: number): void {
    if (!this.bridge.multiplayer) return;
    const seen = new Set<string>();
    for (const snap of this.bridge.remote) {
      seen.add(snap.sessionId);
      let ghost = this.ghosts.get(snap.sessionId);
      if (!ghost) {
        ghost = new RemoteGhost(this, snap, 0xab9ff2, 1);
        this.ghosts.set(snap.sessionId, ghost);
      }
      ghost.update(snap);
    }
    for (const [id, ghost] of this.ghosts) {
      if (!seen.has(id)) {
        ghost.destroy();
        this.ghosts.delete(id);
      }
    }
    for (const ghost of this.ghosts.values()) ghost.interpolate(dt);
  }

  private emitSnapshot(dt: number, alive: number): void {
    if (!this.bridge.multiplayer || !this.bridge.emit) return;
    this.snapAccum += dt * 1000;
    if (this.snapAccum < SNAPSHOT_MS) return;
    this.snapAccum = 0;
    const b = this.leader.arcadeBody;
    this.bridge.emit({
      x: this.leader.x,
      y: this.leader.y,
      angle: this.orientation * 90,
      vx: b.velocity.x,
      vy: b.velocity.y,
      facing: this.leader.facing,
      state: this.leader.ninjaState,
      score: this.score,
      alive: alive > 0,
    });
  }

  // ---- HUD ----
  private publishHud(alive?: number): void {
    const a = alive ?? this.ninjas.filter((n) => n.alive).length;
    const hud: HudData = {
      score: this.score,
      alive: a,
      total: SWARM,
      chambers: this.chambers?.enteredCount ?? 0,
      best: Math.max(appState.bestScore, this.score),
      players: this.bridge?.multiplayer ? this.bridge.remote.length + 1 : 1,
      over: this.over,
    };
    this.registry.set(REG.hud, hud);
  }

  // ---- game over ----
  private gameOver(): void {
    if (this.over) return;
    this.over = true;
    const result: RunResult = {
      score: this.score,
      chambers: this.chambers.enteredCount,
      distance: Math.round(this.leader.x),
      survivedMs: Math.round(this.time.now - this.startedAt),
    };
    appState.recordScore(result.score);
    bus.emit('game:over', result);
    this.publishHud(0);
    this.showGameOver(result);
  }

  private showGameOver(result: RunResult): void {
    this.scene.bringToTop();
    const cam = this.cameras.main;
    const cx = cam.midPoint.x;
    const cy = cam.midPoint.y;
    // Undo camera rotation for a readable overlay.
    const panel = this.add.container(cx, cy).setDepth(200).setRotation(-this.camAngle);

    const bg = this.add.rectangle(0, 0, VIEW.width, VIEW.height, 0x0c0e11, 0.82);
    bg.setInteractive();
    const card = this.add.rectangle(0, 0, 420, 300, 0x1b1f24, 1).setStrokeStyle(2, 0xe23b2e, 1);

    const title = this.add
      .text(0, -108, 'ALL NINJAS DOWN', { fontFamily: FONT, fontSize: '34px', fontStyle: 'bold', color: '#ff5a3c' })
      .setOrigin(0.5);
    const scoreT = this.add
      .text(0, -50, `SCORE  ${result.score}`, { fontFamily: FONT, fontSize: '26px', color: '#ffffff' })
      .setOrigin(0.5);
    const meta = this.add
      .text(0, -12, `${result.chambers} chambers  ·  best ${appState.bestScore}`, {
        fontFamily: FONT,
        fontSize: '15px',
        color: '#b6bfc9',
      })
      .setOrigin(0.5);

    const restart = this.makeOverlayButton(0, 44, 'RESTART', 0xe23b2e, () => {
      this.ghosts.forEach((g) => g.destroy());
      this.ghosts.clear();
      this.scene.restart();
    });
    const exit = this.makeOverlayButton(0, 104, 'EXIT TO MENU', 0x2e353e, () => {
      bus.emit('game:exit', undefined);
    });

    panel.add([bg, card, title, scoreT, meta, restart, exit]);
  }

  private makeOverlayButton(
    x: number,
    y: number,
    label: string,
    color: number,
    onClick: () => void,
  ): Phaser.GameObjects.Container {
    const w = 240;
    const h = 48;
    const rect = this.add.rectangle(0, 0, w, h, color, 1).setStrokeStyle(1, 0x000000, 0.3);
    const txt = this.add
      .text(0, 0, label, { fontFamily: FONT, fontSize: '18px', fontStyle: 'bold', color: '#ffffff' })
      .setOrigin(0.5);
    const c = this.add.container(x, y, [rect, txt]);
    c.setSize(w, h);
    rect.setInteractive({ useHandCursor: true });
    rect.on('pointerover', () => rect.setScale(1.03));
    rect.on('pointerout', () => rect.setScale(1));
    rect.on('pointerdown', () => {
      rect.setScale(0.97);
      onClick();
    });
    return c;
  }

  // ---- audio ----
  private playSfx(key: string, vol: number): void {
    try {
      if (this.cache.audio.exists(key)) this.sound.play(key, { volume: vol });
    } catch {
      /* audio unavailable — non-fatal */
    }
  }

  private cleanup(): void {
    this.ghosts.forEach((g) => g.destroy());
    this.ghosts.clear();
    this.ninjas = [];
  }
}
