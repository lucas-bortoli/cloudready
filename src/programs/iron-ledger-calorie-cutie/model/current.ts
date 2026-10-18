import { migrateV1ToV2 } from "./migrations/v001-to-v002";
import type { DataFile as V2DataFile } from "./v002";

const CURRENT_VERSION = 2;
type CurrentDataFile = V2DataFile;
// Only re-export everything from the current version. ALWAYS keep this up-to-date.
export * from "./v002";

const migrations = {
  1: migrateV1ToV2,
} as const;

/** An unsupported or malformed persisted ledger file. */
export class InvalidDataFileError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "InvalidDataFileError";
  }
}

/**
 * Migrates a persisted ledger one version at a time to the current schema.
 *
 * @param input The parsed JSON value read from the ledger file.
 * @returns A validated data file in the current schema version.
 * @throws {InvalidDataFileError} If the input is malformed or its version is unsupported.
 */
export function migrate(input: unknown): CurrentDataFile {
  if (typeof input !== "object" || input === null || !("version" in input)) {
    throw new InvalidDataFileError("Ledger data must be an object with an integer version.");
  }

  const version = input.version;
  if (
    typeof version !== "number" ||
    !Number.isInteger(version) ||
    version < 1 ||
    version > CURRENT_VERSION
  ) {
    throw new InvalidDataFileError(`Unsupported ledger version: ${String(input.version)}.`);
  }

  let data = input as { version: number };
  while (data.version < CURRENT_VERSION) {
    const migration = migrations[data.version as keyof typeof migrations];
    if (!migration) {
      throw new InvalidDataFileError(`No migration is available from version ${data.version}.`);
    }

    data = migration(data as never);
  }

  return data as CurrentDataFile;
}
