import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  NCELLS, TURN_ORDER, cardName, faces, isEmpty, popcount, rotateCW,
  type Board,
} from '../engine';
import {
  type GameState,
  activateLeader, applyMove, isOver, leaderChoices, leaderChoicesFor,
  newGame, ownershipSteps, score, toMove,
} from '../game';
import {
  BLURB, LEADERS, REVEAL_COUNT, TARGETING, type LeaderId, type Payload,
} from '../leaders';
import { type Difficulty, pick } from '../bot';
import { mulberry32, randomSeed, sample } from '../rng';
import { CardFace } from './CardFace';

const leaderArt = (l: LeaderId) =>
  `/art/leaders/leader_${l.toLowerCase()}.svg`;

const WAVE_MS = 320;
const BOT_THINK_MS = 420;

interface Anim {
  steps: [number, number][];
  waves: number[];
  index: number;
}

type Targeting = { first: number | null } | null;

export function App() {
  const [seed, setSeed] = useState(() => randomSeed());
  const [mySeat, setMySeat] = useState(0);
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [phase, setPhase] = useState<'draft' | 'play'>('draft');
  const [game, setGame] = useState<GameState>(() => newGame(seed));
  const [selected, setSelected] = useState<number | null>(null);
  const [targeting, setTargeting] = useState<Targeting>(null);
  const [hover, setHover] = useState<number | null>(null);
  /** Co-cast window: you have placed, and may still fire your leader before
   *  the opponent moves. Casting after a placement is the stronger line for
   *  Lover and Tantalus, so the rule needs to be reachable. */
  const [postWindow, setPostWindow] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [anim, setAnim] = useState<Anim | null>(null);
  const botRng = useRef(mulberry32(seed ^ 0x5bf03635));

  /** The four leaders on offer this match, derived from the seed. */
  const revealed = useMemo(
    () => sample(mulberry32(seed ^ 0x1a2b3c4d), LEADERS, REVEAL_COUNT),
    [seed],
  );

  const reset = useCallback((s: number, seat: number) => {
    setSeed(s);
    setMySeat(seat);
    setPhase('draft');
    setGame(newGame(s));
    setSelected(null);
    setTargeting(null);
    setPostWindow(false);
    setLog([]);
    setAnim(null);
    botRng.current = mulberry32(s ^ 0x5bf03635);
  }, []);

  const chooseLeader = (mine: LeaderId) => {
    const rest = revealed.filter((l) => l !== mine);
    const theirs = rest[Math.floor(botRng.current() * rest.length)];
    const leaders: [LeaderId | null, LeaderId | null] = [null, null];
    leaders[mySeat] = mine;
    leaders[1 - mySeat] = theirs;
    setGame(newGame(seed, leaders));
    setPhase('play');
    setLog([`You take ${mine}. Bot takes ${theirs}.`]);
  };

  // ---- animation ---------------------------------------------------------
  const startAnim = (before: Board, player: number, cell: number,
                     waves: number[], after: GameState) => {
    const steps = ownershipSteps(before, { player, cell },
                                 { captured: 0, waves });
    setGame(after);
    setSelected(null);
    setTargeting(null);
    setAnim({ steps, waves, index: 0 });
  };

  useEffect(() => {
    if (!anim) return;
    if (anim.index >= anim.steps.length - 1) {
      const t = setTimeout(() => setAnim(null), WAVE_MS);
      return () => clearTimeout(t);
    }
    const t = setTimeout(
      () => setAnim((a) => (a ? { ...a, index: a.index + 1 } : a)),
      WAVE_MS);
    return () => clearTimeout(t);
  }, [anim]);

  const note = (line: string) =>
    setLog((l) => [line, ...l].slice(0, 9));

  // ---- moves -------------------------------------------------------------
  const doPlace = useCallback((g: GameState, cardIndex: number,
                               cell: number, who: string, seat?: number) => {
    const before = g.board;
    const { state, resolution, move } = applyMove(g, cardIndex, cell);
    if (seat !== undefined && !state.leaders[seat].used &&
        leaderChoicesFor(state, seat).length > 0) {
      setPostWindow(true);
    }
    note(`${who} played ${cardName(move.card)} on ${cell}` +
      (resolution.captured
        ? ` — captured ${resolution.captured}` +
          (resolution.waves.length > 1
            ? ` in ${resolution.waves.length} waves` : '')
        : ''));
    startAnim(before, move.player, cell, resolution.waves, state);
  }, []);

  const doLeader = useCallback((g: GameState, payload: Payload,
                                who: string, asPlayer?: number) => {
    const before = g.board;
    const player = asPlayer ?? toMove(g);
    const kind = g.leaders[player].leader!;
    const { state, resolution } = activateLeader(g, payload, player);
    setPostWindow(false);
    const where = payload === null ? ''
      : Array.isArray(payload) ? ` (${payload[0]} ↔ ${payload[1]})`
      : ` (cell ${payload})`;
    note(`${who} activated ${kind}${where}` +
      (resolution.captured ? ` — captured ${resolution.captured}` : ''));
    // a leader places nothing, so no cell is granted at step 0
    startAnim(before, player, -1, resolution.waves, state);
  }, []);

  // bot turn: fire its leader on its third slot, then place
  useEffect(() => {
    if (phase !== 'play' || anim || isOver(game) || postWindow) return;
    if (toMove(game) === mySeat) return;
    const t = setTimeout(() => {
      const bot = 1 - mySeat;
      const slots = TURN_ORDER.map((p, i) => (p === bot ? i : -1))
        .filter((i) => i >= 0);
      const fireOn = slots[Math.min(2, slots.length - 1)];
      const opts = leaderChoices(game);
      if (game.turn === fireOn && !game.leaders[bot].used && opts.length) {
        doLeader(game, opts[Math.floor(botRng.current() * opts.length)], 'Bot');
        return;
      }
      const m = pick(game, botRng.current, difficulty);
      doPlace(game, m.cardIndex, m.cell, 'Bot');
    }, BOT_THINK_MS);
    return () => clearTimeout(t);
  }, [phase, anim, game, mySeat, difficulty, postWindow, doPlace, doLeader]);

  // ---- derived -----------------------------------------------------------
  const shownOwn: [number, number] = anim
    ? anim.steps[anim.index]
    : [game.board.own[0], game.board.own[1]];
  const flashMask = anim && anim.index > 0 ? anim.waves[anim.index - 1] : 0;

  const myTurn = phase === 'play' && !anim && !isOver(game) &&
    toMove(game) === mySeat;
  const me = game.leaders[mySeat];
  const them = game.leaders[1 - mySeat];
  // computed regardless of whose turn it is, so the button label can tell
  // "no legal target" apart from "not your turn"
  const canAct = phase === 'play' && !anim &&
    (myTurn || (postWindow && !isOver(game)));
  const choices = canAct ? leaderChoicesFor(game, mySeat) : [];
  const mode = me.leader ? TARGETING[me.leader] : 'none';

  /** Cells that are legal targets right now. */
  const targetCells = useMemo(() => {
    if (!targeting) return new Set<number>();
    if (mode === 'pair') {
      const pairs = choices as [number, number][];
      if (targeting.first === null) {
        return new Set(pairs.flat());
      }
      return new Set(pairs
        .filter((p) => p.includes(targeting.first!))
        .map((p) => (p[0] === targeting.first ? p[1] : p[0])));
    }
    return new Set(choices as number[]);
  }, [targeting, choices, mode]);

  const onCell = (cell: number) => {
    if (!canAct) return;
    if (targeting) {
      if (!targetCells.has(cell)) return;
      if (mode === 'pair') {
        if (targeting.first === null) { setTargeting({ first: cell }); return; }
        doLeader(game, [Math.min(targeting.first, cell),
                        Math.max(targeting.first, cell)] as [number, number],
                 'You', mySeat);
        return;
      }
      doLeader(game, cell, 'You', mySeat);
      return;
    }
    if (selected === null || !isEmpty(game.board, cell)) return;
    doPlace(game, selected, cell, 'You', mySeat);
  };

  const beginLeader = () => {
    if (!canAct || me.used || !choices.length) return;
    if (mode === 'none') { doLeader(game, null, 'You', mySeat); return; }
    setSelected(null);
    setTargeting({ first: null });
  };

  const finished = isOver(game) && !anim;
  const result = useMemo(() => {
    if (!finished) return null;
    const [a, b] = score(game);
    const mine = mySeat === 0 ? a : b;
    return { mine, theirs: mySeat === 0 ? b : a, won: mine > (mySeat === 0 ? b : a) };
  }, [finished, game, mySeat]);

  const preview = useMemo(() => {
    if (!targeting || hover === null || me.leader !== 'SCAVENGER') return null;
    const card = game.board.cards[hover];
    if (!card) return null;
    return `${faces(card).join('/')} → ${faces(rotateCW(card)).join('/')}`;
  }, [targeting, hover, me.leader, game.board]);

  // ---- draft -------------------------------------------------------------
  if (phase === 'draft') {
    return (
      <div className="app">
        <Header {...{ seed, mySeat, difficulty, setDifficulty, reset }} />
        <h2 className="drafthead">
          {REVEAL_COUNT} of {LEADERS.length} leaders revealed — choose one
        </h2>
        <div className="draft">
          {revealed.map((l) => (
            <button key={l} className="leadercard"
                    onClick={() => chooseLeader(l)}>
              <span className="portrait"
                    style={{ backgroundImage: `url(${leaderArt(l)})` }} />
              <strong>{l}</strong>
              <span className="blurb">{BLURB[l]}</span>
            </button>
          ))}
        </div>
        <p className="status">
          the bot picks from whatever you leave behind
        </p>
      </div>
    );
  }

  // ---- play --------------------------------------------------------------
  return (
    <div className="app">
      <Header {...{ seed, mySeat, difficulty, setDifficulty, reset }} />

      <div className="scoreline">
        <span className="chip p1-chip">you {popcount(shownOwn[mySeat])}</span>
        <TurnStrip turn={game.turn} mySeat={mySeat} />
        <span className="chip p2-chip">
          bot {popcount(shownOwn[1 - mySeat])}
        </span>
      </div>

      <div className="leaderbar">
        {me.leader && (
          <span className="portrait-sm" title={me.leader}
                style={{ backgroundImage: `url(${leaderArt(me.leader)})` }} />
        )}
        <button className="leaderbtn" onClick={beginLeader}
                disabled={!canAct || me.used || !choices.length}>
          {me.leader ?? '—'}
          {me.used ? ' · spent'
            : !canAct ? ' · ready'
            : choices.length ? ' · ready'
            : ' · no legal target'}
        </button>
        {me.auraLeft > 0 && (
          <span className="badge">aura {me.auraLeft} placement(s)</span>
        )}
        {postWindow && (
          <button className="tiny"
                  onClick={() => setPostWindow(false)}>
            pass
          </button>
        )}
        {game.frozen > 0 && (
          <span className="badge">
            frozen {Array.from({ length: NCELLS }, (_, i) => i)
              .filter((i) => (game.frozen >>> i) & 1).join(', ')}
          </span>
        )}
        <span className="muted small">
          {them.leader && (
            <span className="portrait-sm" title={them.leader}
                  style={{ backgroundImage: `url(${leaderArt(them.leader)})`,
                           display: 'inline-block',
                           verticalAlign: 'middle',
                           marginRight: '5px' }} />
          )}
          bot: {them.leader ?? '—'}{them.used ? ' (spent)' : ''}
        </span>
      </div>

      {targeting && (
        <p className="hint">
          {mode === 'pair'
            ? targeting.first === null
              ? 'pick the first of two adjacent cards you own'
              : `pick a card adjacent to ${targeting.first}`
            : mode === 'enemy'
              ? 'pick an enemy card'
              : 'pick any card'}
          {preview && <span className="prev"> {preview}</span>}
          <button className="tiny" onClick={() => setTargeting(null)}>
            cancel
          </button>
        </p>
      )}

      <div className="board">
        {Array.from({ length: NCELLS }, (_, cell) => {
          const card = game.board.cards[cell];
          const owner = (shownOwn[0] >>> cell) & 1 ? 0
            : (shownOwn[1] >>> cell) & 1 ? 1 : -1;
          const placeable = myTurn && !targeting && selected !== null &&
            isEmpty(game.board, cell);
          const isTarget = targeting && targetCells.has(cell);
          return (
            <div key={cell}
                 className={`cell${placeable ? ' placeable' : ''}` +
                   `${isTarget ? ' target' : ''}` +
                   `${targeting?.first === cell ? ' picked' : ''}`}
                 onClick={() => onCell(cell)}
                 onMouseEnter={() => setHover(cell)}
                 onMouseLeave={() => setHover(null)}>
              {card ? (
                <CardFace card={card} owner={owner}
                          frozen={((game.frozen >>> cell) & 1) === 1}
                          flash={((flashMask >>> cell) & 1) === 1} />
              ) : <span className="cellno">{cell}</span>}
            </div>
          );
        })}
      </div>

      <div className="hand">
        {game.hands[mySeat].map((card, i) => (
          <button key={`${card}-${i}`}
                  className={`handslot${selected === i ? ' sel' : ''}`}
                  disabled={!myTurn || !!targeting || postWindow}
                  onClick={() => setSelected(selected === i ? null : i)}>
            <CardFace card={card} owner={mySeat}
                      dim={!myTurn || !!targeting} />
          </button>
        ))}
        {game.hands[mySeat].length === 0 &&
          <span className="muted">hand empty</span>}
      </div>

      {me.seesOpponentHand && game.hands[1 - mySeat].length > 0 && (
        <p className="revealed">
          bot hand: {game.hands[1 - mySeat].map(cardName).join('  ·  ')}
        </p>
      )}

      <p className="status">
        {finished
          ? `final ${result!.mine}–${result!.theirs} — ${
              result!.won ? 'you win' : 'bot wins'}`
          : anim ? 'resolving…'
          : targeting ? 'choosing a target…'
          : postWindow ? 'you may still use your leader — or pass'
          : myTurn
            ? selected === null
              ? 'pick a card, then a cell' + (me.used ? '' : ' — or use your leader')
              : 'choose a cell'
            : 'bot thinking…'}
      </p>

      <ul className="log">{log.map((l, i) => <li key={i}>{l}</li>)}</ul>
    </div>
  );
}

