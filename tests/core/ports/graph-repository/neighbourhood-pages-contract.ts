import { test } from "node:test";
import assert from "node:assert/strict";
import { createEntity, type Entity } from "../../../../src/core/domain/entity/index.ts";
import { createProvenance } from "../../../../src/core/domain/provenance/index.ts";
import { createRelation, type Relation } from "../../../../src/core/domain/relation/index.ts";
import {
  InvalidNeighbourhoodOptionsError,
  type EntityNeighbourhood,
  type GraphRepository,
} from "../../../../src/core/ports/graph-repository/index.ts";
import type { GraphRepositoryContractOptions } from "./graph-repository-contract.ts";

// What every `GraphRepository` must answer when a neighbourhood is read page by page (`offset`). Same
// options and same way of use as `testNeighbourhoodContract`; a suite of its own so a repository can
// start running it when it reads pages.
const HOST = "CONTRACTTEST_HOST";
const EMAIL = "CONTRACTTEST_EMAIL";

export function testNeighbourhoodPagesContract(options: GraphRepositoryContractOptions): void {
  const { name, skip, valuePrefix, tool, createRepository } = options;

  function entity(type: string, value: string): Entity {
    return createEntity(type, `${valuePrefix}${value}`);
  }

  function relation(source: Entity, target: Entity, run = "run-1") {
    return createRelation({ source, target, provenance: createProvenance({ tool, run }) });
  }

  // A relation as text without the prefix, so the order of `relations` (not defined) does not matter.
  function describe(relations: readonly Relation[]): string[] {
    return relations
      .map(
        (item) =>
          `${item.source.value.slice(valuePrefix.length)}>${item.target.value.slice(valuePrefix.length)}@${item.provenance.run}`,
      )
      .sort();
  }

  function values(neighbourhood: EntityNeighbourhood | null): string[] {
    return (neighbourhood?.entities ?? []).map(({ entity: reached }) =>
      reached.value.slice(valuePrefix.length),
    );
  }

  // The origin and three neighbours at one hop, in the order center, x (EMAIL), m, z, with a relation
  // between two neighbours and one seen by two runs.
  async function star(): Promise<{ repository: GraphRepository; center: Entity }> {
    const repository = await createRepository();
    const center = entity(HOST, "center");
    const x = entity(EMAIL, "x");
    const m = entity(HOST, "m");
    const z = entity(HOST, "z");
    await repository.save({
      relations: [
        relation(center, z),
        relation(center, x),
        relation(center, m),
        relation(center, m, "run-2"),
        relation(x, z),
      ],
      attributes: [],
    });
    return { repository, center };
  }

  async function readAllPages(repository: GraphRepository, origin: Entity, maxEntities: number) {
    const pages: EntityNeighbourhood[] = [];
    let offset: number | undefined = 0;
    while (offset !== undefined) {
      const page: EntityNeighbourhood | null = await repository.getEntityNeighbourhood(origin, {
        maxEntities,
        offset,
      });
      assert.notEqual(page, null);
      pages.push(page as EntityNeighbourhood);
      offset = page?.nextOffset;
    }
    return pages;
  }

  test(
    `${name}: the pages give every entity once, in order, and say where the next starts`,
    { skip },
    async () => {
      const { repository, center } = await star();

      const pages = await readAllPages(repository, center, 2);

      assert.deepEqual(pages.map(values), [
        ["center", "x"],
        ["m", "z"],
      ]);
      assert.deepEqual(
        pages.map((page) => [page.offset, page.truncated, page.nextOffset]),
        [
          [0, true, 2],
          [2, false, undefined],
        ],
      );
    },
  );

  test(`${name}: pages of three leave a last page with the rest`, { skip }, async () => {
    const { repository, center } = await star();

    const pages = await readAllPages(repository, center, 3);

    assert.deepEqual(pages.map(values), [["center", "x", "m"], ["z"]]);
  });

  test(`${name}: every relation comes in exactly one page`, { skip }, async () => {
    const { repository, center } = await star();

    const pages = await readAllPages(repository, center, 2);
    const whole = await repository.getEntityNeighbourhood(center, { maxEntities: 4 });

    // The first page cannot show what touches m or z; the second shows everything that touches them.
    assert.deepEqual(describe(pages[0]?.relations ?? []), ["center>x@run-1"]);
    assert.deepEqual(describe(pages[1]?.relations ?? []), [
      "center>m@run-1",
      "center>m@run-2",
      "center>z@run-1",
      "x>z@run-1",
    ]);
    assert.deepEqual(
      describe(pages.flatMap((page) => page.relations)),
      describe(whole?.relations ?? []),
    );
  });

  test(`${name}: an offset can be asked without a page size`, { skip }, async () => {
    const { repository, center } = await star();

    const neighbourhood = await repository.getEntityNeighbourhood(center, { offset: 2 });

    assert.deepEqual(values(neighbourhood), ["m", "z"]);
    assert.equal(neighbourhood?.truncated, false);
  });

  test(`${name}: an offset past the end is refused`, { skip }, async () => {
    const { repository, center } = await star();

    await assert.rejects(
      repository.getEntityNeighbourhood(center, { offset: 4 }),
      InvalidNeighbourhoodOptionsError,
    );
    await assert.rejects(
      repository.getEntityNeighbourhood(center, { offset: 100 }),
      InvalidNeighbourhoodOptionsError,
    );
  });

  for (const invalid of [{ offset: -1 }, { offset: 1.5 }]) {
    test(`${name}: it refuses ${JSON.stringify(invalid)}`, { skip }, async () => {
      const { repository, center } = await star();

      await assert.rejects(
        repository.getEntityNeighbourhood(center, invalid),
        InvalidNeighbourhoodOptionsError,
      );
    });
  }
}
