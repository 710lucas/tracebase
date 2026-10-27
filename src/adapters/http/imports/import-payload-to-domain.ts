import { createAttribute, type Attribute } from "../../../core/domain/attribute/index.ts";
import { createEntity } from "../../../core/domain/entity/index.ts";
import { createProvenance } from "../../../core/domain/provenance/index.ts";
import { createRelation, type Relation } from "../../../core/domain/relation/index.ts";
import type { ImportPayloadDTO } from "./import-payload-schema.ts";

export interface ImportedDomainObjects {
  relations: Relation[];
  attributes: Attribute[];
}

// Turns a payload that already has the right structure into domain objects. The batch `source`
// (tool and run) and `recordedAt` (when our system received the batch) are merged into every item's
// provenance, so a batch cannot contradict itself and all its items share one `recordedAt`.
//
// The `create*` functions check the content and throw the domain's own errors when something is
// wrong; this function lets them through for the controller to answer.
export function importPayloadToDomain(
  payload: ImportPayloadDTO,
  recordedAt: number,
): ImportedDomainObjects {
  // Built once up front, so a bad `source` is rejected even when the batch has no items.
  const batchProvenance = createProvenance({ ...payload.source, recordedAt });
  const buildItemProvenance = (itemProvenance: object | undefined) =>
    createProvenance({ ...batchProvenance, ...itemProvenance });

  const relations = payload.relations.map((relationPayload) =>
    createRelation({
      source: createEntity(relationPayload.source.type, relationPayload.source.value),
      target: createEntity(relationPayload.target.type, relationPayload.target.value),
      provenance: buildItemProvenance(relationPayload.provenance),
      ...(relationPayload.type !== undefined && { type: relationPayload.type }),
      ...(relationPayload.viaRecordRefs !== undefined && {
        viaRecordRefs: relationPayload.viaRecordRefs,
      }),
    }),
  );

  const attributes = payload.attributes.map((attributePayload) =>
    createAttribute({
      entity: createEntity(attributePayload.entity.type, attributePayload.entity.value),
      name: attributePayload.name,
      value: attributePayload.value,
      provenance: buildItemProvenance(attributePayload.provenance),
    }),
  );

  return { relations, attributes };
}
