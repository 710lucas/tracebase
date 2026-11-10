import type { ReactNode } from "react";
import { formatNumber } from "../format.ts";
import { shareOf } from "../dashboard-figures.ts";

export interface Bar {
  key: string;
  label: ReactNode;
  value: number;
}

// A list of values drawn as horizontal bars, the length of each one relative to the biggest. It is plain HTML and
// CSS (no chart library): the number is always written next to the bar, so the bar only helps to compare.
export function BarList({ bars }: { bars: readonly Bar[] }) {
  const biggest = Math.max(0, ...bars.map(({ value }) => value));

  return (
    <ul className="bars">
      {bars.map((bar) => (
        <li key={bar.key}>
          <div className="bar-label">{bar.label}</div>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${shareOf(bar.value, biggest)}%` }} />
          </div>
          <div className="number">{formatNumber(bar.value)}</div>
        </li>
      ))}
    </ul>
  );
}
