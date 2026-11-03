import { test } from "node:test";
import assert from "node:assert/strict";
import { importPayloadSchema } from "../../../../src/adapters/http/imports/import-payload-schema.ts";
import { importPayloadToDomain } from "../../../../src/adapters/http/imports/import-payload-to-domain.ts";
import { InvalidImportItemError } from "../../../../src/adapters/http/imports/invalid-import-item-error.ts";
import { InvalidProvenanceError } from "../../../../src/core/domain/provenance/index.ts";

const address = { type: "IP_ADDRESS", value: "93.184.216.34" };
const RECEIVED_AT = 1000;

function convert(body: object) {
  return importPayloadToDomain(importPayloadSchema.parse(body), RECEIVED_AT);
}

function failureOf(body: object): unknown {
  try {
    convert(body);
  } catch (error) {
    return error;
  }
  throw new Error("the payload was expected to be rejected");
}

const source = { tool: "spiderfoot", run: "scan-1" };

test("builds the domain objects of a valid payload", () => {
  const { relations, attributes } = convert({
    source,
    relations: [{ source: address, target: { type: "DOMAIN_NAME", value: "example.com" } }],
    attributes: [{ entity: address, name: "BANNER", values: ["nginx"] }],
  });

  assert.equal(relations.length, 1);
  assert.equal(attributes.length, 1);
  assert.equal(attributes[0]?.provenance.recordedAt, RECEIVED_AT);
});

test("says which attribute the domain rejected, counting from zero", () => {
  const error = failureOf({
    source,
    attributes: [
      { entity: address, name: "a", values: ["x"] },
      { entity: address, name: "b", values: [" "] },
    ],
  });

  assert.ok(error instanceof InvalidImportItemError);
  assert.equal(error.path, "attributes.1");
  assert.match(error.message, /a value must not be blank/);
});

test("says which relation the domain rejected", () => {
  const error = failureOf({
    source,
    relations: [
      { source: address, target: { type: "DOMAIN_NAME", value: "example.com" } },
      { source: address, target: { type: "DOMAIN_NAME", value: "  " } },
    ],
  });

  assert.ok(error instanceof InvalidImportItemError);
  assert.equal(error.path, "relations.1");
});

test("keeps the domain error that caused it", () => {
  const error = failureOf({
    source,
    attributes: [{ entity: address, name: "a", values: ["x"], provenance: { confidence: 101 } }],
  });

  assert.ok(error instanceof InvalidImportItemError);
  assert.ok(error.cause instanceof InvalidProvenanceError);
});

test("reports the first bad item when there are several", () => {
  const error = failureOf({
    source,
    relations: [{ source: address, target: { type: "DOMAIN_NAME", value: "  " } }],
    attributes: [{ entity: address, name: " ", values: ["x"] }],
  });

  assert.ok(error instanceof InvalidImportItemError);
  assert.equal(error.path, "relations.0");
});

test("an error about the batch source is not about an item", () => {
  const error = failureOf({ source: { tool: "t", run: " " } });

  assert.ok(error instanceof InvalidProvenanceError);
  assert.equal(error instanceof InvalidImportItemError, false);
});
