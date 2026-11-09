import { test } from "node:test";
import assert from "node:assert/strict";
import { createAttribute } from "../../../../src/core/domain/attribute/index.ts";
import { createEntity, type Entity } from "../../../../src/core/domain/entity/index.ts";
import { createProvenance } from "../../../../src/core/domain/provenance/index.ts";
import { createRelation } from "../../../../src/core/domain/relation/index.ts";
import {
  InvalidEntityQueryError,
  type EntityQuery,
  type EntityQueryAnswer,
  type EntityQueryPage,
  type GraphRepository,
} from "../../../../src/core/ports/graph-repository/index.ts";
import type { GraphRepositoryContractOptions } from "./graph-repository-contract.ts";

// What every `GraphRepository` must answer for `queryEntities`, whatever keeps the graph. Same options and same
// way of use as `testGraphRepositoryContract`; a suite of its own so a repository can start running it when it
// implements the question. A query can read the WHOLE graph, so every query here is limited by the entity types
// of this suite (`TYPE_A`, `TYPE_B`), which no other data has: the answers are then only what the suite wrote,
// also in a database that holds other data.
const TYPE_A = "CONTRACTTEST_QA";
const TYPE_B = "CONTRACTTEST_QB";
const BOTH_TYPES = [TYPE_A, TYPE_B];

