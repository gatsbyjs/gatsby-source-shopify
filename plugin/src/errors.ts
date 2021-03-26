import { Response } from "node-fetch";

export const pluginErrorCodes = {
  bulkOperationFailed: "111000",
  unknownSourcingFailure: "111001",
  unknownApiError: "111002",
};

export class OperationError extends Error {
  public node: BulkOperationNode;

  constructor(node: BulkOperationNode) {
    const { errorCode, id } = node;
    super(`Operation ${id} failed with ${errorCode}`);
    Object.setPrototypeOf(this, OperationError.prototype);
    this.node = node;
  }
}

export class HttpError extends Error {
  public response: Response;

  constructor(response: Response) {
    super(response.statusText);
    Object.setPrototypeOf(this, HttpError.prototype);
    this.response = response;
  }
}
