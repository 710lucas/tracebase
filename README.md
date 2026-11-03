# tracebase

Core of the TCC system: turns data from OSINT tools into a knowledge graph (Memgraph)
that can be explored and queried in natural language.

- For humans: start at [`docs/README.md`](docs/README.md).
- For the AI: `CLAUDE.md` and `.claude/`.

Status: in development. The domain model, the import and read API, the SpiderFoot reader (a separate
program), the Memgraph repository and the first version of the front end (`web/`) exist (see
[`docs/roadmap.md`](docs/roadmap.md)).

Run the API (`PORT` defaults to 3333; set `MEMGRAPH_URL` to keep the graph in Memgraph, otherwise it
is kept in memory; see [`docs/memgraph.md`](docs/memgraph.md)):

```bash
MEMGRAPH_URL=bolt://localhost:7687 PORT=3001 npm run start
```

The front end is a React app in `web/` (see [`docs/frontend.md`](docs/frontend.md)). Install and build it
once, and the API serves it at `http://localhost:<PORT>/`:

```bash
npm run web:install
npm run web:build
```

While working on it, `npm run web:dev` starts the development server (it forwards the API paths to
`API_ADDRESS`, `http://localhost:3333` by default).
