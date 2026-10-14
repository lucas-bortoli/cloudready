/**
 * Base class for recoverable machine intelligence failures.
 */
export class MachineIntelligenceError extends Error {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class MachineIntelligenceProviderMissingError extends MachineIntelligenceError {}
export class MachineIntelligenceProviderDisposedError extends MachineIntelligenceError {}
export class ChatGptPopupBlockedError extends MachineIntelligenceError {}
export class ChatGptAuthorizationError extends MachineIntelligenceError {}
export class ChatGptPermissionError extends MachineIntelligenceError {}
export class ChatGptNotConnectedError extends MachineIntelligenceError {}
export class ChatGptReauthorizationRequiredError extends MachineIntelligenceError {}
export class ChatGptModelUnavailableError extends MachineIntelligenceError {}
export class ChatGptUsageLimitError extends MachineIntelligenceError {}
export class ChatGptIncompleteResponseError extends MachineIntelligenceError {}
export class MachineIntelligenceInvalidInputError extends MachineIntelligenceError {}
export class MachineIntelligenceServerError extends MachineIntelligenceError {}
