import fetch from "node-fetch";
import { createNodeHelpers } from "gatsby-node-helpers";
import { createInterface } from "readline";
import {
  createOperations,
  ShopifyBulkOperation,
  BulkResults,
} from "./operations";
import { nodeBuilder } from "./node-builder";
import { eventsApi } from "./events";
import {
  CreateResolversArgs,
  CreateSchemaCustomizationArgs,
  NodePluginArgs,
  PluginOptionsSchemaArgs,
  SourceNodesArgs,
} from "gatsby";
import { getGatsbyImageResolver } from "gatsby-plugin-image/graphql-utils";
import { resolveGatsbyImageData } from "./resolve-gatsby-image-data";

const LAST_SHOPIFY_BULK_OPERATION = `LAST_SHOPIFY_BULK_OPERATION`;

const errorCodes = {
  bulkOperationFailed: "111000",
  unknownSourcingFailure: "111001",
};

export function pluginOptionsSchema({ Joi }: PluginOptionsSchemaArgs) {
  return Joi.object({
    apiKey: Joi.string().required(),
    password: Joi.string().required(),
    storeUrl: Joi.string().required(),
    downloadImages: Joi.boolean(),
    shopifyConnections: Joi.array()
      .default([])
      .items(Joi.string().valid("orders", "collections")),
  });
}

function makeSourceFromOperation(
  finishLastOperation: () => Promise<void>,
  completedOperation: (
    id: string
  ) => Promise<{ node: { objectCount: string; url: string } }>,
  gatsbyApi: SourceNodesArgs,
  options: ShopifyPluginOptions
) {
  return async function sourceFromOperation(op: ShopifyBulkOperation) {
    const {
      reporter,
      actions,
      createNodeId,
      createContentDigest,
      cache,
    } = gatsbyApi;

    try {
      const operationTimer = reporter.activityTimer(
        `Sourced from bulk operation`
      );
      operationTimer.start();

      const nodeHelpers = createNodeHelpers({
        typePrefix: `Shopify`,
        createNodeId,
        createContentDigest,
      });

      reporter.info(`Checking for operations in progress`);
      await finishLastOperation();

      reporter.info(`Initiating bulk operation query`);
      const {
        bulkOperationRunQuery: { userErrors, bulkOperation },
      } = await op.execute();

      if (userErrors.length) {
        reporter.panic(
          {
            id: errorCodes.bulkOperationFailed,
            context: {
              sourceMessage: `Couldn't perform bulk operation`,
            },
          },
          userErrors
        );
      }

      await cache.set(LAST_SHOPIFY_BULK_OPERATION, bulkOperation.id);

      let resp = await completedOperation(bulkOperation.id);
      reporter.info(`Completed bulk operation`);

      if (parseInt(resp.node.objectCount, 10) === 0) {
        reporter.info(`No data was returned for this operation`);
        operationTimer.end();
        return;
      }

      const results = await fetch(resp.node.url);

      const rl = createInterface({
        input: results.body,
        crlfDelay: Infinity,
      });

      reporter.info(`Creating nodes from bulk operation ${op.name}`);

      const objects: BulkResults = [];

      for await (const line of rl) {
        objects.unshift(JSON.parse(line));
      }

      await Promise.all(
        op
          .process(objects, nodeBuilder(nodeHelpers, gatsbyApi, options))
          .map(async (promise) => {
            const node = await promise;
            actions.createNode(node);
          })
      );

      operationTimer.end();

      await cache.set(LAST_SHOPIFY_BULK_OPERATION, undefined);
    } catch (e) {
      reporter.panic(
        {
          id: errorCodes.unknownSourcingFailure,
          context: {
            sourceMessage: `Could not source from bulk operation`,
          },
        },
        e
      );
    }
  };
}

async function sourceAllNodes(
  gatsbyApi: SourceNodesArgs,
  pluginOptions: ShopifyPluginOptions
) {
  const {
    createProductsOperation,
    createOrdersOperation,
    createCollectionsOperation,
    finishLastOperation,
    completedOperation,
  } = createOperations(pluginOptions, gatsbyApi);

  const operations = [createProductsOperation];
  if (pluginOptions.shopifyConnections?.includes("orders")) {
    operations.push(createOrdersOperation);
  }

  if (pluginOptions.shopifyConnections?.includes("collections")) {
    operations.push(createCollectionsOperation);
  }

  const sourceFromOperation = makeSourceFromOperation(
    finishLastOperation,
    completedOperation,
    gatsbyApi,
    pluginOptions
  );

  for (const op of operations) {
    await sourceFromOperation(op);
  }
}

