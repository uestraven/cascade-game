import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { CardFace } from '../proto/ui/CardFace';
import { SIGIL_NAMES, SIGIL_PALETTE, Sigil } from '../proto/ui/Sigil';
import { BattleCard } from './BattleCard';
import { isMuted, loadMuted, primeAudio, setMuted, sfx }
  from '../proto/ui/sound';
import { mulberry32, randomSeed } from '../rng';
import {
  type CardId, type ChoiceOption, type DominionCommand, type Player,
  type V23State, CELLS, CMD_INFO, COLS, DOMINION_COMMANDS, ROWS,
  TRAIT_INFO, alliesAdjacent, apply, captureBlocked, cellOf,
  commandsLeft, deployments, dominionCommands, isOver, moveBlocked,
  mustPass, newGame, previewAt, previewDeploy, score, toMove,
  traitState, winner,
} from './rules';

type Mode = 'bot' | 'hotseat';
const BOT_MS = 460;

/**
 * Whether this is a touch screen.
 *
 * Every preview in the v2.3 build was reached by hovering — the card's
 * full rules, the per-cell survey, which enemies a command would take.
 * A touch screen cannot hover, so on a phone none of it was reachable;
 * worse, mobile browsers synthesise a mouseenter on tap, so the hover
 * popover opened on top of the thing you had just tapped.
 *
 * Asked as a media query rather than inferred from the width, because
 * a hybrid laptop is wide AND coarse, and a desktop window dragged
 * narrow is neither. It starts false so the first render matches the
 * server's and a test's.
 */
function useCoarsePointer() {
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const m = window.matchMedia('(hover: none), (pointer: coarse)');
    const sync = () => setCoarse(m.matches);
    sync();
    m.addEventListener('change', sync);
    return () => m.removeEventListener('change', sync);
  }, []);
  return coarse;
}

/** The bot plays the same reducer the human does. */
function botAction(g: V23State, rng: () => number) {
  if (g.pending) {
    const opts = g.pending.options;
    if (g.pending.optional && rng() < 0.35) return { kind: 'skip' } as const;
    return { kind: 'choose' as const,
             option: opts[Math.floor(rng() * opts.length)].id };
  }
  if (g.phase === 'convergence') {
    const all = deployments(g);
    let best = all[0], bestScore = -Infinity;
    for (const d of all) {
      const p = previewDeploy(g, d.card, d.cell);
      const s = p.taken.length + rng() * 0.2;
      if (s > bestScore) { bestScore = s; best = d; }
    }
    return { kind: 'deploy' as const, ...best };
  }
  if (mustPass(g)) return { kind: 'pass' } as const;
  const cmds = dominionCommands(g);
  let best = cmds[0], bestScore = -Infinity;
  for (const c of cmds) {
    const after = apply(g, { kind: 'command', cmd: c });
    const s = score(after)[toMove(g)] + rng() * 0.2;
    if (s > bestScore) { bestScore = s; best = c; }
  }
  return { kind: 'command' as const, cmd: best };
}

