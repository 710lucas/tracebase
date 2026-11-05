import type {
  EntityNeighbourhood,
  NeighbourhoodEntity,
} from "../../../core/ports/graph-repository/index.ts";

// A neighbourhood reduced to what an AI (or a person) needs to see its shape: who is near, at which
// distance, and who is linked to whom, without the provenance of each relation and without the
// attributes of every entity. The origin keeps its attributes (name and values); anything else about one
// entity is one `GET /graph/entities` away. It is the answer of the neighbourhood route unless the
// caller asks for the full one.
//
// The relations name their two ends in full instead of pointing at positions in `entities`: each one can
// be read on its own, which is what keeps them valid when a neighbourhood comes in several answers.
export interface LeanNeighbourhood {
  readonly origin: {
    readonly type: string;
    readonly value: string;
    readonly attributes: readonly { name: string; values: readonly string[]; qualifier?: string }[];
  };
  readonly hops: number;
  readonly maxEntities: number;
  // Every entity reached except the origin, nearest first.
  readonly entities: readonly { type: string; value: string; distance: number }[];
  readonly relations: readonly {
    source: { type: string; value: string };
    target: { type: string; value: string };
    type?: string;
  }[];
  readonly truncated: boolean;
}

export function toLeanNeighbourhood(neighbourhood: EntityNeighbourhood): LeanNeighbourhood {
  const [origin, ...others] = neighbourhood.entities as [
    NeighbourhoodEntity,
    ...NeighbourhoodEntity[],
  ];

  return {
    origin: {
      type: origin.entity.type,
      value: origin.entity.value,
      attributes: origin.attributes.map(({ name, values, qualifier }) => ({
        name,
        values,
        ...(qualifier !== undefined && { qualifier }),
      })),
    },
    hops: neighbourhood.hops,
    maxEntities: neighbourhood.maxEntities,
    entities: others.map(({ entity, distance }) => ({
      type: entity.type,
      value: entity.value,
      distance,
    })),
    relations: neighbourhood.relations.map(({ source, target, type }) => ({
      source: { type: source.type, value: source.value },
      target: { type: target.type, value: target.value },
      ...(type !== undefined && { type }),
    })),
    truncated: neighbourhood.truncated,
  };
}
