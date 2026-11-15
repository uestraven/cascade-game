import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { type Card, ROTATIONS, rot90 } from '../proto/engine';
import { CardFace } from '../proto/ui/CardFace';
import { isMuted, loadMuted, primeAudio, setMuted, sfx }
  from '../proto/ui/sound';
import { mulberry32, randomSeed } from '../rng';
import {
  type Character, type Cmd, type Command, type Trait, type V22State,
  CHARACTERS, CMD_INFO, COMMANDS, TRAIT_INFO, allCommands, applyCommand,
  applyPlacement, commandsFor, commandsLeft, friendsAdjacent, isOver,
  isProtected, mustPass, newGame, passCommand, phaseOf, pickCommand,
  pickPlacement, score, toMove, winner,
} from './game';

type Mode = 'bot' | 'hotseat';
const BOT_MS = 440;

function describe(c: Command): string {
  switch (c.kind) {
    case 'plain': return 'strike every adjacent enemy';
    case 'usurp':
      return `turn cell ${c.via} against its whole side`;
    case 'usurpOne':
      return `turn cell ${c.via} on cell ${c.target}`;
    case 'transpose': return `swap cells ${c.a} and ${c.b}`;
    case 'reclaimRecent': return `reclaim cell ${c.target}`;
  }
}

interface Choice {
  cmd: Command;
  label: string;
  took: number;
  direct: number;
  follow: number;
  moved: boolean;
}

