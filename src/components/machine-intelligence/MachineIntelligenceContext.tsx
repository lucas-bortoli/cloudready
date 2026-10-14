import { createContext, onCleanup, useContext, type JSX } from "solid-js";
import { KernelRpcApiError } from "../../lib/kernel-rpc/core";
import {
  miDisconnect,
  miGenerateText,
  miGetAuthorization,
  miGetConnection,
  miListModels,
  miStartAuthorization,
} from "../../lib/kernel-rpc/machine-intelligence";
import {
  ChatGptAuthorizationError,
  ChatGptIncompleteResponseError,
  ChatGptModelUnavailableError,
  ChatGptNotConnectedError,
  ChatGptPermissionError,
  ChatGptPopupBlockedError,
  ChatGptReauthorizationRequiredError,
  ChatGptUsageLimitError,
  MachineIntelligenceProviderDisposedError,
  MachineIntelligenceProviderMissingError,
  MachineIntelligenceInvalidInputError,
  MachineIntelligenceServerError,
} from "./errors";

export type MachineIntelligenceConnection = Readonly<{ connected: boolean; email: string | null }>;
export type MachineIntelligenceModel = Readonly<{ slug: string; displayName: string }>;

/**
 * A profile-bound client for ChatGPT plan requests.
 */
export class MachineIntelligenceClient {
  private active = true;

  public dispose(): void {
    this.active = false;
  }

  /**
   * Gets connection status for the active CloudReady profile.
   *
   * @throws {MachineIntelligenceProviderDisposedError} When its provider is gone.
   * @throws {KernelRpcNetworkError} When the kernel cannot be reached.
   * @throws {KernelRpcProtocolError} When the kernel response is malformed.
   * @throws {MachineIntelligenceServerError} When the service rejects the request.
   */
  public async connection(): Promise<MachineIntelligenceConnection> {
    return this.run(miGetConnection);
  }

