import type {
  ConnectedEntity,
  EntityFindings,
  EntityRef,
  EntityListOptions,
  EntityPage,
  EntityTypeCount,
  Neighbourhood,
  RunSummary,
  StatusReport,
} from "./types.ts";

const NOT_FOUND = 404;

// The API answered, but with an error status. `status` lets a caller treat one of them (a 404) as an
// answer instead of a failure.
export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

// Every request goes to the page's own origin: the API serves this page in production and the dev server
// forwards the same paths to it.
async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path);

  if (!response.ok) {
    throw new ApiError(await errorMessage(response), response.status);
  }

  return (await response.json()) as T;
}

// The API explains its errors as `{ "error": "..." }`; anything else falls back to the status.
async function errorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    if (body.error !== undefined) return body.error;
  } catch {
    // The body was not JSON; the status line below is all there is to say.
  }
  return `the API answered ${response.status}`;
}

export function getStatus(): Promise<StatusReport> {
  return getJson("/status");
}

export async function getRuns(): Promise<RunSummary[]> {
  return (await getJson<{ runs: RunSummary[] }>("/imports")).runs;
}

export async function getEntityTypes(): Promise<EntityTypeCount[]> {
  return (await getJson<{ types: EntityTypeCount[] }>("/graph/types")).types;
}

export function getEntities(type: string, options: EntityListOptions): Promise<EntityPage> {
  const query = new URLSearchParams({
    limit: String(options.limit),
    offset: String(options.offset),
  });
  if (options.search !== "") query.set("search", options.search);

  return getJson(`/graph/types/${encodeURIComponent(type)}/entities?${query}`);
}

// The entities within `hops` relations of one entity, at most `maxEntities` of them. `null` when nothing in the graph
// mentions the entity.
export async function getNeighbourhood(
  entity: EntityRef,
  options: { hops: number; maxEntities: number },
): Promise<Neighbourhood | null> {
  const query = new URLSearchParams({
    type: entity.type,
    value: entity.value,
    hops: String(options.hops),
    maxEntities: String(options.maxEntities),
  });

  try {
    return await getJson(`/graph/entities/neighbourhood?${query}`);
  } catch (error) {
    if (error instanceof ApiError && error.status === NOT_FOUND) return null;
    throw error;
  }
}

export async function getMostConnected(limit: number): Promise<ConnectedEntity[]> {
  return (await getJson<{ entities: ConnectedEntity[] }>(`/graph/most-connected?limit=${limit}`))
    .entities;
}

// `null` when nothing in the graph mentions the entity (the API's 404), which is an answer, not a failure.
export async function getEntity(type: string, value: string): Promise<EntityFindings | null> {
  const query = new URLSearchParams({ type, value });

  try {
    return await getJson(`/graph/entities?${query}`);
  } catch (error) {
    if (error instanceof ApiError && error.status === NOT_FOUND) return null;
    throw error;
  }
}
