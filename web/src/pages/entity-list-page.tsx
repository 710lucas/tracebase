import { useState, type FormEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { getEntities } from "../api/client.ts";
import { EntityLink } from "../components/entity-link.tsx";
import { RequestView } from "../components/request-view.tsx";
import { formatNumber } from "../format.ts";
import { useRequest } from "../hooks/use-request.ts";

const PAGE_SIZE = 50;

// The entities of one type, a page at a time, with a search on the value. The search text and the page
// live in the address (`?search=...&offset=...`), so the back button and a copied link work.
export function EntityListPage() {
  const { type = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get("search") ?? "";
  const offset = Number(searchParams.get("offset") ?? 0);

  const [draft, setDraft] = useState(search);
  const state = useRequest(
    () => getEntities(type, { search, limit: PAGE_SIZE, offset }),
    [type, search, offset],
  );

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    // A new search starts again at the first page.
    setSearchParams(draft === "" ? {} : { search: draft });
  }

  function goTo(newOffset: number) {
    setSearchParams({ ...(search !== "" && { search }), offset: String(newOffset) });
  }

  return (
    <>
      <p>
        <Link to="/browse">← All types</Link>
      </p>
      <h1>{type}</h1>

      <form onSubmit={submitSearch} className="search">
        <input
          type="search"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Search in the values"
          aria-label="Search in the values"
        />
        <button type="submit">Search</button>
      </form>

      <RequestView state={state}>
        {(page) =>
          page.total === 0 ? (
            <p className="muted">No entity of this type matches.</p>
          ) : (
            <>
              <p className="muted">
                {formatNumber(offset + 1)}–{formatNumber(offset + page.entities.length)} of{" "}
                {formatNumber(page.total)}
              </p>
              <ul className="plain">
                {page.entities.map((entity) => (
                  <li key={entity.value}>
                    <EntityLink entity={entity} />
                  </li>
                ))}
              </ul>
              <div className="pager">
                <button
                  type="button"
                  disabled={offset === 0}
                  onClick={() => goTo(Math.max(0, offset - PAGE_SIZE))}
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={offset + PAGE_SIZE >= page.total}
                  onClick={() => goTo(offset + PAGE_SIZE)}
                >
                  Next
                </button>
              </div>
            </>
          )
        }
      </RequestView>
    </>
  );
}
