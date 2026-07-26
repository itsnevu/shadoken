// ============================================================================
// HudScene — runs on top of PlayScene. Shows score / ninja count / best and
// renders the on-screen touch controls (left/right pad, JUMP, ROTATE) that
// write into the shared VirtualInput the PlayScene reads each frame. Works with
// mouse (desktop) and multi-touch (mobile).
// ============================================================================

import Phaser from 'phaser';
import { VIEW } from '../../config';
import { REG, type HudData, type VirtualInput } from '../shared';

const FONT = 'Poppins, Trebuchet MS, system-ui, sans-serif';

export class HudScene extends Phaser.Scene {
  private input$!: VirtualInput;
  private scoreText!: Phaser.GameObjects.Text;
  private countText!: Phaser.GameObjects.Text;
  private controls: Phaser.GameObjects.Container[] = [];

  constructor() {
    super('Hud');
  }

  create(): void {
    // Ensure the shared input object exists (PlayScene usually creates it first).
    let input = this.registry.get(REG.input) as VirtualInput | undefined;
    if (!input) {
      input = { left: false, right: false, jump: false, rotate: false, sabotage: false };
      this.registry.set(REG.input, input);
    }
    this.input$ = input;

    // ---- readouts (top-centre, below the DOM top bar) ----
    this.scoreText = this.add
      .text(VIEW.width / 2, 30, '0', {
        fontFamily: FONT,
        fontSize: '30px',
        fontStyle: 'bold',
        color: '#ffffff',
      })
      .setOrigin(0.5, 0)
      .setShadow(0, 3, '#000000', 6);

    this.countText = this.add
      .text(VIEW.width / 2, 66, '', {
        fontFamily: FONT,
        fontSize: '14px',
        color: '#b6bfc9',
      })
      .setOrigin(0.5, 0);

    // ---- touch / click controls ----
    this.buildControls();

    // Rebuild positions if the game is resized.
    this.scale.on('resize', () => this.layoutControls());
    this.events.on('shutdown', () => this.scale.off('resize', this.layoutControls, this));
  }

  private buildControls(): void {
    const holdBtn = (icon: string, onDown: () => void, onUp: () => void): Phaser.GameObjects.Container => {
      const c = this.makeButton(icon);
      const circle = c.getData('hit') as Phaser.GameObjects.Arc;
      circle
        .on('pointerdown', () => {
          onDown();
          c.setScale(0.92);
          (c.getData('ring') as Phaser.GameObjects.Arc).setStrokeStyle(3, 0xff5a3c, 1);
        })
        .on('pointerup', () => {
          onUp();
          c.setScale(1);
          (c.getData('ring') as Phaser.GameObjects.Arc).setStrokeStyle(3, 0x363d47, 1);
        })
        .on('pointerout', () => {
          onUp();
          c.setScale(1);
          (c.getData('ring') as Phaser.GameObjects.Arc).setStrokeStyle(3, 0x363d47, 1);
        });
      return c;
    };

    const tapBtn = (icon: string, color: number, onTap: () => void): Phaser.GameObjects.Container => {
      const c = this.makeButton(icon, color);
      const circle = c.getData('hit') as Phaser.GameObjects.Arc;
      circle.on('pointerdown', () => {
        onTap();
        c.setScale(0.9);
        this.tweens.add({ targets: c, scale: 1, duration: 160, ease: 'Back.out' });
      });
      return c;
    };

    const left = holdBtn('‹', () => (this.input$.left = true), () => (this.input$.left = false));
    const right = holdBtn('›', () => (this.input$.right = true), () => (this.input$.right = false));
    const jump = tapBtn('▲', 0xccff00, () => (this.input$.jump = true));
    const rotate = tapBtn('⟳', 0xf5c542, () => (this.input$.rotate = true));
    const sabotage = tapBtn('⚡', 0xccff00, () => (this.input$.sabotage = true));

    this.controls = [left, right, jump, rotate, sabotage];
    this.controls.forEach((c) => c.setDepth(30).setScrollFactor(0).setAlpha(0.9));
    this.layoutControls();
  }

  private makeButton(icon: string, iconColor = 0xeef1f4): Phaser.GameObjects.Container {
    const r = 44;
    const ring = this.add.circle(0, 0, r, 0x1b1f24, 0.72).setStrokeStyle(3, 0x363d47, 1);
    const label = this.add
      .text(0, 2, icon, { fontFamily: FONT, fontSize: '34px', color: '#eef1f4' })
      .setOrigin(0.5)
      .setColor(Phaser.Display.Color.IntegerToColor(iconColor).rgba);
    const hit = this.add.circle(0, 0, r, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
    const c = this.add.container(0, 0, [ring, label, hit]);
    c.setData('hit', hit);
    c.setData('ring', ring);
    c.setSize(r * 2, r * 2);
    return c;
  }

  private layoutControls = (): void => {
    if (this.controls.length < 5) return;
    const w = this.scale.width;
    const h = this.scale.height;
    const pad = 74;
    const [left, right, jump, rotate, sabotage] = this.controls;
    left!.setPosition(pad, h - pad);
    right!.setPosition(pad + 108, h - pad + 6);
    jump!.setPosition(w - pad, h - pad);
    rotate!.setPosition(w - pad - 104, h - pad + 6);
    sabotage!.setPosition(w - pad - 208, h - pad + 12);
  };

  update(): void {
    const hud = this.registry.get(REG.hud) as HudData | undefined;
    if (!hud) return;
    this.scoreText.setText(String(hud.score));
    const players = hud.players > 1 ? `  ·  ${hud.players} in arena` : '';
    const sabotage =
      hud.sabotageCharge >= hud.sabotageMax
        ? `  ·  ${hud.sabotageName} ready`
        : `  ·  ${hud.sabotageName} ${hud.sabotageCharge}/${hud.sabotageMax}`;
    const shield = hud.shield > 0 ? `  ·  shield ${hud.shield}` : '';
    const race = hud.raceFinished ? '  ·  finish' : `  ·  #${hud.raceRank} to ${hud.raceTarget}`;
    const slowed = hud.sabotaged ? '  ·  jammed' : '';
    this.countText.setText(`${hud.alive}/${hud.total} ninjas   ·   ${hud.chambers} chambers   ·   best ${hud.best}${players}${race}${sabotage}${shield}${slowed}`);

    const dim = hud.over ? 0.25 : 0.9;
    this.controls.forEach((c) => c.setAlpha(dim));
  }
}
