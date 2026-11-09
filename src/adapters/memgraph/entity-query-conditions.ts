import type {
  ProvenanceFilter,
  ResolvedAttributeCondition,
  ResolvedEntityQuery,
} from "../../core/ports/graph-repository/index.ts";
import { toQualifierKey } from "./attribute-record.ts";
import { createMatchPredicate } from "./match-predicate.ts";

// The conditions of a structured query, written in Cypher for an entity node called `n`: the caller puts them
// after `MATCH (n:Entity) WHERE`, joined with AND. Every value travels as a parameter, never inside the text.
// No condition at all is the whole graph.
export interface EntityQueryConditions {
  readonly conditions: readonly string[];
  readonly parameters: Readonly<Record<string, unknown>>;
}

// Where an attribute is kept (see `AttributeRecord`): the current sets in the map `n.attributes` (name, then
// qualifier) and, when asked for with `includeHistory`, the replaced sets as `:Attribute` nodes.
export function buildEntityQueryConditions(query: ResolvedEntityQuery): EntityQueryConditions {
  const conditions: string[] = [];
  let parameters: Record<string, unknown> = {};

  if (query.types !== undefined) {
    conditions.push("n.type IN $types");
    parameters = { ...parameters, types: query.types };
  }

  if (query.value !== undefined) {
    const predicate = createMatchPredicate(query.value.text, query.value.match, "value");
    conditions.push(predicate.condition("n.value"));
    parameters = { ...parameters, ...predicate.parameters };
  }

  for (const [position, condition] of query.attributes.entries()) {
    const built = attributeCondition(condition, position, query.includeHistory);
    conditions.push(built.condition);
    parameters = { ...parameters, ...built.parameters };
  }

  if (query.provenance !== undefined) {
    conditions.push(provenanceCondition(query.provenance, query.includeHistory));
    parameters = { ...parameters, ...provenanceParameters(query.provenance) };
  }

  return { conditions, parameters };
}

// The names of the parameters of one attribute condition, so that conditions do not share them.
export function attributeParameterPrefix(position: number): string {
  return `attribute${position}`;
}

export function attributeParameterName(position: number, field: "Name" | "Qualifier"): string {
  return `${attributeParameterPrefix(position)}${field}`;
}

// The attribute is found by name (and qualifier, when the condition has one) and, when the condition has a text,
// has a value that matches it. Met by a current set or, with `includeHistory`, by a replaced one.
function attributeCondition(
  condition: ResolvedAttributeCondition,
  position: number,
  includeHistory: boolean,
): { condition: string; parameters: Record<string, unknown> } {
  const predicate =
    condition.text === undefined
      ? undefined
      : createMatchPredicate(condition.text, condition.match, attributeParameterPrefix(position));
  const parameters: Record<string, unknown> = {
    [attributeParameterName(position, "Name")]: condition.name,
    ...(condition.qualifier !== undefined && {
      [attributeParameterName(position, "Qualifier")]: toQualifierKey(condition.qualifier),
    }),
    ...predicate?.parameters,
  };

  const current = currentSetCondition(condition, position, predicate?.condition);
  const replaced = includeHistory
    ? historySetCondition(condition, position, predicate?.condition)
    : undefined;

  return {
    condition: replaced === undefined ? current : `(${current} OR ${replaced})`,
    parameters,
  };
}

function currentSetCondition(
  condition: ResolvedAttributeCondition,
  position: number,
  textCondition: ((expression: string) => string) | undefined,
): string {
  const checks = [
    ...(condition.qualifier !== undefined
      ? [`qualifier = $${attributeParameterName(position, "Qualifier")}`]
      : []),
    ...(textCondition !== undefined
      ? [
          `any(candidate IN n.attributes[name][qualifier].values WHERE ${textCondition("candidate")})`,
        ]
      : []),
  ];
  const insideName = `any(qualifier IN keys(n.attributes[name]) WHERE ${checks.length > 0 ? checks.join(" AND ") : "true"})`;

  return (
    "(n.attributes IS NOT NULL AND " +
    `any(name IN keys(n.attributes) WHERE name = $${attributeParameterName(position, "Name")} AND ${insideName}))`
  );
}

function historySetCondition(
  condition: ResolvedAttributeCondition,
  position: number,
  textCondition: ((expression: string) => string) | undefined,
): string {
  const checks = [
    `h.name = $${attributeParameterName(position, "Name")}`,
    ...(condition.qualifier !== undefined
      ? [`h.qualifier = $${attributeParameterName(position, "Qualifier")}`]
      : []),
    ...(textCondition !== undefined
      ? [`any(candidate IN h.values WHERE ${textCondition("candidate")})`]
      : []),
  ];

  return `EXISTS { MATCH (n)-[:HAS_ATTRIBUTE]->(h:Attribute) WHERE ${checks.join(" AND ")} }`;
}

// The entity is mentioned by one observation (an edge, a current attribute set and, with `includeHistory`, a
// replaced one) that has ALL the parts of the filter: they are compared on the same record, never on different
// ones.
function provenanceCondition(filter: ProvenanceFilter, includeHistory: boolean): string {
  const seenBy = (record: string) => provenanceChecks(filter, record).join(" AND ");

  const sources = [
    `size([(n)-[r]-() WHERE type(r) <> "HAS_ATTRIBUTE" AND ${seenBy("r")} | r]) > 0`,
    "(n.attributes IS NOT NULL AND any(name IN keys(n.attributes) WHERE " +
      `any(qualifier IN keys(n.attributes[name]) WHERE ${seenBy("n.attributes[name][qualifier]")})))`,
    ...(includeHistory
      ? [`EXISTS { MATCH (n)-[:HAS_ATTRIBUTE]->(h:Attribute) WHERE ${seenBy("h")} }`]
      : []),
  ];

  return `(${sources.join(" OR ")})`;
}

function provenanceChecks(filter: ProvenanceFilter, record: string): string[] {
  return [
    ...(filter.tool !== undefined ? [`${record}.tool = $provenanceTool`] : []),
    ...(filter.module !== undefined ? [`${record}.module = $provenanceModule`] : []),
    ...(filter.run !== undefined ? [`${record}.run = $provenanceRun`] : []),
  ];
}

function provenanceParameters(filter: ProvenanceFilter): Record<string, string> {
  return {
    ...(filter.tool !== undefined && { provenanceTool: filter.tool }),
    ...(filter.module !== undefined && { provenanceModule: filter.module }),
    ...(filter.run !== undefined && { provenanceRun: filter.run }),
  };
}
