import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  type Board, type BoardName, type Card, BOARDS, ROTATIONS, popcount,
  rot90,
} from '../engine';
import {
  type AbilityId, type Candidate, type GameState, type Option,
  ABILITY_FROM_PLACEMENT, ABILITY_INFO, SHAPE_INFO, abilityLive,
  abilityOptions, applyMove, cardShape, isOver, newGame, ownershipSteps,
  placedCount, score, toMove,
} from '../game';
import { describeOption } from '../abilities';
import { pick, type Difficulty } from '../bot';
import { mulberry32, randomSeed } from '../../rng';
import { CardFace } from './CardFace';
import { SIGIL_NAMES, SIGIL_SHAPE, Sigil } from './Sigil';
import { isMuted, loadMuted, primeAudio, setMuted, sfx } from './sound';

interface Pick {
  option: Option;
  label: string;
  captured: number;
  /** cells this card takes directly, and cells the chain takes */
  direct: number;
  chain: number;
}
interface Picker { cell: number; options: Pick[] }

const WAVE_MS = 320;
const BOT_MS = 420;

interface Anim { steps: [number, number][]; waves: number[]; index: number }

/** 'bot' plays the other seat; 'hotseat' passes the device between two
 *  people, which means there is no "you" and the UI has to say whose turn
 *  it is far more loudly. */
type Mode = 'bot' | 'hotseat';

