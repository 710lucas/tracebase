import { test } from "node:test";
import assert from "node:assert/strict";
import {
  attributeLookupKey,
  toAttributeRecord,
  type AttributeRecord,
  type StoredAttributes,
} from "../../../src/adapters/memgraph/attribute-record.ts";
import { decideAttributeWrites } from "../../../src/adapters/memgraph/decide-attribute-writes.ts";
import { createAttribute } from "../../../src/core/domain/attribute/index.ts";
import { createEntity } from "../../../src/core/domain/entity/index.ts";
import { createProvenance, type ProvenanceDTO } from "../../../src/core/domain/provenance/index.ts";

const entity = createEntity("IP_ADDRESS", "93.184.216.34");

// A single text is a set of one value; a list is the whole set the tool found together.
function attributeWith(
  values: string | string[],
  provenance: Partial<ProvenanceDTO> = {},
  name = "WEBSERVER_BANNER",
) {
  return createAttribute({
    entity,
    name,
    values: typeof values === "string" ? [values] : values,
    provenance: createProvenance({ tool: "spiderfoot", run: "scan-1", ...provenance }),
  });
}

type TestAttribute = ReturnType<typeof attributeWith>;

const nothingStored: StoredAttributes = { records: new Map(), historyKeys: new Set() };

// What the database holds when `current` is the current record of its attribute and `history` are
// values already kept as nodes.
function storedWith(current: TestAttribute[], history: TestAttribute[] = []): StoredAttributes {
  return {
    records: new Map<string, AttributeRecord>(
      current.map((attribute) => [
        attributeLookupKey(attribute.entity, attribute.name),
        toAttributeRecord(attribute),
      ]),
    ),
    historyKeys: new Set(history.map((attribute) => toAttributeRecord(attribute).key)),
  };
}

function write(attribute: TestAttribute, record = toAttributeRecord(attribute)) {
  return { entity, name: attribute.name, record };
}

test("writes nothing when there are no attributes", () => {
  assert.deepEqual(decideAttributeWrites([], nothingStored), { current: [], history: [] });
});

test("an attribute with no current record becomes the current record", () => {
  const attribute = attributeWith("nginx", { module: "sfp_portscan_tcp", observedAt: 1000 });

  assert.deepEqual(decideAttributeWrites([attribute], nothingStored), {
    current: [write(attribute)],
    history: [],
  });
});

test("each attribute name has its own current record", () => {
  const { current } = decideAttributeWrites(
    [attributeWith("nginx"), attributeWith("Linux", {}, "OS")],
    nothingStored,
  );

  assert.deepEqual(current.map((item) => item.name).toSorted(), ["OS", "WEBSERVER_BANNER"]);
});

test("the same import sent again changes nothing", () => {
  const attribute = attributeWith("nginx", { observedAt: 1000 });

  assert.deepEqual(decideAttributeWrites([attribute], storedWith([attribute])), {
    current: [],
    history: [],
  });
});

test("the same value seen again by another run only moves updatedAt to the later date", () => {
  const first = attributeWith("nginx", { run: "scan-1", observedAt: 1000 });
  const again = attributeWith("nginx", { run: "scan-2", observedAt: 5000 });

  assert.deepEqual(decideAttributeWrites([again], storedWith([first])), {
    current: [write(first, { ...toAttributeRecord(first), updatedAt: 5000 })],
    history: [],
  });
});

test("a repeat that is not later than the latest date changes nothing", () => {
  const first = attributeWith("nginx", { run: "scan-1", observedAt: 5000 });
  const earlier = attributeWith("nginx", { run: "scan-2", observedAt: 1000 });

  assert.deepEqual(decideAttributeWrites([earlier], storedWith([first])), {
    current: [],
    history: [],
  });
});

test("a repeat is compared with updatedAt when the record already has one", () => {
  const stored: StoredAttributes = {
    records: new Map([
      [
        attributeLookupKey(entity, "WEBSERVER_BANNER"),
        {
          ...toAttributeRecord(attributeWith("nginx", { run: "scan-1", observedAt: 1000 })),
          updatedAt: 9000,
        },
      ],
    ]),
    historyKeys: new Set(),
  };
  const again = attributeWith("nginx", { run: "scan-3", observedAt: 5000 });

  assert.deepEqual(decideAttributeWrites([again], stored), { current: [], history: [] });
});

test("recordedAt stands in for observedAt when the tool sent none", () => {
  const first = attributeWith("nginx", { run: "scan-1", recordedAt: 1000 });
  const again = attributeWith("nginx", { run: "scan-2", recordedAt: 4000 });

  const { current } = decideAttributeWrites([again], storedWith([first]));

  assert.equal(current[0]?.record.updatedAt, 4000);
});

test("a later observation of the same value in the same batch moves updatedAt", () => {
  const first = attributeWith("nginx", { run: "scan-1", observedAt: 1000 });
  const later = attributeWith("nginx", { run: "scan-2", observedAt: 5000 });

  assert.deepEqual(decideAttributeWrites([first, later], nothingStored), {
    current: [write(first, { ...toAttributeRecord(first), updatedAt: 5000 })],
    history: [],
  });
});

test("an earlier observation of the same value in the same batch changes nothing", () => {
  const later = attributeWith("nginx", { run: "scan-2", observedAt: 5000 });
  const earlier = attributeWith("nginx", { run: "scan-1", observedAt: 1000 });

  assert.deepEqual(decideAttributeWrites([later, earlier], nothingStored), {
    current: [write(later)],
    history: [],
  });
});

