import { promises as fs } from 'fs';
import * as path from 'path';

export interface ScoreEntry {
  name: string;
  wallet: string;
  score: number;
  timestamp: number;
}

const FILE_PATH = path.join(process.cwd(), 'highscores.json');

class LeaderboardDb {
  private scores: ScoreEntry[] = [];
  private isLoaded = false;

  async load(): Promise<void> {
    if (this.isLoaded) return;
    try {
      const data = await fs.readFile(FILE_PATH, 'utf8');
      this.scores = JSON.parse(data) as ScoreEntry[];
      this.isLoaded = true;
    } catch (e) {
      // If file doesn't exist, start with empty list
      this.scores = [];
      this.isLoaded = true;
    }
  }

  private async save(): Promise<void> {
    try {
      await fs.writeFile(FILE_PATH, JSON.stringify(this.scores, null, 2), 'utf8');
    } catch (e) {
      console.error('[db] failed to save highscores', e);
    }
  }

  async record(name: string, wallet: string, score: number): Promise<void> {
    await this.load();

    const cleanName = (name || 'Guest').trim().slice(0, 24);
    const cleanWallet = (wallet || '').trim().slice(0, 66);
    const key = cleanWallet || cleanName;

    // Check if player already exists in leaderboard
    const existingIdx = this.scores.findIndex((s) => {
      const sKey = s.wallet || s.name;
      return sKey === key;
    });

    if (existingIdx !== -1) {
      const existing = this.scores[existingIdx]!;
      if (score <= existing.score) return; // Keep higher score
      existing.score = score;
      existing.name = cleanName;
      existing.timestamp = Date.now();
    } else {
      this.scores.push({
        name: cleanName,
        wallet: cleanWallet,
        score,
        timestamp: Date.now(),
      });
    }

    // Sort descending by score, limit to top 15
    this.scores.sort((a, b) => b.score - a.score);
    this.scores = this.scores.slice(0, 15);

    await this.save();
  }

  async getScores(): Promise<ScoreEntry[]> {
    await this.load();
    return this.scores;
  }
}

export const leaderboardDb = new LeaderboardDb();
