# tracebase

Core of the TCC system: turns data from OSINT tools into a knowledge graph (Memgraph)
that can be explored and queried in natural language.

- For humans: start at [`docs/README.md`](docs/README.md).
- For the AI: `CLAUDE.md` and `.claude/`.

Status: in development. The domain model, the import and read API, the SpiderFoot reader (a separate
program) and the Memgraph repository exist; next is the proof with a real scan (see
[`docs/roadmap.md`](docs/roadmap.md)).

Run the API (`PORT` defaults to 3000; set `MEMGRAPH_URL` to keep the graph in Memgraph, otherwise it
is kept in memory; see [`docs/memgraph.md`](docs/memgraph.md)):

```bash
MEMGRAPH_URL=bolt://localhost:7687 PORT=3001 npm run start
```
