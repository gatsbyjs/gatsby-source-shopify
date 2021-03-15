import { graphql, rest } from "msw";
import { setupServer } from "msw/node";
import { SourceNodesArgs } from "gatsby";

import { makeSourceFromOperation } from "../src/make-source-from-operation";
import {
  BulkOperationCancelResponse,
  BulkOperationRunQueryResponse,
  createOperations,
} from "../src/operations";
import { pluginErrorCodes } from "../src/errors";

const server = setupServer();

// @ts-ignore
global.setTimeout = (fn: Function) => fn();

beforeAll(() => {
  server.listen();
});

afterEach(() => {
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});

describe("A production build", () => {
  const bulkResult = { id: "gid://shopify/Product/12345" };

  beforeEach(() => {
    server.use(
      graphql.query<CurrentBulkOperationResponse>(
        "OPERATION_STATUS",
        (_req, res, ctx) => {
          return res.once(
            ctx.data({
              currentBulkOperation: {
                id: ``,
                status: `RUNNING`,
              },
            })
          );
        }
      ),
      graphql.mutation<BulkOperationCancelResponse>(
        "CANCEL_OPERATION",
        (_req, res, ctx) => {
          return res(
            ctx.data({
              bulkOperationCancel: {
                bulkOperation: {
                  id: "",
                  status: "CANCELING",
                  objectCount: "0",
                  url: "",
                  query: "",
                },
                userErrors: [],
              },
            })
          );
        }
      ),
      graphql.query<CurrentBulkOperationResponse>(
        "OPERATION_STATUS",
        (_req, res, ctx) => {
          return res(
            ctx.data({
              currentBulkOperation: {
                id: ``,
                status: `CANCELED`,
              },
            })
          );
        }
      ),
      graphql.mutation<BulkOperationRunQueryResponse>(
        "INITIATE_BULK_OPERATION",
        (_req, res, ctx) => {
          return res(
            ctx.data({
              bulkOperationRunQuery: {
                bulkOperation: {
                  id: "",
                  objectCount: "0",
                  query: "",
                  status: "CREATED",
                  url: "",
                },
                userErrors: [],
              },
            })
          );
        }
      ),
      graphql.query<{ node: BulkOperationNode }>(
        "OPERATION_BY_ID",
        (_req, res, ctx) => {
          return res(
            ctx.data({
              node: {
                status: `COMPLETED`,
                id: "",
                objectCount: "1",
                query: "",
                url: "http://results.url",
              },
            })
          );
        }
      ),
      rest.get("http://results.url", (_req, res, ctx) => {
        return res(ctx.text(JSON.stringify(bulkResult)));
      })
    );
  });

  it("cancels other operations in progress", async () => {
    const createNode = jest.fn();
    const gatsbyApiMock = jest.fn().mockImplementation(() => {
      return {
        cache: {
          set: jest.fn(),
        },
        actions: {
          createNode,
        },
        createContentDigest: jest.fn(),
        createNodeId: jest.fn(),
        reporter: {
          info: jest.fn(),
          error: jest.fn(),
          panic: jest.fn(),
          activityTimer: () => ({
            start: jest.fn(),
            end: jest.fn(),
            setStatus: jest.fn(),
          }),
        },
      };
    });

    const gatsbyApi = gatsbyApiMock as jest.Mock<SourceNodesArgs>;
    const options = {
      apiKey: ``,
      password: ``,
      storeUrl: "my-shop.shopify.com",
    };
    const operations = createOperations(options, gatsbyApi());

    const sourceFromOperation = makeSourceFromOperation(
      operations.finishLastOperation,
      operations.completedOperation,
      operations.cancelOperationInProgress,
      gatsbyApi(),
      options
    );

    await sourceFromOperation(operations.createProductsOperation, true);

    expect(createNode).toHaveBeenCalledWith(
      expect.objectContaining({ shopifyId: bulkResult.id })
    );
  });
});

