import { test } from "node:test";
import assert from "node:assert/strict";
import { createAttribute } from "../../../../src/core/domain/attribute/index.ts";
import { createEntity, type Entity } from "../../../../src/core/domain/entity/index.ts";
import { createProvenance } from "../../../../src/core/domain/provenance/index.ts";
import { createRelation } from "../../../../src/core/domain/relation/index.ts";
import type { GraphRepository } from "../../../../src/core/ports/graph-repository/index.ts";

// What every `GraphRepository` must answer in the same way, whatever keeps the graph. Each repository
// runs this suite from its own test file, which says how to build an empty repository for one test and
// which values the suite may write (a database shared with other data needs a prefix of its own, which
// its test file cleans up).
export interface GraphRepositoryContractOptions {
  // Names the repository in the test titles, so a failure says which one broke the contract.
  readonly name: string;
  // A reason to skip the whole suite (no database running), or `false` to run it.
  readonly skip: string | false;
  // Every entity value the suite writes starts with this.
  readonly valuePrefix: string;
  // The tool named in the provenance of everything the suite writes.
  readonly tool: string;
  createRepository(): Promise<GraphRepository>;
}

const HOST = "CONTRACTTEST_HOST";
const EMAIL = "CONTRACTTEST_EMAIL";
const PERSON = "CONTRACTTEST_PERSON";

export function testGraphRepositoryContract(options: GraphRepositoryContractOptions): void {
  const { name, skip, valuePrefix, tool, createRepository } = options;

  function entity(type: string, value: string): Entity {
    return createEntity(type, `${valuePrefix}${value}`);
  }

  function relation(source: Entity, target: Entity, run = "run-1") {
    return createRelation({ source, target, provenance: createProvenance({ tool, run }) });
  }

  test(`${name}: the degree of an entity nothing mentions is null`, { skip }, async () => {
    const repository = await createRepository();

    assert.equal(await repository.getEntityDegree(entity(HOST, "nobody")), null);
  });

  test(`${name}: the degree can be asked with a time limit of its own`, { skip }, async () => {
    const repository = await createRepository();
    const source = entity(HOST, "with-limit");
    await repository.save({
      relations: [relation(source, entity(EMAIL, "with-limit"))],
      attributes: [],
    });

    const degree = await repository.getEntityDegree(source, { timeoutMs: 5000 });

    assert.equal(degree?.total, 1);
  });

  test(`${name}: an entity that only has attributes has degree zero`, { skip }, async () => {
    const repository = await createRepository();
    const host = entity(HOST, "only-attributes");
    await repository.save({
      relations: [],
      attributes: [
        createAttribute({
          entity: host,
          name: "banner",
          values: ["nginx"],
          provenance: createProvenance({ tool, run: "run-1" }),
        }),
      ],
    });

    assert.deepEqual(await repository.getEntityDegree(host), {
      entity: host,
      total: 0,
      incoming: 0,
      outgoing: 0,
      byNeighbourType: [],
    });
  });

  test(
    `${name}: the degree counts the relations in each direction and by neighbour type`,
    { skip },
    async () => {
      const repository = await createRepository();
      const center = entity(HOST, "center");
      const firstHost = entity(HOST, "first");
      const secondHost = entity(HOST, "second");
      await repository.save({
        relations: [
          relation(center, firstHost),
          relation(center, secondHost),
          relation(center, entity(EMAIL, "mail")),
          relation(entity(PERSON, "owner"), center),
          // Between two neighbours: not a relation of the center.
          relation(firstHost, secondHost),
        ],
        attributes: [],
      });

      // Biggest count first; EMAIL and PERSON tie and are ordered by type.
      assert.deepEqual(await repository.getEntityDegree(center), {
        entity: center,
        total: 4,
        incoming: 1,
        outgoing: 3,
        byNeighbourType: [
          { type: HOST, count: 2 },
          { type: EMAIL, count: 1 },
          { type: PERSON, count: 1 },
        ],
      });
    },
  );

  test(`${name}: the same link seen by two runs counts twice`, { skip }, async () => {
    const repository = await createRepository();
    const source = entity(HOST, "seen-twice");
    const target = entity(EMAIL, "seen-twice");
    await repository.save({
      relations: [relation(source, target, "run-1"), relation(source, target, "run-2")],
      attributes: [],
    });

    const degree = await repository.getEntityDegree(source);

    assert.equal(degree?.total, 2);
    assert.deepEqual(degree?.byNeighbourType, [{ type: EMAIL, count: 2 }]);
  });

  test(
    `${name}: a relation from an entity to itself counts in both directions`,
    { skip },
    async () => {
      const repository = await createRepository();
      const host = entity(HOST, "loop");
      await repository.save({ relations: [relation(host, host)], attributes: [] });

      assert.deepEqual(await repository.getEntityDegree(host), {
        entity: host,
        total: 2,
        incoming: 1,
        outgoing: 1,
        byNeighbourType: [{ type: HOST, count: 2 }],
      });
    },
  );
}
