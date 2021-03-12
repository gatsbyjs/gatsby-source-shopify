export const pluginErrorCodes = {
  bulkOperationFailed: "111000",
  unknownSourcingFailure: "111001",
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
