import { test } from "node:test";
import assert from "node:assert/strict";
import {
  attributeLookupKey,
  toAttributeRecord,
  type AttributeRecord,
} from "../../../src/adapters/memgraph/attribute-record.ts";
import { decideAttributeWrites } from "../../../src/adapters/memgraph/decide-attribute-writes.ts";
import { createAttribute } from "../../../src/core/domain/attribute/index.ts";
import { createEntity } from "../../../src/core/domain/entity/index.ts";
import { createProvenance, type ProvenanceDTO } from "../../../src/core/domain/provenance/index.ts";

const entity = createEntity("IP_ADDRESS", "93.184.216.34");

function attributeWith(
  value: string,
  provenance: Partial<ProvenanceDTO> = {},
  name = "WEBSERVER_BANNER",
) {
  return createAttribute({
    entity,
    name,
    value,
    provenance: createProvenance({ tool: "spiderfoot", run: "scan-1", ...provenance }),
  });
}

function currentRecords(...attributes: ReturnType<typeof attributeWith>[]) {
  return new Map<string, AttributeRecord>(
    attributes.map((attribute) => [
      attributeLookupKey(attribute.entity, attribute.name),
      toAttributeRecord(attribute),
    ]),
  );
}

test("writes nothing when there are no attributes", () => {
  assert.deepEqual(decideAttributeWrites([], new Map()), []);
});

test("an attribute with no current record becomes the current record", () => {
  const attribute = attributeWith("nginx", { module: "sfp_portscan_tcp", observedAt: 1000 });

  const writes = decideAttributeWrites([attribute], new Map());

  assert.deepEqual(writes, [
    { entity, name: "WEBSERVER_BANNER", record: toAttributeRecord(attribute) },
  ]);
});

test("each attribute name has its own current record", () => {
  const writes = decideAttributeWrites(
    [attributeWith("nginx"), attributeWith("Linux", {}, "OS")],
    new Map(),
  );

  assert.deepEqual(writes.map((write) => write.name).toSorted(), ["OS", "WEBSERVER_BANNER"]);
});

test("the same import sent again changes nothing", () => {
  const attribute = attributeWith("nginx", { observedAt: 1000 });

  assert.deepEqual(decideAttributeWrites([attribute], currentRecords(attribute)), []);
});

test("the same value seen again by another run only moves updatedAt to the later date", () => {
  const first = attributeWith("nginx", { run: "scan-1", observedAt: 1000 });
  const again = attributeWith("nginx", { run: "scan-2", observedAt: 5000 });

  const [write] = decideAttributeWrites([again], currentRecords(first));

  assert.deepEqual(write?.record, { ...toAttributeRecord(first), updatedAt: 5000 });
});

test("a repeat that is not later than the latest date changes nothing", () => {
  const first = attributeWith("nginx", { run: "scan-1", observedAt: 5000 });
  const earlier = attributeWith("nginx", { run: "scan-2", observedAt: 1000 });

  assert.deepEqual(decideAttributeWrites([earlier], currentRecords(first)), []);
});

test("a repeat is compared with updatedAt when the record already has one", () => {
  const stored: AttributeRecord = {
    ...toAttributeRecord(attributeWith("nginx", { run: "scan-1", observedAt: 1000 })),
    updatedAt: 9000,
  };
  const again = attributeWith("nginx", { run: "scan-3", observedAt: 5000 });

  assert.deepEqual(
    decideAttributeWrites(
      [again],
      new Map([[attributeLookupKey(entity, "WEBSERVER_BANNER"), stored]]),
    ),
    [],
  );
});

test("recordedAt stands in for observedAt when the tool sent none", () => {
  const first = attributeWith("nginx", { run: "scan-1", recordedAt: 1000 });
  const again = attributeWith("nginx", { run: "scan-2", recordedAt: 4000 });

  const [write] = decideAttributeWrites([again], currentRecords(first));

  assert.equal(write?.record.updatedAt, 4000);
});

test("a later observation of the same value in the same batch moves updatedAt", () => {
  const first = attributeWith("nginx", { run: "scan-1", observedAt: 1000 });
  const later = attributeWith("nginx", { run: "scan-2", observedAt: 5000 });

  const writes = decideAttributeWrites([first, later], new Map());

  assert.deepEqual(writes, [
    { entity, name: "WEBSERVER_BANNER", record: { ...toAttributeRecord(first), updatedAt: 5000 } },
  ]);
});

test("an earlier observation of the same value in the same batch changes nothing", () => {
  const later = attributeWith("nginx", { run: "scan-2", observedAt: 5000 });
  const earlier = attributeWith("nginx", { run: "scan-1", observedAt: 1000 });

  const writes = decideAttributeWrites([later, earlier], new Map());

  assert.deepEqual(writes, [
    { entity, name: "WEBSERVER_BANNER", record: toAttributeRecord(later) },
  ]);
});

test("the same observation twice in one batch is written once", () => {
  const attribute = attributeWith("nginx", { observedAt: 1000 });

  assert.equal(decideAttributeWrites([attribute, attribute], new Map()).length, 1);
});

test("a different value for an attribute that has a current record is refused", () => {
  const stored = attributeWith("nginx", { observedAt: 1000 });
  const different = attributeWith("apache", { run: "scan-2", observedAt: 5000 });

  assert.throws(
    () => decideAttributeWrites([different], currentRecords(stored)),
    /attribute "WEBSERVER_BANNER" of IP_ADDRESS 93\.184\.216\.34 already has a different value/,
  );
});

test("two different values for one attribute in the same batch are refused", () => {
  assert.throws(
    () =>
      decideAttributeWrites(
        [
          attributeWith("nginx", { observedAt: 1000 }),
          attributeWith("apache", { observedAt: 2000 }),
        ],
        new Map(),
      ),
    /already has a different value/,
  );
});
