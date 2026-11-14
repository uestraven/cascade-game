import { useState } from 'react';

import { ELEMENTS, NAMES, beats } from '../engine';
import { icon } from './CardFace';

const Pip = ({ el, big, faded }:
  { el: number; big?: boolean; faded?: boolean }) => (
  <span
    className={`pip${big ? ' big' : ''}${faded ? ' faded' : ''}`}
    data-el={el}
    title={NAMES[el]}
    style={{ ['--icon' as string]: `url(${icon(el)})` }}
  />
);

/** Four twin pairs: the layer worth memorising. Everything else is lookup. */
const TWIN_PAIRS: [number, number][] = [[1, 2], [3, 4], [5, 6], [7, 8]];

export function ElementMap() {
  const [focus, setFocus] = useState<number | null>(null);

  return (
    <aside className="map">
      <h2>element map</h2>

      <div className="twins">
        {TWIN_PAIRS.map(([a, b]) => (
          <span key={a} className="twinpair" title="twins never resolve">
            <Pip el={a} /><i>=</i><Pip el={b} />
          </span>
        ))}
        <small>twins cancel — nothing happens</small>
      </div>

      <table>
        <tbody>
          {ELEMENTS.map((e) => {
            const victims = ELEMENTS.filter((f) => beats(e, f));
            const predators = ELEMENTS.filter((f) => beats(f, e));
            // No dimming: the wheel is dense enough that every element
            // relates to six of the other seven, so "tracing" one would
            // only ever grey out its twin. A plain row highlight is the
            // honest amount of help here.
            return (
              <tr key={e}
                  className={focus === e ? 'on' : ''}
                  onMouseEnter={() => setFocus(e)}
                  onMouseLeave={() => setFocus(null)}>
                <th><Pip el={e} big /></th>
                <td>
                  <span className="lbl beat">beats</span>
                  {victims.map((v) => <Pip key={v} el={v} />)}
                </td>
                <td>
                  <span className="lbl lose">loses to</span>
                  {predators.map((v) => <Pip key={v} el={v} faded />)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <small className="foot">
        every element beats three and loses to three.
        read across a row to settle any matchup.
      </small>
    </aside>
  );
}
