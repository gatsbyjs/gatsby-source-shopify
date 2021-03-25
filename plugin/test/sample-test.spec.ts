import { graphql } from "msw";
import { setupServer } from "msw/node";
import { SourceNodesArgs } from "gatsby";

import { createOperations } from "../src/operations";

const server = setupServer(
  graphql.query("OPERATION_BY_ID", (req, res, ctx) => {
    return res(
      ctx.data({
        node: {
          id: req.body?.variables?.id,
          status: `COMPLETED`,
        },
      })
    );
  })
);

beforeAll(() => {
  server.listen();
});

afterAll(() => {
  server.close();
});

test("Sample test", async () => {
  const mock = jest.fn().mockImplementation(() => ({
    reporter: {},
  }));

  const args = mock as jest.Mock<SourceNodesArgs>;

  const operations = createOperations(
    {
      apiKey: "12345",
      password: "12345",
      storeUrl: "my-shop.shopify.com",
    },
    args()
  );

  const resp = await operations.completedOperation(`12345`, () => {});

  expect(resp.node.status).toEqual(`COMPLETED`);
  expect(resp.node.id).toEqual(`12345`);
});
