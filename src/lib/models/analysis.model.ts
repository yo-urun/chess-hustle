export interface AnalysisData {
  game_id: string;
  player_color: string;
  analysis_map: Record<string, any>;
  statistics: {
    blunders: number;
    missed_tactics: number;
    brilliant_moves: number;
  };
  game_info: {
    White?: string;
    Black?: string;
    Result?: string;
    Site?: string;
  };
}

export class TechnicalAnalysis {
  constructor(private data: AnalysisData) {}

  get id(): string {
    return this.data.game_id || (this.data.game_info?.Site ? this.data.game_info.Site.split('/').pop()! : 'unknown');
  }

  get url(): string | null {
    if (this.data.game_info?.Site) return this.data.game_info.Site;
    if (this.id !== 'unknown') return `https://lichess.org/${this.id}`;
    return null;
  }

  get summaryText(): string {
    const s = this.data.statistics;
    return `Зевков: ${s.blunders}, Жертв: ${s.brilliant_moves}, Упущено тактик: ${s.missed_tactics}`;
  }

  get opponent(): string {
    const info = this.data.game_info;
    return `${info.White || 'Белые'} vs ${info.Black || 'Черные'}`;
  }

  getKeyMoments(limit: number = 5): string[] {
    return Object.values(this.data.analysis_map)
      .filter((m: any) => 
        m.severity === 'blunder' || 
        (m.tactics && m.tactics.length > 0) ||
        (m.missed_tactics && m.missed_tactics.length > 0)
      )
      .map((m: any) => {
        return `Ход ${m.move_number} (${m.san}): Оценка ${m.eval.toFixed(1)}. 
        ${m.tactics?.length ? `Темы: ${m.tactics.join(', ')}.` : ''} 
        ${m.missed_tactics?.length ? `Упущено: ${m.missed_tactics.join(', ')}.` : ''}
        ${m.severity === 'blunder' ? 'Критическая ошибка!' : ''}`;
      })
      .slice(0, limit);
  }

  toJSON() {
    return {
      game: this.opponent,
      url: this.url,
      summary: this.summaryText,
      highlights: this.getKeyMoments()
    };
  }
}
