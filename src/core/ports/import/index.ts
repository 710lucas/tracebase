// Public API of the `import` contract: the single customizable port of the system. Any OSINT tool
// (through the REST API, later) hands the core a payload; `parseImportBatch` turns it into a
// trusted ImportBatch or explains precisely what is wrong.
export type { ImportBatch } from "./import-batch.ts";
export type { ImportSource } from "./import-source.ts";
export { parseImportBatch } from "./parse-import-batch.ts";
export { InvalidImportBatchError } from "./invalid-import-batch-error.ts";
