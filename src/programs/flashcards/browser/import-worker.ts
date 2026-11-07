import initSqlJs from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import { importAnki } from "../core/anki";

// Keeping SQLite and ZIP parsing in a worker protects pointer and touch input during import.
self.onmessage = async (event: MessageEvent<ArrayBuffer>) => {
  try {
    const SQL = await initSqlJs({ locateFile: () => wasmUrl });
    const collection = importAnki(new Uint8Array(event.data), SQL);
    self.postMessage({ collection });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : "Could not read the package.",
    });
  }
};
