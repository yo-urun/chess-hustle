import { Chess } from 'chess.js';

/**
 * Генерирует текстовое описание доски для LLM (Saplin style)
 */
export function getVerbalBoard(fen: string): string {
  const chess = new Chess(fen);
  const board = chess.board();
  let description = "Board State:\n";
  
  const rows = ['8', '7', '6', '5', '4', '3', '2', '1'];
  const cols = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

  for (let i = 0; i < 8; i++) {
    description += `${rows[i]} [`;
    for (let j = 0; j < 8; j++) {
      const piece = board[i][j];
      description += piece ? (piece.color === 'w' ? piece.type.toUpperCase() : piece.type.toLowerCase()) : '.';
      if (j < 7) description += ' ';
    }
    description += "]\n";
  }
  description += "   a b c d e f g h\n\n";

  // Список фигур
  const pieces: string[] = [];
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 8; j++) {
      const piece = board[i][j];
      if (piece) {
        const color = piece.color === 'w' ? 'White' : 'Black';
        const type = piece.type.toUpperCase();
        pieces.push(`${color} ${type} at ${cols[j]}${rows[i]}`);
      }
    }
  }
  description += "Pieces:\n" + pieces.join(', ');

  return description;
}