describe("When an operation gets canceled", () => {
  const bulkResult = { id: "gid://shopify/Product/12345" };

  beforeEach(() => {
    server.use(
      graphql.query<CurrentBulkOperationResponse>(
        "OPERATION_STATUS",
        (_req, res, ctx) => {
          return res(
            ctx.data({
              currentBulkOperation: {
                id: ``,
                status: `COMPLETED`,
              },
            })
          );
        }
      ),
      graphql.mutation<BulkOperationRunQueryResponse>(
        "INITIATE_BULK_OPERATION",
        (_req, res, ctx) => {
          return res(
            ctx.data({
              bulkOperationRunQuery: {
                bulkOperation: {
                  id: "",
                  objectCount: "0",
                  query: "",
                  status: "CREATED",
                  url: "",
                },
                userErrors: [],
              },
            })
          );
        }
      ),
      graphql.query<{ node: BulkOperationNode }>(
        "OPERATION_BY_ID",
        (_req, res, ctx) => {
          return res.once(
            ctx.data({
              node: {
                status: `CANCELED`,
                id: "",
                objectCount: "0",
                query: "",
                url: "",
              },
            })
          );
        }
      ),
      graphql.query<{ node: BulkOperationNode }>(
        "OPERATION_BY_ID",
        (_req, res, ctx) => {
          return res(
            ctx.data({
              node: {
                status: `COMPLETED`,
                id: "",
                objectCount: "1",
                query: "",
                url: "http://results.url",
              },
            })
          );
        }
      ),
      rest.get("http://results.url", (_req, res, ctx) => {
        return res(ctx.text(JSON.stringify(bulkResult)));
      })
    );
  });

  it("tries again", async () => {
    const createNode = jest.fn();
    const gatsbyApiMock = jest.fn().mockImplementation(() => {
      return {
        cache: {
          set: jest.fn(),
        },
        actions: {
          createNode,
        },
        createContentDigest: jest.fn(),
        createNodeId: jest.fn(),
        reporter: {
          info: jest.fn(),
          error: jest.fn(),
          panic: jest.fn(),
          activityTimer: () => ({
            start: jest.fn(),
            end: jest.fn(),
            setStatus: jest.fn(),
          }),
        },
      };
    });

    const gatsbyApi = gatsbyApiMock as jest.Mock<SourceNodesArgs>;
    const options = {
      apiKey: ``,
      password: ``,
      storeUrl: "my-shop.shopify.com",
    };
    const operations = createOperations(options, gatsbyApi());

    const sourceFromOperation = makeSourceFromOperation(
      operations.finishLastOperation,
      operations.completedOperation,
      operations.cancelOperationInProgress,
      gatsbyApi(),
      options
    );

    await sourceFromOperation(operations.createProductsOperation);

    expect(createNode).toHaveBeenCalledWith(
      expect.objectContaining({ shopifyId: bulkResult.id })
    );
  });
});

describe("When an operation fails with bad credentials", () => {
  beforeEach(() => {
    server.use(
      graphql.query<CurrentBulkOperationResponse>(
        "OPERATION_STATUS",
        (_req, res, ctx) => {
          return res(
            ctx.data({
              currentBulkOperation: {
                id: ``,
                status: `COMPLETED`,
              },
            })
          );
        }
      ),
      graphql.mutation<BulkOperationRunQueryResponse>(
        "INITIATE_BULK_OPERATION",
        (_req, res, ctx) => {
          return res(
            ctx.data({
              bulkOperationRunQuery: {
                bulkOperation: {
                  id: "",
                  objectCount: "0",
                  query: "",
                  status: "CREATED",
                  url: "",
                },
                userErrors: [],
              },
            })
          );
        }
      ),
      graphql.query<{ node: BulkOperationNode }>(
        "OPERATION_BY_ID",
        (_req, res, ctx) => {
          return res(
            ctx.data({
              node: {
                status: `FAILED`,
                id: "",
                objectCount: "0",
                query: "",
                url: "",
                errorCode: `ACCESS_DENIED`,
              },
            })
          );
        }
      )
    );
  });

  it("panics and reports the error code", async () => {
    const panic = jest.fn();
    const gatsbyApiMock = jest.fn().mockImplementation(() => {
      return {
        cache: {
          set: jest.fn(),
        },
        actions: {
          createNode: jest.fn(),
        },
        reporter: {
          info: jest.fn(),
          error: jest.fn(),
          panic,
          activityTimer: () => ({
            start: jest.fn(),
            end: jest.fn(),
            setStatus: jest.fn(),
          }),
        },
      };
    });

    const gatsbyApi = gatsbyApiMock as jest.Mock<SourceNodesArgs>;
    const options = {
      apiKey: ``,
      password: ``,
      storeUrl: "my-shop.shopify.com",
    };
    const operations = createOperations(options, gatsbyApi());

    const sourceFromOperation = makeSourceFromOperation(
      operations.finishLastOperation,
      operations.completedOperation,
      operations.cancelOperationInProgress,
      gatsbyApi(),
      options
    );

    await sourceFromOperation(operations.createProductsOperation);
    expect(panic).toHaveBeenCalledWith(
      expect.objectContaining({
        id: pluginErrorCodes.unknownSourcingFailure,
        context: {
          sourceMessage: expect.stringContaining(`ACCESS_DENIED`),
        },
      })
    );
  });
});
