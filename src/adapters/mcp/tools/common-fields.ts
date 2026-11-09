import { z } from "zod";

// The fields that several tools take, written once so every tool describes them to the AI in the same words.

// The two fields that name one entity.
export const entityFields = {
  type: z.string().describe("The entity type, for example IP_ADDRESS or INTERNET_NAME."),
  value: z.string().describe("The entity value, for example 104.21.2.94."),
};

// How long a read may take. Optional: without it the default of the repository applies.
export const timeoutMsField = z
  .number()
  .int()
  .min(1)
  .optional()
  .describe("How long the read may take, in milliseconds (default 30000).");

// The options of a read with a time limit, from what the tool received.
export function timeLimitOf(timeoutMs: number | undefined): { timeoutMs?: number } {
  return timeoutMs === undefined ? {} : { timeoutMs };
}
