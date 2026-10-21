import { test } from "node:test";
import assert from "node:assert/strict";
import {
  InvalidImportBatchError,
  parseImportBatch,
} from "../../../../src/core/ports/import/index.ts";

const domain = { type: "DOMAIN_NAME", value: "example.com" };
const ip = { type: "IP_ADDRESS", value: "93.184.216.34" };

function payload(overrides: Record<string, unknown> = {}) {
  return { source: { tool: "spiderfoot", run: "scan-1" }, ...overrides };
}

function failure(input: unknown) {
  try {
    parseImportBatch(input);
  } catch (error) {
    return error;
  }
  return undefined;
}

test("parses the documented example into domain objects with merged provenance", () => {
  const batch = parseImportBatch(
    payload({
      relations: [
        {
          source: domain,
          target: ip,
          type: "resolves_to",
          provenance: { module: "sfp_dnsresolve", recordRef: "a1b2", confidence: 100 },
        },
      ],
      attributes: [
        {
          entity: ip,
          name: "WEBSERVER_BANNER",
          value: "nginx/1.25",
          provenance: { module: "sfp_webserver" },
        },
      ],
    }),
  );
  assert.deepEqual(batch.source, { tool: "spiderfoot", run: "scan-1" });
  assert.equal(batch.relations[0]?.source.value, "example.com");
  assert.equal(batch.relations[0]?.type, "resolves_to");
  assert.deepEqual(batch.relations[0]?.provenance, {
    tool: "spiderfoot",
    run: "scan-1",
    module: "sfp_dnsresolve",
    recordRef: "a1b2",
    confidence: 100,
  });
  assert.equal(batch.attributes[0]?.entity.value, "93.184.216.34");
  assert.equal(batch.attributes[0]?.provenance.module, "sfp_webserver");
});

test("a batch with only a source is valid and empty", () => {
  const batch = parseImportBatch(payload());
  assert.deepEqual(batch.relations, []);
  assert.deepEqual(batch.attributes, []);
});

test("a relation needs no type, no path and no provenance block", () => {
  const batch = parseImportBatch(payload({ relations: [{ source: domain, target: ip }] }));
  assert.equal(batch.relations[0]?.type, undefined);
  assert.equal(batch.relations[0]?.viaRecordRefs, undefined);
  assert.deepEqual(batch.relations[0]?.provenance, { tool: "spiderfoot", run: "scan-1" });
});

test("keeps the path through intermediate records", () => {
  const batch = parseImportBatch(
    payload({ relations: [{ source: domain, target: ip, viaRecordRefs: ["u1", "u2"] }] }),
  );
  assert.deepEqual(batch.relations[0]?.viaRecordRefs, ["u1", "u2"]);
});

test("accepts entity types the core has never heard of", () => {
  const batch = parseImportBatch(
    payload({
      relations: [{ source: { type: "X-NEW-TYPE", value: "a" }, target: ip }],
    }),
  );
  assert.equal(batch.relations[0]?.source.type, "X-NEW-TYPE");
});

test("rejects a payload that is not an object, or has no source", () => {
  assert.ok(failure(null) instanceof InvalidImportBatchError);
  assert.ok(failure([]) instanceof InvalidImportBatchError);
  assert.ok(failure({}) instanceof InvalidImportBatchError);
});

test("rejects unknown top-level fields", () => {
  assert.ok(failure(payload({ entities: [] })) instanceof InvalidImportBatchError);
});

test("reports the exact path of a structural problem", () => {
  const error = failure(
    payload({
      relations: [
        { source: domain, target: ip },
        { source: 5, target: ip },
      ],
    }),
  );
  assert.ok(error instanceof InvalidImportBatchError);
  assert.equal(error.path, "relations[1].source");
});

test("reports the exact path of a domain problem inside an attribute", () => {
  const error = failure(
    payload({
      attributes: [{ entity: ip, name: "  ", value: "x" }],
    }),
  );
  assert.ok(error instanceof InvalidImportBatchError);
  assert.equal(error.path, "attributes[0]");
});

test("one bad item rejects the whole batch", () => {
  const error = failure(
    payload({
      relations: [{ source: domain, target: ip }],
      attributes: [{ entity: ip, name: "n", value: 3 }],
    }),
  );
  assert.ok(error instanceof InvalidImportBatchError);
  assert.equal(error.path, "attributes[0].value");
});

test("rejects relations or attributes that are not lists", () => {
  assert.ok(failure(payload({ relations: {} })) instanceof InvalidImportBatchError);
  assert.ok(failure(payload({ attributes: "x" })) instanceof InvalidImportBatchError);
});

test("the parsed batch cannot be mutated", () => {
  const batch = parseImportBatch(payload());
  assert.ok(Object.isFrozen(batch));
  assert.ok(Object.isFrozen(batch.relations));
  assert.ok(Object.isFrozen(batch.attributes));
});

// Two tools describing the same entity: attributes from both are kept side by side.
test("different tools can describe the same entity in separate batches", () => {
  const first = parseImportBatch(
    payload({ attributes: [{ entity: ip, name: "banner", value: "nginx" }] }),
  );
  const second = parseImportBatch({
    source: { tool: "other-tool", run: "r9" },
    attributes: [{ entity: ip, name: "banner", value: "Apache" }],
  });
  assert.equal(first.attributes[0]?.provenance.tool, "spiderfoot");
  assert.equal(second.attributes[0]?.provenance.tool, "other-tool");
});
