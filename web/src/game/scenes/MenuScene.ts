import Phaser from 'phaser';
import { APP, VIEW } from '../../config';
import { appState } from '../../app-state';
import type { GameLaunchOptions } from '../../types';

/** Title card with best score, mode badge and a tap-to-deploy prompt. */
export class MenuScene extends Phaser.Scene {
  private starting = false;

  constructor() {
    super('Menu');
  }

  create(): void {
    const opts = this.registry.get('launchOptions') as GameLaunchOptions | undefined;
    const cx = VIEW.width / 2;
    const cy = VIEW.height / 2;

    this.cameras.main.setBackgroundColor('#1C180D');

    // Ambient blades drifting in the background.
    for (let i = 0; i < 7; i++) {
      const s = this.add
        .image(Phaser.Math.Between(0, VIEW.width), Phaser.Math.Between(0, VIEW.height), 'saw')
        .setAlpha(0.06)
        .setScale(Phaser.Math.FloatBetween(0.8, 2.2));
      this.tweens.add({
        targets: s,
        angle: 360,
        duration: Phaser.Math.Between(6000, 12000),
        repeat: -1,
      });
    }

    if (this.textures.exists('logo')) {
      // logo.png is the square 768px brand mark — scale it to ~130px tall so it
      // clears the wordmark below.
      this.add.image(cx, cy - 118, 'logo').setOrigin(0.5).setScale(0.17).setAlpha(0.9);
    }

    this.add
      .text(cx, cy - 46, 'SHADOKEN', {
        fontFamily: 'Trebuchet MS, system-ui, sans-serif',
        fontSize: '76px',
        fontStyle: 'bold',
        color: '#CCFF00',
      })
      .setOrigin(0.5)
      .setShadow(0, 6, '#8fb300', 12, false, true);

    this.add
      .text(cx, cy + 4, APP.tagline, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '16px',
        color: '#b6bfc9',
      })
      .setOrigin(0.5);

    // Mode badge.
    const mode = opts?.multiplayer ? 'ARENA' : 'SOLO';
    const badgeColor = opts?.multiplayer ? '#CCFF00' : '#f5c542';
    this.add
      .text(cx, cy + 42, `◈  ${mode}`, {
        fontFamily: 'Trebuchet MS, system-ui, sans-serif',
        fontSize: '15px',
        fontStyle: 'bold',
        color: badgeColor,
        backgroundColor: '#1b1f24',
        padding: { x: 12, y: 6 },
      })
      .setOrigin(0.5);

    this.add
      .text(cx, cy + 84, `BEST  ${appState.bestScore}`, {
        fontFamily: 'Trebuchet MS, system-ui, sans-serif',
        fontSize: '16px',
        color: '#f5c542',
      })
      .setOrigin(0.5);

    const prompt = this.add
      .text(cx, cy + 140, 'TAP / CLICK TO DEPLOY', {
        fontFamily: 'Trebuchet MS, system-ui, sans-serif',
        fontSize: '20px',
        fontStyle: 'bold',
        color: '#eef1f4',
      })
      .setOrigin(0.5);
    this.tweens.add({ targets: prompt, alpha: 0.25, duration: 700, yoyo: true, repeat: -1 });

    const go = () => this.startRun();
    this.input.once('pointerdown', go);
    this.input.keyboard?.once('keydown-SPACE', go);
    this.input.keyboard?.once('keydown-ENTER', go);
  }

  private startRun(): void {
    if (this.starting) return;
    this.starting = true;
    let count = 3;
    const cx = VIEW.width / 2;
    const cy = VIEW.height / 2;
    const countdown = this.add
      .text(cx, cy + 194, String(count), {
        fontFamily: 'Trebuchet MS, system-ui, sans-serif',
        fontSize: '54px',
        fontStyle: 'bold',
        color: '#CCFF00',
      })
      .setOrigin(0.5)
      .setDepth(20);
    this.time.addEvent({
      delay: 520,
      repeat: 2,
      callback: () => {
        count--;
        if (count > 0) {
          countdown.setText(String(count));
          this.tweens.add({ targets: countdown, scale: 1.25, duration: 120, yoyo: true });
          return;
        }
        countdown.setText('GO');
        this.time.delayedCall(240, () => {
          this.scene.start('Play');
          this.scene.launch('Hud');
        });
      },
    });
  }
}
