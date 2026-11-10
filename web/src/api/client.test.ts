import { afterEach, expect, test, vi } from "vitest";
import { ApiError, getEntities, getEntity, getMostConnected, getRuns } from "./client.ts";
import { failure, ok, stubApi } from "../test/stub-api.ts";

afterEach(() => vi.unstubAllGlobals());

test("an entity nothing mentions is null, not an error", async () => {
  stubApi({ "/graph/entities?type=A&value=B": failure(404, "entity not found") });

  expect(await getEntity("A", "B")).toBeNull();
});

test("any other failure carries the API's own message and status", async () => {
  stubApi({ "/imports": failure(500, "storage is down") });

  const error = await getRuns().catch((reason: unknown) => reason);

  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).message).toBe("storage is down");
  expect((error as ApiError).status).toBe(500);
});

test("falls back to the status when the error body is not the API's JSON", async () => {
  vi.stubGlobal("fetch", async () => new Response("<html>bad gateway</html>", { status: 502 }));

  await expect(getRuns()).rejects.toThrow("the API answered 502");
});

test("encodes the type and the search text in the request", async () => {
  const { calls } = stubApi({
    "/graph/types/ACCOUNT%20X/entities?limit=50&offset=0&search=a%26b": ok({
      total: 0,
      entities: [],
    }),
  });

  await getEntities("ACCOUNT X", { search: "a&b", limit: 50, offset: 0 });

  expect(calls).toEqual(["/graph/types/ACCOUNT%20X/entities?limit=50&offset=0&search=a%26b"]);
});

test("leaves the search out of the request when it is empty", async () => {
  const { calls } = stubApi({
    "/graph/types/A/entities?limit=10&offset=20": ok({ total: 0, entities: [] }),
  });

  await getEntities("A", { search: "", limit: 10, offset: 20 });

  expect(calls).toEqual(["/graph/types/A/entities?limit=10&offset=20"]);
});

test("asks for the most connected entities with the limit and gives the list", async () => {
  const connected = { entity: { type: "A", value: "B" }, total: 3, incoming: 1, outgoing: 2 };
  const { calls } = stubApi({ "/graph/most-connected?limit=5": ok({ entities: [connected] }) });

  expect(await getMostConnected(5)).toEqual([connected]);
  expect(calls).toEqual(["/graph/most-connected?limit=5"]);
});
