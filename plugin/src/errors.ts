export class OperationError extends Error {
  public node: BulkOperationNode;

  constructor(node: BulkOperationNode) {
    const { errorCode, id } = node;
    super(`Operation ${id} failed with ${errorCode}`);
    Object.setPrototypeOf(this, OperationError.prototype);
    this.node = node;
  }
}
