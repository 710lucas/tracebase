import { createInMemoryGraphRepository } from "../../../src/adapters/memory/in-memory-graph-repository.ts";
import { testGraphRepositoryContract } from "../../core/ports/graph-repository/graph-repository-contract.ts";
import { testNeighbourhoodPagesContract } from "../../core/ports/graph-repository/neighbourhood-pages-contract.ts";
import { testShortestPathContract } from "../../core/ports/graph-repository/shortest-path-contract.ts";
import { testMostConnectedContract } from "../../core/ports/graph-repository/most-connected-contract.ts";
import { testEntityQueryContract } from "../../core/ports/graph-repository/entity-query-contract.ts";
import { testSearchContract } from "../../core/ports/graph-repository/search-contract.ts";
import { testNeighbourhoodContract } from "../../core/ports/graph-repository/neighbourhood-contract.ts";

// The in-memory repository against the port's contract. Each test gets a new, empty repository, so no
// clean-up is needed.
const options = {
  name: "memory",
  skip: false,
  valuePrefix: "",
  tool: "contract-tool",
  createRepository: async () => createInMemoryGraphRepository(),
} as const;

testGraphRepositoryContract(options);
testNeighbourhoodContract(options);
testNeighbourhoodPagesContract(options);
testShortestPathContract(options);
testSearchContract(options);
testEntityQueryContract(options);
testMostConnectedContract(options);
