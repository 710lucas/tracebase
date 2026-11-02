import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createAttribute,
  InvalidAttributeError,
  type Attribute,
} from "../../../../src/core/domain/attribute/index.ts";
import { createEntity } from "../../../../src/core/domain/entity/index.ts";
import { createProvenance } from "../../../../src/core/domain/provenance/index.ts";

const server = createEntity("IP_ADDRESS", "93.184.216.34");

function fields(overrides: { name?: string; values?: readonly string[] } = {}) {
  return {
    entity: server,
    name: "WEBSERVER_BANNER",
    values: ["nginx/1.25"],
    provenance: createProvenance({ tool: "spiderfoot", run: "scan1" }),
    ...overrides,
  };
}

test("creates an attribute that points to its entity", () => {
  const attribute = createAttribute(fields());
  assert.equal(attribute.entity, server);
  assert.equal(attribute.name, "WEBSERVER_BANNER");
  assert.deepEqual(attribute.values, ["nginx/1.25"]);
});

test("trims the name, so a stray space does not create a different attribute", () => {
  assert.equal(createAttribute(fields({ name: " WEBSERVER_BANNER " })).name, "WEBSERVER_BANNER");
});

test("rejects a blank name, an empty list of values and a blank value", () => {
  assert.throws(() => createAttribute(fields({ name: " " })), InvalidAttributeError);
  assert.throws(() => createAttribute(fields({ values: [] })), /values must not be empty/);
  assert.throws(() => createAttribute(fields({ values: [""] })), /a value must not be blank/);
  assert.throws(
    () => createAttribute(fields({ values: ["x-runtime: 0.2", "  "] })),
    InvalidAttributeError,
  );
});

test("one attribute holds the whole set of values the tool found together", () => {
  const headers = ["x-runtime: 0.196737", "x-cache: Miss from cloudfront", "x-request-queueing: 0"];

  assert.equal(createAttribute(fields({ values: headers })).values.length, 3);
});

test("drops repeated values and sorts the rest, so the same set always has the same shape", () => {
  const first = createAttribute(fields({ values: ["b", "a", "b", "c"] }));
  const second = createAttribute(fields({ values: ["c", "a", "b"] }));

  assert.deepEqual(first.values, ["a", "b", "c"]);
  assert.deepEqual(first.values, second.values);
});

test("does not change the list it was given", () => {
  const given = ["b", "a"];

  createAttribute(fields({ values: given }));

  assert.deepEqual(given, ["b", "a"]);
});

test("the created attribute and its values cannot be mutated", () => {
  const attribute = createAttribute(fields());

  assert.ok(Object.isFrozen(attribute));
  assert.ok(Object.isFrozen(attribute.values));
});

// The reason this concept exists: many sources can describe the same entity.
test("the same entity can hold attributes from several tools and runs", () => {
  const fromSpiderFoot = createAttribute(fields());
  const fromOtherTool = createAttribute({
    entity: server,
    name: "WEBSERVER_BANNER",
    values: ["Apache/2.4"],
    provenance: createProvenance({
      tool: "other-tool",
      run: "run9",
      observedAt: 1760000000000,
    }),
  });
  const attributes = [fromSpiderFoot, fromOtherTool];
  assert.equal(attributes.length, 2);
  assert.notEqual(attributes[0]?.provenance.tool, attributes[1]?.provenance.tool);
  assert.equal(attributes[0]?.entity, attributes[1]?.entity);
});

// The "Lucas lives in Patos, then in João Pessoa" case: a later observation is another attribute.
test("a later observation is another attribute, the earlier one is not overwritten", () => {
  const person = createEntity("PERSON", "Lucas");
  const inPatos = createAttribute({
    entity: person,
    name: "lives_in",
    values: ["Patos"],
    provenance: createProvenance({ tool: "t", run: "r1", observedAt: 1000 }),
  });
  const inJoaoPessoa = createAttribute({
    entity: person,
    name: "lives_in",
    values: ["João Pessoa"],
    provenance: createProvenance({ tool: "t", run: "r2", observedAt: 2000 }),
  });
  assert.deepEqual(inPatos.values, ["Patos"]);
  assert.deepEqual(inJoaoPessoa.values, ["João Pessoa"]);
});

test("an object literal is not an Attribute for the compiler", () => {
  // @ts-expect-error a literal has no brand, so it is not an Attribute
  const loose: Attribute = { ...fields() };
  assert.equal(loose.name, "WEBSERVER_BANNER");
});
