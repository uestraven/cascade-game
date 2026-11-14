import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  NAMES, NCELLS, ORDER, ROTATIONS, cardName, orientations, popcount,
  rot90,
  type Board, type Card,
} from '../engine';
import {
  ABILITIES, ABILITY_FROM_PLACEMENT, type Candidate, type GameState,
  type Option, abilityLive, abilityOptions, applyMove, isOver,
  newGame, ownershipSteps, placedCount, score, toMove,
} from '../game';
import { pick, type Difficulty } from '../bot';
import { mulberry32, randomSeed } from '../../rng';
import { CardFace, icon } from './CardFace';
import { ElementMap } from './ElementMap';
import { type Line, narrate, turnLabel } from './narrate';
import {
  openSides, previewPlacement, rotationPreview, threatenedCells,
} from './vision';

const WAVE_MS = 330;
const BOT_MS = 440;

interface Anim { steps: [number, number][]; waves: number[]; index: number }

export function App() {
  const [seed, setSeed] = useState(() => randomSeed());
  const [mySeat, setMySeat] = useState(0);
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [game, setGame] = useState<GameState>(() => newGame(seed));
  const [sel, setSel] = useState<number | null>(null);
  const [spin, setSpin] = useState(0);   // quarter turns clockwise
  const [armed, setArmed] = useState(false);
  const [targeting, setTargeting] = useState<Option[] | null>(null);
  const [anim, setAnim] = useState<Anim | null>(null);
  const [log, setLog] = useState<Line[]>([]);
  const [hover, setHover] = useState<number | null>(null);
  const [showOpen, setShowOpen] = useState(true);
  const botRng = useRef(mulberry32(seed ^ 0x5bf03635));

  const reset = useCallback((s: number, seat: number) => {
    setSeed(s); setMySeat(seat); setGame(newGame(s));
    setSel(null); setSpin(0); setArmed(false);
    setTargeting(null); setAnim(null); setLog([]); setHover(null);
    botRng.current = mulberry32(s ^ 0x5bf03635);
  }, []);

  const commit = useCallback((g: GameState, c: Candidate, who: string) => {
    const before: Board = g.board;
    const { state, resolution, move, events } = applyMove(g, c);
    const spun = orientations(move.placed.edges)
      .findIndex((e) => e.join() === move.placed.edges.join());
    setLog((l) => [
      ...narrate(who, move.cell, cardName(move.placed.edges),
                 Math.max(spun, 0), events,
                 move.placed.ability, move.option),
      ...l].slice(0, 14));
    setGame(state);
    setSel(null); setSpin(0); setArmed(false); setTargeting(null);
    setHover(null);
    setAnim({
      steps: ownershipSteps(before, move, resolution.waves),
      waves: resolution.waves, index: 0,
    });
  }, []);

  useEffect(() => {
    if (!anim) return;
    if (anim.index >= anim.steps.length - 1) {
      const t = setTimeout(() => setAnim(null), WAVE_MS);
      return () => clearTimeout(t);
    }
    const t = setTimeout(
      () => setAnim((a) => (a ? { ...a, index: a.index + 1 } : a)), WAVE_MS);
    return () => clearTimeout(t);
  }, [anim]);

  useEffect(() => {
    if (anim || isOver(game) || toMove(game) === mySeat) return;
    const t = setTimeout(
      () => commit(game, pick(game, botRng.current, difficulty), 'Bot'), BOT_MS);
    return () => clearTimeout(t);
  }, [anim, game, mySeat, difficulty, commit]);

  const shownOwn: [number, number] = anim
    ? anim.steps[anim.index] : [game.board.own[0], game.board.own[1]];
  const flash = anim && anim.index > 0 ? anim.waves[anim.index - 1] : 0;
  const myTurn = !anim && !isOver(game) && toMove(game) === mySeat;
  const hand = game.hands[mySeat];
  const card = sel !== null ? hand[sel] : null;
  const spinCard = (c: Card, n: number): Card => {
    let out = c;
    for (let i = 0; i < (n % 4 + 4) % 4; i++) out = rot90(out);
    return out;
  };
  const edges: Card | null = card ? spinCard(card.edges, spin) : null;
  const live = card ? abilityLive(game, mySeat, card) : false;
  const abilityOn = placedCount(game, mySeat) >= ABILITY_FROM_PLACEMENT - 1;

  // Readability. The running score is nearly uninformative in this game --
  // the lead changes hands 7.47 times out of 8 chances -- so the position
  // itself has to be legible. These are facts the player could work out by
  // hand; no placement is scored or recommended.
  const openMap = useMemo(() => {
    if (!showOpen) return null;
    const m = new Map<number, number[]>();
    for (let i = 0; i < NCELLS; i++) {
      const o = openSides(game.board, i);
      if (o.length) m.set(i, o);
    }
    return m;
  }, [game.board, showOpen]);

  const myThreatened = useMemo(
    () => (showOpen ? new Set(threatenedCells(game.board, mySeat)) : null),
    [game.board, mySeat, showOpen]);

  const preview = useMemo(() => {
    if (!myTurn || sel === null || !edges || hover === null) return null;
    if (game.board.cards[hover] !== null) return null;
    return previewPlacement(game, mySeat, hover, edges, null, sel);
  }, [myTurn, sel, edges, hover, game, mySeat]);

  const rotations = useMemo(() => {
    if (!myTurn || !card) return null;
    return rotationPreview(game, mySeat, card.edges, hover, null,
                           sel ?? 0);
  }, [myTurn, card, game, mySeat, hover]);

  const targetCells = useMemo(() => {
    if (!targeting) return new Set<number>();
    const s = new Set<number>();
    for (const o of targeting) if (o && 'cell' in o) s.add(o.cell);
    return s;
  }, [targeting]);

  const place = (cell: number, option: Option) => {
    if (sel === null || !edges) return;
    commit(game, { handIndex: sel, cell, edges, option }, 'You');
  };

  const onCell = (cell: number) => {
    if (!myTurn || sel === null || !edges) return;
    if (targeting) {
      // Several options can share a target cell -- Beacon offers one per
      // edge. Pick the one that captures: its only outcome is capture or
      // nothing, so preferring a capturing edge is optimal, not a shortcut.
      const here = targeting.filter((o) => o && 'cell' in o && o.cell === cell);
      if (!here.length) return;
      let bestOpt = here[0];
      let bestGain = -1;
      for (const o of here) {
        const got = applyMove(game, {
          handIndex: sel, cell: pendingCell.current!, edges, option: o,
        }).resolution.captured;
        if (got > bestGain) { bestGain = got; bestOpt = o; }
      }
      place(pendingCell.current!, bestOpt);
      return;
    }
    if (game.board.cards[cell] !== null) return;
    if (armed && live && card!.ability) {
      const opts = abilityOptions(game, mySeat, card!, cell)
        .filter((o) => o !== null);
      const needsTarget = opts.some((o) => o && 'cell' in o);
      if (needsTarget) {
        if (!opts.length) { place(cell, null); return; }
        pendingCell.current = cell;
        setTargeting(opts);
        return;
      }
      place(cell, opts[0] ?? null);
      return;
    }
    place(cell, null);
  };
  const pendingCell = useRef<number | null>(null);

  const finished = isOver(game) && !anim;
  const result = useMemo(() => {
    if (!finished) return null;
    const [a, b] = score(game);
    const mine = mySeat === 0 ? a : b;
    const theirs = mySeat === 0 ? b : a;
    return { mine, theirs, won: mine > theirs };
  }, [finished, game, mySeat]);

  return (
    <div className="page">
    <div className="app">
      <h1>cascade</h1>
      <div className="controls">
        <label>seat
          <select value={mySeat}
                  onChange={(e) => reset(seed, Number(e.target.value))}>
            <option value={0}>P1 — 5 cards, first &amp; last</option>
            <option value={1}>P2 — 6 cards, plays four</option>
          </select>
        </label>
        <label>bot
          <select value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value as Difficulty)}>
            <option value="easy">easy</option>
            <option value="normal">normal</option>
          </select>
        </label>
        <button onClick={() => reset(randomSeed(), mySeat)}>new game</button>
        <span className="seed">#{seed}</span>
      </div>

      <div className="scoreline quiet"
           title="the lead changes hands 7.5 times per game on average, so
