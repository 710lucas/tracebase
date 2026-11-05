import { test } from "node:test";
import assert from "node:assert/strict";
import { createAttribute } from "../../../../src/core/domain/attribute/index.ts";
import { createEntity, type Entity } from "../../../../src/core/domain/entity/index.ts";
import { createProvenance } from "../../../../src/core/domain/provenance/index.ts";
import { createRelation, type Relation } from "../../../../src/core/domain/relation/index.ts";
import { InvalidNeighbourhoodOptionsError } from "../../../../src/core/ports/graph-repository/index.ts";
import type { GraphRepositoryContractOptions } from "./graph-repository-contract.ts";

// What every `GraphRepository` must answer for `getEntityNeighbourhood`, whatever keeps the graph. Same
// options and same way of use as `testGraphRepositoryContract`. It is a suite of its own so a repository
// can start running it when it implements the question.
const HOST = "CONTRACTTEST_HOST";
const EMAIL = "CONTRACTTEST_EMAIL";

export function testNeighbourhoodContract(options: GraphRepositoryContractOptions): void {
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

  function values(entities: readonly { entity: Entity }[]): string[] {
    return entities.map((item) => item.entity.value.slice(valuePrefix.length));
  }

  // a - b - c - d - e, with the relations pointing in different directions on purpose.
  async function chain() {
    const repository = await createRepository();
    const [a, b, c, d, e] = ["a", "b", "c", "d", "e"].map((value) => entity(HOST, value)) as [
      Entity,
      Entity,
      Entity,
      Entity,
      Entity,
    ];
    await repository.save({
      relations: [relation(a, b), relation(c, b), relation(c, d), relation(e, d)],
      attributes: [],
    });
    return { repository, a, b, c, d, e };
  }

  test(`${name}: the neighbourhood of an entity nothing mentions is null`, { skip }, async () => {
    const repository = await createRepository();

    assert.equal(await repository.getEntityNeighbourhood(entity(HOST, "nobody")), null);
  });

  test(
    `${name}: an entity that only has attributes is alone in its neighbourhood`,
    { skip },
    async () => {
      const repository = await createRepository();
      const host = entity(HOST, "only-attributes");
      const banner = createAttribute({
        entity: host,
        name: "banner",
        values: ["nginx"],
        provenance: createProvenance({ tool, run: "run-1" }),
      });
      await repository.save({ relations: [], attributes: [banner] });

      const neighbourhood = await repository.getEntityNeighbourhood(host);

      assert.deepEqual(neighbourhood?.entities, [
        { entity: host, distance: 0, attributes: [banner] },
      ]);
      assert.deepEqual(neighbourhood?.relations, []);
      assert.equal(neighbourhood?.truncated, false);
    },
  );

  test(`${name}: it goes as far as the hops, ignoring the direction`, { skip }, async () => {
    const { repository, a } = await chain();

    const oneHop = await repository.getEntityNeighbourhood(a, { hops: 1 });
    const twoHops = await repository.getEntityNeighbourhood(a, { hops: 2 });

    assert.deepEqual(values(oneHop?.entities ?? []), ["a", "b"]);
    assert.deepEqual(values(twoHops?.entities ?? []), ["a", "b", "c"]);
    assert.deepEqual(
      twoHops?.entities.map((item) => item.distance),
      [0, 1, 2],
    );
    assert.deepEqual(describe(twoHops?.relations ?? []), ["a>b@run-1", "c>b@run-1"]);
  });

  test(`${name}: the default is three hops`, { skip }, async () => {
    const { repository, a } = await chain();

    const neighbourhood = await repository.getEntityNeighbourhood(a);

    assert.deepEqual(values(neighbourhood?.entities ?? []), ["a", "b", "c", "d"]);
    assert.equal(neighbourhood?.hops, 3);
    assert.equal(neighbourhood?.maxEntities, 100);
    assert.equal(neighbourhood?.truncated, false);
  });

  test(`${name}: an entity has the distance of its shortest way`, { skip }, async () => {
    const repository = await createRepository();
    const [a, b, c] = ["a", "b", "c"].map((value) => entity(HOST, value)) as [
      Entity,
      Entity,
      Entity,
    ];
    await repository.save({
      relations: [relation(a, b), relation(b, c), relation(a, c)],
      attributes: [],
    });

    const neighbourhood = await repository.getEntityNeighbourhood(a);

    assert.deepEqual(
      neighbourhood?.entities.map((item) => item.distance),
      [0, 1, 1],
    );
  });

  test(`${name}: the same link seen by two runs is two relations`, { skip }, async () => {
    const repository = await createRepository();
    const source = entity(HOST, "seen-twice");
    const target = entity(EMAIL, "seen-twice");
    await repository.save({
      relations: [relation(source, target, "run-1"), relation(source, target, "run-2")],
      attributes: [],
    });

    const neighbourhood = await repository.getEntityNeighbourhood(source);

    assert.deepEqual(describe(neighbourhood?.relations ?? []), [
      "seen-twice>seen-twice@run-1",
      "seen-twice>seen-twice@run-2",
    ]);
  });

  test(
    `${name}: it brings the current attributes of the entities it returns`,
    { skip },
    async () => {
      const { repository, a, b, d } = await chain();
      const attribute = (host: Entity) =>
        createAttribute({
          entity: host,
          name: "banner",
          values: ["nginx"],
          provenance: createProvenance({ tool, run: "run-1" }),
        });
      await repository.save({ relations: [], attributes: [attribute(b), attribute(d)] });

      const neighbourhood = await repository.getEntityNeighbourhood(a, { hops: 1 });

      assert.deepEqual(
        neighbourhood?.entities.map((item) => item.attributes.length),
        [0, 1],
      );
    },
  );

  // The origin and three neighbours at one hop: EMAIL "x", then HOST "m" and HOST "z" (by type, then value).
  async function star() {
    const repository = await createRepository();
    const center = entity(HOST, "center");
    const [x, m, z] = [entity(EMAIL, "x"), entity(HOST, "m"), entity(HOST, "z")] as [
      Entity,
      Entity,
      Entity,
    ];
    await repository.save({
      relations: [relation(center, z), relation(center, x), relation(center, m), relation(x, z)],
      attributes: [],
    });
    return { repository, center };
  }

  test(
    `${name}: when there are more entities than the maximum, the nearest are kept and it says so`,
    { skip },
    async () => {
      const { repository, center } = await star();

      const cut = await repository.getEntityNeighbourhood(center, { maxEntities: 3 });

      // The origin counts; at the same distance the type and then the value decide.
      assert.deepEqual(values(cut?.entities ?? []), ["center", "x", "m"]);
      assert.equal(cut?.truncated, true);
      // Only the relations between the entities kept; `center>z` and `x>z` touch the one left out.
      assert.deepEqual(describe(cut?.relations ?? []), ["center>m@run-1", "center>x@run-1"]);

      const whole = await repository.getEntityNeighbourhood(center, { maxEntities: 4 });

      assert.deepEqual(values(whole?.entities ?? []), ["center", "x", "m", "z"]);
      assert.equal(whole?.truncated, false);
      assert.equal(whole?.relations.length, 4);
    },
  );

  test(`${name}: a maximum of one returns only the entity itself`, { skip }, async () => {
    const { repository, center } = await star();

    const neighbourhood = await repository.getEntityNeighbourhood(center, { maxEntities: 1 });

    assert.deepEqual(values(neighbourhood?.entities ?? []), ["center"]);
    assert.equal(neighbourhood?.truncated, true);
    assert.deepEqual(neighbourhood?.relations, []);
  });

  test(`${name}: it can be asked with a time limit of its own`, { skip }, async () => {
    const { repository, a } = await chain();

    const neighbourhood = await repository.getEntityNeighbourhood(a, { timeoutMs: 5000 });

    assert.equal(neighbourhood?.entities.length, 4);
  });

  for (const invalid of [{ hops: 0 }, { hops: 1.5 }, { maxEntities: 0 }, { maxEntities: -1 }]) {
    test(`${name}: it refuses ${JSON.stringify(invalid)}`, { skip }, async () => {
      const { repository, a } = await chain();

      await assert.rejects(
        repository.getEntityNeighbourhood(a, invalid),
        InvalidNeighbourhoodOptionsError,
      );
    });
  }
}
