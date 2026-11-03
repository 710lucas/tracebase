import { createAttribute, type Attribute } from "../../../core/domain/attribute/index.ts";
import { createEntity } from "../../../core/domain/entity/index.ts";
import { createProvenance } from "../../../core/domain/provenance/index.ts";
import { createRelation, type Relation } from "../../../core/domain/relation/index.ts";
import type { ImportPayloadDTO } from "./import-payload-schema.ts";
import { InvalidImportItemError } from "./invalid-import-item-error.ts";
import { isDomainValidationError } from "./is-domain-validation-error.ts";

export interface ImportedDomainObjects {
  relations: Relation[];
  attributes: Attribute[];
}

// Turns a payload that already has the right structure into domain objects. The batch `source`
// (tool and run) and `recordedAt` (when our system received the batch) are merged into every item's
// provenance, so a batch cannot contradict itself and all its items share one `recordedAt`.
//
// The `create*` functions check the content and throw the domain's own errors when something is
// wrong. For an item of the batch, the error is raised again as an `InvalidImportItemError` that says
// which item it was; an error about the batch `source` is not about an item and goes through as it is.
// Either way the controller answers it.
export function importPayloadToDomain(
  payload: ImportPayloadDTO,
  recordedAt: number,
): ImportedDomainObjects {
  // Built once up front, so a bad `source` is rejected even when the batch has no items.
  const batchProvenance = createProvenance({ ...payload.source, recordedAt });
  const buildItemProvenance = (itemProvenance: object | undefined) =>
    createProvenance({ ...batchProvenance, ...itemProvenance });

  const relations = payload.relations.map((relationPayload, index) =>
    buildItem(`relations.${index}`, () =>
      createRelation({
        source: createEntity(relationPayload.source.type, relationPayload.source.value),
        target: createEntity(relationPayload.target.type, relationPayload.target.value),
        provenance: buildItemProvenance(relationPayload.provenance),
        ...(relationPayload.type !== undefined && { type: relationPayload.type }),
        ...(relationPayload.viaRecordRefs !== undefined && {
          viaRecordRefs: relationPayload.viaRecordRefs,
        }),
      }),
    ),
  );

  const attributes = payload.attributes.map((attributePayload, index) =>
    buildItem(`attributes.${index}`, () =>
      createAttribute({
        entity: createEntity(attributePayload.entity.type, attributePayload.entity.value),
        name: attributePayload.name,
        values: attributePayload.values,
        ...(attributePayload.qualifier !== undefined && { qualifier: attributePayload.qualifier }),
        provenance: buildItemProvenance(attributePayload.provenance),
      }),
    ),
  );

  return { relations, attributes };
}

// Builds one item of the batch, and says which one it was when the domain rejects it.
function buildItem<Item>(path: string, build: () => Item): Item {
  try {
    return build();
  } catch (error) {
    if (isDomainValidationError(error)) {
      throw new InvalidImportItemError(path, error);
    }
    throw error;
  }
}
