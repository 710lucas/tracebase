import { expect, test } from "vitest";
import {
  DEFAULT_LAYOUT,
  DEFAULT_SPACING,
  clusterPositions,
  groupIdOf,
  LAYOUTS,
  layoutOptions,
  sectorPositions,
  SPACINGS,
  minimumApart,
  spacingFactor,
  spreadApart,
  type Point,
} from "./graph-layout.ts";

test("the default layout groups the types in boxes and the default spacing is normal", () => {
  expect(DEFAULT_LAYOUT).toBe("grouped");
  expect(DEFAULT_SPACING).toBe("normal");
  expect(LAYOUTS.map(({ value }) => value)).toEqual(["grouped", "sectors", "force", "rings"]);
  expect(SPACINGS.map(({ value }) => value)).toEqual(["compact", "normal", "wide"]);
});

test("the spacing is a factor that grows from compact to wide", () => {
  expect(spacingFactor("compact")).toBeLessThan(spacingFactor("normal"));
  expect(spacingFactor("normal")).toBe(1);
  expect(spacingFactor("wide")).toBeGreaterThan(spacingFactor("normal"));
});

test("a type has an id of its own for its box", () => {
  expect(groupIdOf("IP_ADDRESS")).toBe("group:IP_ADDRESS");
});

const entity = (id: string, type: string, distance = 1) => ({ id, type, distance });

test("the force layout uses cose, and a wider spacing pushes harder and makes the relations longer", () => {
  const compact = layoutOptions("force", "compact", true) as unknown as Record<
    string,
    () => number
  >;
  const wide = layoutOptions("force", "wide", true) as unknown as Record<string, () => number>;

  expect(layoutOptions("force", "normal", true).name).toBe("cose");
  expect((wide["nodeRepulsion"] as () => number)()).toBeGreaterThan(
    (compact["nodeRepulsion"] as () => number)(),
  );
  expect((wide["idealEdgeLength"] as () => number)()).toBeGreaterThan(
    (compact["idealEdgeLength"] as () => number)(),
  );
});

test("the rings layout puts the origin in the middle: the nearer, the higher", () => {
  const options = layoutOptions("rings", "normal", true) as unknown as {
    name: string;
    concentric: (node: { data: (name: string) => number }) => number;
  };
  const at = (distance: number) => options.concentric({ data: () => distance });

  expect(options.name).toBe("concentric");
  expect(at(0)).toBeGreaterThan(at(1));
  expect(at(1)).toBeGreaterThan(at(2));
});

test("force and rings fit the view only when it is a fresh drawing", () => {
  expect(layoutOptions("force", "normal", true)).toMatchObject({ randomize: true, fit: true });
  expect(layoutOptions("force", "normal", false)).toMatchObject({ randomize: false, fit: false });
  expect(layoutOptions("rings", "normal", false)).toMatchObject({ fit: false });
});

test("the grouped layout places the nodes with the positions of the clusters", () => {
  const options = layoutOptions("grouped", "normal", true, [
    entity("o", "A", 0),
    entity("x", "B"),
  ]) as unknown as {
    name: string;
    positions: (node: { id: () => string }) => { x: number; y: number };
    animate: boolean;
  };

  expect(options.name).toBe("preset");
  expect(options.positions({ id: () => "o" })).toEqual({ x: 0, y: 0 });
  expect(options.positions({ id: () => "x" })).not.toEqual({ x: 0, y: 0 });
  expect(options.animate).toBe(false);
  expect(
    (layoutOptions("grouped", "normal", false) as unknown as { animate: boolean }).animate,
  ).toBe(true);
});

