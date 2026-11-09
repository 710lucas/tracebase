// How the text of a search is compared with a value. A caller picks one per request:
// - `exact`: the value is the text, letter for letter (`café` finds `café` and nothing else);
// - `contains`: the value has the text inside, letter for letter (`café` finds `um café bom`, not `CAFÉ`);
// - `insensitive`: the value has the text inside, ignoring case and accents (`café` finds `Café`, `CAFÉ` and `cafe`).
export const MATCH_MODES = ["exact", "contains", "insensitive"] as const;
export type MatchMode = (typeof MATCH_MODES)[number];

export const DEFAULT_MATCH_MODE: MatchMode = "insensitive";
