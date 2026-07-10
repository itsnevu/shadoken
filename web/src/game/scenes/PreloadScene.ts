import Phaser from 'phaser';

// Palette (matches style.css design tokens).
const C = {
  black: 0x12151a,
  panel: 0x262c34,
  panel2: 0x2e353e,
  line: 0x363d47,
  line2: 0x3d4650,
  shadow: 0x15181d,
  accent: 0xe23b2e,
  accentBright: 0xff5a3c,
  accentDeep: 0xb62519,
  phantom: 0xab9ff2,
  gold: 0xf5c542,
  goldSoft: 0xffe9a8,
  goldDeep: 0xcaa02a,
  success: 0x37c46b,
  successSoft: 0x7fe0a1,
  water: 0x2fb6d8,
  waterSoft: 0x8fe0f2,
  steel: 0x9aa4af,
  steelDark: 0x5b636d,
  ink: 0xeef1f4,
};

/**
 * Generate every texture procedurally (no external art required), and
 * defensively attempt to load optional audio + logo (failure is ignored).
 */
export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('Preload');
  }

  preload(): void {
    // Optional assets — never fatal.
    this.load.on('loaderror', () => {
      /* ignore missing optional assets */
    });
    this.load.image('logo', 'logo.png');
    this.load.audio('sfx_ninja', 'audio/sfx_ninja.ogg');
    this.load.audio('sfx_arrow', 'audio/sfx_arrow.ogg');
    this.load.audio('sfx_blades', 'audio/sfx_blades.ogg');
    this.load.audio('sfx_smasher', 'audio/sfx_smasher.ogg');
    this.load.audio('sfx_splash', 'audio/sfx_splash.ogg');

    this.buildTextures();
  }

  create(): void {
    this.scene.start('Menu');
  }

  // ---- procedural texture atlas -------------------------------------------

  private tex(key: string, w: number, h: number, draw: (g: Phaser.GameObjects.Graphics) => void): void {
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    draw(g);
    g.generateTexture(key, w, h);
    g.destroy();
  }

  private buildTextures(): void {
    // --- ninja: dark shinobi silhouette + red scarf ---
    this.tex('ninja', 20, 24, (g) => {
      g.fillStyle(C.black, 1);
      g.fillRoundedRect(4, 6, 12, 16, 4); // torso
      g.fillStyle(0x1b2026, 1);
      g.fillCircle(10, 7, 5); // hood/head
      g.fillStyle(C.black, 1);
      g.fillRect(5, 5, 10, 3); // hood brim
      g.fillStyle(C.accent, 1);
      g.fillRect(3, 10, 14, 3); // scarf
      g.fillTriangle(3, 10, 3, 16, 0, 13); // scarf tail
      g.fillStyle(C.accentBright, 1);
      g.fillRect(7, 6, 2, 2); // eyes
      g.fillRect(11, 6, 2, 2);
      g.fillStyle(0x0e1013, 1);
      g.fillRect(5, 16, 10, 2); // belt
    });

    // --- floor / wall tile (horizontally uniform so it stretches cleanly) ---
    this.tex('tile', 32, 32, (g) => {
      g.fillStyle(C.panel2, 1);
      g.fillRect(0, 0, 32, 32);
      g.fillStyle(C.line2, 1);
      g.fillRect(0, 0, 32, 4);
      g.fillStyle(C.line, 1);
      g.fillRect(0, 15, 32, 2);
      g.fillStyle(C.shadow, 1);
      g.fillRect(0, 28, 32, 4);
    });

    // --- saw blade ---
    this.tex('saw', 44, 44, (g) => {
      const cx = 22;
      const cy = 22;
      g.fillStyle(C.steel, 1);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const a2 = a + Math.PI / 12;
        g.fillTriangle(
          cx + Math.cos(a) * 21,
          cy + Math.sin(a) * 21,
          cx + Math.cos(a2) * 21,
          cy + Math.sin(a2) * 21,
          cx + Math.cos((a + a2) / 2) * 14,
          cy + Math.sin((a + a2) / 2) * 14,
        );
      }
      g.fillCircle(cx, cy, 15);
      g.fillStyle(C.steelDark, 1);
      g.fillCircle(cx, cy, 11);
      g.fillStyle(C.accent, 1);
      g.fillCircle(cx, cy, 6);
      g.fillStyle(C.shadow, 1);
      g.fillCircle(cx, cy, 2);
    });

    // --- smasher block ---
    this.tex('smasher', 72, 40, (g) => {
      g.fillStyle(C.panel2, 1);
      g.fillRoundedRect(0, 0, 72, 40, 4);
      g.fillStyle(C.panel, 1);
      g.fillRect(0, 0, 72, 8);
      g.fillStyle(C.accentDeep, 1);
      g.fillRect(0, 30, 72, 10);
      g.fillStyle(C.accentBright, 1);
      for (let x = -10; x < 72; x += 18) g.fillTriangle(x, 40, x + 9, 30, x + 18, 40);
      g.fillStyle(C.shadow, 1);
      g.fillCircle(6, 20, 2);
      g.fillCircle(66, 20, 2);
    });

    // --- bounce pad ---
    this.tex('bounce', 64, 20, (g) => {
      g.fillStyle(C.success, 1);
      g.fillRoundedRect(0, 4, 64, 16, 6);
      g.fillStyle(C.successSoft, 1);
      g.fillRect(2, 5, 60, 4);
      g.fillStyle(0x0e2a18, 1);
      g.fillTriangle(24, 16, 32, 8, 40, 16);
    });

    // --- lava ---
    this.tex('lava', 48, 24, (g) => {
      g.fillStyle(C.accentDeep, 1);
      g.fillRect(0, 0, 48, 24);
      g.fillStyle(C.accent, 1);
      g.fillRect(0, 0, 48, 11);
      g.fillStyle(C.accentBright, 1);
      g.fillRect(4, 0, 10, 5);
      g.fillRect(26, 0, 12, 5);
      g.fillStyle(C.gold, 1);
      g.fillRect(8, 1, 3, 2);
      g.fillRect(32, 1, 3, 2);
    });

    // --- arrow ---
    this.tex('arrow', 18, 6, (g) => {
      g.fillStyle(C.line, 1);
      g.fillRect(0, 2, 12, 2);
      g.fillStyle(C.accent, 1);
      g.fillRect(0, 1, 3, 4);
      g.fillStyle(C.accentBright, 1);
      g.fillTriangle(12, 0, 18, 3, 12, 6);
    });

    // --- water ---
    this.tex('water', 32, 32, (g) => {
      g.fillStyle(C.water, 1);
      g.fillRect(0, 0, 32, 32);
      g.fillStyle(C.waterSoft, 1);
      g.fillRect(0, 0, 32, 5);
      g.fillStyle(0x53c6e0, 1);
      g.fillRect(0, 14, 32, 2);
    });

    // --- particle ---
    this.tex('particle', 8, 8, (g) => {
      g.fillStyle(0xffffff, 1);
      g.fillCircle(4, 4, 4);
    });

    // --- pickups ---
    this.tex('pu_coin', 22, 22, (g) => {
      g.fillStyle(C.goldDeep, 1);
      g.fillCircle(11, 11, 10);
      g.fillStyle(C.gold, 1);
      g.fillCircle(11, 11, 8);
      g.fillStyle(C.goldSoft, 1);
      g.fillCircle(11, 11, 4);
    });
    this.pickupBg('pu_nitro', (g) => {
      g.fillStyle(C.accentBright, 1);
      g.fillPoints(
        [
          new Phaser.Geom.Point(12, 3),
          new Phaser.Geom.Point(6, 12),
          new Phaser.Geom.Point(10, 12),
          new Phaser.Geom.Point(9, 19),
          new Phaser.Geom.Point(16, 9),
          new Phaser.Geom.Point(12, 9),
        ],
        true,
      );
    });
    this.pickupBg('pu_normous', (g) => {
      g.fillStyle(C.phantom, 1);
      g.fillTriangle(11, 4, 5, 11, 17, 11);
      g.fillTriangle(11, 10, 5, 17, 17, 17);
    });
    this.pickupBg('pu_normal', (g) => {
      g.lineStyle(2.5, C.success, 1);
      g.strokeCircle(11, 11, 6);
      g.lineStyle(2.5, C.successSoft, 1);
      g.beginPath();
      g.moveTo(8, 11);
      g.lineTo(10, 14);
      g.lineTo(15, 8);
      g.strokePath();
    });
    this.pickupBg('pu_new', (g) => {
      g.fillStyle(C.water, 1);
      g.fillRect(9, 4, 4, 14);
      g.fillRect(4, 9, 14, 4);
    });
  }

  private pickupBg(key: string, glyph: (g: Phaser.GameObjects.Graphics) => void): void {
    this.tex(key, 22, 22, (g) => {
      g.fillStyle(0x1b1f24, 1);
      g.fillRoundedRect(1, 1, 20, 20, 6);
      g.lineStyle(1.5, C.line, 1);
      g.strokeRoundedRect(1, 1, 20, 20, 6);
      glyph(g);
    });
  }
}