export function testEntityQueryContract(options: GraphRepositoryContractOptions): void {
  const { name, skip, valuePrefix, tool, createRepository } = options;

  function entity(type: string, value: string): Entity {
    return createEntity(type, `${valuePrefix}${value}`);
  }

  function seenBy(run: string, module?: string) {
    return createProvenance({ tool, run, ...(module !== undefined && { module }) });
  }

  function attribute(
    owner: Entity,
    attributeName: string,
    values: string[],
    seen: { qualifier?: string; run?: string; module?: string } = {},
  ) {
    return createAttribute({
      entity: owner,
      name: attributeName,
      values,
      ...(seen.qualifier !== undefined && { qualifier: seen.qualifier }),
      provenance: seenBy(seen.run ?? "run-1", seen.module),
    });
  }

  async function repositoryWith(
    attributes: ReturnType<typeof attribute>[],
    relations: ReturnType<typeof createRelation>[] = [],
  ): Promise<GraphRepository> {
    const repository = await createRepository();
    await repository.save({ relations, attributes });
    return repository;
  }

  // Every entity gets a `present` attribute, so that it exists in the graph whatever else the test writes.
  function exist(...entities: Entity[]) {
    return entities.map((owner) => attribute(owner, "present", ["x"]));
  }

  function listing(answer: EntityQueryAnswer): EntityQueryPage {
    assert.equal(answer.mode, "list");
    return answer as EntityQueryPage;
  }

  function who(answer: EntityQueryAnswer): string[] {
    return listing(answer).results.map(
      ({ entity: found }) => `${found.type}:${found.value.slice(valuePrefix.length)}`,
    );
  }

  async function ask(repository: GraphRepository, query: EntityQuery) {
    return who(await repository.queryEntities({ types: BOTH_TYPES, ...query }));
  }

  test(
    `${name}: types are alternatives, and the answer is ordered by value and then by type`,
    { skip },
    async () => {
      const repository = await repositoryWith(
        exist(
          entity(TYPE_B, "b"),
          entity(TYPE_A, "b"),
          entity(TYPE_A, "a"),
          entity("OTHER_QX", "a"),
        ),
      );

      assert.deepEqual(await ask(repository, {}), [`${TYPE_A}:a`, `${TYPE_A}:b`, `${TYPE_B}:b`]);
      assert.deepEqual(await ask(repository, { types: [TYPE_B] }), [`${TYPE_B}:b`]);
    },
  );

  test(
    `${name}: a query for a type nobody has is an empty page, not an error`,
    { skip },
    async () => {
      const repository = await repositoryWith(exist(entity(TYPE_A, "a")));

      const answer = listing(await repository.queryEntities({ types: ["CONTRACTTEST_NOBODY"] }));

      assert.deepEqual(answer.results, []);
      assert.equal(answer.truncated, false);
    },
  );

  test(
    `${name}: a condition on the value follows the match mode, by default ignoring case and accents`,
    { skip },
    async () => {
      const repository = await repositoryWith(
        exist(
          entity(TYPE_A, "café"),
          entity(TYPE_A, "CAFÉ"),
          entity(TYPE_A, "cafe"),
          entity(TYPE_A, "um café bom"),
        ),
      );
      const withText = (text: string, match?: "exact" | "contains" | "insensitive") =>
        ask(repository, { value: { text, ...(match !== undefined && { match }) } });

      assert.deepEqual(await withText("cafe"), [
        `${TYPE_A}:CAFÉ`,
        `${TYPE_A}:cafe`,
        `${TYPE_A}:café`,
        `${TYPE_A}:um café bom`,
      ]);
      assert.deepEqual(await withText("café", "contains"), [
        `${TYPE_A}:café`,
        `${TYPE_A}:um café bom`,
      ]);
      assert.deepEqual(await withText(`${valuePrefix}café`, "exact"), [`${TYPE_A}:café`]);
    },
  );

  test(
    `${name}: an attribute condition with only a name asks for an attribute with that name and lists nothing`,
    { skip },
    async () => {
      const [withBanner, without] = [entity(TYPE_A, "with"), entity(TYPE_A, "without")];
      const repository = await repositoryWith([
        ...exist(without),
        attribute(withBanner, "banner", ["nginx"]),
      ]);

      const answer = listing(
        await repository.queryEntities({ types: BOTH_TYPES, attributes: [{ name: "banner" }] }),
      );

      assert.deepEqual(who(answer), [`${TYPE_A}:with`]);
      assert.deepEqual(answer.results[0]?.matches, []);
    },
  );

  test(
    `${name}: the qualifier of an attribute condition narrows the attributes`,
    { skip },
    async () => {
      const owner = entity(TYPE_A, "owner");
      const repository = await repositoryWith([
        attribute(owner, "banner", ["nginx"], { qualifier: "sfp_web" }),
      ]);

      assert.deepEqual(
        await ask(repository, { attributes: [{ name: "banner", qualifier: "sfp_web" }] }),
        [`${TYPE_A}:owner`],
      );
      assert.deepEqual(
        await ask(repository, { attributes: [{ name: "banner", qualifier: "other" }] }),
        [],
      );
    },
  );

  test(
    `${name}: an attribute condition with a text lists where it was met, with a snippet`,
    { skip },
    async () => {
      const owner = entity(TYPE_A, "owner");
      const repository = await repositoryWith([
        attribute(owner, "banner", ["apache", "has NGINX inside"], { qualifier: "sfp_web" }),
        attribute(owner, "note", ["nothing here"]),
      ]);

      const answer = listing(
        await repository.queryEntities({
          types: BOTH_TYPES,
          attributes: [{ name: "banner", text: "nginx" }],
        }),
      );

      assert.deepEqual(answer.results[0]?.matches, [
        { name: "banner", qualifier: "sfp_web", snippet: "has NGINX inside" },
      ]);
      assert.deepEqual(
        await ask(repository, { attributes: [{ name: "banner", text: "iis" }] }),
        [],
      );
    },
  );

  test(`${name}: the match mode of an attribute condition is its own`, { skip }, async () => {
    const owner = entity(TYPE_A, "owner");
    const repository = await repositoryWith([attribute(owner, "note", ["Café"])]);

    assert.deepEqual(await ask(repository, { attributes: [{ name: "note", text: "cafe" }] }), [
      `${TYPE_A}:owner`,
    ]);
    assert.deepEqual(
      await ask(repository, { attributes: [{ name: "note", text: "cafe", match: "contains" }] }),
      [],
    );
  });

  test(`${name}: every condition must hold`, { skip }, async () => {
    const [both, onlyValue, onlyAttribute] = [
      entity(TYPE_A, "target-both"),
      entity(TYPE_A, "target-only-value"),
      entity(TYPE_A, "other-only-attribute"),
    ];
    const repository = await repositoryWith([
      attribute(both, "banner", ["nginx"]),
      ...exist(onlyValue),
      attribute(onlyAttribute, "banner", ["nginx"]),
    ]);

    assert.deepEqual(
      await ask(repository, {
        value: { text: "target" },
        attributes: [{ name: "banner", text: "nginx" }],
      }),
      [`${TYPE_A}:target-both`],
    );
    assert.deepEqual(
      await ask(repository, {
        attributes: [{ name: "banner", text: "nginx" }, { name: "note" }],
      }),
      [],
    );
  });

  test(
    `${name}: a provenance filter asks for an entity seen by a tool, a module or a run`,
    { skip },
    async () => {
      const [byOne, byTwo] = [entity(TYPE_A, "by-one"), entity(TYPE_A, "by-two")];
      const repository = await repositoryWith([
        attribute(byOne, "note", ["x"], { run: "run-1", module: "module-a" }),
        attribute(byTwo, "note", ["x"], { run: "run-2", module: "module-b" }),
      ]);

      assert.deepEqual(await ask(repository, { provenance: { tool } }), [
        `${TYPE_A}:by-one`,
        `${TYPE_A}:by-two`,
      ]);
      assert.deepEqual(await ask(repository, { provenance: { run: "run-2" } }), [
        `${TYPE_A}:by-two`,
      ]);
      assert.deepEqual(await ask(repository, { provenance: { module: "module-a" } }), [
        `${TYPE_A}:by-one`,
      ]);
      assert.deepEqual(await ask(repository, { provenance: { tool: "nobody-used-this" } }), []);
    },
  );

  test(
    `${name}: the parts of a provenance filter must be those of the same observation`,
    { skip },
    async () => {
      const owner = entity(TYPE_A, "owner");
      const repository = await repositoryWith([
        attribute(owner, "first", ["x"], { run: "run-1", module: "module-a" }),
        attribute(owner, "second", ["x"], { run: "run-2", module: "module-b" }),
      ]);

      assert.deepEqual(
        await ask(repository, { provenance: { run: "run-1", module: "module-a" } }),
        [`${TYPE_A}:owner`],
      );
      // run-1 and module-b were both seen for this entity, but never together.
      assert.deepEqual(
        await ask(repository, { provenance: { run: "run-1", module: "module-b" } }),
        [],
      );
    },
  );

  test(
    `${name}: an entity seen only through a relation is found by the provenance of the relation, on either end`,
    { skip },
    async () => {
      const [source, target] = [entity(TYPE_A, "source"), entity(TYPE_B, "target")];
      const repository = await repositoryWith(
        [],
        [createRelation({ source, target, provenance: seenBy("run-r", "module-r") })],
      );

      assert.deepEqual(await ask(repository, { provenance: { run: "run-r" } }), [
        `${TYPE_A}:source`,
        `${TYPE_B}:target`,
      ]);
      assert.deepEqual(await ask(repository, { provenance: { module: "module-r" } }), [
        `${TYPE_A}:source`,
        `${TYPE_B}:target`,
      ]);
    },
  );

  test(
    `${name}: the mode count answers the total and the count by type, the biggest first`,
    { skip },
    async () => {
      const repository = await repositoryWith(
        exist(entity(TYPE_B, "1"), entity(TYPE_A, "1"), entity(TYPE_A, "2"), entity(TYPE_A, "3")),
      );

      const answer = await repository.queryEntities({
        types: BOTH_TYPES,
        mode: "count",
        limit: 1,
        offset: 99,
      });

      assert.deepEqual(answer, {
        mode: "count",
        total: 4,
        byType: [
          { type: TYPE_A, count: 3 },
          { type: TYPE_B, count: 1 },
        ],
      });
    },
  );

  test(`${name}: the mode count of a query that finds nothing is zero`, { skip }, async () => {
    const repository = await repositoryWith(exist(entity(TYPE_A, "a")));

    const answer = await repository.queryEntities({
      types: BOTH_TYPES,
      value: { text: "nothing-has-this" },
      mode: "count",
    });

    assert.deepEqual(answer, { mode: "count", total: 0, byType: [] });
  });

  test(
    `${name}: a page is cut by limit and offset, and says where the next one starts`,
    { skip },
    async () => {
      const repository = await repositoryWith(
        exist(...["a", "b", "c", "d", "e"].map((value) => entity(TYPE_A, value))),
      );
      const everything: string[] = [];
      let offset: number | undefined = 0;
      const pages: EntityQueryPage[] = [];

      while (offset !== undefined) {
        const page = listing(
          await repository.queryEntities({ types: BOTH_TYPES, limit: 2, offset }),
        );
        pages.push(page);
        everything.push(...who(page));
        offset = page.nextOffset;
      }

      assert.deepEqual(
        everything,
        ["a", "b", "c", "d", "e"].map((value) => `${TYPE_A}:${value}`),
      );
      assert.deepEqual(
        pages.map((page) => [page.offset, page.truncated]),
        [
          [0, true],
          [2, true],
          [4, false],
        ],
      );
    },
  );

  test(
    `${name}: it repeats the options it used, with the defaults filled in`,
    { skip },
    async () => {
      const repository = await repositoryWith(exist(entity(TYPE_A, "a")));

      const page = listing(await repository.queryEntities({ types: BOTH_TYPES }));

      assert.deepEqual([page.limit, page.offset, page.snippetLength], [50, 0, 200]);
    },
  );

  test(`${name}: an offset past the end of the results is an error`, { skip }, async () => {
    const repository = await repositoryWith(exist(entity(TYPE_A, "a")));

    await assert.rejects(
      repository.queryEntities({ types: BOTH_TYPES, offset: 5 }),
      (error: unknown) =>
        error instanceof InvalidEntityQueryError && /past the end/.test(error.message),
    );
  });

  test(`${name}: a query that makes no sense is refused`, { skip }, async () => {
    const repository = await repositoryWith([]);

    for (const query of [
      { types: [] },
      { value: { text: " " } },
      { limit: 0 },
      { mode: "table" as never },
    ]) {
      await assert.rejects(
        repository.queryEntities(query),
        (error: unknown) => error instanceof InvalidEntityQueryError,
      );
    }
  });

  test(
    `${name}: includeHistory changes nothing when no attribute was replaced`,
    { skip },
    async () => {
      const owner = entity(TYPE_A, "owner");
      const repository = await repositoryWith([attribute(owner, "banner", ["nginx"])]);
      const query = { attributes: [{ name: "banner", text: "nginx" }] };

      assert.deepEqual(
        await repository.queryEntities({ types: BOTH_TYPES, ...query, includeHistory: true }),
        await repository.queryEntities({ types: BOTH_TYPES, ...query }),
      );
    },
  );
}
