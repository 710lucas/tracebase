import type { FilterChoices, ProvenanceFilter } from "../provenance-filter.ts";
import { isFiltering } from "../provenance-filter.ts";

interface ProvenanceFilterBarProps {
  choices: FilterChoices;
  filter: ProvenanceFilter;
  onChange: (filter: ProvenanceFilter) => void;
}

// The controls that filter the relations and attributes of an entity by where they came from: tool, module, run
// and, when some finding has one, a minimum confidence. A part left on "any" is not part of the filter.
export function ProvenanceFilterBar({ choices, filter, onChange }: ProvenanceFilterBarProps) {
  // Sets one part of the filter, or takes it out when the value is `undefined`.
  function set(part: keyof ProvenanceFilter, value: string | number | undefined) {
    const others = Object.entries(filter).filter(([key]) => key !== part);
    onChange(Object.fromEntries(value === undefined ? others : [...others, [part, value]]));
  }

  return (
    <div className="search" role="group" aria-label="Filter by provenance">
      <PartSelect
        label="Tool"
        options={choices.tools}
        value={filter.tool}
        onChange={(v) => set("tool", v)}
      />
      <PartSelect
        label="Module"
        options={choices.modules}
        value={filter.module}
        onChange={(v) => set("module", v)}
      />
      <PartSelect
        label="Run"
        options={choices.runs}
        value={filter.run}
        onChange={(v) => set("run", v)}
      />
      {choices.hasConfidence && (
        <label>
          Confidence at least{" "}
          <input
            type="number"
            min={0}
            max={100}
            value={filter.minConfidence ?? ""}
            onChange={(event) =>
              set(
                "minConfidence",
                event.target.value === "" ? undefined : Number(event.target.value),
              )
            }
          />
        </label>
      )}
      {isFiltering(filter) && <button onClick={() => onChange({})}>Clear filter</button>}
    </div>
  );
}

function PartSelect(props: {
  label: string;
  options: readonly string[];
  value: string | undefined;
  onChange: (value: string | undefined) => void;
}) {
  // Nothing to choose between: the part is not worth showing.
  if (props.options.length < 2) return null;

  return (
    <label>
      {props.label}{" "}
      <select
        value={props.value ?? ""}
        onChange={(event) =>
          props.onChange(event.target.value === "" ? undefined : event.target.value)
        }
      >
        <option value="">any</option>
        {props.options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}
