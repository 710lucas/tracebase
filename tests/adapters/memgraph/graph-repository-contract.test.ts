import { after, beforeEach } from "node:test";
import {
  connectToMemgraph,
  DEFAULT_MEMGRAPH_URL,
  type MemgraphConnection,
} from "../../../src/adapters/memgraph/memgraph-connection.ts";
import { createMemgraphGraphRepository } from "../../../src/adapters/memgraph/memgraph-graph-repository.ts";
import { testGraphRepositoryContract } from "../../core/ports/graph-repository/graph-repository-contract.ts";
import { testNeighbourhoodPagesContract } from "../../core/ports/graph-repository/neighbourhood-pages-contract.ts";
import { testShortestPathContract } from "../../core/ports/graph-repository/shortest-path-contract.ts";
import { testEntityQueryContract } from "../../core/ports/graph-repository/entity-query-contract.ts";
import { testSearchContract } from "../../core/ports/graph-repository/search-contract.ts";
import { testNeighbourhoodContract } from "../../core/ports/graph-repository/neighbourhood-contract.ts";

// The Memgraph repository against the port's contract. Needs a running Memgraph; skipped when none
// answers. The database may hold other data and other test files write to it at the same time, so the
// suite writes only values with this file's own prefix (which does not start with `__test__`, so the
// other files never delete them) and every test starts from none of them.
const PREFIX = "__test_contract__";

async function tryConnecting(): Promise<MemgraphConnection | null> {
  try {
    return await connectToMemgraph({ url: process.env["MEMGRAPH_URL"] ?? DEFAULT_MEMGRAPH_URL });
  } catch {
    return null;
  }
}

const connection = await tryConnecting();

async function deleteContractEntities(): Promise<void> {
  await connection?.run(
    "MATCH (n:Entity)-[:HAS_ATTRIBUTE]->(history:Attribute) WHERE n.value STARTS WITH $prefix DETACH DELETE history",
    { prefix: PREFIX },
  );
  await connection?.run("MATCH (n:Entity) WHERE n.value STARTS WITH $prefix DETACH DELETE n", {
    prefix: PREFIX,
  });
}

beforeEach(deleteContractEntities);

after(async () => {
  await deleteContractEntities();
  await connection?.close();
});

const contractOptions = {
  name: "memgraph",
  skip: connection === null ? "no Memgraph is running" : false,
  valuePrefix: PREFIX,
  tool: `${PREFIX}tool`,
  createRepository: () => createMemgraphGraphRepository(connection as MemgraphConnection),
} as const;

testGraphRepositoryContract(contractOptions);
testNeighbourhoodContract(contractOptions);
testNeighbourhoodPagesContract(contractOptions);
testShortestPathContract(contractOptions);
testSearchContract(contractOptions);
testEntityQueryContract(contractOptions);