const shopifyNodeTypes = [
  `ShopifyLineItem`,
  `ShopifyMetafield`,
  `ShopifyOrder`,
  `ShopifyProduct`,
  `ShopifyCollection`,
  `ShopifyProductImage`,
  `ShopifyProductFeaturedImage`,
  `ShopifyProductVariant`,
  `ShopifyProductVariantPricePair`,
];

async function sourceChangedNodes(
  gatsbyApi: SourceNodesArgs,
  pluginOptions: ShopifyPluginOptions
) {
  const {
    incrementalProducts,
    incrementalOrders,
    incrementalCollections,
    finishLastOperation,
    completedOperation,
  } = createOperations(pluginOptions, gatsbyApi);
  const lastBuildTime = await gatsbyApi.cache.get(`LAST_BUILD_TIME`);
  const touchNode = (node: { id: string }) =>
    gatsbyApi.actions.touchNode({ nodeId: node.id });
  for (const nodeType of shopifyNodeTypes) {
    gatsbyApi.getNodesByType(nodeType).forEach(touchNode);
  }

  const operations = [incrementalProducts(lastBuildTime)];
  if (pluginOptions.shopifyConnections?.includes("orders")) {
    operations.push(incrementalOrders(lastBuildTime));
  }

  if (pluginOptions.shopifyConnections?.includes("collections")) {
    operations.push(incrementalCollections(lastBuildTime));
  }

  const sourceFromOperation = makeSourceFromOperation(
    finishLastOperation,
    completedOperation,
    gatsbyApi,
    pluginOptions
  );

  for (const op of operations) {
    await sourceFromOperation(op);
  }

  const { fetchDestroyEventsSince } = eventsApi(pluginOptions);
  const destroyEvents = await fetchDestroyEventsSince(new Date(lastBuildTime));
  if (destroyEvents.length) {
    for (const nodeType of shopifyNodeTypes) {
      gatsbyApi.getNodesByType(nodeType).forEach((node) => {
        /* This is currently untested because all the destroy events for the
         * swag store are for products that this POC has never sourced!
         *
         * Also to consider: what about cascade delete? If a product is removed
         * here, do we clean up variants, metafields, images, etc?
         */
        const event = destroyEvents.find(
          (e: { subject_id: number; subject_type: string }) =>
            e.subject_id === parseInt(node.shopifyId as string, 10) &&
            node.internal.type === `Shopify${e.subject_type}`
        );
        if (event) {
          gatsbyApi.actions.deleteNode({ node });
        }
      });
    }
  }
}

export async function sourceNodes(
  gatsbyApi: SourceNodesArgs,
  pluginOptions: ShopifyPluginOptions
) {
  const lastOperationId = await gatsbyApi.cache.get(
    LAST_SHOPIFY_BULK_OPERATION
  );

  if (lastOperationId) {
    gatsbyApi.reporter.info(`Cancelling last operation: ${lastOperationId}`);
    await createOperations(pluginOptions, gatsbyApi).cancelOperation(
      lastOperationId
    );
    await gatsbyApi.cache.set(LAST_SHOPIFY_BULK_OPERATION, undefined);
  }

  const lastBuildTime = await gatsbyApi.cache.get(`LAST_BUILD_TIME`);
  if (lastBuildTime) {
    await sourceChangedNodes(gatsbyApi, pluginOptions);
  } else {
    await sourceAllNodes(gatsbyApi, pluginOptions);
  }

  await gatsbyApi.cache.set(`LAST_BUILD_TIME`, Date.now());
}

