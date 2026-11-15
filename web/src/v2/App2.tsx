import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { type Card, ROTATIONS, rot90 } from '../proto/engine';
import { CardFace } from '../proto/ui/CardFace';
import { SIGIL_NAMES } from '../proto/ui/Sigil';
import { isMuted, loadMuted, primeAudio, setMuted, sfx } from '../proto/ui/sound';
import { mulberry32, randomSeed } from '../rng';
import {
  type Command, type V2Option, type V2State, COMMANDS, V2_ABILITY_TEXT,
  applyCommand, applyPlacement, commandOptions, commandsLeft, isOver,
  mustPass, newGame, passCommand, phaseOf, pickCommand, pickPlacement,
  placements, score, toMove, winner,
} from './game';

type Mode = 'bot' | 'hotseat';
const BOT_MS = 420;

const EDGE = ['top', 'right', 'bottom', 'left'] as const;

function describe(o: V2Option): string {
  if (o === null) return 'no ability';
  switch (o.kind) {
    case 'pivot': return `turn cell ${o.cell} 90°, then attack`;
    case 'exchange': return `swap with cell ${o.cell}, attack from there`;
    case 'relay': return `cell ${o.cell} attacks instead`;
    case 'prism': return `${EDGE[o.edge]} edge matches anything`;
  }
}

interface Choice {
  option: V2Option;
  label: string;
  took: number;
  direct: number;
  follow: number;
}

