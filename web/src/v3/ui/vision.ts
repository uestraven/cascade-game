/**
 * Making the position readable.
 *
 * The measurement that motivates this file: the running score changes
 * hands 7.47 times per game out of 8 chances, and the eventual winner was
 * behind going into the final placement 53.4% of the time. So the
 * ownership count -- the actual victory condition -- is nearly useless as
 * an in-play guide. Meanwhile positional control is worth 38% + 35% + 22%
 * of win rate across its three facets, and none of it is on screen.
 *
 * These functions surface FACTS a player could work out by hand but would
 * find tedious:
 *
 *   openEdges        which edges face an empty cell, and so can be
 *                    attacked next turn
 *   previewPlacement what a placement would capture, split into direct /
 *                    cascade / reach
 *   rotationPreview  the same, for all four turns of the selected card
 *
 * Deliberately NOT here: any score, rating or recommendation for a
 * placement. Exposure is the game's main skill axis, so a number rating
 * it would replace the skill rather than teach it. Facts the player can
 * verify, not verdicts.
 *
 * Everything reads only the public board and the caller's own hand, so
 * nothing here can leak a hidden hand.
 */

import {
  NB, NCELLS, OPPSIDE, orientations, popcount,
  type Board, type Card,
} from '../engine';
import {
  type Candidate, type GameState, type Option, applyMove, isOver,
} from '../game';

/** Sides of `cell` that face an empty cell. Empty cells return nothing. */
export function openSides(b: Board, cell: number): number[] {
  if (b.cards[cell] === null) return [];
  const out: number[] = [];
  for (let d = 0; d < 4; d++) {
    const t = NB[cell][d];
    if (t >= 0 && b.cards[t] === null) out.push(d);
  }
  return out;
}

export interface OpenEdge {
  cell: number;
  side: number;
  element: number;
  owner: number;
}

/** Every attackable edge on the board, for both players. Public info. */
export function openEdges(b: Board): OpenEdge[] {
  const out: OpenEdge[] = [];
  for (let cell = 0; cell < NCELLS; cell++) {
    const c = b.cards[cell];
    if (!c) continue;
    const owner = ((b.own[0] >>> cell) & 1) ? 0
      : ((b.own[1] >>> cell) & 1) ? 1 : -1;
    for (const side of openSides(b, cell)) {
      out.push({ cell, side, element: c[side], owner });
    }
  }
  return out;
}

/**
 * Can a card placed on `cell` be beaten on `side` by SOME card? Always
 * yes, as it happens -- every element has exactly three beaters and a
 * four-element card can be aimed any of four ways -- which is why this
 * returns the beaters themselves rather than a yes/no. Showing a player
 * "Fire here loses to Water, Lightning or Shadow" is a fact; showing them
 * "this edge is 37.5% unsafe" is a verdict.
 */
export function beatenBy(element: number, beats: (a: number, b: number) => boolean,
                         elements: readonly number[]): number[] {
  return elements.filter((e) => beats(e, element));
}

export type CaptureKind = 'direct' | 'cascade' | 'reach';

export interface Preview {
  /** cells taken by the placed card itself */
  direct: number;
  /** cells taken by the chain that followed */
  cascade: number;
  /** cells taken by Scorch / Backlash / Beacon, which start no chain */
  reach: number;
  total: number;
  /** the placed card's elements left facing an empty cell */
  exposed: { side: number; element: number }[];
  /** my cards that end up attackable, including ones I already had */
  myOpenEdges: number;
}

const REACH_KINDS = new Set(['scorch', 'backlash', 'beacon']);

/**
 * What a placement would do. Runs the real engine on a clone -- applyMove
 * already clones the board -- so this cannot drift from the rules the way
 * a reimplemented preview would.
 */
export function previewPlacement(
  g: GameState, player: number, cell: number, edges: Card, option: Option,
  handIndex = 0,
): Preview | null {
  if (isOver(g) || g.board.cards[cell] !== null) return null;
  // The hand index matters even though the captures depend only on `edges`
  // and `cell`: applyMove reads the ability off hand[handIndex] to decide
  // whether the option is live, so passing the wrong card silently drops
  // the ability from the preview.
  if (handIndex < 0 || handIndex >= g.hands[player].length) return null;
  const c: Candidate = { handIndex, cell, edges, option };
  let applied;
  try {
    applied = applyMove(g, c);
  } catch {
    return null;
  }
  const waves = applied.resolution.waves;

  // Reach resolves after the chain and is appended as its own wave of
  // exactly one cell, so it is identifiable rather than guessed at.
  let reach = 0;
  let chainWaves = waves;
  if (option && REACH_KINDS.has(option.kind) && 'cell' in option
      && waves.length > 0) {
    const last = waves[waves.length - 1];
    if (last === (1 << option.cell)) {
      reach = last;
      chainWaves = waves.slice(0, -1);
    }
  }
  const direct = chainWaves.length > 0 ? chainWaves[0] : 0;
  let cascade = 0;
  for (let i = 1; i < chainWaves.length; i++) cascade |= chainWaves[i];

  const after = applied.state.board;
  const exposed = openSides(after, cell).map((side) => ({
    side, element: (after.cards[cell] as Card)[side],
  }));
  let myOpenEdges = 0;
  for (let i = 0; i < NCELLS; i++) {
    if (((after.own[player] >>> i) & 1) === 0) continue;
    myOpenEdges += openSides(after, i).length;
  }

  return {
    direct, cascade, reach,
    total: popcount(direct) + popcount(cascade) + popcount(reach),
    exposed, myOpenEdges,
  };
}

export interface RotationOption {
  spin: number;             // quarter turns clockwise
  edges: Card;
  preview: Preview | null;  // null when no cell is being considered
}

/**
 * All four turns of one card, with what each would do at `cell`. When
 * `cell` is null the previews are null and only the edges are offered,
 * because captures are meaningless without a target cell.
 */
export function rotationPreview(
  g: GameState, player: number, card: Card, cell: number | null,
  option: Option = null, handIndex = 0,
): RotationOption[] {
  return orientations(card).map((edges, spin) => ({
    spin,
    edges,
    preview: cell === null
      ? null
      : previewPlacement(g, player, cell, edges, option, handIndex),
  }));
}

/** Which cells an opponent card could be placed on to attack me. */
export function threatenedCells(b: Board, player: number): number[] {
  const out: number[] = [];
  for (let cell = 0; cell < NCELLS; cell++) {
    if (b.cards[cell] !== null) continue;
    let touches = false;
    for (let d = 0; d < 4; d++) {
      const t = NB[cell][d];
      if (t >= 0 && b.cards[t] !== null && ((b.own[player] >>> t) & 1)) {
        touches = true;
        break;
      }
    }
    if (touches) out.push(cell);
  }
  return out;
}

export { OPPSIDE };