export function V23App() {
  const [seed, setSeed] = useState(() => randomSeed());
  const [mode, setMode] = useState<Mode>('hotseat');
  const [champions, setChampions] = useState<0 | 2 | 3>(0);
  const [game, setGame] = useState<V23State>(() =>
    newGame(seed, { boundChampions: 0 }));
  const [sel, setSel] = useState<CardId | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [optHover, setOptHover] = useState<string | null>(null);
  const [cmdCell, setCmdCell] = useState<number | null>(null);
  const [cmdHover, setCmdHover] = useState<number | null>(null);
  const [inspect, setInspect] = useState<number | null>(null);
  const [showStack, setShowStack] = useState(true);
  const [mute, setMute] = useState(false);
  const [flash, setFlash] = useState<Set<number>>(new Set());
  const [big, setBig] = useState<{ cell: number; x: number; y: number }
    | null>(null);
  /** a hand card under the cursor, inspected before being chosen */
  const [peek, setPeek] = useState<{ card: CardId; x: number; y: number }
    | null>(null);
  const botRng = useRef(mulberry32(seed ^ 0x9e3779b9));
  const coarse = useCoarsePointer();

  useEffect(() => { setMute(loadMuted()); }, []);

  const reset = useCallback((s: number, bc: 0 | 2 | 3) => {
    setSeed(s); setChampions(bc);
    setGame(newGame(s, { boundChampions: bc }));
    setSel(null); setHover(null); setOptHover(null); setCmdCell(null);
    setInspect(null); setFlash(new Set());
    botRng.current = mulberry32(s ^ 0x9e3779b9);
  }, []);

  const active = toMove(game);
  const over = isOver(game);
  const [s0, s1] = score(game);
  const myTurn = mode === 'hotseat' ? true : active === 0;

  const advance = useCallback((next: V23State) => {
    const lit = new Set<number>();
    for (const e of next.events.slice(0, 2)) {
      for (const c of e.cells ?? []) lit.add(c);
    }
    setFlash(lit);
    setGame(next);
    setSel(null); setOptHover(null); setCmdCell(null);
    window.setTimeout(() => setFlash(new Set()), 340);
  }, []);

  // the opponent
  useEffect(() => {
    if (mode !== 'bot' || over) return;
    if (!game.pending && toMove(game) === 0) return;
    if (game.pending && game.pending.player === 0) return;
    const t = window.setTimeout(() => {
      advance(apply(game, botAction(game, botRng.current) as never));
      sfx('place');
    }, BOT_MS);
    return () => window.clearTimeout(t);
  }, [game, mode, over, advance]);

  // automatic pass when a side has nothing to command
  useEffect(() => {
    if (!mustPass(game) || over) return;
    const t = window.setTimeout(() =>
      advance(apply(game, { kind: 'pass' })), 340);
    return () => window.clearTimeout(t);
  }, [game, over, advance]);

  // ---- previews -------------------------------------------------------
  /**
   * What the card under the cursor would do EVERYWHERE, so cards can be
   * compared before one is committed to. Runs the real engine per empty
   * cell; a 4x3 board is twelve evaluations.
   */
  const survey = useMemo(() => {
    const card = peek?.card ?? sel;
    if (game.phase !== 'convergence' || !card || game.pending) return null;
    if (!game.hands[active].includes(card)) return null;
    const out = new Map<number, { taken: number; blocked: number;
                                  traitOptions: number }>();
    let best = 0;
    for (let c = 0; c < CELLS; c++) {
      if (game.cells[c]) continue;
      const p = previewAt(game, card, c);
      out.set(c, { taken: p.taken.length, blocked: p.blocked.length,
                   traitOptions: p.traitOptions });
      best = Math.max(best, p.taken.length);
    }
    return { card, cells: out, best };
  }, [peek, sel, game, active]);

  const deployPreview = useMemo(() => {
    if (game.phase !== 'convergence' || !sel || hover === null) return null;
    if (game.cells[hover] !== null || game.pending) return null;
    return previewDeploy(game, sel, hover);
  }, [game, sel, hover]);

  const optionPreview = useMemo(() => {
    if (!game.pending || !optHover) return null;
    return game.pending.options.find((o) => o.id === optHover) ?? null;
  }, [game, optHover]);

  const cmdChoices = useMemo(() => {
    if (game.phase !== 'dominion' || cmdCell === null) return [];
    return dominionCommands(game)
      .filter((c) => c.cell === cmdCell)
      .map((c) => {
        const after = apply(game, { kind: 'command', cmd: c });
        const before = score(game)[active];
        return { cmd: c, gain: score(after)[active] - before - 0, label:
          c.kind === 'plain' ? 'strike every adjacent enemy'
          : c.kind === 'usurp' ? `turn cell ${c.via} on its whole side`
          : c.kind === 'usurpOne' ? `turn cell ${c.via} on cell ${c.target}`
          : c.kind === 'transpose' ? `swap cells ${c.a} and ${c.b}`
          : `reclaim ${game.defs[c.target].name}` };
      });
  }, [game, cmdCell, active]);

  const commandable = useMemo(() => {
    const out = new Set<number>();
    if (game.phase !== 'dominion' || game.pending) return out;
    for (const c of dominionCommands(game)) out.add(c.cell);
    return out;
  }, [game]);

  const highlight = useMemo(() => {
    const take = new Set<number>();
    const block = new Set<number>();
    const touch = new Set<number>();
    if (deployPreview) {
      for (const c of deployPreview.taken) take.add(cellOf(game, c));
      for (const b of deployPreview.blocked) block.add(cellOf(game, b.card));
    }
    if (optionPreview) for (const c of optionPreview.cells) touch.add(c);
    if (cmdHover !== null) {
      const c = cmdChoices[cmdHover];
      if (c) {
        const after = apply(game, { kind: 'command', cmd: c.cmd });
        for (let i = 0; i < CELLS; i++) {
          const id = after.cells[i];
          if (id && after.owner[id] !== game.owner[id]) take.add(i);
        }
      }
    }
    return { take, block, touch };
  }, [deployPreview, optionPreview, cmdHover, cmdChoices, game]);

  const detail = inspect ?? cmdCell ?? hover;
  const detailId = detail !== null ? game.cells[detail] : null;
  const detailDef = detailId ? game.defs[detailId] : null;

  const req = game.pending;
  const myDecision = req
    && (mode === 'hotseat' || req.player === 0);

  /**
   * The card whose rules the strip under the board should state: the one
   * being inspected in hand, then the one selected, then the one tapped
   * on the board. Nothing in the hand has a hover on a phone, so this
   * is the only place a selected card's full text appears before it is
   * committed.
   */
  const focusId: CardId | null = peek?.card ?? sel
    ?? (detailId ?? null);
  const focusDef = focusId ? game.defs[focusId] : null;
  const focusOwner = focusId && game.owner[focusId] !== undefined
    ? game.owner[focusId] : -1;

  return (
    <div className="page">
      {/* Phase, turn and score, pinned to the top on a phone. On
          desktop these live in the left rail, which a phone puts below
          the board, so whose turn it is would have meant scrolling.

          Deliberately a sibling of .app rather than a child: a sticky
          grid item is stuck inside its own grid area, which here is
          exactly its own height, so it would never have moved. */}
      <div className="mobilestatus">
          <span className={`ms-phase ${game.phase === 'convergence'
            ? 'i' : game.phase === 'dominion' ? 'ii' : 'over'}`}>
            {game.phase === 'convergence' ? 'I · Convergence'
              : game.phase === 'dominion' ? 'II · Dominion' : 'Finished'}
          </span>
          <span className="ms-turn">
            {over ? (winner(game) === -1 ? 'a draw'
              : `P${winner(game) + 1} wins`)
              : req ? `P${req.player + 1} decides`
                : `P${active + 1} to ${game.phase === 'convergence'
                    ? 'deploy' : 'command'}`}
          </span>
          <span className="chip p1c">P1 {s0}</span>
          <span className="chip p2c">
            {mode === 'hotseat' ? 'P2' : 'bot'} {s1}
          </span>
          <span className="ms-right">
            <button className="tinybtn"
                    onClick={() => reset(randomSeed(), champions)}>
              new
            </button>
          </span>
        </div>

      <div className="app">
        <div className="rail left">
          <h1>cascade</h1>
          <p className="subtitle">v2.3 — convergence abilities</p>

          <div className="controls">
            <label>mode
              <select value={mode}
                      onChange={(e) => { setMode(e.target.value as Mode);
                                         reset(seed, champions); }}>
                <option value="hotseat">two players, one screen</option>
                <option value="bot">vs computer</option>
              </select>
            </label>
            <label>champions
              <select value={champions}
                      onChange={(e) =>
                        reset(seed, Number(e.target.value) as 0 | 2 | 3)}>
                <option value={0}>off</option>
                <option value={2}>2 each</option>
                <option value={3}>3 each</option>
              </select>
            </label>
            <button onClick={() => reset(randomSeed(), champions)}>
              new game
            </button>
            <button onClick={() => { const m = !mute; setMute(m);
                                     setMuted(m);
                                     if (!m) { primeAudio(); sfx('select'); } }}>
              {mute ? 'sound off' : 'sound on'}
            </button>
          </div>

          <div className={`phasebar ${game.phase === 'convergence'
            ? 'deploy' : game.phase === 'dominion' ? 'command' : 'over'}`}>
            {game.phase === 'convergence' && (
              <>
                <b>Phase I — The Convergence</b>
                <span>
                  {12 - game.deployed} deployments left · traits active ·
                  no rotation, sigils are fixed
                </span>
              </>
            )}
            {game.phase === 'dominion' && (
              <>
                <b>Phase II — The Dominion</b>
                <span>
                  {DOMINION_COMMANDS - game.commands} commands left ·
                  all traits expired
                </span>
              </>
            )}
            {over && (
              <>
                <b>Finished</b>
                <span>{winner(game) === -1 ? 'level — a draw'
                  : `P${winner(game) + 1} holds the most`}</span>
              </>
            )}
          </div>

          <div className="scorerow">
            <span className="chip p1c">P1 {s0}</span>
            <span className="chip p2c">
              {mode === 'hotseat' ? 'P2' : 'bot'} {s1}
            </span>
            {game.phase === 'dominion' && (
              <span className="muted small2">
                commands — P1 {commandsLeft(game, 0)}, P2{' '}
                {commandsLeft(game, 1)}
              </span>
            )}
            {/* the active variant, always visible -- it changes which
                cards can be captured and must not be something you have
                to remember choosing */}
            <span className={`variantchip${champions ? ' on' : ''}`}>
              {champions
                ? `★ bound champions: ${champions} each`
                : 'no champions'}
            </span>
          </div>

          {/* the stack, as pending effects rather than an animation */}
          <h2>
            <button className="tinybtn"
                    onClick={() => setShowStack(!showStack)}>
              stack {game.stack.length ? `(${game.stack.length})` : '(empty)'}
            </button>
          </h2>
          {showStack && (
            <ul className="stackpanel">
              {game.stack.length === 0 && (
                <li className="muted small2">nothing pending</li>
              )}
              {game.stack.slice().reverse().map((e, i) => (
                <li key={e.id} className={i === 0 ? 'next' : ''}>
                  {i === 0 && <span className="nexttag">next</span>}
                  <b>{TRAIT_INFO[e.trait].name}</b>{' '}
                  <span className="muted">
                    {game.defs[e.source].name} · P{e.controller + 1} ·{' '}
                    {e.status}
                  </span>
                </li>
              ))}
              {req && (
                <li className="deciding">
                  awaiting P{req.player + 1}: {req.kind}
                </li>
              )}
            </ul>
          )}

          <h2>events</h2>
          <ul className="log">
            {game.events.slice(0, 40).map((e) => (
              <li key={e.id} className={`ln ev-${e.kind}`}>{e.text}</li>
            ))}
          </ul>
        </div>

        <div className="stage">
          <div className="previewkey">
            <span><i className="k-direct" />will be captured</span>
            <span><i className="k-shield" />protected, cannot be taken</span>
            <span><i className="k-gold" />ability target</span>
          </div>

          <div className="board v23"
               style={{
                 // --cellw, not --cell: v2.3 cells are not square
                 gridTemplateColumns: `repeat(${COLS}, var(--cellw))`,
                 ['--rows' as string]: String(ROWS),
                 ['--cols' as string]: String(COLS),
               } as React.CSSProperties}>
            {Array.from({ length: CELLS }, (_, cell) => {
              const id = game.cells[cell];
              const def = id ? game.defs[id] : null;
              const owner: number = id ? game.owner[id] : -1;
              const blocked = id ? captureBlocked(game, id) : null;
              const immovable = id ? moveBlocked(game, id) : null;
              const placeable = game.phase === 'convergence' && !!sel
                && !id && !req && myTurn;
              const canCmd = commandable.has(cell) && myTurn;
              return (
                <div key={cell}
                     className={`cell${placeable ? ' placeable' : ''}`
                       + `${owner >= 0 ? ` own${owner}` : ''}`
                       + `${canCmd ? ' commandable' : ''}`
                       + `${cmdCell === cell ? ' chosen' : ''}`
                       + `${highlight.take.has(cell) ? ' cap-direct' : ''}`
                       + `${highlight.touch.has(cell) ? ' chosen' : ''}`
                       + `${blocked?.source === 'sanctuary'
                           ? ' warded' : ''}`
                       + `${blocked?.source === 'champion'
                           ? ' champ' : ''}`
                       + `${flash.has(cell) ? ' flash' : ''}`
                       + `${hover === cell && placeable ? ' hovering' : ''}`}
                     // a touch browser fires mouseenter on tap, which
                     // opened the enlargement over the cell you had
                     // just tapped. On touch the strip under the board
                     // carries this instead.
                     onMouseEnter={coarse ? undefined : (ev) => {
                       setHover(cell);
                       if (id) {
                         const r = (ev.currentTarget as HTMLElement)
                           .getBoundingClientRect();
                         setBig({ cell, x: r.right, y: r.top });
                       }
                     }}
                     onMouseLeave={coarse ? undefined : () => {
                       setHover((h) => (h === cell ? null : h));
                       setBig((b) => (b && b.cell === cell ? null : b));
                     }}
                     onClick={() => {
                       if (over) return;
                       if (req) return;          // a decision is pending
                       if (game.phase === 'convergence' && !id && sel
                           && myTurn) {
                         advance(apply(game, { kind: 'deploy', card: sel,
                                               cell }));
                         sfx('place');
                       } else if (canCmd) {
                         setCmdCell(cell); setCmdHover(null);
                       } else if (id) {
                         setInspect(cell);
                       }
                     }}>
                  {def ? (
                    <>
                      <BattleCard g={game} id={id!} owner={owner} />
                      {canCmd && <span className="cmddot" />}
                    </>
                  ) : (
                    <>
                      <span className="cellno">{cell}</span>
                      {survey?.cells.has(cell) && (() => {
                        const q = survey.cells.get(cell)!;
                        const top = q.taken > 0 && q.taken === survey.best;
                        return (
                          <span className={`surv${top ? ' top' : ''}`
                            + `${q.taken === 0 ? ' none' : ''}`}>
                            <b>{q.taken > 0 ? `+${q.taken}` : '0'}</b>
                            {q.traitOptions > 0 && (
                              <i className="surv-trait"
                                 title={`${q.traitOptions} ability `
                                   + 'target(s) here'}>✦</i>
                            )}
                            {q.blocked > 0 && (
                              <i className="surv-held"
                                 title={`${q.blocked} held by `
                                   + 'protection'}>⛉</i>
                            )}
                          </span>
                        );
                      })()}
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {/* What the card in focus does, stated under the board.
              Visible only on a narrow screen, where the right rail that
              normally carries this has been pushed below the pickers
              and is no use mid-decision. */}
          {focusDef && focusId ? (
            <button className={`cardstrip${focusOwner === 0 ? ' p1'
              : focusOwner === 1 ? ' p2' : ''}`}
                    onClick={() => setPeek({ card: focusId, x: 0, y: 0 })}>
              <span className="cs-art"
                    style={{ backgroundImage:
                      `url(/art/portraits/card-${String(focusDef.art)
                        .padStart(2, '0')}.webp)` }} />
              <span className="cs-text">
                <b className="cs-name">{focusDef.name}</b>
                <span className="cs-ab i">
                  <b>I ·{' '}
                    {focusDef.trait
                      ? TRAIT_INFO[focusDef.trait].name : 'no trait'}</b>
                  {focusDef.trait
                    && ` — ${TRAIT_INFO[focusDef.trait].short}`}
                </span>
                <span className="cs-ab ii">
                  <b>II · {CMD_INFO[focusDef.command].name}</b>
                  {` — ${CMD_INFO[focusDef.command].short}`}
                </span>
              </span>
              <span className="cs-more">full</span>
            </button>
          ) : (
            <p className="cardstrip empty">
              {game.phase === 'convergence'
                ? 'tap a card in hand to see what it takes everywhere'
                : 'tap one of your characters to read it'}
            </p>
          )}

          {/* the two-tap rule, said out loud: an interaction you have
              to discover by accident is not an interaction */}
          {game.phase === 'convergence' && !req && (
            <p className="taphint">
              <b>tap</b> a card to select it and number every cell ·{' '}
              <b>tap it again</b> for the full rules ·{' '}
              <b>tap a cell</b> to deploy
            </p>
          )}

          {/* A hand card under the cursor, read in full BEFORE it is
              chosen. Without this a card's rules text was only
              reachable after committing to it. */}
          {peek && (() => {
            const d = game.defs[peek.card];
            const q = survey;
            // On touch this is a sheet anchored to the bottom edge by
            // the stylesheet, so no coordinates are written at all --
            // an inline left/top would beat the sheet rule and park a
            // 330px panel at an arbitrary offset.
            const place = coarse ? undefined : {
              left: `${Math.min(peek.x, window.innerWidth - 348)}px`,
              top: `${Math.max(8, peek.y - 430)}px`,
            };
            return (
              <div className="bigcard peekcard" style={place}>
                {coarse && (
                  <button className="sheetclose" aria-label="close"
                          onClick={() => setPeek(null)}>✕</button>
                )}
                <div className="bc-art"
                     style={{ backgroundImage:
                       `url(/art/portraits/card-${String(d.art)
                         .padStart(2, '0')}.webp)` }} />
                <h3>{d.name}</h3>
                {d.epithet && <p className="bc-ep">{d.epithet}</p>}
                <div className="peeksigils">
                  {(['north', 'east', 'south', 'west'] as const)
                    .map((side, i) => (
                    <span key={side}>
                      <span className="sl-disc"
                            style={{ color: SIGIL_PALETTE[
                              SIGIL_NAMES[d.sigils[i]]].color }}>
                        <Sigil sigil={d.sigils[i]} size={14} />
                      </span>
                      <em>{side}</em>
                    </span>
                  ))}
                </div>
                <div className="bc-slot i">
                  <b>I · CONVERGENCE —{' '}
                    {d.trait ? TRAIT_INFO[d.trait].name : 'NONE'}</b>
                  {d.trait && <p>{TRAIT_INFO[d.trait].text}</p>}
                </div>
                <div className="bc-slot ii">
                  <b>II · DOMINION — {CMD_INFO[d.command].name}</b>
                  <p>{CMD_INFO[d.command].text}</p>
                </div>
                {q && (
                  <p className="bc-state">
                    {q.best > 0
                      ? `best placement takes ${q.best} — see the board`
                      : 'no placement captures anything right now'}
                  </p>
                )}
                {d.flavour && <p className="bc-flav">“{d.flavour}”</p>}
              </div>
            );
          })()}

          {/* Supplementary enlargement for a card already on the board. */}
          {big && !peek && game.cells[big.cell] && (() => {
            const bid = game.cells[big.cell]!;
            const bd = game.defs[bid];
            const left = Math.min(big.x + 12, window.innerWidth - 348);
            const top = Math.min(big.y, window.innerHeight - 430);
            return (
              <div className="bigcard"
                   style={coarse ? undefined
                     : { left: `${left}px`,
                         top: `${Math.max(8, top)}px` }}>
                {coarse && (
                  <button className="sheetclose" aria-label="close"
                          onClick={() => setBig(null)}>✕</button>
                )}
                <div className="bc-art"
                     style={{ backgroundImage:
                       `url(/art/portraits/card-${String(bd.art)
                         .padStart(2, '0')}.webp)` }} />
                <h3>{bd.name}</h3>
                {bd.epithet && <p className="bc-ep">{bd.epithet}</p>}
                <div className="bc-slot i">
                  <b>I · CONVERGENCE —{' '}
                    {bd.trait ? TRAIT_INFO[bd.trait].name : 'NONE'}</b>
                  {bd.trait && <p>{TRAIT_INFO[bd.trait].text}</p>}
                  {bd.trait && (
                    <p className="bc-state">
                      {traitState(game, bid)}
                    </p>
                  )}
                </div>
                <div className="bc-slot ii">
                  <b>II · DOMINION — {CMD_INFO[bd.command].name}</b>
                  <p>{CMD_INFO[bd.command].text}</p>
                </div>
                {bd.flavour && <p className="bc-flav">“{bd.flavour}”</p>}
              </div>
            );
          })()}

          {game.phase === 'convergence' && !req && (
            <div className="hand">
              {game.hands[active].map((cid) => {
                const d = game.defs[cid];
                return (
                  <button key={cid}
                          className={`slot${sel === cid ? ' sel' : ''}`
                            + `${peek?.card === cid ? ' peek' : ''}`}
                          disabled={!myTurn || over}
                          onMouseEnter={coarse ? undefined : (ev) => {
                            const r = (ev.currentTarget as HTMLElement)
                              .getBoundingClientRect();
                            setPeek({ card: cid, x: r.left, y: r.top });
                          }}
                          onMouseLeave={coarse ? undefined : () =>
                            setPeek((q) => (q?.card === cid ? null : q))}
                          onFocus={coarse ? undefined : (ev) => {
                            const r = (ev.currentTarget as HTMLElement)
                              .getBoundingClientRect();
                            setPeek({ card: cid, x: r.left, y: r.top });
                          }}
                          onClick={() => {
                            primeAudio(); sfx('select');
                            setInspect(null);
                            // With no hover, one tap has to do the work
                            // of moving the cursor there: it selects the
                            // card AND surveys the board. A second tap
                            // on the same card opens its full rules.
                            // Nothing is deployed either way -- that
                            // still takes a tap on a cell.
                            if (coarse && sel === cid) {
                              setPeek({ card: cid, x: 0, y: 0 });
                              return;
                            }
                            setSel(cid);
                            if (coarse) setPeek(null);
                          }}>
                    <CardFace sigils={d.sigils} owner={active} small
                              art={d.art} />
                    <small>{d.name.replace(/^The /, '')}</small>
                    <small className="handslots">
                      <span className="hs-i">
                        {d.trait ? TRAIT_INFO[d.trait].name : '—'}
                      </span>
                      <span className="hs-ii">
                        {CMD_INFO[d.command].name}
                      </span>
                    </small>
                  </button>
                );
              })}
            </div>
          )}

          {game.phase === 'dominion' && !req && cmdCell === null && (
            <p className="hint">
              {myTurn ? 'click one of your characters to command it'
                : 'the opponent is commanding…'}
            </p>
          )}
        </div>

        <div className="rail right">
          {/* a decision the rules are waiting on */}
          {req && (
            <div className="picker decide">
              <p className="hint">
                <b>P{req.player + 1} decides</b> — {req.prompt}
              </p>
              {!myDecision && (
                <p className="muted small2">waiting for the other player…</p>
              )}
              {myDecision && (
                <>
                  {coarse && (
                    <p className="taphint">
                      <b>tap</b> an option to see what it touches ·{' '}
                      <b>tap again</b> to take it
                    </p>
                  )}
                  <ul onMouseLeave={coarse ? undefined
                    : () => setOptHover(null)}>
                    {req.options.map((o: ChoiceOption) => (
                      <li key={o.id}
                          className={optHover === o.id ? 'on' : ''}
                          onMouseEnter={coarse ? undefined
                            : () => setOptHover(o.id)}
                          onClick={() => {
                            // On touch the board preview has nowhere to
                            // come from, so the first tap IS the hover
                            // and the second commits.
                            if (coarse && optHover !== o.id) {
                              setOptHover(o.id);
                              return;
                            }
                            advance(apply(game, { kind: 'choose',
                                                  option: o.id }));
                            sfx('ability');
                          }}>
                        <span className="plabel">{o.label}</span>
                      </li>
                    ))}
                  </ul>
                  {req.optional && (
                    <button onClick={() => {
                      advance(apply(game, { kind: 'skip' }));
                    }}>skip this ability</button>
                  )}
                </>
              )}
            </div>
          )}

          {/* Dominion command choices */}
          {!req && cmdCell !== null && (
            <div className="picker">
              <p className="hint">
                commanding {game.defs[game.cells[cmdCell]!].name}
                <button onClick={() => { setCmdCell(null);
                                         setCmdHover(null); }}>
                  cancel
                </button>
              </p>
              {coarse && (
                <p className="taphint">
                  <b>tap</b> a command to light up what it takes ·{' '}
                  <b>tap again</b> to give the order
                </p>
              )}
              <ul onMouseLeave={coarse ? undefined
                : () => setCmdHover(null)}>
                {cmdChoices.map((c, i) => (
                  <li key={i}
                      className={`${cmdHover === i ? 'on' : ''}`
                        + `${c.gain > 0 ? ' takes' : ''}`}
                      onMouseEnter={coarse ? undefined
                        : () => setCmdHover(i)}
                      onClick={() => {
                        if (coarse && cmdHover !== i) {
                          setCmdHover(i);
                          return;
                        }
                        advance(apply(game, { kind: 'command',
                                              cmd: c.cmd as DominionCommand }));
                        sfx('ability');
                      }}>
                    <span className="plabel">{c.label}</span>
                    <span className="pgain">
                      {c.gain > 0 ? `takes ${c.gain}` : 'takes nothing'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* the card under the cursor: both slots, with live condition */}
          {detailDef && detail !== null && (
            <div className="abilitybox">
              <b>{detailDef.name}</b>
              {detailDef.epithet && (
                <p className="muted small2 epithet">{detailDef.epithet}</p>
              )}
              <div className="slotrow">
                <span className="slottag i">I · Convergence</span>
                {detailDef.trait ? (
                  <>
                    <b>{TRAIT_INFO[detailDef.trait].name}</b>{' '}
                    <span className="muted small2">
                      ({TRAIT_INFO[detailDef.trait].timing}
                      {TRAIT_INFO[detailDef.trait].status === 'experimental'
                        ? ', experimental' : ''})
                    </span>
                    <p className="small2">
                      {TRAIT_INFO[detailDef.trait].text}
                    </p>
                    <p className="statusline">
                      {traitState(game, game.cells[detail]!)}
                    </p>
                    <p className="muted small2">
                      {TRAIT_INFO[detailDef.trait].why}
                    </p>
                    <p className="muted small2">
                      on a table: {TRAIT_INFO[detailDef.trait].physical}
                    </p>
                  </>
                ) : <p className="muted small2">none</p>}
              </div>
              <div className="slotrow">
                <span className="slottag ii">II · Dominion</span>
                <b>{CMD_INFO[detailDef.command].name}</b>
                <p className="small2">{CMD_INFO[detailDef.command].text}</p>
              </div>
              {detailDef.flavour && (
                <p className="muted small2 flavour">
                  “{detailDef.flavour}”
                </p>
              )}
            </div>
          )}

          {deployPreview && deployPreview.blocked.length > 0 && (
            <div className="rule">
              {deployPreview.blocked.map((b) => (
                <div key={b.card} className="small2">
                  <b>{game.defs[b.card].name}</b> holds — {b.why}
                </div>
              ))}
            </div>
          )}

          <h2>the four sigils</h2>
          <ul className="sigillegend">
            {SIGIL_NAMES.map((n, i) => (
              <li key={n}>
                <span className="sl-disc"
                      style={{ color: SIGIL_PALETTE[n].color }}>
                  <Sigil sigil={i as 0 | 1 | 2 | 3} size={16} />
                </span>
                <span>
                  <b style={{ color: SIGIL_PALETTE[n].color }}>
                    {SIGIL_PALETTE[n].arcane}
                  </b>
                  <br />
                  <span className="muted small2">
                    {SIGIL_PALETTE[n].tone} · {SIGIL_PALETTE[n].shape}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <p className="muted small2">
            A sigil's colour means only which symbol it is. It never
            changes with ownership or phase, and matching still decides
            captures in Dominion.
          </p>

          <h2>the six convergence traits</h2>
          <ul className="log">
            {(Object.keys(TRAIT_INFO) as (keyof typeof TRAIT_INFO)[])
              .map((t) => (
              <li key={t} className="ln">
                <b>{TRAIT_INFO[t].name}</b>{' '}
                <span className="muted">
                  {TRAIT_INFO[t].timing}
                  {TRAIT_INFO[t].status === 'experimental'
                    ? ' · experimental' : ''}
                </span>
                <br />
                <span className="small2">{TRAIT_INFO[t].text}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
