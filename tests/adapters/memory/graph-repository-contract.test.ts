import { createInMemoryGraphRepository } from "../../../src/adapters/memory/in-memory-graph-repository.ts";
import { testGraphRepositoryContract } from "../../core/ports/graph-repository/graph-repository-contract.ts";
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
