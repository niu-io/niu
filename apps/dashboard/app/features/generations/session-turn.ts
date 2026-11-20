import type { GenerationsTurn } from '@niu-io/sdk/generations-sessions';

/** A saved turn is addressed by its readable request or run reference. */
export function readableTurnAnchor(turn: GenerationsTurn) {
  return turn.task?.reference ?? turn.intent?.reference ?? `turn-${turn.sequence}`;
}

export function savedTurnHref(sessionReference: string, turn?: GenerationsTurn) {
  const anchor = turn ? readableTurnAnchor(turn) : '';
  return `/generations/${encodeURIComponent(sessionReference)}${anchor ? `#${encodeURIComponent(anchor)}` : ''}`;
}
