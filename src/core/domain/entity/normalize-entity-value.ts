import { normalizeText } from "../text/index.ts";

// Brings an entity value to a canonical form, so the same thing written slightly differently
// does not become two nodes. It is applied by `createEntity`, in one place.
//
// WHAT IT DOES (safe for ANY kind of value): the basic text hygiene of `normalizeText`,
// that is Unicode NFC and trim.
//
// WHAT IT DELIBERATELY DOES NOT DO: lowercase, strip a trailing dot, drop a "www." prefix, etc.
// Those rules depend on the entity TYPE (a domain is case-insensitive; a username, a URL path
// or a hash may not be), and types are owned by the tools, so the core cannot know. If it
// lowercased everything it would silently merge values that are different things. So values are
// CASE SENSITIVE here: "Example.com" and "example.com" are different nodes unless the adapter
// folds the case first.
//
// So the split is: the core guarantees the universal part; the ADAPTER applies the rules of its
// own types before handing the value over.
//
// SpiderFoot -> normalization (done by the SpiderFoot ADAPTER, before `createEntity`):
//   DOMAIN_NAME / INTERNET_NAME: lowercase and strip the trailing dot ("Example.com." -> "example.com").
//   Other types: pass `data` through unchanged unless a rule is known to be safe.
//
// Types are 100% owned by the tools (decision of 2026-10-19), so type-specific normalization
// stays in the adapters. Not planned: if several adapters ever repeat the same rule, revisit it
// then (for example a tool-declared rule the core applies), without giving the core a list of types.
//
// This function exists separately from `normalizeText` because entity values are where
// value-specific rules would grow, if they ever do.
export function normalizeEntityValue(value: string): string {
  return normalizeText(value);
}
