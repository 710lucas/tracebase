# tracebase

A tool-agnostic core that turns the output of OSINT tools into one knowledge graph, stored in
[Memgraph](https://memgraph.com), that can be explored in a web interface and queried by a language
model through the [Model Context Protocol](https://modelcontextprotocol.io) (MCP).

It is the central module of an undergraduate thesis project. Each OSINT tool gets a small adapter that
reads its results and sends them to this module through one import contract. The module knows no tool:
everything that depends on a tool's format stays in its adapter.

The first adapter is for [SpiderFoot](https://github.com/smicallef/spiderfoot):
[spiderfoot-tracebase-adapter](https://github.com/710lucas/spiderfoot-tracebase-adapter).

> **Security notice.** The API and the MCP server have no authentication. The graph may hold personal
> data collected by OSINT tools. Run it only on a trusted, local network.

## How it works

```
OSINT tool ──> adapter ──> import API ──> core ──> Memgraph
                                             │
                      REST API · web interface · MCP server
```

- **Import.** A tool sends batches of relations and attributes as JSON. Every batch carries the tool and
  the run (scan) that produced it, and every item may carry its own provenance (module, confidence,
  observation time and the records of the tool behind it).
- **Graph.** An entity is a node identified by its type and value, so two runs or two tools that mention
  the same entity reach the same node. Entity types are defined by each tool; the core has no list of
  them. A relation is a directed edge, one per tool, run, module, pair of entities and type. An
  attribute holds the set of values a tool found together; when a newer set arrives, the older one is
  kept as history.
- **Idempotent writes.** Sending the same batch twice leaves the graph as it was. Each batch is written in
  one transaction.
- **Reading.** The graph can be read through REST routes, a web interface and an MCP server that exposes
  the same queries to a language model.

## Requirements

- Node.js 26 (the TypeScript source runs directly, without a build step).
- Memgraph with MAGE, to keep the graph. Without it the API keeps the graph in memory, which is useful
  for trying it out and for the tests.

## Run

```bash
npm install
MEMGRAPH_URL=bolt://localhost:7687 npm run start
```

| Variable | Meaning | Default |
|---|---|---|
| `PORT` | Port of the API | `3333` |
| `MEMGRAPH_URL` | Bolt address of Memgraph. When absent, the graph is kept in memory. | none |
| `MEMGRAPH_USER`, `MEMGRAPH_PASSWORD` | Only for a Memgraph that asks for credentials | none |

The web interface is a React app in `web/`. Build it once and the API serves it at
`http://localhost:<PORT>/`:

```bash
npm run web:install
npm run web:build
```

`npm run web:dev` starts its development server, which forwards the API paths to `API_ADDRESS`
(`http://localhost:3333` by default).

## Import contract

`POST /imports` with `Content-Type: application/json`. Entities are not sent on their own: each one is
written inside the relations and attributes that mention it.

```json
{
  "source": { "tool": "example-tool", "run": "run-1" },
  "relations": [
    {
      "source": { "type": "DOMAIN_NAME", "value": "example.com" },
      "target": { "type": "IP_ADDRESS", "value": "203.0.113.7" },
      "type": "resolves_to",
      "provenance": { "module": "dns-module", "confidence": 100 }
    }
  ],
  "attributes": [
    {
      "entity": { "type": "IP_ADDRESS", "value": "203.0.113.7" },
      "name": "WEBSERVER_BANNER",
      "qualifier": "http-module",
      "values": ["nginx/1.25"]
    }
  ]
}
```

- `relations[].type`, `relations[].provenance` and `attributes[].qualifier` are optional. A relation
  without a type is stored with the label `RELATED`.
- Unknown fields are rejected, so a typo is an error instead of silently lost data.
- A valid batch answers `202` with the number of relations and attributes received. An invalid batch
  answers `400`, writes nothing, and says which field is wrong.
- The API reads about 100 KB per request; an adapter splits a large run into several batches.

## API

| Route | What it does |
|---|---|
| `POST /imports` | Imports a batch |
| `GET /imports` | Lists the runs already imported |
| `GET /imports/compare` | Compares two runs |
| `GET /graph/entities` | One entity with its relations and attributes |
| `GET /graph/entities/degree` | How connected an entity is |
| `GET /graph/entities/neighbourhood` | Entities a few hops away, in pages |
| `GET /graph/entities/shortest-path` | Shortest path between two entities |
| `GET /graph/search` | Entities whose value or attributes contain a text |
| `POST /graph/query` | Entities that meet conditions on type, value, attribute and provenance |
| `GET /graph/most-connected` | The most connected entities |
| `GET /graph/types` | Entity types with their counts |
| `GET /graph/types/:type/entities` | Entities of one type |
| `GET /status` | State of the service and of the graph |
| `POST /mcp` | The MCP server (HTTP transport, read-only, no session) |

## MCP server

An MCP client connects to `http://localhost:<PORT>/mcp`. The server has eight tools:

| Tool | What it answers |
|---|---|
| `list_entity_types` | The entity types and how many entities each has |
| `find_entity` | Everything the graph holds about one entity, with provenance |
| `get_entity_degree` | How connected an entity is |
| `get_entity_neighbourhood` | The entities a few hops away, in pages |
| `find_shortest_path` | The path with the fewest relations between two entities |
| `search_entities` | The entities that contain a text, in value or attributes |
| `query_entities` | The entities that meet all given conditions, as a page or a count |
| `run_read_only_cypher` | A read-only Cypher statement (only with Memgraph; last resort) |

The Cypher tool is protected by a filter that accepts only reading statements, a memory limit, a read
transaction and a row limit.

## Development

```bash
npm install
npm run check
```

`npm run check` runs the type check, the linter, the format check, the architecture rules
(dependency-cruiser), the tests with a 90% coverage threshold and the checks of the web app. The tests
that need Memgraph run against `MEMGRAPH_URL` (or the default Bolt address) and are skipped when none
answers.

The code follows a hexagonal layout: `src/core` holds the domain, the use cases and the ports, and
`src/adapters` holds the HTTP, MCP, Memgraph and in-memory implementations.