test("the same observation twice in one batch is written once", () => {
  const attribute = attributeWith("nginx", { observedAt: 1000 });

  assert.deepEqual(decideAttributeWrites([attribute, attribute], nothingStored), {
    current: [write(attribute)],
    history: [],
  });
});

test("a newer different value becomes current and the old current record is kept as a node", () => {
  const old = attributeWith("nginx", { run: "scan-1", observedAt: 1000 });
  const newer = attributeWith("apache", { run: "scan-2", observedAt: 5000 });

  assert.deepEqual(decideAttributeWrites([newer], storedWith([old])), {
    current: [write(newer)],
    history: [write(old)],
  });
});

test("the old record keeps its updatedAt when it is kept as a node", () => {
  const old = attributeWith("nginx", { run: "scan-1", observedAt: 1000 });
  const oldSeenAgain = { ...toAttributeRecord(old), updatedAt: 3000 };
  const stored: StoredAttributes = {
    records: new Map([[attributeLookupKey(entity, "WEBSERVER_BANNER"), oldSeenAgain]]),
    historyKeys: new Set(),
  };

  const { history } = decideAttributeWrites(
    [attributeWith("apache", { run: "scan-2", observedAt: 5000 })],
    stored,
  );

  assert.deepEqual(history, [write(old, oldSeenAgain)]);
});

test("a different value not newer than the current one is kept as a node and current stays", () => {
  const current = attributeWith("nginx", { run: "scan-2", observedAt: 5000 });
  const late = attributeWith("apache", { run: "scan-1", observedAt: 1000 });

  assert.deepEqual(decideAttributeWrites([late], storedWith([current])), {
    current: [],
    history: [write(late)],
  });
});

test("a different value with the same date as the current one is not newer", () => {
  const current = attributeWith("nginx", { run: "scan-1", observedAt: 5000 });
  const sameDate = attributeWith("apache", { run: "scan-2", observedAt: 5000 });

  assert.deepEqual(decideAttributeWrites([sameDate], storedWith([current])), {
    current: [],
    history: [write(sameDate)],
  });
});

test("a value already kept as a node, sent again, changes nothing", () => {
  const current = attributeWith("apache", { run: "scan-2", observedAt: 5000 });
  const kept = attributeWith("nginx", { run: "scan-1", observedAt: 1000 });

  assert.deepEqual(decideAttributeWrites([kept], storedWith([current], [kept])), {
    current: [],
    history: [],
  });
});

test("a value that comes back later is a new current record, and the old node stays", () => {
  const nginxAgain = attributeWith("nginx", { run: "scan-3", observedAt: 9000 });
  const current = attributeWith("apache", { run: "scan-2", observedAt: 5000 });
  const kept = attributeWith("nginx", { run: "scan-1", observedAt: 1000 });

  assert.deepEqual(decideAttributeWrites([nginxAgain], storedWith([current], [kept])), {
    current: [write(nginxAgain)],
    history: [write(current)],
  });
});

test("different values in one batch end with the newest as current and the rest as nodes", () => {
  const first = attributeWith("nginx", { observedAt: 1000 });
  const second = attributeWith("apache", { observedAt: 2000 });
  const third = attributeWith("caddy", { observedAt: 3000 });

  assert.deepEqual(decideAttributeWrites([first, second, third], nothingStored), {
    current: [write(third)],
    history: [write(first), write(second)],
  });
});

test("different values in one batch, newest first, give the same current record", () => {
  const first = attributeWith("nginx", { observedAt: 1000 });
  const second = attributeWith("apache", { observedAt: 2000 });
  const third = attributeWith("caddy", { observedAt: 3000 });

  assert.deepEqual(decideAttributeWrites([third, second, first], nothingStored), {
    current: [write(third)],
    history: [write(second), write(first)],
  });
});

// The cases below are the reason attributes are sets: values found together are one observation.
const HEADERS = ["x-runtime: 0.2", "x-cache: Miss", "x-request-queueing: 0"];

test("several values found together are one record: nothing goes to the history", () => {
  const observation = attributeWith(HEADERS, { observedAt: 1000 }, "WEBSERVER_STRANGEHEADER");

  assert.deepEqual(decideAttributeWrites([observation], nothingStored), {
    current: [write(observation)],
    history: [],
  });
});

test("the same set seen by another run, whatever the order, only moves updatedAt", () => {
  const first = attributeWith(HEADERS, { run: "scan-1", observedAt: 1000 });
  const again = attributeWith([...HEADERS].reverse(), { run: "scan-2", observedAt: 5000 });

  assert.deepEqual(decideAttributeWrites([again], storedWith([first])), {
    current: [write(first, { ...toAttributeRecord(first), updatedAt: 5000 })],
    history: [],
  });
});

test("a newer set with fewer values replaces the old set, which is kept as one node", () => {
  const old = attributeWith(HEADERS, { run: "scan-1", observedAt: 1000 });
  const newer = attributeWith(HEADERS.slice(0, 2), { run: "scan-2", observedAt: 5000 });

  assert.deepEqual(decideAttributeWrites([newer], storedWith([old])), {
    current: [write(newer)],
    history: [write(old)],
  });
});

test("a set that only differs by one value is another set", () => {
  const old = attributeWith(["a", "b"], { run: "scan-1", observedAt: 1000 });
  const newer = attributeWith(["a", "b", "c"], { run: "scan-2", observedAt: 5000 });

  assert.deepEqual(decideAttributeWrites([newer], storedWith([old])), {
    current: [write(newer)],
    history: [write(old)],
  });
});
