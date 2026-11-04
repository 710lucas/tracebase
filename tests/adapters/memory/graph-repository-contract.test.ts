import { createInMemoryGraphRepository } from "../../../src/adapters/memory/in-memory-graph-repository.ts";
import { testGraphRepositoryContract } from "../../core/ports/graph-repository/graph-repository-contract.ts";

// The in-memory repository against the port's contract. Each test gets a new, empty repository, so no
// clean-up is needed.
testGraphRepositoryContract({
  name: "memory",
  skip: false,
  valuePrefix: "",
  tool: "contract-tool",
  createRepository: async () => createInMemoryGraphRepository(),
});