export function App() {
  const [boardName, setBoardName] = useState<BoardName>('3x3');
  const [seed, setSeed] = useState(() => randomSeed());
  const [mode, setMode] = useState<Mode>('bot');
  const [mySeat, setMySeat] = useState(0);
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [mute, setMute] = useState(() => loadMuted());
  const [game, setGame] = useState<GameState>(
    () => newGame(seed, BOARDS['3x3']));
  const [sel, setSel] = useState<number | null>(null);
  const [spin, setSpin] = useState(0);
  const [armed, setArmed] = useState(false);
  const [picker, setPicker] = useState<Picker | null>(null);
  const [pickHover, setPickHover] = useState<number | null>(null);
  const [anim, setAnim] = useState<Anim | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [landed, setLanded] = useState<number | null>(null);
  const pendingCell = useRef<number | null>(null);
  const botRng = useRef(mulberry32(seed ^ 0x9e3779b9));

  const reset = useCallback((s: number, seat: number, bn: BoardName) => {
    setSeed(s); setMySeat(seat); setBoardName(bn);
    setGame(newGame(s, BOARDS[bn]));
    setSel(null); setSpin(0); setArmed(false); setPicker(null);
    setPickHover(null);
    setAnim(null); setHover(null); setLog([]); setLanded(null);
    botRng.current = mulberry32(s ^ 0x9e3779b9);
  }, []);

  const commit = useCallback((g: GameState, c: Candidate, who: string) => {
    const before: Board = g.board;
    const { state, resolution, move, events } = applyMove(g, c);
    const opt = move.option;
    const bits: string[] = [];
    bits.push(`${who} placed ${move.placed.ability} on cell ${move.cell}`);
    if (opt) bits.push(`${opt.kind} — ${describeOption(opt)}`);
    for (const e of events) {
      bits.push(e.wild
        ? `wild edge took cell ${e.target}`
        : `${SIGIL_NAMES[e.sigil]} matched ${SIGIL_NAMES[e.sigil]} `
          + `— took cell ${e.target}${e.wave > 0 ? ' (chain)' : ''}`);
    }
    if (!events.length) bits.push('nothing matched');
    setLog((l) => [...bits.reverse(), ...l].slice(0, 16));

    sfx('place');
    if (opt) sfx('ability');
    if (!events.length) sfx('nothing');
    setLanded(move.cell);
    setGame(state);
    setSel(null); setSpin(0); setArmed(false); setPicker(null);
    setPickHover(null);
    setHover(null);
    setAnim({ steps: ownershipSteps(before, move, resolution.waves),
              waves: resolution.waves, index: 0 });
  }, []);

  useEffect(() => {
    if (!anim) return;
    if (anim.index >= anim.steps.length - 1) {
      const t = setTimeout(() => setAnim(null), WAVE_MS);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setAnim((a) => {
      if (!a) return a;
      const next = a.index + 1;
      const taken = popcount(a.waves[a.index] ?? 0);
      // the first wave is the card's own captures; later ones are chain
      for (let i = 0; i < taken; i++) {
        sfx(a.index === 0 ? 'capture' : 'cascade', i + a.index * 2);
      }
      return { ...a, index: next };
    }), WAVE_MS);
    return () => clearTimeout(t);
  }, [anim]);

  // the result chime, once, when the game settles
  const chimed = useRef(false);
  useEffect(() => {
    if (anim || !isOver(game)) return;
    if (chimed.current) return;
    chimed.current = true;
    const [a, b] = score(game);
    if (a === b) return;
    if (mode === 'hotseat') sfx('win');
    else sfx(((a > b) === (mySeat === 0)) ? 'win' : 'lose');
  }, [anim, game, mode, mySeat]);
  useEffect(() => { chimed.current = false; }, [seed, boardName]);

  useEffect(() => {
    if (mode !== 'bot') return;
    if (anim || isOver(game) || toMove(game) === mySeat) return;
    const t = setTimeout(
      () => commit(game, pick(game, botRng.current, difficulty), 'Bot'),
      BOT_MS);
    return () => clearTimeout(t);
  }, [mode, anim, game, mySeat, difficulty, commit]);

  const s = game.shape;
  const shownOwn: [number, number] = anim
    ? anim.steps[anim.index] : [game.board.own[0], game.board.own[1]];
  const flash = anim && anim.index > 0 ? anim.waves[anim.index - 1] : 0;
  const active = mode === 'hotseat' ? toMove(game) : mySeat;
  const myTurn = !anim && !isOver(game)
    && (mode === 'hotseat' ? true : toMove(game) === mySeat);
  const hand = game.hands[active < 0 ? 0 : active];
  const card = sel !== null ? hand[sel] : null;
  const spinCard = (c: Card, n: number): Card => {
    let out = c;
    for (let i = 0; i < ((n % 4) + 4) % 4; i++) out = rot90(out);
    return out;
  };
  const sigils: Card | null = card ? spinCard(card.sigils, spin) : null;
  const live = abilityLive(game, active < 0 ? 0 : active);

  // which artwork sits on each cell. Ownership changes during a cascade
  // but the artwork does not -- it belongs to the card, not the player.
  const artAt = useMemo(() => {
    const m = new Map<number, number>();
    for (const mv of game.history) {
      if (mv.placed.art) m.set(mv.cell, mv.placed.art);
    }
    // Exchange swaps two cards, so the art follows the swap
    for (const mv of game.history) {
      if (mv.option?.kind === 'exchange') {
        const a = m.get(mv.cell);
        const b = m.get(mv.option.cell);
        if (a !== undefined) m.set(mv.option.cell, a);
        if (b !== undefined) m.set(mv.cell, b);
        else m.delete(mv.cell);
      }
    }
    return m;
  }, [game.history]);

  const openMap = useMemo(() => {
    const m = new Map<number, number[]>();
    for (let i = 0; i < s.cells; i++) {
      if (!game.board.cards[i]) continue;
      const o: number[] = [];
      for (let d = 0; d < 4; d++) {
        const t = s.nb[i][d];
        if (t >= 0 && game.board.cards[t] === null) o.push(d);
      }
      if (o.length) m.set(i, o);
    }
    return m;
  }, [game.board, s]);

  // what each rotation would take at the hovered cell -- facts the player
  // could work out, with the tedium removed
  const rotations = useMemo(() => {
    if (!myTurn || !card) return null;
    return [0, 1, 2, 3].map((n) => {
      const e = spinCard(card.sigils, n);
      if (hover === null || game.board.cards[hover] !== null) {
        return { spin: n, sigils: e, took: null as number | null };
      }
      try {
        const a = applyMove(game, { handIndex: sel!, cell: hover,
                                    sigils: e, option: null });
        return { spin: n, sigils: e, took: a.resolution.captured };
      } catch { return { spin: n, sigils: e, took: null }; }
    });
  }, [myTurn, card, hover, game, sel]);

  const preview = useMemo(() => {
    if (!myTurn || sel === null || !sigils || hover === null) return null;
    if (game.board.cards[hover] !== null) return null;
    try {
      const a = applyMove(game, { handIndex: sel, cell: hover,
                                  sigils, option: null });
      const direct = a.resolution.waves[0] ?? 0;
      let chain = 0;
      for (let i = 1; i < a.resolution.waves.length; i++) {
        chain |= a.resolution.waves[i];
      }
      return { direct, chain };
    } catch { return null; }
  }, [myTurn, sel, sigils, hover, game]);

  /**
   * Every choice the armed card offers at `cell`, each with what it
   * would actually do. The outcome is computed by running the real
   * engine on a throwaway copy, so the number in the list is the number
   * the player will get -- not an estimate, and not a second
   * implementation of the rules that could disagree with the first.
   */
  const optionsAt = useCallback((cell: number): Pick[] => {
    if (sel === null || !sigils || !card) return [];
    return abilityOptions(game, active, card.ability, cell, sigils)
      .map((option) => {
        try {
          const a = applyMove(game, { handIndex: sel, cell, sigils,
                                      option });
          let chain = 0;
          for (let i = 1; i < a.resolution.waves.length; i++) {
            chain |= a.resolution.waves[i];
          }
          return { option, label: describeOption(option),
                   captured: a.resolution.captured,
                   direct: a.resolution.waves[0] ?? 0, chain };
        } catch {
          return { option, label: describeOption(option), captured: 0,
                   direct: 0, chain: 0 };
        }
      });
  }, [game, active, card, sel, sigils]);

  const place = (cell: number, option: Option) => {
    if (sel === null || !sigils) return;
    setPicker(null); setPickHover(null);
    commit(game, { handIndex: sel, cell, sigils, option },
           mode === 'hotseat' ? `P${active + 1}` : 'You');
  };

  const onCell = (cell: number) => {
    if (!myTurn || sel === null || !sigils) return;
    if (game.board.cards[cell] !== null) return;
    if (!armed || !live || !card) { place(cell, null); return; }
    const opts = optionsAt(cell);
    // nothing to choose between is not a choice worth a dialog
    if (opts.length <= 1) { place(cell, opts[0]?.option ?? null); return; }
    setPicker({ cell, options: opts });
    setPickHover(null);
  };

  const finished = isOver(game) && !anim;
  const result = useMemo(() => {
    if (!finished) return null;
    const [a, b] = score(game);
    const mine = mySeat === 0 ? a : b;
    const theirs = mySeat === 0 ? b : a;
    return { mine, theirs, won: mine > theirs, tied: mine === theirs,
             p1: a, p2: b };
  }, [finished, game, mySeat]);

  return (
    <div className="page">
      <div className="app">
        <h1>cascade</h1>
        <p className="subtitle">prototype a — matching sigils</p>

        <div className="controls">
          <label>board
            <select value={boardName}
                    onChange={(e) =>
                      reset(seed, mySeat, e.target.value as BoardName)}>
              {(Object.keys(BOARDS) as BoardName[]).map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </label>
          <label>mode
            <select value={mode}
                    onChange={(e) => {
                      setMode(e.target.value as Mode);
                      reset(seed, mySeat, boardName);
                    }}>
              <option value="bot">vs computer</option>
              <option value="hotseat">two players, one screen</option>
            </select>
          </label>
          <label>seat
            <select value={mySeat}
                    disabled={mode === 'hotseat'}
                    onChange={(e) =>
                      reset(seed, Number(e.target.value), boardName)}>
              <option value={0}>P1 — moves first</option>
              <option value={1}>P2 — moves second</option>
            </select>
          </label>
          <label>bot
            <select value={difficulty} disabled={mode === 'hotseat'}
                    onChange={(e) =>
                      setDifficulty(e.target.value as Difficulty)}>
              <option value="easy">easy</option>
              <option value="normal">normal</option>
            </select>
          </label>
          <button onClick={() => reset(randomSeed(), mySeat, boardName)}>
            new game
          </button>
          <button className="mutebtn"
                  onClick={() => { const m = !mute; setMute(m); setMuted(m);
                                   if (!m) { primeAudio(); sfx('select'); } }}>
            {mute ? 'sound off' : 'sound on'}
          </button>
          <span className="seed">#{seed}</span>
        </div>

        <div className="rule">
          <b>Matching facing sigils capture.</b> Different sigils do
          nothing. Only the card you place attacks.
        </div>

        {mode === 'hotseat' && !isOver(game) && (
          <div className={`turnbanner ${active === 0 ? 'p1' : 'p2'}`}>
            Player {active + 1} to place
            <span className="pass">
              {anim ? 'resolving…' : 'pass the screen when you are done'}
            </span>
          </div>
        )}

        <div className="scoreline quiet">
          <span className={`chip ${active === 0 ? 'p1c' : 'p2c'}`}>
            {mode === 'hotseat' ? 'P1' : 'you'}{' '}
            {popcount(shownOwn[mode === 'hotseat' ? 0 : mySeat])}
          </span>
          <div className="strip">
            {s.order.map((p, i) => (
              <span key={i} className={['seg',
                p === mySeat ? 'mine' : 'theirs',
                i === game.turn ? 'now' : i < game.turn ? 'done' : '']
                .filter(Boolean).join(' ')} />
            ))}
          </div>
          <span className={`chip ${active === 0 ? 'p2c' : 'p1c'}`}>
            {mode === 'hotseat' ? 'P2' : 'bot'}{' '}
            {popcount(shownOwn[mode === 'hotseat' ? 1 : 1 - mySeat])}
          </span>
        </div>

        <div className="row aff">
          <span>
            abilities {live ? 'online'
              : `online from placement ${ABILITY_FROM_PLACEMENT}`}
            {' '}· you have placed {placedCount(game, mySeat)}
            {' '}· {game.reserve.length} card
            {game.reserve.length === 1 ? '' : 's'} never dealt
          </span>
        </div>

        {card && (
          <div className="abilitybox">
            <b>{card.ability.toUpperCase()}</b>{' '}
            <span className="muted">
              changes {ABILITY_INFO[card.ability].changes}
            </span>
            {' · '}
            {live
              ? <button onClick={() => setArmed(!armed)}>
                  {armed ? 'armed ✓' : 'use it'}
                </button>
              : <span className="muted">
                  from your {ABILITY_FROM_PLACEMENT}nd placement
                </span>}
            <p>{ABILITY_INFO[card.ability].text}</p>
            <p className="muted small2">
              this card is <b>{cardShape(card.sigils)}</b> —{' '}
              {SHAPE_INFO[cardShape(card.sigils)]}
            </p>
          </div>
        )}

        {picker && card && (
          <div className="picker">
            <p className="hint">
              <b>{card.ability}</b> on cell {picker.cell} — hover a choice
              to see what it takes, then click it
              <button onClick={() => { setPicker(null); setPickHover(null); }}>
                cancel
              </button>
            </p>
            <ul onMouseLeave={() => setPickHover(null)}>
              {picker.options.map((o, i) => (
                <li key={i}
                    className={`${pickHover === i ? 'on' : ''}`
                      + `${o.captured > 0 ? ' takes' : ''}`}
                    onMouseEnter={() => setPickHover(i)}
                    onClick={() => place(picker.cell, o.option)}>
                  <span className="plabel">{o.label}</span>
                  <span className="pgain">
                    {o.captured > 0
                      ? `takes ${o.captured}`
                      : 'takes nothing'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {card && (
          <div className="previewkey">
            <span><i className="k-open" />exposed edge</span>
            {hover !== null && preview && (
              <>
                <span><i className="k-direct" />this card takes it</span>
                <span><i className="k-cascade" />the chain takes it</span>
              </>
            )}
          </div>
        )}

        <div className="board"
             style={{ gridTemplateColumns: `repeat(${s.cols}, var(--cell))` }}>
          {Array.from({ length: s.cells }, (_, cell) => {
            const c = game.board.cards[cell];
            const owner = (shownOwn[0] >>> cell) & 1 ? 0
              : (shownOwn[1] >>> cell) & 1 ? 1 : -1;
            const placeable = myTurn && !picker && sel !== null
              && c === null;
            const isTarget = !!picker && picker.cell === cell;
            const bit = 1 << cell;
            // while the picker is open the highlight shows the option
            // under the cursor, so the player sees each result before
            // choosing between them
            const shown = picker
              ? (pickHover !== null ? picker.options[pickHover] : null)
              : preview;
            const kind = shown
              ? (shown.direct & bit ? ' cap-direct'
                : shown.chain & bit ? ' cap-cascade' : '')
              : '';
            return (
              <div key={cell}
                   className={`cell${placeable ? ' placeable' : ''}`
                     + `${isTarget ? ' target' : ''}${kind}`
                     + `${hover === cell && placeable ? ' hovering' : ''}`}
                   onMouseEnter={() => setHover(cell)}
                   onMouseLeave={() =>
                     setHover((h) => (h === cell ? null : h))}
                   onClick={() => onCell(cell)}>
                {c
                  ? <CardFace sigils={c} owner={owner}
                              art={artAt.get(cell)}
                              open={openMap.get(cell)}
                              flash={((flash >>> cell) & 1) === 1}
                              flipping={((flash >>> cell) & 1) === 1}
                              landing={landed === cell && !anim} />
                  : <span className="cellno">{cell}</span>}
              </div>
            );
          })}
        </div>

        {mode === 'hotseat' && (
          <p className="handlabel">Player {active + 1}’s hand</p>
        )}
        <div className="hand">
          {hand.map((h, i) => (
            <button key={i} className={`slot${sel === i ? ' sel' : ''}`}
                    disabled={!myTurn || !!picker}
                    onClick={() => {
                      primeAudio();
                      setSel(sel === i ? null : i);
                      setSpin(0); setArmed(false); setHover(null);
                      if (sel !== i) sfx('select');
                    }}>
              <CardFace sigils={sel === i ? spinCard(h.sigils, spin)
                                          : h.sigils}
                        owner={active} small art={h.art}
                        dim={!myTurn || !!picker} />
              <small className={live ? 'live' : ''}>{h.ability}</small>
            </button>
          ))}
          {hand.length === 0 && <span className="muted">hand empty</span>}
        </div>

        {card && rotations && (
          <div className="rotstrip">
            {rotations.map((r) => (
              <button key={r.spin}
                      className={`rot${r.spin === spin ? ' sel' : ''}`}
                      onClick={() => {
                        if (r.spin !== spin) sfx('rotate');
                        setSpin(r.spin);
                      }}>
                <span className="deg">{r.spin * 90}°</span>
                <CardFace sigils={r.sigils} owner={active} small
                          art={card.art} />
                <span className="rotcaps">
                  {r.took === null ? ' '
                    : r.took === 0 ? 'takes nothing' : `takes ${r.took}`}
                </span>
              </button>
            ))}
          </div>
        )}

        {game.reserve.length > 0 && (
          <div className="reserve">
            <span className="handlabel">
              never dealt — {game.reserve.length} card
              {game.reserve.length === 1 ? '' : 's'}
            </span>
            <div className="reservepile">
              {game.reserve.map((_, i) => (
                <CardFace key={i} sigils={[0, 0, 0, 0] as unknown as Card}
                          owner={-1} small faceDown />
              ))}
            </div>
          </div>
        )}

        <p className="status">
          {finished
            ? (mode === 'hotseat'
              ? `final ${result!.p1}–${result!.p2} — `
                + (result!.p1 === result!.p2 ? 'tied'
                  : `Player ${result!.p1 > result!.p2 ? 1 : 2} wins`)
              : result!.tied ? `tied ${result!.mine}–${result!.theirs}`
              : `final ${result!.mine}–${result!.theirs} — `
                + `${result!.won ? 'you win' : 'bot wins'}`)
            : anim ? 'resolving…'
            : picker ? 'choose how to use it…'
            : myTurn
              ? sel === null ? 'pick a card'
                : 'turn it if you like, then pick a cell'
              : 'bot thinking…'}
        </p>

        <ul className="log">
          {log.map((l, i) => <li key={i} className="ln">{l}</li>)}
        </ul>
      </div>

      <aside className="sigilmap">
        <h2>the four sigils</h2>
        <p className="muted small2">
          Matching captures. There is no hierarchy — no sigil beats
          another, so there is nothing to memorise.
        </p>
        <ul>
          {SIGIL_NAMES.map((n, i) => (
            <li key={n}>
              <Sigil sigil={i} size={28} />
              <span><b>{n}</b><br />
                <span className="muted small2">{SIGIL_SHAPE[n]}</span>
              </span>
            </li>
          ))}
        </ul>
        <h2>the four abilities</h2>
        <ul className="abilist">
          {(Object.keys(ABILITY_INFO) as AbilityId[]).map((a) => (
            <li key={a}>
              <b>{a}</b> <span className="muted small2">
                changes {ABILITY_INFO[a].changes}
              </span>
              <br /><span className="small2">{ABILITY_INFO[a].text}</span>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
