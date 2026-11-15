/**
 * The v2.3 experimental roster: twelve characters, fixed sigils.
 *
 * Each of the six Convergence traits appears exactly twice, so every
 * ability is met in an ordinary match rather than needing a contrived
 * scenario. Sigils are fixed and never rotate, so a character's four
 * edges are part of its identity.
 *
 * The three established characters keep their names and artwork. Their
 * pairings have been adjusted to fit the new trait set, and deliberately
 * NOT to give them the strongest-looking combinations — Stormgrave holds
 * an experimental trait precisely so the experiment is played rather
 * than avoided.
 *
 * Nine provisional characters fill the rest. They have names so they can
 * be talked about in a playtest, not because the roster is settled.
 */

import { type Card } from '../proto/engine';
import { type CardDef, type CmdId, type TraitId } from './rules';

/** halo 0, ward 1, crux 2, gyre 3 — north, east, south, west */
const S = (n: number, e: number, s: number, w: number): Card =>
  [n, e, s, w] as unknown as Card;

interface Entry {
  id: string;
  /** this character's identity colour, authored rather than hashed so
   *  the twelve are actually distinguishable from each other */
  accent: string;
  name: string;
  epithet: string;
  flavour: string;
  sigils: Card;
  trait: TraitId | null;
  command: CmdId;
  art: number;
}

export const ROSTER: Entry[] = [
  // ---- established, art already approved -----------------------------
  {
    id: 'equinox', accent: '#8f7bff', name: 'The Veiled Equinox',
    epithet: 'Keeper of Two Truths',
    flavour: 'All things cast a shadow. Even the light that reveals them.',
    sigils: S(0, 1, 3, 2), trait: 'sanctuary', command: 'transpose',
    art: 1,
  },
  {
    id: 'stormgrave', accent: '#3fb6d8', name: 'Stormgrave Empress',
    epithet: 'Sovereign of the Drowned Throne',
    flavour: 'The storm does not obey me. It remembers who crowned it.',
    sigils: S(2, 0, 1, 3), trait: 'pact', command: 'usurpOne',
    art: 8,
  },
  {
    id: 'shepherd', accent: '#d8a23f', name: 'The Hollow Shepherd',
    epithet: 'Warden of the Returning',
    flavour: 'Nothing of mine stays lost. It only wanders.',
    sigils: S(1, 3, 0, 2), trait: 'rally', command: 'reclaimRecent',
    art: 15,
  },

  // ---- provisional ---------------------------------------------------
  {
    id: 'bastion', accent: '#c9b26a', name: 'The Gilded Bastion',
    epithet: 'Who Does Not Step Aside',
    flavour: 'Move the river. I will still be here.',
    sigils: S(1, 1, 2, 3), trait: 'anchor', command: 'plain',
    art: 5,
  },
  {
    id: 'cantor', accent: '#4fd1b0', name: 'The Drowned Cantor',
    epithet: 'Singer of the Second Tide',
    flavour: 'Every verse returns. That is what makes it a verse.',
    sigils: S(3, 2, 0, 1), trait: 'rally', command: 'plain',
    art: 19,
  },
  {
    id: 'cartwright', accent: '#b06ad8', name: 'The Pale Cartwright',
    epithet: 'Who Turns the Wheel of Others',
    flavour: 'I do not decide where you go. Only that you go.',
    sigils: S(2, 3, 1, 0), trait: 'harbinger', command: 'transpose',
    art: 17,
  },
  {
    id: 'magistrate', accent: '#6fa8ff', name: 'The Rimewood Magistrate',
    epithet: 'Arbiter of Borders',
    flavour: 'Exile is not cruelty. It is bookkeeping.',
    sigils: S(0, 2, 1, 3), trait: 'exile', command: 'plain',
    art: 11,
  },
  {
    id: 'oathkeeper', accent: '#5fd96f', name: 'The Sunken Oathkeeper',
    epithet: 'Holder of the Unbroken Line',
    flavour: 'Two shields are a wall. Three are a country.',
    sigils: S(1, 0, 3, 2), trait: 'sanctuary', command: 'plain',
    art: 3,
  },
  {
    id: 'ferryman', accent: '#d86a6a', name: 'The Ashen Ferryman',
    epithet: 'Who Names the Price After',
    flavour: 'You may cross. Someone must stay.',
    sigils: S(3, 1, 2, 0), trait: 'pact', command: 'usurp',
    art: 20,
  },
  {
    id: 'herald', accent: '#e0954a', name: 'The Brass Herald',
    epithet: 'First of the Turning Court',
    flavour: 'I announce nothing. I rearrange.',
    sigils: S(2, 1, 0, 3), trait: 'harbinger', command: 'plain',
    art: 6,
  },
  {
    id: 'warden', accent: '#8ba3c7', name: 'The Stonefast Warden',
    epithet: 'Rooted Against the Hour',
    flavour: 'Let them come around. They always do.',
    sigils: S(0, 3, 2, 1), trait: 'anchor', command: 'usurpOne',
    art: 13,
  },
  {
    id: 'cartographer', accent: '#d85fa8', name: 'The Severed Cartographer',
    epithet: 'Who Redraws the Living',
    flavour: 'The map was wrong. I corrected the land.',
    sigils: S(1, 2, 3, 0), trait: 'exile', command: 'reclaimRecent',
    art: 10,
  },
];

export const CARD_DEFS: Record<string, CardDef> = Object.fromEntries(
  ROSTER.map((e) => [e.id, {
    id: e.id, name: e.name, epithet: e.epithet, flavour: e.flavour,
    sigils: e.sigils, trait: e.trait, command: e.command, art: e.art,
    accent: e.accent,
  }]),
);

/** Each trait exactly twice — asserted by test, not by hope. */
export const TRAIT_COUNTS = ROSTER.reduce<Record<string, number>>(
  (acc, e) => {
    if (e.trait) acc[e.trait] = (acc[e.trait] ?? 0) + 1;
    return acc;
  }, {});
