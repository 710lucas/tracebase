// Where and when a piece of information came from. Answers: "which tool, in which run and,
// when the tool says so, by which module, with what confidence, at what time?".
//
// TOOL-AGNOSTIC (decision of 2026-10-19): only `tool` and `run` are required, because any tool
// has a name and some notion of an execution. Everything else is optional: a tool that has no
// such concept simply leaves it out, and a tool that has it computes the value itself.
//
// `tool` and `run` are stored once, here. There is no separate id for a finding: a relation or
// an attribute is told apart from another by its content plus this provenance (two runs of the
// same tool, or two modules in one run, are different provenances).
//
// It applies to any tool, so it has its own module and does not depend on Entity or Relation.
//
// SpiderFoot -> Provenance (translation done by the SpiderFoot ADAPTER):
//   tool        -> the constant "spiderfoot"
//   run         -> the scan id (`tbl_scan_results.scan_instance_id`, a GUID)
//   recordRef   -> the event's `hash` (`event_hash`)
//   module      -> the event's `module` (e.g. "sfp_dnsresolve")
//   confidence  -> the event's `confidence`, 0 to 100 (SpiderFoot already uses this scale)
//   observedAt  -> the event's `generated`, which SpiderFoot stores in SECONDS with a fraction
//                  (e.g. 1786049414.250); the adapter sends it in milliseconds (1786049414250)
//
// Build instances with `createProvenance`, which enforces the invariants. The brand below makes the
// compiler refuse a literal or a `ProvenanceDTO` where a `Provenance` is expected.
//
// EXPAND: the tool version, when the graph-state / reprocessing work needs it. The key that makes an
// import idempotent (re-sending the same import must not duplicate edges) is built by the Memgraph
// adapter from tool, run, module, source, target and type.
declare const provenanceBrand: unique symbol;

export interface Provenance {
  readonly tool: string;
  readonly run: string;

  // A reference to the tool's own record that produced the finding (in SpiderFoot, the event
  // hash). It only lets you go back to the original: to open that record in the tool, or to
  // link the finding to its raw data. It is NOT part of any identity and no query depends on
  // it. A tool with no such record, such as one that just returns a list, leaves it out.
  readonly recordRef?: string;

  // The tool's sub-component that produced the finding ("sfp_dnsresolve" in SpiderFoot).
  readonly module?: string;

  // 0 to 100. The ADAPTER is responsible for scaling the tool's own measure to this range, or
  // for omitting it when the tool gives none. The core never invents a confidence.
  readonly confidence?: number;

  // When the tool made the observation, in epoch milliseconds (UTC). Gives the graph a
  // date-based history: the same fact seen again in a later run has a later `observedAt`.
  readonly observedAt?: number;

  // When OUR system received the data, in epoch milliseconds (UTC). The imports service sets it when
  // it receives the request, and a tool can never send it. Different from `observedAt`, which is the
  // tool's own date: this one is the date of last resort, used to order observations when the tool
  // sent no `observedAt`.
  readonly recordedAt?: number;

  // Exists only for the compiler; there is no such property at runtime.
  readonly [provenanceBrand]: true;
}
