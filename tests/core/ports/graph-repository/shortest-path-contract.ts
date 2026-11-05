import { test } from "node:test";
import assert from "node:assert/strict";
import { createAttribute } from "../../../../src/core/domain/attribute/index.ts";
import { createEntity, type Entity } from "../../../../src/core/domain/entity/index.ts";
import { createProvenance } from "../../../../src/core/domain/provenance/index.ts";
import { createRelation, type Relation } from "../../../../src/core/domain/relation/index.ts";
import {
  InvalidShortestPathOptionsError,
  type GraphRepository,
} from "../../../../src/core/ports/graph-repository/index.ts";
import type { GraphRepositoryContractOptions } from "./graph-repository-contract.ts";

// What every `GraphRepository` must answer for `getShortestPath`, whatever keeps the graph. Same options
// and same way of use as `testGraphRepositoryContract`; a suite of its own so a repository can start
// running it when it implements the question.
const HOST = "CONTRACTTEST_HOST";

export function testShortestPathContract(options: GraphRepositoryContractOptions): void {
  const { name, skip, valuePrefix, tool, createRepository } = options;

  function entity(value: string): Entity {
    return createEntity(HOST, `${valuePrefix}${value}`);
  }

  function relation(source: Entity, target: Entity, run = "run-1") {
    return createRelation({ source, target, provenance: createProvenance({ tool, run }) });
  }

  function names(entities: readonly Entity[]): string[] {
    return entities.map(({ value }) => value.slice(valuePrefix.length));
  }

  // A relation as text without the prefix, so the order inside a step (not defined) does not matter.
  function describe(relations: readonly Relation[]): string[] {
    return relations
      .map(
        ({ source, target, provenance }) =>
          `${source.value.slice(valuePrefix.length)}>${target.value.slice(valuePrefix.length)}@${provenance.run}`,
      )
      .sort();
  }

  async function graphOf(links: [string, string][]): Promise<GraphRepository> {
    const repository = await createRepository();
    await repository.save({
      relations: links.map(([source, target]) => relation(entity(source), entity(target))),
      attributes: [],
    });
    return repository;
  }

  test(`${name}: the path of an entity that is not in the graph is null`, { skip }, async () => {
    const repository = await graphOf([["a", "b"]]);

    assert.equal(await repository.getShortestPath(entity("a"), entity("nobody")), null);
    assert.equal(await repository.getShortestPath(entity("nobody"), entity("a")), null);
    assert.equal(await repository.getShortestPath(entity("nobody"), entity("nobody-2")), null);
  });

  test(
    `${name}: a path from an entity to itself is that entity, with no step`,
    { skip },
    async () => {
      const repository = await graphOf([["a", "b"]]);

      const path = await repository.getShortestPath(entity("a"), entity("a"));

      assert.deepEqual(names(path?.entities ?? []), ["a"]);
      assert.deepEqual(path?.steps, []);
    },
  );

  test(`${name}: the direction of the relations does not matter`, { skip }, async () => {
    const repository = await graphOf([
      ["b", "a"],
      ["c", "b"],
    ]);

    const path = await repository.getShortestPath(entity("a"), entity("c"));

    assert.deepEqual(names(path?.entities ?? []), ["a", "b", "c"]);
    assert.deepEqual(
      path?.steps.map((step) => describe(step.relations)),
      [["b>a@run-1"], ["c>b@run-1"]],
    );
  });

  test(
    `${name}: a step holds every relation between its entities, each observation and each direction`,
    { skip },
    async () => {
      const repository = await createRepository();
      const a = entity("a");
      const b = entity("b");
      await repository.save({
        relations: [relation(a, b, "run-1"), relation(a, b, "run-2"), relation(b, a, "run-3")],
        attributes: [],
      });

      const path = await repository.getShortestPath(a, b);

      assert.deepEqual(describe(path?.steps[0]?.relations ?? []), [
        "a>b@run-1",
        "a>b@run-2",
        "b>a@run-3",
      ]);
    },
  );

  test(`${name}: it takes the path with the fewest relations`, { skip }, async () => {
    const repository = await graphOf([
      ["a", "b"],
      ["b", "c"],
      ["c", "d"],
      ["a", "d"],
    ]);

    const path = await repository.getShortestPath(entity("a"), entity("d"));

    assert.deepEqual(names(path?.entities ?? []), ["a", "d"]);
  });

  test(
    `${name}: among paths of the same length it always answers the first in the order`,
    { skip },
    async () => {
      // a to d through b or through c, written in two different orders.
      const links: [string, string][] = [
        ["a", "c"],
        ["c", "d"],
        ["a", "b"],
        ["b", "d"],
      ];

      const first = await (await graphOf(links)).getShortestPath(entity("a"), entity("d"));
      const second = await (
        await graphOf([...links].reverse())
      ).getShortestPath(entity("a"), entity("d"));

      assert.deepEqual(names(first?.entities ?? []), ["a", "b", "d"]);
      assert.deepEqual(names(second?.entities ?? []), ["a", "b", "d"]);
    },
  );

  test(
    `${name}: the choice is the first in the order from the source, step by step`,
    { skip },
    async () => {
      // From a there are two shortest ways to f: a-b-d-f and a-c-e-f, plus a-b-e-f; the first in the order is a-b-d-f.
      const repository = await graphOf([
        ["a", "c"],
        ["c", "e"],
        ["e", "f"],
        ["a", "b"],
        ["b", "e"],
        ["b", "d"],
        ["d", "f"],
      ]);

      const path = await repository.getShortestPath(entity("a"), entity("f"));

      assert.deepEqual(names(path?.entities ?? []), ["a", "b", "d", "f"]);
    },
  );

  test(`${name}: a path longer than maxHops is empty, not an error`, { skip }, async () => {
    const repository = await graphOf([
      ["a", "b"],
      ["b", "c"],
      ["c", "d"],
    ]);

    const tooShort = await repository.getShortestPath(entity("a"), entity("d"), { maxHops: 2 });
    const exact = await repository.getShortestPath(entity("a"), entity("d"), { maxHops: 3 });

    assert.deepEqual(tooShort?.entities, []);
    assert.deepEqual(tooShort?.steps, []);
    assert.equal(tooShort?.maxHops, 2);
    assert.deepEqual(names(exact?.entities ?? []), ["a", "b", "c", "d"]);
  });

  test(
    `${name}: entities that exist but are not connected give an empty path`,
    { skip },
    async () => {
      const repository = await createRepository();
      const lonely = entity("lonely");
      await repository.save({
        relations: [relation(entity("a"), entity("b"))],
        attributes: [
          createAttribute({
            entity: lonely,
            name: "banner",
            values: ["nginx"],
            provenance: createProvenance({ tool, run: "run-1" }),
          }),
        ],
      });

      const path = await repository.getShortestPath(entity("a"), lonely);

      assert.deepEqual(path?.entities, []);
      assert.deepEqual(path?.steps, []);
    },
  );

  test(`${name}: the default is six hops`, { skip }, async () => {
    const values = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const links = values
      .slice(1)
      .map((value, index): [string, string] => [values[index] as string, value]);
    const repository = await graphOf(links);

    const sixHops = await repository.getShortestPath(entity("a"), entity("g"));
    const sevenHops = await repository.getShortestPath(entity("a"), entity("h"));

    assert.equal(sixHops?.entities.length, 7);
    assert.equal(sixHops?.maxHops, 6);
    assert.deepEqual(sevenHops?.entities, []);
  });

  test(`${name}: it can be asked with a time limit of its own`, { skip }, async () => {
    const repository = await graphOf([["a", "b"]]);

    const path = await repository.getShortestPath(entity("a"), entity("b"), { timeoutMs: 5000 });

    assert.equal(path?.entities.length, 2);
  });

  for (const invalid of [{ maxHops: 0 }, { maxHops: 1.5 }, { maxHops: -2 }]) {
    test(`${name}: it refuses ${JSON.stringify(invalid)}`, { skip }, async () => {
      const repository = await graphOf([["a", "b"]]);

      await assert.rejects(
        repository.getShortestPath(entity("a"), entity("b"), invalid),
        InvalidShortestPathOptionsError,
      );
    });
  }
}
