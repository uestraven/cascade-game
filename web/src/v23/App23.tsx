import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { CardFace } from '../proto/ui/CardFace';
import { CardInfo } from './CardInfo';
import { isMuted, loadMuted, primeAudio, setMuted, sfx }
  from '../proto/ui/sound';
import { mulberry32, randomSeed } from '../rng';
import {
  type CardId, type ChoiceOption, type DominionCommand, type Player,
  type V23State, CELLS, CMD_INFO, COLS, DOMINION_COMMANDS, ROWS,
  TRAIT_INFO, alliesAdjacent, apply, captureBlocked, cellOf,
  commandsLeft, deployments, dominionCommands, isOver, moveBlocked,
  mustPass, newGame, previewDeploy, score, toMove, traitState, winner,
} from './rules';

type Mode = 'bot' | 'hotseat';
const BOT_MS = 460;

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
  const botRng = useRef(mulberry32(seed ^ 0x9e3779b9));

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

  return (
    <div className="page">
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
            {game.events.slice(0, 14).map((e) => (
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
               style={{ gridTemplateColumns: `repeat(${COLS}, var(--cell))`,
                        ['--rows' as string]: String(ROWS),
                        ['--cols' as string]: String(COLS) } as
                        React.CSSProperties}>
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
                     onMouseEnter={(ev) => {
                       setHover(cell);
                       if (id) {
                         const r = (ev.currentTarget as HTMLElement)
                           .getBoundingClientRect();
                         setBig({ cell, x: r.right, y: r.top });
                       }
                     }}
                     onMouseLeave={() => {
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
                      <CardFace sigils={def.sigils} owner={owner}
                                art={def.art}
                                flash={flash.has(cell)} />
                      <CardInfo g={game} id={id!} />
                      {canCmd && <span className="cmddot" />}
                    </>
                  ) : <span className="cellno">{cell}</span>}
                </div>
              );
            })}
          </div>

          {/* Supplementary enlargement. The board already carries every
              ability in text; this is for reading the full rule without
              navigating the rail. */}
          {big && game.cells[big.cell] && (() => {
            const bid = game.cells[big.cell]!;
            const bd = game.defs[bid];
            const left = Math.min(big.x + 12, window.innerWidth - 348);
            const top = Math.min(big.y, window.innerHeight - 430);
            return (
              <div className="bigcard"
                   style={{ left: `${left}px`, top: `${Math.max(8, top)}px` }}>
                <div className="bc-art"
                     style={{ backgroundImage:
                       `url(/art/cards/card-${String(bd.art)
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
                          className={`slot${sel === cid ? ' sel' : ''}`}
                          disabled={!myTurn || over}
                          onClick={() => { primeAudio(); sfx('select');
                                           setSel(cid); setInspect(null); }}>
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
                  <ul onMouseLeave={() => setOptHover(null)}>
                    {req.options.map((o: ChoiceOption) => (
                      <li key={o.id}
                          className={optHover === o.id ? 'on' : ''}
                          onMouseEnter={() => setOptHover(o.id)}
                          onClick={() => {
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
              <ul onMouseLeave={() => setCmdHover(null)}>
                {cmdChoices.map((c, i) => (
                  <li key={i}
                      className={`${cmdHover === i ? 'on' : ''}`
                        + `${c.gain > 0 ? ' takes' : ''}`}
                      onMouseEnter={() => setCmdHover(i)}
                      onClick={() => {
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