export function createSchemaCustomization({
  actions,
}: CreateSchemaCustomizationArgs) {
  actions.createTypes(`
    type ShopifyProductVariant implements Node {
      product: ShopifyProduct @link(from: "productId", by: "shopifyId")
      metafields: [ShopifyMetafield]
      presentmentPrices: [ShopifyProductVariantPricePair]
    }

    type ShopifyProduct implements Node {
      variants: [ShopifyProductVariant]
    }

    type ShopifyProductFeaturedImage {
      localFile: File @link
    }

    type ShopifyMetafield implements Node {
      productVariant: ShopifyProductVariant @link(from: "productVariantId", by: "shopifyId")
    }

    type ShopifyProductVariantPricePair implements Node {
      productVariant: ShopifyProductVariant @link(from: "productVariantId", by: "shopifyId")
    }

    type ShopifyOrder implements Node {
      lineItems: [ShopifyLineItem]
    }

    type ShopifyLineItem implements Node {
      product: ShopifyProduct @link(from: "productId", by: "shopifyId")
    }

    type ShopifyProductImage implements Node {
      altText: String
      originalSrc: String!
      product: ShopifyProduct @link(from: "productId", by: "shopifyId")
      localFile: File @link
    }
  `);
}

/**
 * FIXME
 *
 * What are the types for the resolve functions?
 */
export function createResolvers(
  { createResolvers }: CreateResolversArgs,
  { downloadImages }: ShopifyPluginOptions
) {
  const resolvers: Record<string, unknown> = {
    ShopifyOrder: {
      lineItems: {
        type: ["ShopifyLineItem"],
        resolve(source: any, _args: any, context: any, _info: any) {
          return context.nodeModel.runQuery({
            query: {
              filter: {
                orderId: { eq: source.shopifyId },
              },
            },
            type: "ShopifyLineItem",
            firstOnly: false,
          });
        },
      },
    },
    ShopifyProductVariant: {
      presentmentPrices: {
        type: ["ShopifyProductVariantPricePair"],
        resolve(source: any, _args: any, context: any, _info: any) {
          return context.nodeModel.runQuery({
            query: {
              filter: {
                productVariantId: { eq: source.shopifyId },
              },
            },
            type: "ShopifyProductVariantPricePair",
            firstOnly: false,
          });
        },
      },
      metafields: {
        type: ["ShopifyMetafield"],
        resolve(source: any, _args: any, context: any, _info: any) {
          return context.nodeModel.runQuery({
            query: {
              filter: {
                productVariantId: { eq: source.shopifyId },
              },
            },
            type: "ShopifyMetafield",
            firstOnly: false,
          });
        },
      },
    },
    ShopifyProduct: {
      images: {
        type: ["ShopifyProductImage"],
        resolve(source: any, _args: any, context: any, _info: any) {
          return context.nodeModel.runQuery({
            query: {
              filter: {
                productId: { eq: source.shopifyId },
              },
            },
            type: "ShopifyProductImage",
            firstOnly: false,
          });
        },
      },
      variants: {
        type: ["ShopifyProductVariant"],
        resolve(source: any, _args: any, context: any, _info: any) {
          return context.nodeModel.runQuery({
            query: {
              filter: {
                productId: { eq: source.shopifyId },
              },
            },
            type: "ShopifyProductVariant",
            firstOnly: false,
          });
        },
      },
    },
  };

  if (!downloadImages) {
    resolvers.ShopifyProductImage = {
      gatsbyImageData: getGatsbyImageResolver(resolveGatsbyImageData),
    };

    resolvers.ShopifyProductFeaturedImage = {
      gatsbyImageData: getGatsbyImageResolver(resolveGatsbyImageData),
    };
  }

  createResolvers(resolvers);
}

interface ErrorContext {
  sourceMessage: string;
}

const getErrorText = (context: ErrorContext): string => context.sourceMessage;

export function onPreInit({ reporter }: NodePluginArgs) {
  reporter.setErrorMap({
    [errorCodes.bulkOperationFailed]: {
      text: getErrorText,
      level: `ERROR`,
      category: `USER`,
    },
    /**
     * If we don't know what it is, we haven't done our due
     * diligence to handle it explicitly. That means it's our
     * fault, so THIRD_PARTY indicates us, the plugin authors.
     */
    [errorCodes.unknownSourcingFailure]: {
      text: getErrorText,
      level: "ERROR",
      category: `THIRD_PARTY`,
    },
  });
}
