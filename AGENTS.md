A self-contained, portable web application platform ("web OS").

## Commands

Use npm scripts as the project entry points:

- `npm run dev`: start the frontend development server.
- `npm run dev:kernel`: start the Rust API server. Run alongside `npm run dev`, in a separate console.
- `npm run build`: type-check and bundle the frontend, then build the release executable
  with the assets embedded.
- `npm run test`: run frontend tests plus debug and release Rust tests.

Focused commands are available when needed:

- `npm run build:frontend`: type-check and build only the frontend bundle.
- `npm run test:frontend`: run only frontend tests.
- `npm run test:kernel`: run debug Rust tests.
- `npm run test:kernel:release`: rebuild the frontend bundle and run release Rust tests.

Cargo does not invoke Vite or Node.js. `cargo run` is API-only, and
`cargo build --release` requires an existing `target/userland-static-bundle/`.
Use `npm run build` for production builds.

## Verification

- Do not run TypeScript checks, frontend builds, or broad test suites after every small change.
  Run only the focused verification relevant to the change, or run broader checks when the user
  requests them or before a meaningful handoff.

## Pull requests

- When the user says "make a PR thing", create a pull request for the current branch with
  GitHub CLI, then rebase-merge it and delete the remote branch.

## Frontend structure

- Use `kebab-case` directory names for feature areas, such as `components/window-manager/`.
- Put one exported component in each `PascalCase.tsx` file. Name components for one entity
  in singular form; use plural names only for collection renderers, such as `WindowsOutlet`.
- Keep types and helpers within a feature directory until another feature needs them. Promote
  only framework-independent, reusable utilities to `src/lib/`.
- Name context modules `FeatureContext.tsx`; export a matching `FeatureProvider` and
  `useFeature` hook.
- Co-locate component tests as `Component.test.tsx`.
- Prefer explicit relative imports over barrel files unless a feature develops a deliberate
  public API.
- Declare an explicit `public`, `protected`, or `private` access modifier on every class method.

## Markup roles

- The `x-role` attribute is sacred: it defines stable semantic roles in the web OS markup.
  Preserve every existing `x-role` value verbatim. Never remove, rename, repurpose, or replace
  one without explicit user approval; add one to canonical structural elements when needed.

## Comment rules

Use comments to explain intent, behavior, or constraints that are not obvious from the code. Keep inline comments brief and close to the code they explain; avoid narrating straightforward operations. Add JSDoc to exported classes and public methods when it helps callers understand their purpose, parameters, return values, examples, or failure modes. Write JSDoc as multiline blocks with a concise summary first, followed by relevant tags such as `@param`, `@returns`, `@example`, and `@throws`. Put the opening `/**` and closing `*/` delimiters on their own lines. Keep descriptions specific and useful, and update comments when behavior changes.

The following class demonstrates the preferred JSDoc style and level of detail:

````typescript
/**
 * A generic history manager for navigation.
 * Stores documents, supports back/forward navigation, and allows user to define cleanup logic.
 * Uses `setOnDocumentChanged` for callback — encapsulates it.
 *
 * @example
 * ```ts
 * const history = new NavigationHistoryStack<FileDocument>()
 *   .setOnDocumentChangedHandler(() => {
 *     console.log("File changed!");
 *   })
 *   .setOnDocumentCleanupHandler((doc) => doc.cleanUpResources());
 * history.navigate(file);
 * history.goBack();
 * history.goForward();
 * ```
 *
 * @param T The type of document stored in the history.
 */
export class NavigationHistoryStack<T> {
  private backStack: T[];
  private backStackPointer: number | null;
  private callbackCleanUpDocument: ((document: T) => void) | null;
  private callbackOnDocumentChanged: (() => void) | null;

  /**
   * Creates a new navigation history.
   *
   * @param opts.callbackCleanUpDocument
   * @param opts.onDocumentChanged The callback to call when document changes.
   */
  public constructor() {
    this.backStack = [];
    this.backStackPointer = null;
    this.callbackCleanUpDocument = null;
    this.callbackOnDocumentChanged = null;
  }

  /**
   * Sets a new document handler for discarding a `T` (e.g., remove DOM element).
   *
   * @param handler The callback to cleanup the document.
   * @returns this, for chaining.
   */
  public setOnDocumentCleanupHandler(handler: ((document: T) => void) | null) {
    this.callbackCleanUpDocument = handler;
    return this;
  }

  /**
   * Sets a new document handler for when a document changes.
   *
   * @param handler The callback to call when document changes.
   * @returns this, for chaining.
   */
  public setOnDocumentChangedHandler(handler: (() => void) | null) {
    this.callbackOnDocumentChanged = handler;
    return this;
  }

  /**
   * Adds a document to the history, from the current backStackPointer location.
   *
   * @param document The document to add.
   */
  public navigate(document: T) {
    // if the pointer is not null, clean all docs beyond it
    if (this.backStackPointer !== null && this.callbackCleanUpDocument) {
      this.backStack.slice(this.backStackPointer + 1).forEach(this.callbackCleanUpDocument);
    }

    this.backStackPointer = this.backStackPointer === null ? 0 : this.backStackPointer + 1;
    this.backStack = [...this.backStack.slice(0, this.backStackPointer), document];

    this.callbackOnDocumentChanged?.();
  }

  /**
   * Checks if can go back.
   *
   * @returns true if there is a previous document.
   */
  public canGoBack() {
    return this.backStackPointer !== null && this.backStackPointer > 0;
  }

  /**
   * Goes back one step.
   *
   * @returns this, for chaining.
   */
  public goBack() {
    if (this.canGoBack()) {
      this.backStackPointer!--;
      this.callbackOnDocumentChanged?.();
    }
    return this;
  }

  /**
   * Checks if can go forward.
   *
   * @returns true if there is a next document.
   */
  public canGoForward() {
    return this.backStackPointer !== null && this.backStackPointer < this.backStack.length - 1;
  }

  /**
   * Goes forward one step.
   *
   * @returns this, for chaining.
   */
  public goForward() {
    if (this.canGoForward()) {
      this.backStackPointer!++;
      this.callbackOnDocumentChanged?.();
    }
    return this;
  }

  /**
   * Gets the current document.
   *
   * @returns the current document or `null`.
   */
  public getCurrentDocument() {
    if (this.backStackPointer === null) return null;
    return this.backStack.at(this.backStackPointer) ?? null;
  }

  /**
   * Cleans up all documents.
   *
   * Removes all documents, unbinds callbacks.
   */
  public cleanUpResources() {
    if (this.callbackCleanUpDocument) this.backStack.forEach(this.callbackCleanUpDocument);
    this.backStackPointer = null;
    this.callbackCleanUpDocument = null;
    this.callbackOnDocumentChanged = null;
  }
}
````

## Errors

- Public application and library APIs that can fail in a recoverable way must throw exported,
  named error classes rather than an unadorned `Error`.
- Define one error class for each meaningful, catchable failure condition and preserve runtime
  `instanceof` behavior.
- Document every public throwing API with `@throws {SpecificError}` entries.
- Format JSDoc as multiline blocks: use a summary line and put each `@throws` tag on its own line.
- Across HTTP boundaries, use stable machine-readable error codes and map them to the matching
  client-side error classes.
- Reserve generic errors for unrecoverable programmer bugs and internal assertions.
