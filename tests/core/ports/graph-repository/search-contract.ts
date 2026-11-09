import { test } from "node:test";
import assert from "node:assert/strict";
import { createAttribute } from "../../../../src/core/domain/attribute/index.ts";
import { createEntity, type Entity } from "../../../../src/core/domain/entity/index.ts";
import { createProvenance } from "../../../../src/core/domain/provenance/index.ts";
import {
  InvalidSearchError,
  type EntitySearchPage,
  type GraphRepository,
} from "../../../../src/core/ports/graph-repository/index.ts";
import type { GraphRepositoryContractOptions } from "./graph-repository-contract.ts";

// What every `GraphRepository` must answer for `searchEntities`, whatever keeps the graph. Same options and
// same way of use as `testGraphRepositoryContract`; a suite of its own so a repository can start running it
// when it implements the question. A search reads the WHOLE graph, so every text searched for here contains
// `TOKEN`, which no other data has: the results are then only what the suite wrote, also in a database that
// holds other data.
const HOST = "CONTRACTTEST_HOST";
const EMAIL = "CONTRACTTEST_EMAIL";
const TOKEN = "zqxneedle";

export function testSearchContract(options: GraphRepositoryContractOptions): void {
  const { name, skip, valuePrefix, tool, createRepository } = options;

  function entity(type: string, value: string): Entity {
    return createEntity(type, `${valuePrefix}${value}`);
  }

  function attribute(owner: Entity, attributeName: string, values: string[], qualifier?: string) {
    return createAttribute({
      entity: owner,
      name: attributeName,
      values,
      ...(qualifier !== undefined && { qualifier }),
      provenance: createProvenance({ tool, run: "run-1" }),
    });
  }

  async function repositoryWith(
    entities: Entity[],
    attributes: ReturnType<typeof attribute>[] = [],
  ): Promise<GraphRepository> {
    const repository = await createRepository();
    await repository.save({
      relations: [],
      attributes: [...entities.map((owner) => attribute(owner, "present", ["x"])), ...attributes],
    });
    return repository;
  }

  function who(page: EntitySearchPage): string[] {
    return page.results.map(
      ({ entity: found }) => `${found.type}:${found.value.slice(valuePrefix.length)}`,
    );
  }

  test(`${name}: it finds an entity by its value, ignoring case`, { skip }, async () => {
    const host = entity(HOST, `a-${TOKEN}.test`);
    const repository = await repositoryWith([host]);

    const page = await repository.searchEntities(TOKEN.toUpperCase());

    assert.deepEqual(who(page), [`${HOST}:a-${TOKEN}.test`]);
    assert.equal(page.results[0]?.matches[0]?.where, "entity-value");
    assert.equal(page.results[0]?.matches[0]?.snippet, host.value);
    assert.equal(page.truncated, false);
  });

  test(`${name}: the text is literal, a dot is a dot`, { skip }, async () => {
    const repository = await repositoryWith([
      entity(HOST, `1-${TOKEN}.x`),
      entity(HOST, `2-${TOKEN}Zx`),
    ]);

    const page = await repository.searchEntities(`${TOKEN}.x`);

    assert.deepEqual(who(page), [`${HOST}:1-${TOKEN}.x`]);
  });

  test(`${name}: it ignores the case of letters with accents too`, { skip }, async () => {
    const repository = await repositoryWith([entity(HOST, `café-${TOKEN}`)]);

    const page = await repository.searchEntities(`CAFÉ-${TOKEN}`);

    assert.deepEqual(who(page), [`${HOST}:café-${TOKEN}`]);
  });

  test(`${name}: by default it ignores accents too, in both directions`, { skip }, async () => {
    const repository = await repositoryWith([
      entity(HOST, `1-café-${TOKEN}`),
      entity(HOST, `2-CAFE-${TOKEN}`),
      entity(HOST, `3-chá-${TOKEN}`),
    ]);

    const withAccent = await repository.searchEntities(`café-${TOKEN}`);
    const withoutAccent = await repository.searchEntities(`CAFE-${TOKEN}`);

    const both = [`${HOST}:1-café-${TOKEN}`, `${HOST}:2-CAFE-${TOKEN}`];
    assert.deepEqual(who(withAccent), both);
    assert.deepEqual(who(withoutAccent), both);
  });

  test(`${name}: match "contains" respects case and accents`, { skip }, async () => {
    const repository = await repositoryWith([
      entity(HOST, `1-café-${TOKEN}`),
      entity(HOST, `2-CAFÉ-${TOKEN}`),
      entity(HOST, `3-cafe-${TOKEN}`),
      entity(HOST, `4-um café-${TOKEN} bom`),
    ]);

    const page = await repository.searchEntities(`café-${TOKEN}`, { match: "contains" });

    assert.deepEqual(who(page), [`${HOST}:1-café-${TOKEN}`, `${HOST}:4-um café-${TOKEN} bom`]);
  });

  test(`${name}: match "exact" finds only the value that is the text`, { skip }, async () => {
    const repository = await repositoryWith([
      entity(HOST, `${TOKEN}`),
      entity(HOST, `${TOKEN}-more`),
      entity(HOST, `${TOKEN.toUpperCase()}`),
    ]);

    const page = await repository.searchEntities(`${valuePrefix}${TOKEN}`, { match: "exact" });

    assert.deepEqual(who(page), [`${HOST}:${TOKEN}`]);
    assert.equal(page.match, "exact");
  });

  test(
    `${name}: the match mode also applies to the values of the attributes`,
    { skip },
    async () => {
      const owner = entity(HOST, `owner-${TOKEN}`);
      const repository = await repositoryWith(
        [owner],
        [attribute(owner, "note", [`Café ${TOKEN}`])],
      );

      const loose = await repository.searchEntities(`cafe ${TOKEN}`, { scope: "full" });
      const strict = await repository.searchEntities(`cafe ${TOKEN}`, { match: "contains" });

      assert.equal(
        loose.results[0]?.matches.some(({ where }) => where === "attribute"),
        true,
      );
      assert.deepEqual(who(strict), []);
    },
  );

  test(
    `${name}: a text written with a combining accent finds the same as the accented letter`,
    { skip },
    async () => {
      const repository = await repositoryWith([entity(HOST, `café-${TOKEN}`)]);

      const page = await repository.searchEntities(`café-${TOKEN}`);

      assert.deepEqual(who(page), [`${HOST}:café-${TOKEN}`]);
    },
  );

  test(
    `${name}: with the scope full it finds the values of the attributes and shows the first that matches`,
    { skip },
    async () => {
      const owner = entity(HOST, "plain-owner");
      const repository = await repositoryWith(
        [owner],
        [
          attribute(
            owner,
            "banner",
            ["foo", `has ${TOKEN} inside`, `other ${TOKEN}`],
            "sfp_banner",
          ),
        ],
      );

      const page = await repository.searchEntities(TOKEN);

      assert.deepEqual(who(page), [`${HOST}:plain-owner`]);
      assert.deepEqual(page.results[0]?.matches, [
        {
          where: "attribute",
          name: "banner",
          qualifier: "sfp_banner",
          snippet: `has ${TOKEN} inside`,
        },
      ]);
    },
  );

  test(
    `${name}: with the scope entity-value it does not look at the attributes`,
    { skip },
    async () => {
      const owner = entity(HOST, "plain-owner");
      const repository = await repositoryWith([owner], [attribute(owner, "banner", [TOKEN])]);

      const page = await repository.searchEntities(TOKEN, { scope: "entity-value" });

      assert.deepEqual(page.results, []);
      assert.equal(page.truncated, false);
    },
  );

  test(
    `${name}: an entity that matches in several places is one result, its value first`,
    { skip },
    async () => {
      const owner = entity(HOST, `both-${TOKEN}`);
      const repository = await repositoryWith(
        [owner],
        [
          attribute(owner, "b-note", [TOKEN], "q2"),
          attribute(owner, "b-note", [TOKEN], "q1"),
          attribute(owner, "a-note", [TOKEN]),
        ],
      );

      const page = await repository.searchEntities(TOKEN);

      assert.equal(page.results.length, 1);
      assert.deepEqual(
        page.results[0]?.matches.map(
          (match) => `${match.where}/${match.name ?? "-"}/${match.qualifier ?? "-"}`,
        ),
        ["entity-value/-/-", "attribute/a-note/-", "attribute/b-note/q1", "attribute/b-note/q2"],
      );
    },
  );

  test(
    `${name}: values that match come first, then attributes only, each by value and then by type`,
    { skip },
    async () => {
      const attributeOnly = entity(HOST, "0-plain");
      const repository = await repositoryWith(
        [
          entity(HOST, `b-${TOKEN}`),
          entity(EMAIL, `a-${TOKEN}`),
          entity(HOST, `a-${TOKEN}`),
          attributeOnly,
        ],
        [attribute(attributeOnly, "note", [TOKEN])],
      );

      const page = await repository.searchEntities(TOKEN);

      assert.deepEqual(who(page), [
        `${EMAIL}:a-${TOKEN}`,
        `${HOST}:a-${TOKEN}`,
        `${HOST}:b-${TOKEN}`,
        `${HOST}:0-plain`,
      ]);
    },
  );

  test(
    `${name}: the matches of an entity are cut at maxMatches and the rest is counted`,
    { skip },
    async () => {
      const owner = entity(HOST, "many-matches");
      const repository = await repositoryWith(
        [owner],
        ["a", "b", "c", "d", "e"].map((attributeName) => attribute(owner, attributeName, [TOKEN])),
      );

      const cut = await repository.searchEntities(TOKEN, { maxMatches: 3 });
      const whole = await repository.searchEntities(TOKEN);

      assert.deepEqual(
        cut.results[0]?.matches.map((match) => match.name),
        ["a", "b", "c"],
      );
      assert.equal(cut.results[0]?.moreMatches, 2);
      assert.equal(whole.results[0]?.matches.length, 5);
      assert.equal("moreMatches" in (whole.results[0] ?? {}), false);
    },
  );

  test(`${name}: the snippet is cut around the text, to the length asked`, { skip }, async () => {
    const owner = entity(HOST, "long-value");
    const repository = await repositoryWith(
      [owner],
      [attribute(owner, "note", [`${"x".repeat(50)}${TOKEN}${"y".repeat(50)}`])],
    );

    const page = await repository.searchEntities(TOKEN, { snippetLength: 30 });

    const snippet = page.results[0]?.matches[0]?.snippet ?? "";
    assert.equal(snippet, `…${"x".repeat(10)}${TOKEN}${"y".repeat(11)}…`);
  });

  test(
    `${name}: the results come in pages that cover everything once and say where the next starts`,
    { skip },
    async () => {
      const repository = await repositoryWith(
        ["e", "c", "a", "d", "b"].map((letter) => entity(HOST, `${letter}-${TOKEN}`)),
      );

      const first = await repository.searchEntities(TOKEN, { limit: 2 });
      const second = await repository.searchEntities(TOKEN, { limit: 2, offset: 2 });
      const third = await repository.searchEntities(TOKEN, { limit: 2, offset: 4 });

      assert.deepEqual(
        [first, second, third].flatMap(who),
        ["a", "b", "c", "d", "e"].map((letter) => `${HOST}:${letter}-${TOKEN}`),
      );
      assert.deepEqual(
        [first, second, third].map((page) => [page.truncated, page.nextOffset]),
        [
          [true, 2],
          [true, 4],
          [false, undefined],
        ],
      );
    },
  );

  test(
    `${name}: an offset past the end is refused, but nothing found is an empty page`,
    { skip },
    async () => {
      const repository = await repositoryWith([entity(HOST, `only-${TOKEN}`)]);

      await assert.rejects(repository.searchEntities(TOKEN, { offset: 1 }), InvalidSearchError);
      await assert.rejects(repository.searchEntities(TOKEN, { offset: 50 }), InvalidSearchError);

      const nothing = await repository.searchEntities(`${TOKEN}-nothing-has-this`);
      assert.deepEqual(nothing.results, []);
      assert.equal(nothing.truncated, false);
    },
  );

  test(`${name}: it repeats what was asked, with the defaults filled in`, { skip }, async () => {
    const repository = await repositoryWith([entity(HOST, `x-${TOKEN}`)]);

    const page = await repository.searchEntities(`  ${TOKEN}  `);

    assert.deepEqual(
      [page.text, page.scope, page.limit, page.offset, page.maxMatches, page.snippetLength],
      [TOKEN, "full", 50, 0, 100, 200],
    );
  });

  test(`${name}: a text of one character is valid`, { skip }, async () => {
    const repository = await createRepository();

    // The results of a one-character text are whatever the database holds: only that it is accepted is checked.
    const page = await repository.searchEntities("a", { scope: "entity-value", limit: 1 });

    assert.ok(page.results.length <= 1);
  });

  test(`${name}: it can be asked with a time limit of its own`, { skip }, async () => {
    const repository = await repositoryWith([entity(HOST, `x-${TOKEN}`)]);

    const page = await repository.searchEntities(TOKEN, { timeoutMs: 5000 });

    assert.equal(page.results.length, 1);
  });

  for (const [description, text, invalid] of [
    ["an empty text", "", {}],
    ["a text of spaces", "   ", {}],
    ["an unknown scope", TOKEN, { scope: "everything" as never }],
    ["a limit of 0", TOKEN, { limit: 0 }],
    ["an offset of -1", TOKEN, { offset: -1 }],
    ["a maxMatches of 0", TOKEN, { maxMatches: 0 }],
    ["a snippetLength of 0", TOKEN, { snippetLength: 0 }],
  ] as const) {
    test(`${name}: it refuses ${description}`, { skip }, async () => {
      const repository = await createRepository();

      await assert.rejects(repository.searchEntities(text, invalid), InvalidSearchError);
    });
  }
}
