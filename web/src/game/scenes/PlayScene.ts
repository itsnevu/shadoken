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
import { audioSynthBgm } from '../systems/audio-synth';

const SWARM = CONST.SCHOOL;
const SKINS = [0xccff00, 0xffffff, 0xf5c542, 0x9fe0ff, 0xff8a70, 0x8effb0, 0xff9fd0];
const SNAPSHOT_MS = 66; // ~15 Hz
const FONT = 'Poppins, Trebuchet MS, system-ui, sans-serif';
const SABOTAGE_MAX = 3;
const SABOTAGE_SECONDS = 2.4;
const RACE_TARGET_CHAMBERS = 10;
const PROGRESSION_KEY = 'shadoken.progression.v1';

type SabotageKind = 'lime-shock' | 'gravity-scramble' | 'shadow-clone' | 'arrow-rush';

const SABOTAGES: readonly SabotageKind[] = ['lime-shock', 'gravity-scramble', 'shadow-clone', 'arrow-rush'];
const SABOTAGE_LABEL: Record<SabotageKind, string> = {
  'lime-shock': 'Shock Jam',
  'gravity-scramble': 'Gravity Scramble',
  'shadow-clone': 'Shadow Clone',
  'arrow-rush': 'Arrow Rush',
};

export class PlayScene extends Phaser.Scene {
  private opts!: GameLaunchOptions;
  private bridge!: NetBridge;
  private input$!: VirtualInput;
  private rng!: Phaser.Math.RandomDataGenerator;
  private offMute!: () => void;

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

  // guest mode
  private guestTimeLeft = 30;
  private guestLimitReached = false;

  // scoring / state
  private score = 0;
  private prevChambers = 0;
  private startedAt = 0;
  private over = false;
  private perfectChamber = true;
  private coinStreak = 0;
  private bestStreak = 0;
  private raceFinished = false;

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
  private sabotageCharge = 0;
  private pendingSabotage: SabotageKind | null = null;
  private activeSabotage: SabotageKind = 'lime-shock';
  private sabotageLeft = 0;
  private arrowRushLeft = 0;
  private shield = 0;
  private offSabotage?: () => void;
  private clones: Phaser.GameObjects.Sprite[] = [];

  constructor() {
    super('Play');
  }

