import neo4j from "neo4j-driver";

export const DEFAULT_MEMGRAPH_URL = "bolt://localhost:7687";

export interface MemgraphConfig {
  url: string;
  user?: string;
  password?: string;
}

// What the Memgraph adapter needs from the database: run a Cypher query and read the rows back as
// plain objects. The driver's own types (sessions, records, integers) stay inside this file.
export interface MemgraphConnection {
  run(query: string, parameters?: Record<string, unknown>): Promise<Record<string, unknown>[]>;
  close(): Promise<void>;
}

// Opens the connection and checks right away that the database answers, so a wrong address fails when
// the application starts and not on the first import.
//
// Integers come back as JavaScript numbers (`disableLosslessIntegers`): the driver would otherwise
// return its own `Integer` object, and every value this project stores (counts, epoch milliseconds)
// fits in a number. A new session is opened for each query and closed after it; the driver keeps the
// connections in a pool.
//
// EXPAND: a method that runs several queries in one transaction, for the writes that must be atomic.
export async function connectToMemgraph(config: MemgraphConfig): Promise<MemgraphConnection> {
  const authentication =
    config.user === undefined ? undefined : neo4j.auth.basic(config.user, config.password ?? "");
  const driver = neo4j.driver(config.url, authentication, { disableLosslessIntegers: true });

  try {
    await driver.verifyConnectivity();
  } catch (error) {
    await driver.close();
    throw new Error(`could not reach Memgraph at ${config.url}: ${(error as Error).message}`, {
      cause: error,
    });
  }

  return {
    run: async (query, parameters = {}) => {
      const session = driver.session();

      try {
        const result = await session.run(query, parameters);
        return result.records.map((record) => record.toObject());
      } finally {
        await session.close();
      }
    },

    close: () => driver.close(),
  };
}
