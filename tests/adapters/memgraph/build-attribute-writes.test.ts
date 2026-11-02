import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAttributeWrites } from "../../../src/adapters/memgraph/build-attribute-writes.ts";
import { createEntity } from "../../../src/core/domain/entity/index.ts";

const entity = createEntity("IP_ADDRESS", "93.184.216.34");

test("writes nothing when no record changes", () => {
  assert.deepEqual(buildAttributeWrites({ current: [], history: [] }), []);
});

test("sets each current record in the attributes map of its entity, without the fields the tool did not send", () => {
  const statements = buildAttributeWrites({
    current: [
      {
        entity,
        name: "WEBSERVER_BANNER",
        record: {
          values: ["nginx"],
          tool: "spiderfoot",
          run: "scan-1",
          module: undefined,
          key: "k1",
        },
      },
    ],
    history: [],
  });

  assert.deepEqual(statements, [
    {
      query:
        "UNWIND $rows AS row " +
        "MATCH (n:Entity {type: row.entityType, value: row.entityValue}) " +
        "WITH n, row, coalesce(n.attributes, {}) AS attributes " +
        "SET n.attributes = map.set_key(attributes, row.name, " +
        "map.set_key(coalesce(attributes[row.name], {}), row.qualifier, row.record))",
      parameters: {
        rows: [
          {
            entityType: "IP_ADDRESS",
            entityValue: "93.184.216.34",
            name: "WEBSERVER_BANNER",
            qualifier: "",
            historyQualifier: null,
            record: { values: ["nginx"], tool: "spiderfoot", run: "scan-1", key: "k1" },
          },
        ],
      },
    },
  ]);
});

test("keeps each replaced value as an :Attribute node linked to its entity, found by its key", () => {
  const statements = buildAttributeWrites({
    current: [],
    history: [
      {
        entity,
        name: "WEBSERVER_BANNER",
        record: {
          values: ["nginx"],
          tool: "spiderfoot",
          run: "scan-1",
          updatedAt: 3000,
          key: "k1",
        },
      },
    ],
  });

  assert.deepEqual(statements, [
    {
      query:
        "UNWIND $rows AS row " +
        "MATCH (n:Entity {type: row.entityType, value: row.entityValue}) " +
        "MERGE (history:Attribute {key: row.record.key}) " +
        "ON CREATE SET history += row.record, history.name = row.name, " +
        "history.qualifier = row.historyQualifier " +
        "MERGE (n)-[:HAS_ATTRIBUTE]->(history)",
      parameters: {
        rows: [
          {
            entityType: "IP_ADDRESS",
            entityValue: "93.184.216.34",
            name: "WEBSERVER_BANNER",
            qualifier: "",
            historyQualifier: null,
            record: {
              values: ["nginx"],
              tool: "spiderfoot",
              run: "scan-1",
              updatedAt: 3000,
              key: "k1",
            },
          },
        ],
      },
    },
  ]);
});

test("writes the current records before the replaced values", () => {
  const record = { values: ["x"], tool: "spiderfoot", run: "scan-1", key: "k" };

  const statements = buildAttributeWrites({
    current: [{ entity, name: "a", record }],
    history: [{ entity, name: "a", record }],
  });

  assert.equal(statements.length, 2);
  assert.match(statements[0]?.query ?? "", /SET n\.attributes/);
  assert.match(statements[1]?.query ?? "", /MERGE \(history:Attribute/);
});

test("a qualifier goes in the row as the key of the record and as the property of a history node", () => {
  const record = { values: ["x"], tool: "spiderfoot", run: "scan-1", key: "k" };

  const [current, history] = buildAttributeWrites({
    current: [{ entity, name: "a", qualifier: "sfp_webserver", record }],
    history: [{ entity, name: "a", qualifier: "sfp_webserver", record }],
  });

  assert.deepEqual(current?.parameters["rows"], [
    {
      entityType: "IP_ADDRESS",
      entityValue: "93.184.216.34",
      name: "a",
      qualifier: "sfp_webserver",
      historyQualifier: "sfp_webserver",
      record,
    },
  ]);
  assert.equal(
    (history?.parameters["rows"] as { historyQualifier: string }[])[0]?.historyQualifier,
    "sfp_webserver",
  );
});