this count says little until the board is full">
        <span className="chip p1c">you {popcount(shownOwn[mySeat])}</span>
        <div className="strip" title="turn order: A B A B A B A B A">
          {ORDER.map((p, i) => (
            <span key={i} className={['seg', p === mySeat ? 'mine' : 'theirs',
              i === game.turn ? 'now' : i < game.turn ? 'done' : '']
              .filter(Boolean).join(' ')} />
          ))}
        </div>
        <span className="chip p2c">bot {popcount(shownOwn[1 - mySeat])}</span>
      </div>

      <div className="row aff">
        <span>
          abilities {abilityOn ? 'online' : `online from placement ${ABILITY_FROM_PLACEMENT}`}
          {' '}· you have placed {placedCount(game, mySeat)}
        </span>
      </div>

      {card && card.ability && (
        <div className="abilitybox">
          <b>{card.ability.toUpperCase()}</b>{' '}
          <span className="muted">{NAMES[ABILITIES[card.ability].element]}</span>
          {' · '}
          {live
            ? <button onClick={() => setArmed(!armed)}>
                {armed ? 'armed ✓' : 'use it'}
              </button>
            : <span className="muted">
                available from your {ABILITY_FROM_PLACEMENT}nd placement
                (you have made {placedCount(game, mySeat)})
              </span>}
          <p>{ABILITIES[card.ability].text}</p>
        </div>
      )}

      {targeting && (
        <p className="hint">pick a target
          <button onClick={() => { setTargeting(null); pendingCell.current = null; }}>
            cancel
          </button>
        </p>
      )}

      {card && (
        <div className="previewkey">
          <span><i className="k-open" />exposed edge — attackable here</span>
          {hover !== null && preview && (
            <>
              <span><i className="k-direct" />this card takes it</span>
              <span><i className="k-cascade" />the chain takes it</span>
              {!!preview.reach &&
                <span><i className="k-reach" />reach takes it</span>}
            </>
          )}
        </div>
      )}

      <div className="board">
        {Array.from({ length: NCELLS }, (_, cell) => {
          const c = game.board.cards[cell];
          const owner = (shownOwn[0] >>> cell) & 1 ? 0
            : (shownOwn[1] >>> cell) & 1 ? 1 : -1;
          const placeable = myTurn && !targeting && sel !== null && c === null;
          const isTarget = !!targeting && targetCells.has(cell);
          const bit = 1 << cell;
          const kind = preview
            ? (preview.direct & bit ? ' cap-direct'
              : preview.cascade & bit ? ' cap-cascade'
              : preview.reach & bit ? ' cap-reach' : '')
            : '';
          const atRisk = !preview && myThreatened?.has(cell) ? ' at-risk' : '';
          return (
            <div key={cell}
                 className={`cell${placeable ? ' placeable' : ''}`
                   + `${isTarget ? ' target' : ''}${kind}${atRisk}`
                   + `${hover === cell && placeable ? ' hovering' : ''}`}
                 onMouseEnter={() => setHover(cell)}
                 onMouseLeave={() => setHover((h) => (h === cell ? null : h))}
                 onClick={() => onCell(cell)}>
              {c ? <CardFace edges={c} owner={owner}
                             open={openMap?.get(cell)}
                             flash={((flash >>> cell) & 1) === 1} />
                 : <span className="cellno">{cell}</span>}
            </div>
          );
        })}
      </div>

      <div className="hand">
        {hand.map((h, i) => {
          const e = sel === i ? spinCard(h.edges, spin) : h.edges;
          return (
            <button key={i} className={`slot${sel === i ? ' sel' : ''}`}
                    disabled={!myTurn || !!targeting}
                    onClick={() => {
                      setSel(sel === i ? null : i);
                      setSpin(0); setArmed(false); setHover(null);
                    }}>
              <CardFace edges={e} owner={mySeat} small
                        dim={!myTurn || !!targeting} />
              <small className={abilityLive(game, mySeat, h) ? 'live' : ''}>
                {h.ability ?? '—'}
              </small>
            </button>
          );
        })}
        {hand.length === 0 && <span className="muted">hand empty</span>}
      </div>

      {card && rotations && (
        <div className="rotstrip">
          {rotations.map((r) => (
            <button key={r.spin}
                    className={`rot${r.spin === spin ? ' sel' : ''}`}
                    onClick={() => setSpin(r.spin)}>
              <span className="deg">{r.spin * 90}°</span>
              <CardFace edges={r.edges} owner={mySeat} small />
              <span className="rotcaps">
                {r.preview
                  ? (r.preview.total === 0 ? 'takes nothing'
                    : `${r.preview.direct ? popcount(r.preview.direct) : 0}`
                      + ` direct`
                      + (r.preview.cascade
                        ? ` +${popcount(r.preview.cascade)} chain` : ''))
                  : '\u00a0'}
              </span>
              <span className="rotexp">
                {r.preview && r.preview.exposed.length
                  ? 'leaves ' + r.preview.exposed
                      .map((e) => NAMES[e.element].slice(0, 2)).join(' ')
                      + ' open'
                  : r.preview ? 'nothing left open' : '\u00a0'}
              </span>
            </button>
          ))}
        </div>
      )}

      {card && (
        <div className="row">
          <label style={{ gap: 4 }}>
            <input type="checkbox" checked={showOpen}
                   onChange={(e) => setShowOpen(e.target.checked)} />
            mark exposed edges
          </label>
          <span className="muted" style={{ fontSize: 11 }}>
            {hover === null
              ? 'hover a cell to preview'
              : `cell ${hover}`}
          </span>
        </div>
      )}

      <p className="status">
        {finished
          ? `final ${result!.mine}–${result!.theirs} — ${result!.won ? 'you win' : 'bot wins'}`
          : anim ? 'resolving…'
          : targeting ? 'choosing a target…'
          : myTurn
            ? sel === null ? 'pick a card'
              : 'turn it if you like, then pick a cell'
            : 'bot thinking…'}
      </p>

      <p className="turnlabel">{turnLabel(game.turn, mySeat)}</p>
      <ul className="log">
        {log.map((l, i) => (
          <li key={i} className={`ln ${l.kind}`}>
            <span className="tag">{l.kind}</span>{l.text}
          </li>
        ))}
      </ul>
    </div>
    <ElementMap />
    </div>
  );
}
