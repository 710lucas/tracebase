import type { EntityNeighbourhood } from "../../../core/ports/graph-repository/index.ts";

// A neighbourhood reduced to what an AI (or a person) needs to see its shape: who is near, at which
// distance, and who is linked to whom, without the provenance of each relation and without the
// attributes of every entity. The origin keeps its attributes (name and values); anything else about one
// entity is one `GET /graph/entities` away. It is the answer of the neighbourhood route unless the
// caller asks for the full one.
//
// The relations name their two ends in full instead of pointing at positions in `entities`: each one can
// be read on its own, which is what keeps them valid when a neighbourhood comes in several answers (pages).
//
// The origin is in the first page only, so only the first page gives its attributes; in a later page the
// `origin` is just its type and value, to say whose neighbourhood it is.
export interface LeanNeighbourhood {
  readonly origin: {
    readonly type: string;
    readonly value: string;
    readonly attributes?: readonly {
      name: string;
      values: readonly string[];
      qualifier?: string;
    }[];
  };
  readonly hops: number;
  readonly maxEntities: number;
  readonly offset: number;
  // The entities of this page except the origin, nearest first.
  readonly entities: readonly { type: string; value: string; distance: number }[];
  readonly relations: readonly {
    source: { type: string; value: string };
    target: { type: string; value: string };
    type?: string;
  }[];
  readonly truncated: boolean;
  readonly nextOffset?: number;
}

export function toLeanNeighbourhood(neighbourhood: EntityNeighbourhood): LeanNeighbourhood {
  // The origin is the first entity of the first page and in no other page.
  const isFirstPage = neighbourhood.offset === 0;
  const [originEntry, ...restOfFirstPage] = neighbourhood.entities;
  const others = isFirstPage ? restOfFirstPage : neighbourhood.entities;

  return {
    origin: {
      type: neighbourhood.origin.type,
      value: neighbourhood.origin.value,
      ...(isFirstPage && {
        attributes: (originEntry?.attributes ?? []).map(({ name, values, qualifier }) => ({
          name,
          values,
          ...(qualifier !== undefined && { qualifier }),
        })),
      }),
    },
    hops: neighbourhood.hops,
    maxEntities: neighbourhood.maxEntities,
    offset: neighbourhood.offset,
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
    ...(neighbourhood.nextOffset !== undefined && { nextOffset: neighbourhood.nextOffset }),
  };
}