  create(): void {
    this.opts = this.registry.get(REG.launchOptions) as GameLaunchOptions;
    this.bridge = this.registry.get(REG.netBridge) as NetBridge;

    let input = this.registry.get(REG.input) as VirtualInput | undefined;
    if (!input) {
      input = { left: false, right: false, jump: false, rotate: false, sabotage: false };
      this.registry.set(REG.input, input);
    }
    this.input$ = input;
    input.left = input.right = input.jump = input.rotate = input.sabotage = false;

    // Start synthesized Background Music
    const isMuted = localStorage.getItem('shadoken-muted') === 'true';
    this.sound.mute = isMuted;
    audioSynthBgm.start();
    audioSynthBgm.setMute(isMuted);

    this.offMute = bus.on('audio:muted', (muted) => {
      this.sound.mute = muted;
    });
    this.offSabotage = bus.on('game:recv-sabotage', (type) => this.receiveSabotage(type));

    this.rng = new Phaser.Math.RandomDataGenerator([String(this.opts.seed)]);
    this.orientation = 0;
    this.camAngle = 0;
    this.targetCamAngle = 0;
    this.nausea = 0;
    this.nauseous = false;
    this.score = 0;
    this.sabotageCharge = 0;
    this.pendingSabotage = null;
    this.activeSabotage = this.pickStartingSabotage();
    this.sabotageLeft = 0;
    this.arrowRushLeft = 0;
    this.shield = this.loadProgression().shield;
    this.prevChambers = 0;
    this.perfectChamber = true;
    this.coinStreak = 0;
    this.bestStreak = 0;
    this.raceFinished = false;
    this.over = false;
    this.startedAt = this.time.now;
    this.guestTimeLeft = 30;
    this.guestLimitReached = false;
    if (this.opts.guest) {
      bus.emit('game:guest-time', Math.ceil(this.guestTimeLeft));
    }

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
    cam.setBackgroundColor('#1C180D');
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
      kb.on('keydown-E', () => this.requestSabotage());
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
  private sabotageQueued = false;
  private requestJump(): void {
    this.jumpQueued = true;
  }
  private requestRotate(): void {
    this.rotateQueued = true;
  }
  private requestSabotage(): void {
    this.sabotageQueued = true;
  }

  private loadProgression(): { shield: number; unlockedSkins: number } {
    try {
      const raw = localStorage.getItem(PROGRESSION_KEY);
      if (!raw) return { shield: 0, unlockedSkins: 1 };
      const parsed = JSON.parse(raw) as Partial<{ shield: number; unlockedSkins: number }>;
      return {
        shield: Math.max(0, Math.min(3, Math.floor(parsed.shield ?? 0))),
        unlockedSkins: Math.max(1, Math.min(SKINS.length, Math.floor(parsed.unlockedSkins ?? 1))),
      };
    } catch {
      return { shield: 0, unlockedSkins: 1 };
    }
  }

  private saveProgression(next: { shield?: number; unlockedSkins?: number }): void {
    const current = this.loadProgression();
    const progress = {
      shield: Math.max(0, Math.min(3, Math.floor(next.shield ?? current.shield))),
      unlockedSkins: Math.max(1, Math.min(SKINS.length, Math.floor(next.unlockedSkins ?? current.unlockedSkins))),
    };
    try {
      localStorage.setItem(PROGRESSION_KEY, JSON.stringify(progress));
    } catch {
      /* storage unavailable */
    }
  }

  private pickStartingSabotage(): SabotageKind {
    const wallet = this.opts?.session?.address ?? 'guest';
    let sum = 0;
    for (let i = 0; i < wallet.length; i++) sum += wallet.charCodeAt(i);
    return SABOTAGES[sum % SABOTAGES.length]!;
  }

  private rotateSabotage(): void {
    const idx = SABOTAGES.indexOf(this.activeSabotage);
    this.activeSabotage = SABOTAGES[(idx + 1) % SABOTAGES.length]!;
  }

  update(_time: number, deltaMs: number): void {
    if (this.over) return;
    const dt = Math.min(deltaMs / 1000, 1 / 30);

    // ----- guest time limit ticker -----
    if (this.opts.guest && !this.guestLimitReached) {
      this.guestTimeLeft -= dt;
      bus.emit('game:guest-time', Math.max(0, Math.ceil(this.guestTimeLeft)));
      if (this.guestTimeLeft <= 0) {
        this.guestLimitReached = true;
        this.showGuestLimitModal();
      }
    }

    // ----- resolve input -----
    let moveDir = 0;
    if (!this.nauseous && !this.guestLimitReached) {
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
      if (this.input$.sabotage) {
        this.sabotageQueued = true;
        this.input$.sabotage = false;
      }
    } else {
      this.input$.jump = false;
      this.input$.rotate = false;
      this.input$.sabotage = false;
    }
    if (moveDir !== 0) this.lastMoveDir = moveDir;

    if (this.jumpQueued && !this.nauseous && !this.guestLimitReached) this.doJump();
    if (this.rotateQueued && !this.nauseous && !this.guestLimitReached) this.doRotate(this.lastMoveDir);
    if (this.sabotageQueued && !this.guestLimitReached) this.fireSabotage();
    this.jumpQueued = false;
    this.rotateQueued = false;
    this.sabotageQueued = false;

    if (this.sabotageLeft > 0) {
      this.sabotageLeft = Math.max(0, this.sabotageLeft - dt);
      if (this.sabotageLeft === 0) {
        for (const n of this.ninjas) n.frozen = false;
      }
    }
    if (this.arrowRushLeft > 0) {
      this.arrowRushLeft = Math.max(0, this.arrowRushLeft - dt);
    }

    // ----- world streaming -----
    const pressureDt = this.arrowRushLeft > 0 ? dt * 2.1 : dt;
    this.chambers.update(pressureDt, this.leader.x);

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
      if (this.perfectChamber) {
        this.score += 25 * gained;
        this.sabotageCharge = Math.min(SABOTAGE_MAX, this.sabotageCharge + 1);
        bus.emit('toast', { message: 'Perfect chamber bonus.', kind: 'success' });
      }
      this.prevChambers = this.chambers.enteredCount;
      this.perfectChamber = true;
      this.sabotageCharge = Math.min(SABOTAGE_MAX, this.sabotageCharge + gained);
      this.checkRaceFinish();
      this.updateUnlocks();

      // Spawn celebratory RobinhoodChain lime particle bursts on all surviving ninjas.
      try {
        for (const n of this.ninjas) {
          if (n.alive) {
            this.add.particles(n.x, n.y, 'particle', {
              speed: { min: -100, max: 100 },
              scale: { start: 1.4, end: 0 },
              blendMode: 'SCREEN',
              lifespan: 500,
              quantity: 8,
              maxParticles: 8,
              tint: 0xccff00,
            });
          }
        }
      } catch (e) {
        console.warn('[game] chamber entry particles failed', e);
      }
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

  private fireSabotage(): void {
    if (!this.bridge.multiplayer) {
      bus.emit('toast', { message: 'Sabotage is only active in arena multiplayer.', kind: 'info' });
      return;
    }
    if (this.sabotageCharge < SABOTAGE_MAX) {
      bus.emit('toast', { message: `Collect ${SABOTAGE_MAX - this.sabotageCharge} more charge to fire ${SABOTAGE_LABEL[this.activeSabotage]}.`, kind: 'info' });
      return;
    }
    this.sabotageCharge = 0;
    this.pendingSabotage = this.activeSabotage;
    this.cameras.main.flash(140, 204, 255, 0, false);
    this.playSfx('sfx_arrow', 0.35);
    this.emitSnapshot(SNAPSHOT_MS / 1000, this.ninjas.filter((n) => n.alive).length);
    bus.emit('toast', { message: `${SABOTAGE_LABEL[this.activeSabotage]} sent.`, kind: 'success' });
    this.rotateSabotage();
  }

  private receiveSabotage(type: string): void {
    if (!SABOTAGES.includes(type as SabotageKind)) return;
    if (this.shield > 0) {
      this.shield--;
      this.saveProgression({ shield: this.shield });
      this.cameras.main.flash(140, 204, 255, 0, false);
      bus.emit('toast', { message: 'Shield blocked enemy sabotage.', kind: 'success' });
      return;
    }
    const kind = type as SabotageKind;
    switch (kind) {
      case 'lime-shock':
        this.sabotageLeft = SABOTAGE_SECONDS;
        for (const n of this.ninjas) {
          if (n.alive) n.frozen = true;
        }
        break;
      case 'gravity-scramble':
        this.doRotate(this.rng.pick([-1, 1]));
        this.nausea = Math.min(1.2, this.nausea + 0.55);
        break;
      case 'shadow-clone':
        this.spawnShadowClones();
        break;
      case 'arrow-rush':
        this.arrowRushLeft = 4.5;
        break;
    }
    this.cameras.main.shake(260, 0.007);
    this.cameras.main.flash(180, 204, 255, 0, false);
    this.playSfx('sfx_smasher', 0.28);
    bus.emit('toast', { message: `Enemy ${SABOTAGE_LABEL[kind]} hit your swarm.`, kind: 'error' });
  }

  private spawnShadowClones(): void {
    this.clones.forEach((c) => c.destroy());
    this.clones = [];
    const source = this.leader;
    for (let i = 0; i < 8; i++) {
      const clone = this.add
        .sprite(source.x + this.rng.between(-160, 180), source.y + this.rng.between(-90, 90), 'ninja')
        .setOrigin(0.5, 0.55)
        .setScale(1)
        .setTint(i % 2 === 0 ? 0xccff00 : 0xf5c542)
        .setAlpha(0.42)
        .setDepth(19);
      this.tweens.add({
        targets: clone,
        x: clone.x + this.rng.between(-80, 120),
        y: clone.y + this.rng.between(-40, 40),
        alpha: 0,
        duration: 1800,
        ease: 'Sine.out',
        onComplete: () => clone.destroy(),
      });
      this.clones.push(clone);
    }
  }

  private checkRaceFinish(): void {
    if (this.raceFinished || this.chambers.enteredCount < RACE_TARGET_CHAMBERS) return;
    this.raceFinished = true;
    this.score += 250;
    this.sabotageCharge = SABOTAGE_MAX;
    this.shield = Math.min(3, this.shield + 1);
    this.saveProgression({ shield: this.shield });
    this.cameras.main.flash(260, 204, 255, 0, false);
    bus.emit('toast', { message: 'Race target cleared. Shield earned.', kind: 'success' });
  }

  private updateUnlocks(): void {
    const progress = this.loadProgression();
    const nextUnlocks = Math.min(SKINS.length, 1 + Math.floor(Math.max(appState.bestScore, this.score) / 500));
    if (nextUnlocks > progress.unlockedSkins) {
      this.saveProgression({ unlockedSkins: nextUnlocks });
      bus.emit('toast', { message: `Skin ${nextUnlocks} unlocked.`, kind: 'success' });
    }
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
        this.coinStreak++;
        this.bestStreak = Math.max(this.bestStreak, this.coinStreak);
        this.score += 5 * Math.min(5, this.coinStreak);
        this.sabotageCharge = Math.min(SABOTAGE_MAX, this.sabotageCharge + 1);
        break;
      case 'mystery': {
        const roll = this.rng.pick(['coin', 'nitro', 'normous', 'normal', 'new', 'shield', 'power'] as const);
        if (roll === 'shield') {
          this.shield = Math.min(3, this.shield + 1);
          this.saveProgression({ shield: this.shield });
          this.score += 18;
          bus.emit('toast', { message: 'Shield charged.', kind: 'success' });
        } else if (roll === 'power') {
          this.rotateSabotage();
          this.sabotageCharge = SABOTAGE_MAX;
          this.score += 18;
          bus.emit('toast', { message: `${SABOTAGE_LABEL[this.activeSabotage]} ready.`, kind: 'success' });
        } else if (roll === 'coin') {
          this.coinStreak += 2;
          this.bestStreak = Math.max(this.bestStreak, this.coinStreak);
          this.score += 10 * Math.min(5, this.coinStreak);
          this.sabotageCharge = SABOTAGE_MAX;
        } else {
          this.applyPickup(roll);
          return;
        }
        break;
      }
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
    this.perfectChamber = false;
    this.coinStreak = 0;
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
        ghost = new RemoteGhost(this, snap, 0xccff00, 1);
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
    const sabotage = this.pendingSabotage;
    this.pendingSabotage = null;
    this.bridge.emit({
      x: this.leader.x,
      y: this.leader.y,
      angle: this.orientation * 90,
      vx: b.velocity.x,
      vy: b.velocity.y,
      facing: this.leader.facing,
      state: this.leader.ninjaState,
      score: this.score,
      chambers: this.chambers.enteredCount,
      alive: alive > 0,
      ...(sabotage ? { sabotage } : {}),
    });
  }

  // ---- HUD ----
  private publishHud(alive?: number): void {
    const a = alive ?? this.ninjas.filter((n) => n.alive).length;
    const betterRacers = this.bridge?.remote.filter((p) => p.chambers > this.chambers.enteredCount || (p.chambers === this.chambers.enteredCount && p.score > this.score)).length ?? 0;
    const hud: HudData = {
      score: this.score,
      alive: a,
      total: SWARM,
      chambers: this.chambers?.enteredCount ?? 0,
      best: Math.max(appState.bestScore, this.score),
      players: this.bridge?.multiplayer ? this.bridge.remote.length + 1 : 1,
      sabotageCharge: this.sabotageCharge,
      sabotageMax: SABOTAGE_MAX,
      sabotageName: SABOTAGE_LABEL[this.activeSabotage],
      shield: this.shield,
      raceRank: betterRacers + 1,
      raceTarget: RACE_TARGET_CHAMBERS,
      raceFinished: this.raceFinished,
      sabotaged: this.sabotageLeft > 0,
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
      seed: this.opts.seed,
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

    const bg = this.add.rectangle(0, 0, VIEW.width, VIEW.height, 0x1c180d, 0.82);
    bg.setInteractive();
    const card = this.add.rectangle(0, 0, 420, 350, 0x1c180d, 1).setStrokeStyle(2, 0xccff00, 1);

    const title = this.add
      .text(0, -108, 'ALL NINJAS DOWN', { fontFamily: FONT, fontSize: '34px', fontStyle: 'bold', color: '#CCFF00' })
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

    const restart = this.makeOverlayButton(0, 44, 'RESTART', 0xccff00, () => {
      this.ghosts.forEach((g) => g.destroy());
      this.ghosts.clear();
      this.scene.restart();
    });
    const reward = this.makeOverlayButton(0, 104, 'POOL REWARD', 0xccff00, () => {
      bus.emit('pool:open-console', undefined);
    });
    const exit = this.makeOverlayButton(0, 164, 'EXIT TO MENU', 0x2e353e, () => {
      bus.emit('game:exit', undefined);
    });

    panel.add([bg, card, title, scoreT, meta, restart, reward, exit]);
  }

  private showGuestLimitModal(): void {
    this.scene.bringToTop();
    const cam = this.cameras.main;
    const cx = cam.midPoint.x;
    const cy = cam.midPoint.y;
    // Undo camera rotation for a readable overlay.
    const panel = this.add.container(cx, cy).setDepth(200).setRotation(-this.camAngle);

    const bg = this.add.rectangle(0, 0, VIEW.width, VIEW.height, 0x1c180d, 0.85);
    bg.setInteractive();
    const card = this.add.rectangle(0, 0, 440, 320, 0x1c180d, 1).setStrokeStyle(2, 0xccff00, 1);

    const title = this.add
      .text(0, -95, 'DEMO LIMIT REACHED', { fontFamily: FONT, fontSize: '30px', fontStyle: 'bold', color: '#CCFF00' })
      .setOrigin(0.5);

    const msg = this.add
      .text(0, -30, 'Connect MetaMask wallet\nto unlock the full game and\nplay real-time multiplayer!', {
        fontFamily: FONT,
        fontSize: '16px',
        color: '#ffffff',
        align: 'center',
      })
      .setOrigin(0.5);

    const scoreT = this.add
      .text(0, 35, `Demo Score: ${this.score}`, {
        fontFamily: FONT,
        fontSize: '15px',
        color: '#b6bfc9',
      })
      .setOrigin(0.5);

    const connectBtn = this.makeOverlayButton(0, 80, 'CONNECT METAMASK', 0xccff00, () => {
      bus.emit('wallet:connect-request', undefined);
    });
    const exit = this.makeOverlayButton(0, 135, 'EXIT TO MENU', 0x2e353e, () => {
      bus.emit('game:exit', undefined);
    });

    panel.add([bg, card, title, msg, scoreT, connectBtn, exit]);
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
    const labelColor = color === 0xccff00 ? '#1C180D' : '#ffffff';
    const txt = this.add
      .text(0, 0, label, { fontFamily: FONT, fontSize: '18px', fontStyle: 'bold', color: labelColor })
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
    // Stop synthesized Background Music
    audioSynthBgm.stop();
    if (this.offMute) this.offMute();
    this.offSabotage?.();

    this.ghosts.forEach((g) => g.destroy());
    this.ghosts.clear();
    this.ninjas = [];
  }
}
