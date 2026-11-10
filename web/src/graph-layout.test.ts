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
  spacingFactor,
  type Point,
} from "./graph-layout.ts";

test("the default layout spreads the types in wedges and the default spacing is normal", () => {
  expect(DEFAULT_LAYOUT).toBe("sectors");
  expect(DEFAULT_SPACING).toBe("normal");
  expect(LAYOUTS.map(({ value }) => value)).toEqual(["sectors", "grouped", "force", "rings"]);
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
