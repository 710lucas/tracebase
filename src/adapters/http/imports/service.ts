import type { Entity } from "../../../core/domain/entity/index.ts";
import {
  createRunComparison,
  type GraphRepository,
  type QueryOptions,
  type RunComparison,
  type RunRef,
  type RunSummary,
} from "../../../core/ports/graph-repository/index.ts";
import type { ImportPayloadDTO } from "./import-payload-schema.ts";
import { importPayloadToDomain } from "./import-payload-to-domain.ts";

export interface ImportResult {
  relations: number;
  attributes: number;
}

export interface ImportsService {
  importBatch(payload: ImportPayloadDTO): Promise<ImportResult>;
  listRuns(): Promise<RunSummary[]>;
  compareRuns(
    a: RunRef,
    b: RunRef,
    options: QueryOptions & { limit: number },
  ): Promise<RunComparison | null>;
}

// Service of the imports module: carries out the import using the core and answers the controller with
// a plain result. It knows nothing about HTTP, and it knows the repository only as the
// `GraphRepository` port, so what is behind it (memory, Memgraph) can change without touching this.
//
// `importBatch`: stamps the batch with the time it was received (`recordedAt`, read once from `now`),
// builds the domain objects from the payload, saves them and says how many there were. Domain errors
// (a value the domain rejects) are not caught here; they reach the controller, which decides how to
// answer them. Nothing is saved when the payload is rejected.
//
// `listRuns`: the runs the graph holds, with how many relations and attributes each brought.
//
// `compareRuns`: the entities two runs saw, side by side (see `RunComparison`). `null` when one of the runs is not
// in the graph. The entities of a run are the ones the structured query finds for its provenance, with the sets that a
// newer one replaced included, so a run is not said to have missed what it saw and a later run changed. `timeoutMs`
// is the limit of each read of the graph (four of them).
//
// `now` is a parameter so tests can fix the time; the application uses the real clock.
export function createImportsService(
  repository: GraphRepository,
  now: () => number = Date.now,
): ImportsService {
  return {
    importBatch: async (payload) => {
      const recordedAt = now();
      const { relations, attributes } = importPayloadToDomain(payload, recordedAt);
      await repository.save({ relations, attributes });
      console.log(`import saved: ${relations.length} relations, ${attributes.length} attributes`);
      return { relations: relations.length, attributes: attributes.length };
    },

    listRuns: () => repository.listRuns(),

    compareRuns: async (a, b, { limit, ...queryOptions }) => {
      const runs = await repository.listRuns();
      const exists = (ref: RunRef) =>
        runs.some(({ tool, run }) => tool === ref.tool && run === ref.run);
      if (!exists(a) || !exists(b)) return null;

      const [entitiesOfA, entitiesOfB] = await Promise.all([
        entitiesSeenBy(repository, a, queryOptions),
        entitiesSeenBy(repository, b, queryOptions),
      ]);

      return createRunComparison(a, b, entitiesOfA, entitiesOfB, limit);
    },
  };
}

// Every entity a run mentions: first how many there are (a count), then all of them in one page of that size, so the
// answer is complete however many there are.
async function entitiesSeenBy(
  repository: GraphRepository,
  { tool, run }: RunRef,
  options: QueryOptions,
): Promise<Entity[]> {
  const asked = { provenance: { tool, run }, includeHistory: true };

  const counted = await repository.queryEntities({ ...asked, mode: "count" }, options);
  if (counted.mode !== "count" || counted.total === 0) return [];

  const listed = await repository.queryEntities(
    { ...asked, mode: "list", limit: counted.total },
    options,
  );

  return listed.mode === "list" ? listed.results.map(({ entity }) => entity) : [];
}