export function V22App() {
  const [seed, setSeed] = useState(() => randomSeed());
  const [mode, setMode] = useState<Mode>('bot');
  const [mySeat] = useState(0);
  const [game, setGame] = useState<V22State>(() => newGame(seed));
  const [sel, setSel] = useState<number | null>(null);
  const [spin, setSpin] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const [cmdCell, setCmdCell] = useState<number | null>(null);
  const [pickHover, setPickHover] = useState<number | null>(null);
  const [flash, setFlash] = useState(0);
  const [mute, setMute] = useState(false);
  const [inspect, setInspect] = useState<number | null>(null);
  const botRng = useRef(mulberry32(seed ^ 0x9e3779b9));

  useEffect(() => { setMute(loadMuted()); }, []);

  const reset = useCallback((s: number) => {
    setSeed(s); setGame(newGame(s)); setSel(null); setSpin(0);
    setHover(null); setCmdCell(null); setPickHover(null); setFlash(0);
    setInspect(null);
    botRng.current = mulberry32(s ^ 0x9e3779b9);
  }, []);

  const phase = phaseOf(game);
  const active = toMove(game);
  const myTurn = mode === 'hotseat' ? true : active === mySeat;
  const [s0, s1] = score(game);
  const over = isOver(game);
  const win = over ? winner(game) : -2;

  const card = phase === 'convergence' && sel !== null
    ? game.hands[active][sel] : undefined;
  const sigils: Card | null = useMemo(() => {
    if (!card) return null;
    let e = card.sigils;
    for (let i = 0; i < ((spin % ROTATIONS) + ROTATIONS) % ROTATIONS; i++) {
      e = rot90(e);
    }
    return e;
  }, [card, spin]);

  const placePreview = useMemo(() => {
    if (phase !== 'convergence' || sel === null || !sigils
        || hover === null) return null;
    if (game.board.cards[hover] !== null) return null;
    try {
      const r = applyPlacement(game, { handIndex: sel, cell: hover, sigils });
      let m = 0;
      for (const c of r.captured) m |= 1 << c;
      return m;
    } catch { return null; }
  }, [phase, sel, sigils, hover, game]);

  const choices: Choice[] = useMemo(() => {
    if (phase !== 'dominion' || cmdCell === null) return [];
    return commandsFor(game, cmdCell).map((cmd) => {
      const r = applyCommand(game, cmd);
      let direct = 0, follow = 0;
      for (const c of r.direct) direct |= 1 << c;
      for (const c of r.followUp) follow |= 1 << c;
      return { cmd, label: describe(cmd), direct, follow, moved: r.moved,
               took: r.direct.length + r.followUp.length };
    });
  }, [phase, cmdCell, game]);

  const shown = pickHover !== null ? choices[pickHover] : null;

  const land = useCallback((next: V22State, got: number[]) => {
    let m = 0;
    for (const c of got) m |= 1 << c;
    setFlash(m);
    setGame(next);
    setSel(null); setSpin(0); setCmdCell(null); setPickHover(null);
    sfx('place');
    if (got.length) sfx('capture', got.length); else sfx('nothing');
    window.setTimeout(() => setFlash(0), 320);
  }, []);

  useEffect(() => {
    if (!mustPass(game)) return;
    const t = window.setTimeout(() => setGame(passCommand(game)), 320);
    return () => window.clearTimeout(t);
  }, [game]);

  useEffect(() => {
    if (mode !== 'bot' || isOver(game) || toMove(game) === mySeat) return;
    if (mustPass(game)) return;
    const t = window.setTimeout(() => {
      if (phaseOf(game) === 'convergence') {
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

  const commandable = useMemo(() => {
    const out = new Set<number>();
    if (phase !== 'dominion' || !myTurn) return out;
    for (const c of allCommands(game)) out.add(c.cell);
    return out;
  }, [phase, myTurn, game]);

  const detail = inspect ?? cmdCell ?? hover;
  const detailChar: Character | undefined =
    detail !== null ? game.charAt[detail] : undefined;
  const detailTrait: Trait | null =
    detail !== null ? game.traitAt[detail] : null;
  const detailCmd: Cmd | null = detail !== null ? game.cmdAt[detail] : null;

  return (
    <div className="page">
      <div className="app">
        <div className="rail left">
          <h1>cascade</h1>
          <p className="subtitle">v2.2 — character powers</p>

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

          <div className={`phasebar ${phase === 'convergence' ? 'deploy'
            : phase === 'dominion' ? 'command' : 'over'}`}>
            {phase === 'convergence' && (
              <>
                <b>Phase I — The Convergence</b>
                <span>
                  {game.shape.order.length - game.placed} placements left.
                  Traits are active. Commands are held.
                </span>
              </>
            )}
            {phase === 'dominion' && (
              <>
                <b>Phase II — The Dominion</b>
                <span>
                  {COMMANDS - game.commands} commands left. Traits have
                  expired — Sanctuary no longer protects.
                </span>
              </>
            )}
            {phase === 'over' && (
              <>
                <b>Finished</b>
                <span>{win === -1 ? 'level — a draw'
                  : `P${win + 1} holds the most`}</span>
              </>
            )}
          </div>

          <div className="scorerow">
            <span className="chip p1c">P1 {s0}</span>
            <span className="chip p2c">
              {mode === 'hotseat' ? 'P2' : 'bot'} {s1}
            </span>
            {phase === 'dominion' && (
              <span className="muted small2">
                commands — P1 {commandsLeft(game, 0)}, P2{' '}
                {commandsLeft(game, 1)}
              </span>
            )}
          </div>

          <h2>the two slots</h2>
          <p className="muted small2">
            Every character has a <b>Convergence trait</b> that works
            while the board is being built, and a <b>Dominion command</b>
            that works once it is full. Either may be empty. The trait
            stops mattering the moment Dominion begins.
          </p>

          <h2>log</h2>
          <ul className="log">
            {game.log.map((l, i) => <li key={i} className="ln">{l}</li>)}
          </ul>
        </div>

        <div className="stage">
          <div className="previewkey">
            {phase === 'convergence'
              ? <>
                  <span><i className="k-direct" />this placement takes it</span>
                  <span><i className="k-shield" />protected by Sanctuary</span>
                </>
              : <>
                  <span><i className="k-direct" />the command takes it</span>
                  <span><i className="k-cascade" />the follow-up takes it</span>
                  <span><i className="k-gold" />selected</span>
                </>}
          </div>

          <div className="board"
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
              const placeable = phase === 'convergence' && myTurn
                && sel !== null && c === null;
              const canCmd = commandable.has(cell);
              const prot = c !== null
                && isProtected(game, game.board, cell, phase);
              const mark = shown
                ? (shown.direct & bit ? ' cap-direct'
                  : shown.follow & bit ? ' cap-cascade' : '')
                : (placePreview && (placePreview & bit) ? ' cap-direct' : '');
              return (
                <div key={cell}
                     className={`cell${placeable ? ' placeable' : ''}`
                       + `${owner >= 0 ? ` own${owner}` : ''}`
                       + `${canCmd ? ' commandable' : ''}`
                       + `${cmdCell === cell ? ' chosen' : ''}${mark}`
                       + `${prot ? ' warded' : ''}`
                       + `${hover === cell && placeable ? ' hovering' : ''}`}
                     onMouseEnter={() => setHover(cell)}
                     onMouseLeave={() =>
                       setHover((h) => (h === cell ? null : h))}
                     onClick={() => {
                       if (over) return;
                       if (phase === 'convergence' && c === null
                           && sel !== null && myTurn) {
                         const r = applyPlacement(game,
                           { handIndex: sel, cell, sigils: sigils! });
                         land(r.state, r.captured);
                       } else if (phase === 'dominion' && canCmd) {
                         setCmdCell(cell); setPickHover(null);
                       } else if (c !== null) {
                         setInspect(cell);
                       }
                     }}>
                  {c ? (
                    <>
                      <CardFace sigils={c} owner={owner}
                                flash={((flash >>> cell) & 1) === 1}
                                flipping={((flash >>> cell) & 1) === 1} />
                      {owner >= 0 && (
                        <span className="crest">P{owner + 1}</span>
                      )}
                      {/* both slots, named on the card itself */}
                      <span className="slots">
                        {game.traitAt[cell] && (
                          <span className={`slot1${prot ? ' live' : ''}`}>
                            {TRAIT_INFO[game.traitAt[cell]!].name}
                          </span>
                        )}
                        {game.cmdAt[cell] && (
                          <span className="slot2">
                            {CMD_INFO[game.cmdAt[cell]!].name}
                          </span>
                        )}
                      </span>
                      {game.charAt[cell] && (
                        <span className="charname">
                          {game.charAt[cell]!.name}
                        </span>
                      )}
                      {prot && <span className="wardmark" title="Sanctuary">
                        ✦</span>}
                      {canCmd && <span className="cmddot" />}
                    </>
                  ) : <span className="cellno">{cell}</span>}
                </div>
              );
            })}
          </div>

          {phase === 'convergence' && (
            <div className="hand">
              {game.hands[active].map((h, i) => (
                <button key={i} className={`slot${sel === i ? ' sel' : ''}`}
                        disabled={!myTurn || over}
                        onClick={() => { primeAudio(); sfx('select');
                                         setSel(i); setSpin(0);
                                         setInspect(null); }}>
                  <CardFace
                    sigils={sel === i && sigils ? sigils : h.sigils}
                    owner={active} small art={h.art} />
                  <small>{h.character ? h.character.name.replace(/^The /, '')
                    : CMD_INFO[h.command].name}</small>
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

          {phase === 'dominion' && cmdCell === null && (
            <p className="hint">
              {myTurn ? 'click one of your characters to command it'
                : 'the opponent is commanding…'}
            </p>
          )}
        </div>

        <div className="rail right">
          {phase === 'dominion' && cmdCell !== null && (
            <div className="picker">
              <p className="hint">
                commanding {game.charAt[cmdCell]?.name ?? `cell ${cmdCell}`}
                <button onClick={() => { setCmdCell(null);
                                         setPickHover(null); }}>cancel</button>
              </p>
              <ul onMouseLeave={() => setPickHover(null)}>
                {choices.map((o, i) => (
                  <li key={i}
                      className={`${pickHover === i ? 'on' : ''}`
                        + `${o.took > 0 ? ' takes' : ''}`}
                      onMouseEnter={() => setPickHover(i)}
                      onClick={() => {
                        const r = applyCommand(game, o.cmd);
                        land(r.state, [...r.direct, ...r.followUp]);
                      }}>
                    <span className="plabel">{o.label}</span>
                    <span className="pgain">
                      {o.took > 0 ? `takes ${o.took}`
                        : o.moved ? 'moves, takes nothing' : 'takes nothing'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* the card under the cursor, both slots spelled out */}
          {detail !== null && game.board.cards[detail] && (
            <div className="abilitybox">
              {detailChar ? (
                <>
                  <b>{detailChar.name}</b>
                  <p className="muted small2 epithet">
                    {detailChar.epithet}
                  </p>
                </>
              ) : <b>cell {detail}</b>}

              <div className="slotrow">
                <span className="slottag i">I · Convergence</span>
                {detailTrait
                  ? <>
                      <b>{TRAIT_INFO[detailTrait].name}</b>
                      <p className="small2">{TRAIT_INFO[detailTrait].text}</p>
                      <p className="muted small2">
                        {TRAIT_INFO[detailTrait].why}
                      </p>
                      {phase === 'convergence' && (
                        <p className="small2">
                          {friendsAdjacent(game, game.board, detail,
                            ((game.board.own[0] >>> detail) & 1) ? 0 : 1)}
                          {' '}of 2 allies adjacent —{' '}
                          {isProtected(game, game.board, detail, phase)
                            ? <b>protected</b> : 'not protected'}
                        </p>
                      )}
                      {phase !== 'convergence' && (
                        <p className="muted small2">expired</p>
                      )}
                    </>
                  : <p className="muted small2">none</p>}
              </div>

              <div className="slotrow">
                <span className="slottag ii">II · Dominion</span>
                {detailCmd
                  ? <>
                      <b>{CMD_INFO[detailCmd].name}</b>
                      <p className="small2">{CMD_INFO[detailCmd].text}</p>
                      <p className="muted small2">{CMD_INFO[detailCmd].why}</p>
                    </>
                  : <p className="muted small2">none</p>}
              </div>

              {detailChar && (
                <p className="muted small2 flavour">
                  “{detailChar.flavour}”
                </p>
              )}
            </div>
          )}

          <h2>the provisional cast</h2>
          <p className="muted small2">
            Three named characters, not a final roster. The rest of the
            deck carries the same powers unnamed, so every ability can be
            met in play.
          </p>
          <ul className="log">
            {CHARACTERS.map((ch) => (
              <li key={ch.id} className="ln">
                <b>{ch.name}</b><br />
                <span className="muted">
                  {ch.trait ? TRAIT_INFO[ch.trait].name : 'no trait'}
                  {' · '}{CMD_INFO[ch.command].name}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
