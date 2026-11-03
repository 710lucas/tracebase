import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createProvenance,
  InvalidProvenanceError,
  type Provenance,
} from "../../../../src/core/domain/provenance/index.ts";

const MINIMUM = { tool: "some-tool", run: "run-1" };

test("accepts only tool and run (tool-agnostic minimum)", () => {
  const provenance = createProvenance(MINIMUM);
  assert.equal(provenance.tool, "some-tool");
  assert.equal(provenance.run, "run-1");
  assert.equal(provenance.recordRefs, undefined);
  assert.equal(provenance.module, undefined);
  assert.equal(provenance.confidence, undefined);
  assert.equal(provenance.observedAt, undefined);
  assert.equal(provenance.recordedAt, undefined);
});

test("keeps the optional fields when given", () => {
  const provenance = createProvenance({
    tool: "spiderfoot",
    run: "scan1",
    recordRefs: ["hashA"],
    module: "sfp_dnsresolve",
    confidence: 80,
    observedAt: 1760000000000,
  });
  assert.deepEqual(provenance.recordRefs, ["hashA"]);
  assert.equal(provenance.module, "sfp_dnsresolve");
  assert.equal(provenance.confidence, 80);
  assert.equal(provenance.observedAt, 1760000000000);
});

test("rejects a blank tool or run and says which one", () => {
  assert.throws(
    () => createProvenance({ ...MINIMUM, tool: " " }),
    new InvalidProvenanceError("tool must not be blank"),
  );
  assert.throws(
    () => createProvenance({ ...MINIMUM, run: "" }),
    new InvalidProvenanceError("run must not be blank"),
  );
});

test("rejects an empty list of recordRefs and a blank reference", () => {
  assert.throws(
    () => createProvenance({ ...MINIMUM, recordRefs: [] }),
    new InvalidProvenanceError("recordRefs must not be empty when present"),
  );
  assert.throws(
    () => createProvenance({ ...MINIMUM, recordRefs: ["hashA", "  "] }),
    new InvalidProvenanceError("a record reference must not be blank"),
  );
});

test("drops repeated recordRefs and sorts the rest, so the same references have the same shape", () => {
  const first = createProvenance({ ...MINIMUM, recordRefs: ["b", "a", "b"] });
  const second = createProvenance({ ...MINIMUM, recordRefs: ["a", "b"] });

  assert.deepEqual(first.recordRefs, ["a", "b"]);
  assert.deepEqual(first.recordRefs, second.recordRefs);
});

test("does not change the list of recordRefs it was given, and the result cannot be mutated", () => {
  const given = ["b", "a"];

  const provenance = createProvenance({ ...MINIMUM, recordRefs: given });

  assert.deepEqual(given, ["b", "a"]);
  assert.ok(Object.isFrozen(provenance.recordRefs));
});

test("accepts the confidence boundaries 0 and 100", () => {
  assert.equal(createProvenance({ ...MINIMUM, confidence: 0 }).confidence, 0);
  assert.equal(createProvenance({ ...MINIMUM, confidence: 100 }).confidence, 100);
});

test("rejects a confidence outside 0-100 or not a number", () => {
  assert.throws(() => createProvenance({ ...MINIMUM, confidence: 101 }), InvalidProvenanceError);
  assert.throws(() => createProvenance({ ...MINIMUM, confidence: -1 }), InvalidProvenanceError);
  assert.throws(
    () => createProvenance({ ...MINIMUM, confidence: Number.NaN }),
    InvalidProvenanceError,
  );
});

test("rejects an observedAt that is negative or not an integer", () => {
  assert.throws(() => createProvenance({ ...MINIMUM, observedAt: -5 }), InvalidProvenanceError);
  assert.throws(() => createProvenance({ ...MINIMUM, observedAt: 1.5 }), InvalidProvenanceError);
});

test("keeps the recordedAt when given", () => {
  assert.equal(
    createProvenance({ ...MINIMUM, recordedAt: 1762387200000 }).recordedAt,
    1762387200000,
  );
});

test("rejects a recordedAt that is negative or not an integer", () => {
  assert.throws(
    () => createProvenance({ ...MINIMUM, recordedAt: -5 }),
    new InvalidProvenanceError("recordedAt must be a non-negative integer (epoch milliseconds)"),
  );
  assert.throws(() => createProvenance({ ...MINIMUM, recordedAt: 1.5 }), InvalidProvenanceError);
});

test("the created provenance cannot be mutated", () => {
  assert.ok(Object.isFrozen(createProvenance(MINIMUM)));
});

test("an object literal is not a Provenance for the compiler", () => {
  // @ts-expect-error a literal has no brand, so it is not a Provenance
  const loose: Provenance = { tool: "some-tool", run: "run-1" };
  assert.equal(loose.tool, "some-tool");
});
