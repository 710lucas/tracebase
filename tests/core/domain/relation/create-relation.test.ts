import { test } from "node:test";
import assert from "node:assert/strict";
import { createEntity } from "../../../../src/core/domain/entity/index.ts";
import { createProvenance } from "../../../../src/core/domain/provenance/index.ts";
import {
  createRelation,
  InvalidRelationError,
  type Relation,
} from "../../../../src/core/domain/relation/index.ts";

function fields(overrides: Partial<Relation> = {}): Relation {
  return {
    source: createEntity("DOMAIN_NAME", "example.com"),
    target: createEntity("IP_ADDRESS", "93.184.216.34"),
    provenance: createProvenance({ tool: "spiderfoot", run: "scan1" }),
    ...overrides,
  };
}

test("creates a direct relation with no type and no path", () => {
  const relation = createRelation(fields());
  assert.equal(relation.type, undefined);
  assert.equal(relation.viaRecordRefs, undefined);
  assert.equal(relation.source.value, "example.com");
});

test("keeps the type when given", () => {
  assert.equal(createRelation(fields({ type: "resolves_to" })).type, "resolves_to");
});

test("trims the type, and a type that is only whitespace is rejected", () => {
  assert.equal(createRelation(fields({ type: " resolves_to " })).type, "resolves_to");
  assert.throws(() => createRelation(fields({ type: "   " })), InvalidRelationError);
});

test("keeps the path through intermediate records, in order", () => {
  const relation = createRelation(fields({ viaRecordRefs: ["evt-1", "evt-2"] }));
  assert.deepEqual(relation.viaRecordRefs, ["evt-1", "evt-2"]);
});

// The example documented in `relation.ts`: an e-mail found through a crawled URL.
test("a link found through an intermediate URL keeps that URL's record reference", () => {
  const relation = createRelation({
    source: createEntity("INTERNET_NAME", "www.example.com"),
    target: createEntity("EMAILADDR", "contact@example.com"),
    provenance: createProvenance({
      tool: "spiderfoot",
      run: "scan1",
      recordRef: "hash-of-the-email-event",
    }),
    viaRecordRefs: ["hash-of-the-linked-url-event"],
  });
  assert.equal(relation.target.value, "contact@example.com");
  assert.deepEqual(relation.viaRecordRefs, ["hash-of-the-linked-url-event"]);
});

test("rejects a blank type when present", () => {
  assert.throws(() => createRelation(fields({ type: "" })), InvalidRelationError);
});

test("rejects a blank entry in the path", () => {
  assert.throws(
    () => createRelation(fields({ viaRecordRefs: ["evt-1", " "] })),
    InvalidRelationError,
  );
});

test("the created relation and its path cannot be mutated", () => {
  const relation = createRelation(fields({ viaRecordRefs: ["evt-1"] }));
  assert.ok(Object.isFrozen(relation));
  assert.ok(Object.isFrozen(relation.viaRecordRefs));
});

test("changing the caller's list afterwards does not change the relation", () => {
  const path = ["evt-1"];
  const relation = createRelation(fields({ viaRecordRefs: path }));
  path.push("evt-2");
  assert.deepEqual(relation.viaRecordRefs, ["evt-1"]);
});
