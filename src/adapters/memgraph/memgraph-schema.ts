import type { MemgraphConnection } from "./memgraph-connection.ts";

// Prepares the database for the graph.
//
// An entity is told apart by type and value, so no two `:Entity` nodes may share both, and looking one
// up by them has to be fast (every relation and attribute written looks up its entity). A replaced
// attribute value (`:Attribute`) is told apart by its `key`, for the same two reasons.
//
// It runs every time the application starts. Creating a constraint or an index that already exists is
// accepted without error (checked on the real database), so there is no "already created" state to keep.
export async function ensureMemgraphSchema(connection: MemgraphConnection): Promise<void> {
  await connection.run("CREATE CONSTRAINT ON (n:Entity) ASSERT n.type, n.value IS UNIQUE");
  await connection.run("CREATE INDEX ON :Entity(type, value)");
  await connection.run("CREATE CONSTRAINT ON (a:Attribute) ASSERT a.key IS UNIQUE");
  await connection.run("CREATE INDEX ON :Attribute(key)");
}
