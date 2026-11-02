import { test } from "node:test";
import assert from "node:assert/strict";
import {
  collectEntities,
  countEntityTypes,
  pageOfEntities,
  summarizeRuns,
  totalsOf,
} from "../../../src/adapters/memory/summarize-graph.ts";
import { createAttribute } from "../../../src/core/domain/attribute/index.ts";
import { createEntity } from "../../../src/core/domain/entity/index.ts";
import { createProvenance } from "../../../src/core/domain/provenance/index.ts";
import { createRelation } from "../../../src/core/domain/relation/index.ts";

const domain = createEntity("DOMAIN_NAME", "example.com");
const other = createEntity("DOMAIN_NAME", "Another.org");
const address = createEntity("IP_ADDRESS", "93.184.216.34");

const first = createProvenance({ tool: "spiderfoot", run: "scan-1", recordedAt: 2000 });
const second = createProvenance({ tool: "spiderfoot", run: "scan-2", recordedAt: 3000 });
const undated = createProvenance({ tool: "other-tool", run: "run-x" });

const relations = [
  createRelation({ source: domain, target: address, provenance: first }),
  createRelation({ source: other, target: address, provenance: second }),
];
const attributes = [
  createAttribute({ entity: address, name: "banner", values: ["nginx"], provenance: first }),
  createAttribute({ entity: address, name: "banner", values: ["apache"], provenance: undated }),
];

test("collects every entity the lists mention, once each", () => {
  const entities = collectEntities(relations, attributes);

  assert.equal(entities.length, 3);
  assert.deepEqual(collectEntities([], []), []);
});

test("summarizes the runs, the most recently received first and the undated one last", () => {
  assert.deepEqual(summarizeRuns(relations, attributes), [
    { tool: "spiderfoot", run: "scan-2", relations: 1, attributes: 0, receivedAt: 3000 },
    { tool: "spiderfoot", run: "scan-1", relations: 1, attributes: 1, receivedAt: 2000 },
    { tool: "other-tool", run: "run-x", relations: 0, attributes: 1 },
  ]);
});

test("keeps the earliest reception date of a run", () => {
  const later = createProvenance({ tool: "spiderfoot", run: "scan-1", recordedAt: 9000 });
  const lateRelation = createRelation({ source: domain, target: other, provenance: later });

  const [run] = summarizeRuns([lateRelation, ...relations], []);

  assert.equal(run?.run, "scan-2");
  assert.equal(
    summarizeRuns([lateRelation, ...relations], []).find((item) => item.run === "scan-1")
      ?.receivedAt,
    2000,
  );
});

test("orders runs with the same date by tool and run", () => {
  const sameDate = (tool: string, run: string) =>
    createRelation({
      source: domain,
      target: address,
      provenance: createProvenance({ tool, run, recordedAt: 1000 }),
    });

  const runs = summarizeRuns([sameDate("b", "1"), sameDate("a", "2"), sameDate("a", "1")], []);

  assert.deepEqual(
    runs.map((run) => `${run.tool}/${run.run}`),
    ["a/1", "a/2", "b/1"],
  );
});

test("counts entities by type, the biggest first and ties by name", () => {
  const entities = collectEntities(relations, attributes);

  assert.deepEqual(countEntityTypes(entities), [
    { type: "DOMAIN_NAME", count: 2 },
    { type: "IP_ADDRESS", count: 1 },
  ]);
});

test("pages the entities of one type ordered by value and filters ignoring case", () => {
  const entities = collectEntities(relations, attributes);

  assert.deepEqual(pageOfEntities(entities, { type: "DOMAIN_NAME", limit: 1, offset: 0 }), {
    total: 2,
    entities: [other],
  });
  assert.deepEqual(pageOfEntities(entities, { type: "DOMAIN_NAME", limit: 1, offset: 1 }), {
    total: 2,
    entities: [domain],
  });
  assert.deepEqual(
    pageOfEntities(entities, { type: "DOMAIN_NAME", search: "EXAMPLE", limit: 10, offset: 0 }),
    { total: 1, entities: [domain] },
  );
  assert.deepEqual(pageOfEntities(entities, { type: "NOPE", limit: 10, offset: 0 }), {
    total: 0,
    entities: [],
  });
});

test("totals the entities, relations and attributes", () => {
  assert.deepEqual(totalsOf(collectEntities(relations, attributes), relations, attributes), {
    entities: 3,
    relations: 2,
    attributes: 2,
  });
});
