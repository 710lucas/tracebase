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

function fields(overrides: { name?: string; value?: string } = {}) {
  return {
    entity: server,
    name: "WEBSERVER_BANNER",
    value: "nginx/1.25",
    provenance: createProvenance({ tool: "spiderfoot", run: "scan1" }),
    ...overrides,
  };
}

test("creates an attribute that points to its entity", () => {
  const attribute = createAttribute(fields());
  assert.equal(attribute.entity, server);
  assert.equal(attribute.name, "WEBSERVER_BANNER");
  assert.equal(attribute.value, "nginx/1.25");
});

test("trims the name, so a stray space does not create a different attribute", () => {
  assert.equal(createAttribute(fields({ name: " WEBSERVER_BANNER " })).name, "WEBSERVER_BANNER");
});

test("rejects blank name or value", () => {
  assert.throws(() => createAttribute(fields({ name: " " })), InvalidAttributeError);
  assert.throws(() => createAttribute(fields({ value: "" })), InvalidAttributeError);
});

test("the created attribute cannot be mutated", () => {
  assert.ok(Object.isFrozen(createAttribute(fields())));
});

// The reason this concept exists: many sources can describe the same entity,
// and disagreeing values coexist instead of overwriting each other.
test("the same entity can hold attributes from several tools and runs", () => {
  const fromSpiderFoot = createAttribute(fields());
  const fromOtherTool = createAttribute({
    entity: server,
    name: "WEBSERVER_BANNER",
    value: "Apache/2.4",
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

// The "Lucas lives in Patos, then in João Pessoa" case: a new value is a new attribute.
test("a later value is added next to the earlier one, nothing is overwritten", () => {
  const person = createEntity("PERSON", "Lucas");
  const inPatos = createAttribute({
    entity: person,
    name: "lives_in",
    value: "Patos",
    provenance: createProvenance({ tool: "t", run: "r1", observedAt: 1000 }),
  });
  const inJoaoPessoa = createAttribute({
    entity: person,
    name: "lives_in",
    value: "João Pessoa",
    provenance: createProvenance({ tool: "t", run: "r2", observedAt: 2000 }),
  });
  assert.equal(inPatos.value, "Patos");
  assert.equal(inJoaoPessoa.value, "João Pessoa");
});

test("an object literal is not an Attribute for the compiler", () => {
  // @ts-expect-error a literal has no brand, so it is not an Attribute
  const loose: Attribute = { ...fields() };
  assert.equal(loose.name, "WEBSERVER_BANNER");
});