  /**
   * Opens ChatGPT sign-in from a user gesture and waits for the callback.
   *
   * @throws {ChatGptPopupBlockedError} When the browser blocks the window.
   * @throws {ChatGptAuthorizationError} When sign-in fails or times out.
   * @throws {ChatGptPermissionError} When plan use was not granted.
   * @throws {KernelRpcNetworkError} When the kernel cannot be reached.
   * @throws {MachineIntelligenceServerError} When the service rejects the request.
   */
  public async connect(): Promise<MachineIntelligenceConnection> {
    this.assertActive();
    // Opening before the first await retains the click's popup permission.
    const popup = window.open("about:blank", "_blank");
    if (!popup) throw new ChatGptPopupBlockedError("Allow popups to connect ChatGPT.");
    popup.opener = null;
    try {
      const attempt = await this.run(miStartAuthorization);
      popup.location.replace(attempt.url);
      const deadline = Date.now() + 5 * 60_000;
      while (Date.now() < deadline) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, 1000));
        this.assertActive();
        const result = await this.run(() => miGetAuthorization(attempt.attempt_id));
        if (result.status === "succeeded") return this.connection();
        if (result.status === "failed") {
          if (result.error === "mi-permission-missing") {
            throw new ChatGptPermissionError("ChatGPT plan use was not granted.");
          }
          throw new ChatGptAuthorizationError("ChatGPT sign-in was not completed.");
        }
      }
      throw new ChatGptAuthorizationError("ChatGPT sign-in timed out.");
    } catch (error) {
      if (!popup.closed) popup.close();
      throw error;
    }
  }

  /**
   * Disconnects the current ChatGPT account and reports whether revocation was confirmed.
   *
   * @throws {KernelRpcNetworkError} When the kernel cannot be reached.
   * @throws {MachineIntelligenceServerError} When the service rejects the request.
   */
  public async disconnect(): Promise<{ revoked: boolean }> {
    return this.run(miDisconnect);
  }

  /**
   * Lists models available to the connected ChatGPT account.
   *
   * @throws {ChatGptNotConnectedError} When no account is connected.
   * @throws {ChatGptReauthorizationRequiredError} When the account needs to sign in again.
   * @throws {KernelRpcNetworkError} When the kernel cannot be reached.
   */
  public async models(): Promise<readonly MachineIntelligenceModel[]> {
    const models = await this.run(miListModels);
    return models.map((model) => ({ slug: model.slug, displayName: model.display_name }));
  }

  /**
   * Sends one text prompt and resolves after the Responses stream completes.
   *
   * @throws {ChatGptNotConnectedError} When no account is connected.
   * @throws {ChatGptModelUnavailableError} When the model is unavailable.
   * @throws {ChatGptUsageLimitError} When the account has reached its limit.
   * @throws {ChatGptIncompleteResponseError} When the stream ends without completion.
   * @throws {MachineIntelligenceInvalidInputError} When model or prompt input is invalid.
   * @throws {ChatGptReauthorizationRequiredError} When the account needs to sign in again.
   * @throws {KernelRpcNetworkError} When the kernel cannot be reached.
   */
  public async generateText(model: string, input: string): Promise<string> {
    return (await this.run(() => miGenerateText(model, input))).text;
  }

  private assertActive(): void {
    if (!this.active) {
      throw new MachineIntelligenceProviderDisposedError("MachineIntelligenceProvider is gone.");
    }
  }

  private async run<T>(operation: () => Promise<T>): Promise<T> {
    this.assertActive();
    try {
      return await operation();
    } catch (error) {
      if (error instanceof KernelRpcApiError) {
        const options = { cause: error };
        switch (error.code) {
          case "mi-not-connected":
            throw new ChatGptNotConnectedError(error.message, options);
          case "mi-attempt-missing":
          case "mi-authorization-denied":
          case "mi-invalid-authorization":
            throw new ChatGptAuthorizationError(error.message, options);
          case "mi-permission-missing":
            throw new ChatGptPermissionError(error.message, options);
          case "mi-reauthorization-required":
            throw new ChatGptReauthorizationRequiredError(error.message, options);
          case "mi-model-unavailable":
            throw new ChatGptModelUnavailableError(error.message, options);
          case "mi-usage-limit":
            throw new ChatGptUsageLimitError(error.message, options);
          case "mi-incomplete-response":
            throw new ChatGptIncompleteResponseError(error.message, options);
          case "mi-invalid-input":
            throw new MachineIntelligenceInvalidInputError(error.message, options);
          default:
            throw new MachineIntelligenceServerError(error.message, options);
        }
      }
      throw error;
    }
  }
}

const MachineIntelligenceContext = createContext<MachineIntelligenceClient>();
let activeClient: MachineIntelligenceClient | undefined;

/**
 * Makes a profile-bound client available to the active desktop.
 */
export function MachineIntelligenceProvider(props: { children: JSX.Element }) {
  const client = new MachineIntelligenceClient();
  activeClient = client;
  onCleanup(() => {
    client.dispose();
    if (activeClient === client) activeClient = undefined;
  });
  return (
    <MachineIntelligenceContext.Provider value={client}>
      {props.children}
    </MachineIntelligenceContext.Provider>
  );
}

/**
 * Creates an imperative client bound to the mounted provider.
 *
 * @throws {MachineIntelligenceProviderMissingError} When no active provider exists.
 */
export function createClient(): MachineIntelligenceClient {
  if (!activeClient) {
    throw new MachineIntelligenceProviderMissingError("MachineIntelligenceProvider is missing.");
  }
  return activeClient;
}

/**
 * Gets the provider client from a Solid component.
 *
 * @throws {MachineIntelligenceProviderMissingError} When no provider is present.
 */
export function useClient(): MachineIntelligenceClient {
  const client = useContext(MachineIntelligenceContext);
  if (!client) {
    throw new MachineIntelligenceProviderMissingError("MachineIntelligenceProvider is missing.");
  }
  return client;
}