test("the origin is in the middle and every type has a cluster of its own", () => {
  const positions = clusterPositions(
    [
      entity("o", "A", 0),
      entity("a1", "A"),
      entity("a2", "A"),
      entity("b1", "B"),
      entity("c1", "C"),
    ],
    "normal",
  );

  expect(positions.get("o")).toEqual({ x: 0, y: 0 });
  expect(positions.size).toBe(5);
  // A cluster's members are near each other and far from the other clusters' members.
  const distance = (first: string, second: string) => {
    const [a, b] = [positions.get(first), positions.get(second)] as [Point, Point];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  expect(distance("a1", "a2")).toBeLessThan(distance("a1", "b1"));
  expect(distance("a1", "a2")).toBeLessThan(distance("a1", "c1"));
});

test("no two entities are on the same point", () => {
  const entities = Array.from({ length: 40 }, (_, index) =>
    entity(`n${index}`, index % 3 === 0 ? "A" : "B"),
  );

  const positions = clusterPositions([entity("o", "A", 0), ...entities], "normal");
  const points = new Set(
    [...positions.values()].map(({ x, y }) => `${Math.round(x)},${Math.round(y)}`),
  );

  expect(points.size).toBe(41);
});

test("a wider spacing puts the entities farther apart", () => {
  const entities = [entity("o", "A", 0), entity("a1", "A"), entity("a2", "A")];
  const apart = (spacing: "compact" | "wide") => {
    const positions = clusterPositions(entities, spacing);
    const [a, b] = [positions.get("a1"), positions.get("a2")] as [Point, Point];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  expect(apart("wide")).toBeGreaterThan(apart("compact"));
});

test("the same graph is always placed the same way", () => {
  const entities = [entity("o", "A", 0), entity("a1", "A"), entity("b1", "B")];

  expect(clusterPositions(entities, "normal")).toEqual(clusterPositions(entities, "normal"));
});

test("with nothing but the origin, it is in the middle and alone", () => {
  expect([...clusterPositions([entity("o", "A", 0)], "normal")]).toEqual([["o", { x: 0, y: 0 }]]);
  expect(clusterPositions([], "normal").size).toBe(0);
});

test("two clusters next to each other on the circle do not touch", () => {
  const entities = [
    entity("o", "A", 0),
    ...Array.from({ length: 30 }, (_, index) => entity(`a${index}`, "A")),
    ...Array.from({ length: 30 }, (_, index) => entity(`b${index}`, "B")),
    ...Array.from({ length: 30 }, (_, index) => entity(`c${index}`, "C")),
  ];
  const positions = clusterPositions(entities, "normal");

  const centre = (prefix: string) => {
    const points = [...positions].filter(([id]) => id.startsWith(prefix)).map(([, point]) => point);
    return {
      x: points.reduce((sum, { x }) => sum + x, 0) / points.length,
      y: points.reduce((sum, { y }) => sum + y, 0) / points.length,
    };
  };
  const apart = (first: string, second: string) =>
    Math.hypot(centre(first).x - centre(second).x, centre(first).y - centre(second).y);

  // Each cluster of 30 is about 7 columns of 46 px: its diagonal is far below the distance between the centres.
  expect(apart("a", "b")).toBeGreaterThan(300);
  expect(apart("b", "c")).toBeGreaterThan(300);
  expect(apart("a", "c")).toBeGreaterThan(300);
});

test("the sectors layout places the nodes with preset positions", () => {
  const options = layoutOptions("sectors", "normal", true, [
    entity("o", "A", 0),
    entity("x", "B"),
  ]) as unknown as {
    name: string;
    positions: (node: { id: () => string }) => { x: number; y: number };
  };

  expect(options.name).toBe("preset");
  expect(options.positions({ id: () => "o" })).toEqual({ x: 0, y: 0 });
  expect(options.positions({ id: () => "x" })).not.toEqual({ x: 0, y: 0 });
});

const around = (point: Point) => Math.atan2(point.y, point.x);
const fromMiddle = (point: Point) => Math.hypot(point.x, point.y);

test("sectors: the origin is in the middle and each type stays in its own wedge", () => {
  const entities = [
    entity("o", "A", 0),
    ...Array.from({ length: 12 }, (_, index) => entity(`a${index}`, "A")),
    ...Array.from({ length: 12 }, (_, index) => entity(`b${index}`, "B")),
    ...Array.from({ length: 12 }, (_, index) => entity(`c${index}`, "C")),
  ];

  const positions = sectorPositions(entities, "normal");
  const anglesOf = (prefix: string) =>
    [...positions]
      .filter(([id]) => id.startsWith(prefix))
      .map(([, point]) => (around(point) + 2 * Math.PI + Math.PI / 2) % (2 * Math.PI));

  expect(positions.get("o")).toEqual({ x: 0, y: 0 });
  // The angles are counted from the top, so the wedges are in order and do not overlap.
  expect(Math.max(...anglesOf("a"))).toBeLessThan(Math.min(...anglesOf("b")));
  expect(Math.max(...anglesOf("b"))).toBeLessThan(Math.min(...anglesOf("c")));
});

test("sectors: a big type grows outward on more arcs, not into its neighbours", () => {
  const entities = [
    entity("o", "A", 0),
    ...Array.from({ length: 60 }, (_, index) => entity(`a${String(index).padStart(2, "0")}`, "A")),
    entity("b0", "B"),
  ];

  const positions = sectorPositions(entities, "normal");
  const radii = new Set(
    [...positions]
      .filter(([id]) => id.startsWith("a"))
      .map(([, point]) => Math.round(fromMiddle(point))),
  );

  expect(radii.size).toBeGreaterThan(1);
});

test("sectors: no two entities are on the same point, and the same graph is placed the same way", () => {
  const entities = [
    entity("o", "A", 0),
    ...Array.from({ length: 50 }, (_, index) =>
      entity(`n${index}`, index % 4 === 0 ? "A" : index % 4 === 1 ? "B" : "C"),
    ),
  ];

  const first = sectorPositions(entities, "normal");
  const points = new Set(
    [...first.values()].map(({ x, y }) => `${Math.round(x)},${Math.round(y)}`),
  );

  expect(points.size).toBe(51);
  expect(sectorPositions(entities, "normal")).toEqual(first);
});

test("sectors: a wider spacing puts the entities farther from the middle", () => {
  const entities = [entity("o", "A", 0), entity("a1", "A")];
  const reach = (spacing: "compact" | "wide") =>
    fromMiddle(sectorPositions(entities, spacing).get("a1") as Point);

  expect(reach("wide")).toBeGreaterThan(reach("compact"));
});

test("sectors: the nearer entities of a type come first, on the inner arc", () => {
  const entities = [entity("o", "A", 0), entity("far", "B", 2), entity("near", "B", 1)];
  const positions = sectorPositions(entities, "normal");

  expect(fromMiddle(positions.get("near") as Point)).toBeLessThanOrEqual(
    fromMiddle(positions.get("far") as Point) + 1e-9,
  );
});

test("sectors: with nothing but the origin, it is in the middle and alone", () => {
  expect([...sectorPositions([entity("o", "A", 0)], "normal")]).toEqual([["o", { x: 0, y: 0 }]]);
  expect(sectorPositions([], "normal").size).toBe(0);
});

// The position of the middle of a type's cluster, as its angle around the origin counted in steps of the circle.
function stepsAround(positions: Map<string, Point>, prefix: string, clusters: number): number {
  const points = [...positions].filter(([id]) => id.startsWith(prefix)).map(([, point]) => point);
  const x = points.reduce((sum, point) => sum + point.x, 0) / points.length;
  const y = points.reduce((sum, point) => sum + point.y, 0) / points.length;
  return Math.round(
    (((Math.atan2(y, x) + Math.PI / 2 + 2 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI)) * clusters,
  );
}

test("types with many relations between them are next to each other on the circle", () => {
  const ids = (prefix: string, count: number) =>
    Array.from({ length: count }, (_, index) => `${prefix}${index}`);
  const entities = [
    entity("o", "O", 0),
    ...ids("a", 6).map((id) => entity(id, "A")),
    ...ids("b", 5).map((id) => entity(id, "B")),
    ...ids("c", 4).map((id) => entity(id, "C")),
    ...ids("d", 3).map((id) => entity(id, "D")),
  ];
  // A is linked to C, and B to D, and nothing else; the alphabet would put A next to B.
  const links = [
    ...ids("a", 4).map((id, index) => ({ source: id, target: `c${index}` })),
    ...ids("b", 3).map((id, index) => ({ source: id, target: `d${index}` })),
  ];

  const positions = clusterPositions(entities, "normal", links);
  const steps = (prefix: string) => stepsAround(positions, prefix, 4);
  const apart = (first: string, second: string) => {
    const difference = Math.abs(steps(first) - steps(second));
    return Math.min(difference, 4 - difference);
  };

  expect(apart("a", "c")).toBe(1);
  expect(apart("b", "d")).toBe(1);
});

test("the relations of the origin do not decide the order", () => {
  const entities = [entity("o", "O", 0), entity("a", "A"), entity("b", "B")];

  const withOrigin = clusterPositions(entities, "normal", [
    { source: "o", target: "a" },
    { source: "o", target: "b" },
  ]);

  expect(withOrigin).toEqual(clusterPositions(entities, "normal"));
});

test("the clusters are farther apart than before", () => {
  const entities = [
    entity("o", "O", 0),
    ...Array.from({ length: 20 }, (_, index) => entity(`a${index}`, "A")),
    ...Array.from({ length: 20 }, (_, index) => entity(`b${index}`, "B")),
  ];
  const positions = clusterPositions(entities, "normal");
  const nearest = Math.min(
    ...[...positions]
      .filter(([id]) => id.startsWith("a"))
      .flatMap(([, first]) =>
        [...positions]
          .filter(([id]) => id.startsWith("b"))
          .map(([, second]) => Math.hypot(first.x - second.x, first.y - second.y)),
      ),
  );

  expect(nearest).toBeGreaterThan(130);
});

const gather = (points: [string, number, number][]) =>
  new Map(points.map(([id, x, y]) => [id, { x, y }] as [string, Point]));

const closest = (positions: Map<string, Point>) => {
  const all = [...positions.values()];
  let least = Number.POSITIVE_INFINITY;
  for (let first = 0; first < all.length; first += 1) {
    for (let second = first + 1; second < all.length; second += 1) {
      const [a, b] = [all[first] as Point, all[second] as Point];
      least = Math.min(least, Math.hypot(a.x - b.x, a.y - b.y));
    }
  }
  return least;
};

test("spreading apart leaves no two points closer than the minimum", () => {
  const knot = gather(
    Array.from({ length: 40 }, (_, index) => [
      `n${index}`,
      (index % 7) * 3,
      Math.floor(index / 7) * 3,
    ]),
  );

  const spread = spreadApart(knot, 60);

  expect(closest(spread)).toBeGreaterThan(55);
  expect(spread.size).toBe(40);
});

test("points that are already apart are not moved, and the given points are not changed", () => {
  const apart = gather([
    ["a", 0, 0],
    ["b", 200, 0],
  ]);

  expect(spreadApart(apart, 60)).toEqual(apart);
  const knot = gather([
    ["a", 0, 0],
    ["b", 1, 0],
  ]);
  spreadApart(knot, 60);
  expect(knot.get("b")).toEqual({ x: 1, y: 0 });
});

test("a pinned point stays where it is and the others move away from it", () => {
  const spread = spreadApart(
    gather([
      ["origin", 0, 0],
      ["a", 5, 0],
      ["b", 0, 5],
    ]),
    60,
    new Set(["origin"]),
  );

  expect(spread.get("origin")).toEqual({ x: 0, y: 0 });
  expect(Math.hypot((spread.get("a") as Point).x, (spread.get("a") as Point).y)).toBeGreaterThan(
    55,
  );
});

test("points on the very same place are separated, the same way every time", () => {
  const same = gather([
    ["a", 10, 10],
    ["b", 10, 10],
    ["c", 10, 10],
  ]);

  const first = spreadApart(same, 60);

  expect(closest(first)).toBeGreaterThan(55);
  expect(spreadApart(same, 60)).toEqual(first);
});

test("the minimum distance grows with the spacing", () => {
  expect(minimumApart("wide")).toBeGreaterThan(minimumApart("normal"));
  expect(minimumApart("normal")).toBeGreaterThan(minimumApart("compact"));
});