export function V2App() {
  const [seed, setSeed] = useState(() => randomSeed());
  const [mode, setMode] = useState<Mode>('bot');
  const [mySeat] = useState(0);
  const [game, setGame] = useState<V2State>(() => newGame(seed));
  const [sel, setSel] = useState<number | null>(null);
  const [spin, setSpin] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const [cmdCell, setCmdCell] = useState<number | null>(null);
  const [pickHover, setPickHover] = useState<number | null>(null);
  const [showMine, setShowMine] = useState(false);
  const [flash, setFlash] = useState(0);
  const [mute, setMute] = useState(false);
  const botRng = useRef(mulberry32(seed ^ 0x9e3779b9));

  useEffect(() => { setMute(loadMuted()); }, []);

  const reset = useCallback((s: number) => {
    setSeed(s); setGame(newGame(s)); setSel(null); setSpin(0);
    setHover(null); setCmdCell(null); setPickHover(null); setFlash(0);
    botRng.current = mulberry32(s ^ 0x9e3779b9);
  }, []);

  const phase = phaseOf(game);
  const active = toMove(game);
  const myTurn = mode === 'hotseat' ? true : active === mySeat;
  const [s0, s1] = score(game);

  const card = phase === 'deploy' && sel !== null
    ? game.hands[active][sel] : undefined;
  const sigils: Card | null = useMemo(() => {
    if (!card) return null;
    let e = card.sigils;
    for (let i = 0; i < ((spin % ROTATIONS) + ROTATIONS) % ROTATIONS; i++) {
      e = rot90(e);
    }
    return e;
  }, [card, spin]);

  // ---- previews: what a move would take, before committing -----------
  const deployPreview = useMemo(() => {
    if (phase !== 'deploy' || sel === null || !sigils || hover === null) {
      return null;
    }
    if (game.board.cards[hover] !== null) return null;
    try {
      const r = applyPlacement(game, { handIndex: sel, cell: hover, sigils });
      let m = 0;
      for (const c of r.captured) m |= 1 << c;
      return m;
    } catch { return null; }
  }, [phase, sel, sigils, hover, game]);

  const choices: Choice[] = useMemo(() => {
    if (phase !== 'command' || cmdCell === null) return [];
    return commandOptions(game, cmdCell).map((option) => {
      const r = applyCommand(game, { cell: cmdCell, option });
      let direct = 0, follow = 0;
      for (const c of r.direct) direct |= 1 << c;
      for (const c of r.followUp) follow |= 1 << c;
      return { option, label: describe(option), direct, follow,
               took: r.direct.length + r.followUp.length };
    });
  }, [phase, cmdCell, game]);

  const shown = pickHover !== null ? choices[pickHover] : null;

  // ---- committing -----------------------------------------------------
  const land = useCallback((next: V2State, got: number[]) => {
    let m = 0;
    for (const c of got) m |= 1 << c;
    setFlash(m);
    setGame(next);
    setSel(null); setSpin(0); setCmdCell(null); setPickHover(null);
    sfx('place');
    if (got.length) sfx('capture', got.length);
    else sfx('nothing');
    window.setTimeout(() => setFlash(0), 320);
  }, []);

  const doPlace = (cell: number) => {
    if (sel === null || !sigils) return;
    const r = applyPlacement(game, { handIndex: sel, cell, sigils });
    land(r.state, r.captured);
  };

  const doCommand = (c: Command) => {
    const r = applyCommand(game, c);
    land(r.state, [...r.direct, ...r.followUp]);
  };

  // ---- the opponent ---------------------------------------------------
  useEffect(() => {
    if (mode !== 'bot' || isOver(game) || toMove(game) === mySeat) return;
    const t = window.setTimeout(() => {
      if (phaseOf(game) === 'deploy') {
        const m = pickPlacement(game, botRng.current);
        if (m) { const r = applyPlacement(game, m); land(r.state, r.captured); }
      } else {
        const c = pickCommand(game, botRng.current);
        if (c) {
          const r = applyCommand(game, c);
          land(r.state, [...r.direct, ...r.followUp]);
        }
      }
    }, BOT_MS);
    return () => window.clearTimeout(t);
  }, [game, mode, mySeat, land]);

  // a side with nothing on the board cannot command; consume the turn
  // rather than waiting for a click that can never come
  useEffect(() => {
    if (!mustPass(game)) return;
    const t = window.setTimeout(() => setGame(passCommand(game)), 300);
    return () => window.clearTimeout(t);
  }, [game]);

  const over = isOver(game);
  const win = over ? winner(game) : -2;

  const ownCells = useMemo(() => {
    const out = new Set<number>();
    if (phase !== 'command' || !myTurn) return out;
    for (let c = 0; c < game.shape.cells; c++) {
      if (game.board.cards[c] !== null
          && ((game.board.own[active] >>> c) & 1)) out.add(c);
    }
    return out;
  }, [phase, myTurn, game, active]);

  return (
    <div className="page">
      <div className="app">
        <div className="rail left">
          <h1>cascade</h1>
          <p className="subtitle">v2 — deployment &amp; command</p>

          <div className="controls">
            <label>mode
              <select value={mode}
                      onChange={(e) => { setMode(e.target.value as Mode);
                                         reset(seed); }}>
                <option value="bot">vs computer</option>
                <option value="hotseat">two players, one screen</option>
              </select>
            </label>
            <button onClick={() => reset(randomSeed())}>new game</button>
            <button onClick={() => { const m = !mute; setMute(m);
                                     setMuted(m);
                                     if (!m) { primeAudio(); sfx('select'); } }}>
              {mute ? 'sound off' : 'sound on'}
            </button>
          </div>

          {/* the phase is the whole point of v2, so it is the loudest
              thing on the screen */}
          <div className={`phasebar ${phase}`}>
            {phase === 'deploy' && (
              <>
                <b>Phase I — The Convergence</b>
                <span>
                  {game.shape.order.length - game.placed} placements left.
                  Direct captures only — no abilities, no chains.
                </span>
              </>
            )}
            {phase === 'command' && (
              <>
                <b>Phase II — The Dominion</b>
                <span>
                  {COMMANDS - game.commands} commands left. No new cards.
                  Abilities fire now.
                </span>
              </>
            )}
            {phase === 'over' && (
              <>
                <b>Finished</b>
                <span>
                  {win === -1 ? 'level — a draw'
                    : `P${win + 1} holds the most cards`}
                </span>
              </>
            )}
          </div>

          <div className="scorerow">
            <span className="chip p1c">P1 {s0}</span>
            <span className="chip p2c">
              {mode === 'hotseat' ? 'P2' : 'bot'} {s1}
            </span>
            {phase === 'command' && (
              <span className="muted small2">
                commands left — P1 {commandsLeft(game, 0)},{' '}
                P2 {commandsLeft(game, 1)}
              </span>
            )}
          </div>

          {over && (
            <div className="rule">
              <b>{win === -1 ? 'A draw'
                 : win === 0 ? 'Player 1 wins'
                 : mode === 'hotseat' ? 'Player 2 wins' : 'The bot wins'}</b>
              {' '}{s0}–{s1}
            </div>
          )}

          <h2>what changed from v1</h2>
          <p className="muted small2">
            v1 was one continuous activity: place, capture, cascade,
            repeat. Here the board is filled first with captures but no
            abilities and no chains, then nobody places anything and you
            spend six commands exploiting the position you built.
          </p>
          <p className="muted small2">
            Measured over 2,500 games: P1 46.6%, P2 43.9%, drawn 9.5%.
            Dominion changes who wins 44.6% of the time — arguably too
            often, since it devalues the twelve placements before it.
          </p>
          <p className="muted small2">
            Draws are allowed. A level board is a legitimate result and
            better than inventing a first-player edge to avoid one.
          </p>

          <h2>log</h2>
          <ul className="log">
            {game.log.map((l, i) => <li key={i} className="ln">{l}</li>)}
          </ul>
        </div>

        <div className="stage">
          <div className="previewkey">
            {phase === 'command' && (
              <>
                <button className={`tinybtn${showMine ? ' on' : ''}`}
                        onMouseDown={() => setShowMine(true)}
                        onMouseUp={() => setShowMine(false)}
                        onMouseLeave={() => setShowMine(false)}
                        onTouchStart={() => setShowMine(true)}
                        onTouchEnd={() => setShowMine(false)}>
                  hold: show my cards
                </button>
                <span><i className="k-cmd" />yours, commandable</span>
                <span><i className="k-gold" />selected</span>
              </>
            )}
            {phase === 'deploy'
              ? <span><i className="k-direct" />this placement takes it</span>
              : <>
                  <span><i className="k-direct" />the command takes it</span>
                  <span><i className="k-cascade" />the follow-up takes it</span>
                </>}
          </div>

          <div className={`board${showMine ? ' mine' : ''}`}
               style={{
                 gridTemplateColumns:
                   `repeat(${game.shape.cols}, var(--cell))`,
                 ['--rows' as string]: String(game.shape.rows),
                 ['--cols' as string]: String(game.shape.cols),
               } as React.CSSProperties}>
            {Array.from({ length: game.shape.cells }, (_, cell) => {
              const c = game.board.cards[cell];
              const owner = (game.board.own[0] >>> cell) & 1 ? 0
                : (game.board.own[1] >>> cell) & 1 ? 1 : -1;
              const bit = 1 << cell;
              const placeable = phase === 'deploy' && myTurn
                && sel !== null && c === null;
              const commandable = ownCells.has(cell);
              const mark = shown
                ? (shown.direct & bit ? ' cap-direct'
                  : shown.follow & bit ? ' cap-cascade' : '')
                : (deployPreview && (deployPreview & bit)
                  ? ' cap-direct' : '');
              return (
                <div key={cell}
                     className={`cell${placeable ? ' placeable' : ''}`
                       // layer 1: who holds it
                       + `${owner >= 0 ? ` own${owner}` : ''}`
                       + `${owner === active ? ' own-active' : ''}`
                       // layer 2: may I act with it
                       + `${commandable ? ' commandable' : ''}`
                       // layer 3: have I chosen it -- gold, only here
                       + `${cmdCell === cell ? ' chosen' : ''}${mark}`
                       + `${hover === cell && placeable ? ' hovering' : ''}`}
                     onMouseEnter={() => setHover(cell)}
                     onMouseLeave={() =>
                       setHover((h) => (h === cell ? null : h))}
                     onClick={() => {
                       if (!myTurn || over) return;
                       if (phase === 'deploy' && c === null && sel !== null) {
                         doPlace(cell);
                       } else if (phase === 'command' && commandable) {
                         setCmdCell(cell); setPickHover(null);
                       }
                     }}>
                  {c ? (
                    <>
                      <CardFace sigils={c} owner={owner}
                                ability={game.abilityAt[cell] ?? undefined}
                                flash={((flash >>> cell) & 1) === 1}
                                flipping={((flash >>> cell) & 1) === 1} />
                      {owner >= 0 && (
                        <span className="crest">P{owner + 1}</span>
                      )}
                      {/* the mark appears only on a card you may
                          command, so its presence is the answer */}
                      {commandable && game.abilityAt[cell] && (
                        <span className="cmdmark"
                              title={`${game.abilityAt[cell]} — `
                                + 'click to command'}>
                          <img alt=""
                               src={`/art/abilities/ability-`
                                 + `${game.abilityAt[cell]}.svg`} />
                        </span>
                      )}
                    </>
                  ) : <span className="cellno">{cell}</span>}
                </div>
              );
            })}
          </div>

          {phase === 'deploy' && (
            <div className="hand">
              {game.hands[active].map((h, i) => (
                <button key={i} className={`slot${sel === i ? ' sel' : ''}`}
                        disabled={!myTurn || over}
                        onClick={() => { primeAudio(); sfx('select');
                                         setSel(i); setSpin(0); }}>
                  <CardFace
                    sigils={sel === i && sigils ? sigils : h.sigils}
                    owner={active} small art={h.art} ability={h.ability} />
                  <small>{h.ability}</small>
                </button>
              ))}
              {sel !== null && (
                <button className="slot"
                        onClick={() => { sfx('rotate'); setSpin(spin + 1); }}>
                  <span className="rotbtn">turn ⟳</span>
                </button>
              )}
            </div>
          )}

          {phase === 'command' && cmdCell === null && (
            <p className="hint">
              {myTurn
                ? 'click one of your cards to command it'
                : 'the opponent is commanding…'}
            </p>
          )}
        </div>

        <div className="rail right">
          {phase === 'command' && cmdCell !== null && (
            <div className="picker">
              <p className="hint">
                commanding cell {cmdCell}
                {game.abilityAt[cmdCell]
                  ? <> — <b>{game.abilityAt[cmdCell]}</b></> : null}
                <button onClick={() => { setCmdCell(null);
                                         setPickHover(null); }}>
                  cancel
                </button>
              </p>
              {game.abilityAt[cmdCell] && (
                <p className="muted small2">
                  {V2_ABILITY_TEXT[game.abilityAt[cmdCell]!]}
                </p>
              )}
              <ul onMouseLeave={() => setPickHover(null)}>
                {choices.map((o, i) => (
                  <li key={i}
                      className={`${pickHover === i ? 'on' : ''}`
                        + `${o.took > 0 ? ' takes' : ''}`}
                      onMouseEnter={() => setPickHover(i)}
                      onClick={() => doCommand({ cell: cmdCell,
                                                 option: o.option })}>
                    <span className="plabel">{o.label}</span>
                    <span className="pgain">
                      {o.took > 0 ? `takes ${o.took}` : 'takes nothing'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {phase === 'deploy' && card && (
            <div className="abilitybox">
              <b>{card.ability.toUpperCase()}</b>
              <p className="muted small2">
                Held until Phase II. {V2_ABILITY_TEXT[card.ability]}
              </p>
              <p className="muted small2">
                Deployment is about where this card sits and which way it
                faces. You command it later.
              </p>
            </div>
          )}

          <h2>the rule</h2>
          <div className="rule">
            <b>Matching facing sigils capture.</b> Different sigils do
            nothing.
          </div>

          <h2>the four sigils</h2>
          <ul className="log">
            {SIGIL_NAMES.map((n) => <li key={n} className="ln">{n}</li>)}
          </ul>
        </div>
      </div>
    </div>
  );
}
