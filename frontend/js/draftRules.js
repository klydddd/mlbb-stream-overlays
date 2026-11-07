// Draft rule: a hero can be in only one draft slot. Once picked or banned (by either team) it
// can't be picked or banned again, so the controller hides it from suggestions and refuses it
// on Enter. Used by js/autocomplete.js and js/control.js.
// Tested by tests/draftRules.test.mjs (run: node --test tests/draftRules.test.mjs).

export const SLOT_KEYS = [
  ...Array.from({ length: 10 }, (_, i) => `heroPick-${i + 1}`),
  ...Array.from({ length: 10 }, (_, i) => `banPick-${i + 1}`),
];

const norm = (v) => (typeof v === "string" ? v.trim().toLowerCase() : "");

// Lowercase names of every hero in a pick or ban slot, except `ownKey` (the slot being edited,
// so re-entering the same hero in its own slot is allowed).
export function takenHeroes(getItem, ownKey) {
  const taken = new Set();
  for (const key of SLOT_KEYS) {
    if (key === ownKey) continue;
    const name = norm(getItem(key));
    if (name) taken.add(name);
  }
  return taken;
}

export function isTaken(getItem, name, ownKey) {
  const n = norm(name);
  return n !== "" && takenHeroes(getItem, ownKey).has(n);
}
