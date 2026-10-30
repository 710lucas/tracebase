import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAttributeWrites } from "../../../src/adapters/memgraph/build-attribute-writes.ts";
import { createEntity } from "../../../src/core/domain/entity/index.ts";

test("writes nothing when no record changes", () => {
  assert.deepEqual(buildAttributeWrites([]), []);
});

test("sets each record in the attributes map of its entity, without the fields the tool did not send", () => {
  const entity = createEntity("IP_ADDRESS", "93.184.216.34");

  const statements = buildAttributeWrites([
    {
      entity,
      name: "WEBSERVER_BANNER",
      record: { value: "nginx", tool: "spiderfoot", run: "scan-1", module: undefined, key: "k1" },
    },
  ]);

  assert.deepEqual(statements, [
    {
      query:
        "UNWIND $rows AS row " +
        "MATCH (n:Entity {type: row.entityType, value: row.entityValue}) " +
        "SET n.attributes = map.set_key(coalesce(n.attributes, {}), row.name, row.record)",
      parameters: {
        rows: [
          {
            entityType: "IP_ADDRESS",
            entityValue: "93.184.216.34",
            name: "WEBSERVER_BANNER",
            record: { value: "nginx", tool: "spiderfoot", run: "scan-1", key: "k1" },
          },
        ],
      },
    },
  ]);
});
