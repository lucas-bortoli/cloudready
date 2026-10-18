import type { DataFile as V1DataFile } from "../v001";
import type { DataFile as V2DataFile } from "../v002";

/**
 * Migrates a validated version 1 ledger to version 2.
 *
 * @param v1 A validated version 1 data file.
 * @returns A new version 2 data file.
 */
export function migrateV1ToV2(v1: V1DataFile): V2DataFile {
  return { ...v1, version: 2 };
}
