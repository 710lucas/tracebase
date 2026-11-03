import { test } from "node:test";
import assert from "node:assert/strict";
import { createRunSummaries } from "../../../../src/core/ports/graph-repository/index.ts";

const scan1 = { tool: "spiderfoot", run: "scan-1" };
const scan2 = { tool: "spiderfoot", run: "scan-2" };

test("lists nothing when nothing was added", () => {
  assert.deepEqual(createRunSummaries().toList(), []);
});

test("a run is created the first time something carries it, and counts add up", () => {
  const runs = createRunSummaries();

  runs.add(scan1, "relations", 1, 1000);
  runs.add(scan1, "relations", 4, 1000);
  runs.add(scan1, "attributes", 2, 1000);

  assert.deepEqual(runs.toList(), [
    { tool: "spiderfoot", run: "scan-1", relations: 5, attributes: 2, receivedAt: 1000 },
  ]);
});

test("a run with no date has no receivedAt, and the key is left out", () => {
  const runs = createRunSummaries();

  runs.add(scan1, "relations", 1);

  assert.deepEqual(runs.toList(), [
    { tool: "spiderfoot", run: "scan-1", relations: 1, attributes: 0 },
  ]);
});

test("keeps the earliest reception date of a run, whatever the order they arrive in", () => {
  const runs = createRunSummaries();

  runs.add(scan1, "relations", 1, 9000);
  runs.add(scan1, "attributes", 1, 2000);
  runs.add(scan1, "relations", 1);
  runs.add(scan1, "relations", 1, 5000);

  assert.equal(runs.toList()[0]?.receivedAt, 2000);
});

test("two runs of the same tool, or the same run of two tools, are different runs", () => {
  const runs = createRunSummaries();

  runs.add(scan1, "relations", 1, 1000);
  runs.add(scan2, "relations", 1, 1000);
  runs.add({ tool: "other-tool", run: "scan-1" }, "relations", 1, 1000);

  assert.equal(runs.toList().length, 3);
});

test("the most recently received comes first and the undated one last", () => {
  const runs = createRunSummaries();

  runs.add({ tool: "other-tool", run: "run-x" }, "attributes", 1);
  runs.add(scan1, "relations", 1, 2000);
  runs.add(scan2, "relations", 1, 3000);

  assert.deepEqual(
    runs.toList().map((run) => run.run),
    ["scan-2", "scan-1", "run-x"],
  );
});

test("runs with the same date are ordered by tool and then by run", () => {
  const runs = createRunSummaries();

  runs.add({ tool: "b", run: "1" }, "relations", 1, 1000);
  runs.add({ tool: "a", run: "2" }, "relations", 1, 1000);
  runs.add({ tool: "a", run: "1" }, "relations", 1, 1000);

  assert.deepEqual(
    runs.toList().map((run) => `${run.tool}/${run.run}`),
    ["a/1", "a/2", "b/1"],
  );
});
