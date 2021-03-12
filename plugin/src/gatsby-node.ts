import fetch from "node-fetch";
import { createInterface } from "readline";
import { createOperations, ShopifyBulkOperation } from "./operations";
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
import { OperationError } from "./errors";

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
    verboseLogging: Joi.boolean(),
    typeName: Joi.string().default(`Shopify`),
    shopifyConnections: Joi.array()
      .default([])
      .items(Joi.string().valid("orders", "collections")),
  });
}

function makeSourceFromOperation(
  finishLastOperation: () => Promise<void>,
  completedOperation: (id: string) => Promise<{ node: BulkOperationNode }>,
  gatsbyApi: SourceNodesArgs,
  options: ShopifyPluginOptions
) {
  return async function sourceFromOperation(op: ShopifyBulkOperation) {
    const { reporter, actions, cache } = gatsbyApi;

    try {
      const operationTimer = reporter.activityTimer(
        `Source from bulk operation ${op.name}`
      );
      operationTimer.start();

      await finishLastOperation();

      reporter.info(`Initiating bulk operation query ${op.name}`);
      const {
        bulkOperationRunQuery: { userErrors, bulkOperation },
      } = await op.execute();

      if (userErrors.length) {
        reporter.panic(
          userErrors.map((e) => ({
            id: errorCodes.bulkOperationFailed,
            context: {
              sourceMessage: `Couldn't initiate bulk operation query`,
            },
            error: new Error(`${e.field.join(".")}: ${e.message}`),
          }))
        );
      }

      operationTimer.setStatus(
        `Polling bulk operation ${op.name}: ${bulkOperation.id}`
      );
      await cache.set(LAST_SHOPIFY_BULK_OPERATION, bulkOperation.id);

      let resp = await completedOperation(bulkOperation.id);
      reporter.info(`Completed bulk operation ${op.name}: ${bulkOperation.id}`);

      if (parseInt(resp.node.objectCount, 10) === 0) {
        reporter.info(`No data was returned for this operation`);
        operationTimer.end();
        return;
      }

      operationTimer.setStatus(
        `Fetching ${resp.node.objectCount} results for ${op.name}: ${bulkOperation.id}`
      );

      const results = await fetch(resp.node.url);

      operationTimer.setStatus(
        `Processing ${resp.node.objectCount} results for ${op.name}: ${bulkOperation.id}`
      );
      const rl = createInterface({
        input: results.body,
        crlfDelay: Infinity,
      });

      reporter.info(`Creating nodes from bulk operation ${op.name}`);

      const objects: BulkResults = [];

      for await (const line of rl) {
        objects.push(JSON.parse(line));
      }

      await Promise.all(
        op
          .process(objects, nodeBuilder(gatsbyApi, options), gatsbyApi)
          .map(async (promise) => {
            const node = await promise;
            actions.createNode(node);
          })
      );

      operationTimer.end();

      await cache.set(LAST_SHOPIFY_BULK_OPERATION, undefined);
    } catch (e) {
      if (e instanceof OperationError) {
        const code = errorCodes.bulkOperationFailed;

        if (e.node.errorCode === `ACCESS_DENIED`) {
          reporter.panic({
            id: code,
            context: {
              sourceMessage: `Your credentials don't have access to a resource you requested`,
            },
            error: e,
          });
        }

        reporter.panic({
          id: errorCodes.unknownSourcingFailure,
          context: {
            sourceMessage: `Could not source from bulk operation: ${e.node.errorCode}`,
          },
          error: e,
        });
      }

      reporter.panic({
        id: errorCodes.unknownSourcingFailure,
        context: {
          sourceMessage: `Could not source from bulk operation`,
        },
        error: e,
      });
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
  `ShopifyCollectionImage`,
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
  const lastBuildTime = new Date(
    gatsbyApi.store.getState().status.plugins?.[
      `gatsby-source-shopify-experimental`
    ]?.lastBuildTime
  );
  for (const nodeType of shopifyNodeTypes) {
    gatsbyApi
      .getNodesByType(nodeType)
      .forEach((node) => gatsbyApi.actions.touchNode(node));
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
  const destroyEvents = await fetchDestroyEventsSince(lastBuildTime);

  gatsbyApi.reporter.info(
    `${destroyEvents.length} items have been deleted since ${lastBuildTime}`
  );

  if (destroyEvents.length) {
    gatsbyApi.reporter.info(`Removing matching nodes from Gatsby`);
    destroyEvents.forEach((e) => {
      const id = `gid://shopify/${e.subject_type}/${e.subject_id}`;
      gatsbyApi.reporter.info(`Looking up node with ID: ${id}`);
      const nodeId = gatsbyApi.createNodeId(id);
      const node = gatsbyApi.getNode(nodeId);

      if (node) {
        gatsbyApi.reporter.info(
          `Removing ${node.internal.type}: ${node.id} with shopifyId ${e.subject_id}`
        );
        gatsbyApi.actions.deleteNode(node);
      } else {
        gatsbyApi.reporter.info(`Couldn't find node with ID: ${id}`);
      }
    });
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

  const lastBuildTime = gatsbyApi.store.getState().status.plugins?.[
    `gatsby-source-shopify-experimental`
  ]?.lastBuildTime;

  if (lastBuildTime) {
    gatsbyApi.reporter.info(`Cache is warm, running an incremental build`);
    await sourceChangedNodes(gatsbyApi, pluginOptions);
  } else {
    gatsbyApi.reporter.info(`Cache is cold, running a clean build`);
    await sourceAllNodes(gatsbyApi, pluginOptions);
  }

  gatsbyApi.reporter.info(`Finished sourcing nodes, caching last build time`);
  gatsbyApi.actions.setPluginStatus({ lastBuildTime: Date.now() });
}

export function createSchemaCustomization({
  actions,
}: CreateSchemaCustomizationArgs, {
  typeName
}:ShopifyPluginOptions) {
  actions.createTypes(`
    type ${typeName}ProductVariant implements Node {
      product: ${typeName}Product @link(from: "productId", by: "id")
      metafields: [${typeName}Metafield] @link(from: "id", by: "productVariantId")
    }

    type ${typeName}Product implements Node {
      variants: [${typeName}ProductVariant] @link(from: "id", by: "productId")
      images: [${typeName}ProductImage] @link(from: "id", by: "productId")
      collections: [${typeName}Collection] @link(from: "id", by: "productIds")
    }

    type ${typeName}Collection implements Node {
      products: [${typeName}Product] @link(from: "productIds", by: "id")
    }

    type ${typeName}ProductFeaturedImage {
      localFile: File @link
    }

    type ${typeName}CollectionImage {
      localFile: File @link
    }

    type ${typeName}Metafield implements Node {
      productVariant: ${typeName}ProductVariant @link(from: "productVariantId", by: "id")
    }

    type ${typeName}Order implements Node {
      lineItems: [${typeName}LineItem] @link(from: "id", by: "orderId")
    }

    type ${typeName}LineItem implements Node {
      product: ${typeName}Product @link(from: "productId", by: "id")
      order: ${typeName}Order @link(from: "orderId", by: "id")
    }

    type ${typeName}ProductImage implements Node {
      altText: String
      originalSrc: String!
      product: ${typeName}Product @link(from: "productId", by: "id")
      localFile: File @link
    }
  `);
}

export function createResolvers(
  { createResolvers }: CreateResolversArgs,
  { downloadImages, typeName }: ShopifyPluginOptions
) {
  if (!downloadImages) {
    const resolvers = {
      [`${typeName}ProductImage`]: {
        gatsbyImageData: getGatsbyImageResolver(resolveGatsbyImageData),
      },

      [`${typeName}ProductFeaturedImage`]: {
        gatsbyImageData: getGatsbyImageResolver(resolveGatsbyImageData),
      },

      [`${typeName}CollectionImage`]: {
        gatsbyImageData: getGatsbyImageResolver(resolveGatsbyImageData),
      },
    };

    createResolvers(resolvers);
  }
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