function Header({ seed, mySeat, difficulty, setDifficulty, reset }: {
  seed: number; mySeat: number; difficulty: Difficulty;
  setDifficulty: (d: Difficulty) => void;
  reset: (s: number, seat: number) => void;
}) {
  return (
    <header>
      <h1>cascade</h1>
      <div className="controls">
        <label>seat
          <select value={mySeat}
                  onChange={(e) => reset(seed, Number(e.target.value))}>
            <option value={0}>P1 — 5 cards, first &amp; last</option>
            <option value={1}>P2 — 4 cards</option>
          </select>
        </label>
        <label>bot
          <select value={difficulty}
                  onChange={(e) =>
                    setDifficulty(e.target.value as Difficulty)}>
            <option value="easy">easy</option>
            <option value="normal">normal</option>
            <option value="hard">hard</option>
          </select>
        </label>
        <button onClick={() => reset(randomSeed(), mySeat)}>new game</button>
        <span className="seed">#{seed}</span>
      </div>
    </header>
  );
}

function TurnStrip({ turn, mySeat }: { turn: number; mySeat: number }) {
  return (
    <div className="strip" title="turn order: A A B B A A B B A">
      {TURN_ORDER.map((p, i) => (
        <span key={i} className={[
          'seg', p === mySeat ? 'mine' : 'theirs',
          i === turn ? 'now' : i < turn ? 'done' : '',
        ].filter(Boolean).join(' ')} />
      ))}
    </div>
  );
}
