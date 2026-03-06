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

  getKeyMoments(limit: number = 5): any[] {
    return Object.values(this.data.analysis_map)
      .filter((m: any) => 
        m.severity === 'blunder' || 
        (m.tactics && m.tactics.length > 0) ||
        (m.missed_tactics && m.missed_tactics.length > 0)
      )
      .map((m: any) => {
        return {
          move_number: m.move_number,
          move_san: m.san,
          position_fen: m.fen,
          legal_moves_available: m.legal_moves,
          evaluation: m.eval.toFixed(1),
          best_engine_move: m.best_move,
          tactical_themes: m.tactics,
          missed_opportunities: m.missed_tactics,
          severity: m.severity
        };
      })
      .slice(0, limit);
  }

  toJSON() {
    return {
      game_title: this.opponent,
      lichess_url: this.url,
      engine_statistics: this.summaryText,
      critical_positions: this.getKeyMoments()
    };
  }
}
