import { test } from "node:test";
import assert from "node:assert/strict";
import { createAttribute } from "../../../../src/core/domain/attribute/index.ts";
import { createEntity, type Entity } from "../../../../src/core/domain/entity/index.ts";
import { createProvenance } from "../../../../src/core/domain/provenance/index.ts";
import { createRelation } from "../../../../src/core/domain/relation/index.ts";
import {
  InvalidMostConnectedError,
  type ConnectedEntity,
  type GraphRepository,
} from "../../../../src/core/ports/graph-repository/index.ts";
import type { GraphRepositoryContractOptions } from "./graph-repository-contract.ts";

// What every `GraphRepository` must answer for `getMostConnectedEntities`, whatever keeps the graph. Same
// options and same way of use as `testGraphRepositoryContract`. A database shared with other data has entities of
// its own that may outrank these, so the tests ask for a limit far above what the graph holds and look only at the
// entities of the suite (the ones whose value starts with `valuePrefix`), in the order they come.
const HOST = "CONTRACTTEST_HOST";
const EMAIL = "CONTRACTTEST_EMAIL";
const EVERYTHING = 1_000_000;

export function testMostConnectedContract(options: GraphRepositoryContractOptions): void {
  const { name, skip, valuePrefix, tool, createRepository } = options;

  function entity(value: string, type = HOST): Entity {
    return createEntity(type, `${valuePrefix}${value}`);
  }

  function relation(source: Entity, target: Entity, run = "run-1") {
    return createRelation({ source, target, provenance: createProvenance({ tool, run }) });
  }

  async function mostConnectedOf(repository: GraphRepository): Promise<ConnectedEntity[]> {
    const all = await repository.getMostConnectedEntities({ limit: EVERYTHING });
    return all.filter(({ entity: { value } }) => value.startsWith(valuePrefix));
  }

  function describe(connected: readonly ConnectedEntity[]): string[] {
    return connected.map(
      ({ entity: { value }, total, incoming, outgoing }) =>
        `${value.slice(valuePrefix.length)}:${total}=${incoming}in+${outgoing}out`,
    );
  }

  test(
    `${name}: the most connected come first, with the relations in and out`,
    { skip },
    async () => {
      const repository = await createRepository();
      await repository.save({
        relations: [
          relation(entity("a"), entity("b")),
          relation(entity("a"), entity("c")),
          relation(entity("c"), entity("a")),
        ],
        attributes: [],
      });

      assert.deepEqual(describe(await mostConnectedOf(repository)), [
        "a:3=1in+2out",
        "c:2=1in+1out",
        "b:1=1in+0out",
      ]);
    },
  );

  test(`${name}: the same link seen by two runs counts twice`, { skip }, async () => {
    const repository = await createRepository();
    await repository.save({
      relations: [
        relation(entity("a"), entity("b"), "run-1"),
        relation(entity("a"), entity("b"), "run-2"),
      ],
      attributes: [],
    });

    assert.deepEqual(describe(await mostConnectedOf(repository)), ["a:2=0in+2out", "b:2=2in+0out"]);
  });

  test(
    `${name}: a relation from an entity to itself counts in both directions`,
    { skip },
    async () => {
      const repository = await createRepository();
      await repository.save({ relations: [relation(entity("a"), entity("a"))], attributes: [] });

      assert.deepEqual(describe(await mostConnectedOf(repository)), ["a:2=1in+1out"]);
    },
  );

  test(
    `${name}: entities with the same number come by type and then by value`,
    { skip },
    async () => {
      const repository = await createRepository();
      await repository.save({
        relations: [
          relation(entity("z"), entity("hub")),
          relation(entity("y", EMAIL), entity("hub")),
          relation(entity("x"), entity("hub")),
        ],
        attributes: [],
      });

      assert.deepEqual(
        (await mostConnectedOf(repository)).map(({ entity: { type, value } }) => [
          type,
          value.slice(valuePrefix.length),
        ]),
        [
          [HOST, "hub"],
          [EMAIL, "y"],
          [HOST, "x"],
          [HOST, "z"],
        ],
      );
    },
  );

  test(`${name}: an entity that only has attributes is not listed`, { skip }, async () => {
    const repository = await createRepository();
    await repository.save({
      relations: [],
      attributes: [
        createAttribute({
          entity: entity("lonely"),
          name: "BANNER",
          values: ["x"],
          provenance: createProvenance({ tool, run: "run-1" }),
        }),
      ],
    });

    assert.deepEqual(await mostConnectedOf(repository), []);
  });

  test(`${name}: the limit cuts the list and defaults to 10`, { skip }, async () => {
    const repository = await createRepository();
    const hub = entity("hub");
    await repository.save({
      relations: Array.from({ length: 12 }, (_, index) => relation(entity(`n${index}`), hub)),
      attributes: [],
    });

    assert.equal((await repository.getMostConnectedEntities()).length, 10);
    const [first, ...rest] = await repository.getMostConnectedEntities({ limit: 3 });
    assert.equal(rest.length, 2);
    assert.deepEqual(first, (await repository.getMostConnectedEntities({ limit: 1 }))[0]);
  });

  test(`${name}: refuses a limit that is not a whole number from 1`, { skip }, async () => {
    const repository = await createRepository();

    for (const limit of [0, -1, 1.5, Number.NaN]) {
      await assert.rejects(
        repository.getMostConnectedEntities({ limit }),
        InvalidMostConnectedError,
        String(limit),
      );
    }
  });
}
