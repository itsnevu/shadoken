// Dynamic Web Audio Synth BGM Generator for Shadoken.
// Generates a lightweight looping ambient synth chord progression to avoid large asset downloads.

export class AudioSynthBgm {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private timer: number | null = null;
  private isPlaying = false;
  private currentStep = 0;

  // Chord progression for the RobinhoodChain arena pulse.
  private readonly chords = [
    [110.00, 220.00, 261.63, 329.63], // A2, A3, C4, E4
    [87.31, 174.61, 220.00, 261.63],  // F2, F3, A3, C4
    [130.81, 261.63, 329.63, 392.00], // C3, C4, E4, G4
    [98.00, 196.00, 246.94, 293.66],  // G2, G3, B3, D4
  ];

  start(): void {
    if (this.isPlaying) return;
    this.isPlaying = true;

    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      // Default low ambient volume
      this.masterGain.gain.value = 0.04;
      this.masterGain.connect(this.ctx.destination);

      // Start the sequencer loop
      this.currentStep = 0;
      this.tick();
    } catch (e) {
      console.warn('[audio-synth] failed to initialize web audio context', e);
    }
  }

  private tick = (): void => {
    if (!this.isPlaying || !this.ctx || !this.masterGain) return;

    const time = this.ctx.currentTime;
    const chord = this.chords[this.currentStep % this.chords.length]!;

    // Play bass pad
    const bassOsc = this.ctx.createOscillator();
    const bassFilter = this.ctx.createBiquadFilter();
    const bassGain = this.ctx.createGain();

    bassOsc.type = 'triangle';
    bassOsc.frequency.setValueAtTime(chord[0]!, time);

    bassFilter.type = 'lowpass';
    bassFilter.frequency.setValueAtTime(250, time);

    // Warm chord attack/decay envelope
    bassGain.gain.setValueAtTime(0, time);
    bassGain.gain.linearRampToValueAtTime(0.6, time + 0.5);
    bassGain.gain.exponentialRampToValueAtTime(0.01, time + 3.8);

    bassOsc.connect(bassFilter);
    bassFilter.connect(bassGain);
    bassGain.connect(this.masterGain);

    bassOsc.start(time);
    bassOsc.stop(time + 4.0);

    // Play higher harmonics (soft arpeggiator or glowing pads)
    chord.slice(1).forEach((freq, idx) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, time);

      const delay = idx * 0.15; // Gentle arpeggiation delay
      gain.gain.setValueAtTime(0, time + delay);
      gain.gain.linearRampToValueAtTime(0.12, time + delay + 0.4);
      gain.gain.exponentialRampToValueAtTime(0.001, time + delay + 3.5);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(time + delay);
      osc.stop(time + delay + 3.8);
    });

    this.currentStep++;
    // Chord duration is 4 seconds
    this.timer = window.setTimeout(this.tick, 4000);
  };

  setMute(mute: boolean): void {
    if (this.masterGain) {
      this.masterGain.gain.value = mute ? 0 : 0.04;
    }
  }

  stop(): void {
    this.isPlaying = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.ctx) {
      try {
        void this.ctx.close();
      } catch (e) {
        /* ignore */
      }
      this.ctx = null;
    }
    this.masterGain = null;
  }
}

// Export singleton instance
export const audioSynthBgm = new AudioSynthBgm();
