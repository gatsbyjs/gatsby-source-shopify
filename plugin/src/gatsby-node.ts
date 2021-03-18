import { createOperations } from "./operations";
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
import { pluginErrorCodes as errorCodes } from "./errors";
import { LAST_SHOPIFY_BULK_OPERATION } from "./constants";
import { makeSourceFromOperation } from "./make-source-from-operation";

export function pluginOptionsSchema({ Joi }: PluginOptionsSchemaArgs) {
  return Joi.object({
    apiKey: Joi.string().required(),
    password: Joi.string().required(),
    storeUrl: Joi.string().required(),
    downloadImages: Joi.boolean(),
    verboseLogging: Joi.boolean(),
    typePrefix: Joi.string().default(''),
    shopifyConnections: Joi.array()
      .default([])
      .items(Joi.string().valid("orders", "collections")),
  });
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
    cancelOperationInProgress,
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
    cancelOperationInProgress,
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
    cancelOperationInProgress,
  } = createOperations(pluginOptions, gatsbyApi);
  const lastBuildTime = new Date(
    gatsbyApi.store.getState().status.plugins?.[
      `gatsby-source-shopify-experimental`
    ]?.[`lastBuildTimeFor${pluginOptions.typePrefix}`]
  );
  
  for (const nodeType of shopifyNodeTypes) {
    gatsbyApi
      .getNodesByType(`${pluginOptions.typePrefix}${nodeType}`)
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
    cancelOperationInProgress,
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
  const cacheKey = LAST_SHOPIFY_BULK_OPERATION + pluginOptions.typePrefix;
  const lastOperationId = await gatsbyApi.cache.get(cacheKey);

  if (lastOperationId) {
    gatsbyApi.reporter.info(`Cancelling last operation: ${lastOperationId}`);
    await createOperations(pluginOptions, gatsbyApi).cancelOperation(
      lastOperationId
    );
    await gatsbyApi.cache.set(cacheKey, undefined);
  }

  const pluginStatus = gatsbyApi.store.getState().status.plugins?.[
    `gatsby-source-shopify-experimental`
  ];

  const lastBuildTime = pluginStatus?.[`lastBuildTimeFor${pluginOptions.typePrefix}`];

  if (lastBuildTime !== undefined) {
    gatsbyApi.reporter.info(`Cache is warm, running an incremental build`);
    await sourceChangedNodes(gatsbyApi, pluginOptions);
  } else {
    gatsbyApi.reporter.info(`Cache is cold, running a clean build`);
    await sourceAllNodes(gatsbyApi, pluginOptions);
  }

  gatsbyApi.reporter.info(`Finished sourcing nodes, caching last build time`);  
  gatsbyApi.actions.setPluginStatus(
    pluginStatus !== undefined
      ? {
          ...pluginStatus,
          [`lastBuildTimeFor${pluginOptions.typePrefix}`]: Date.now()
        }
      : {
          [`lastBuildTimeFor${pluginOptions.typePrefix}`]: Date.now()
        }  
  );
}

export function createSchemaCustomization({
  actions,
}: CreateSchemaCustomizationArgs, {
  typePrefix
}: ShopifyPluginOptions) {
  actions.createTypes(`
    type ${typePrefix}ShopifyProductVariant implements Node {
      product: ${typePrefix}ShopifyProduct @link(from: "productId", by: "id")
      metafields: [${typePrefix}ShopifyMetafield] @link(from: "id", by: "productVariantId")
    }

    type ${typePrefix}ShopifyProduct implements Node {
      variants: [${typePrefix}ShopifyProductVariant] @link(from: "id", by: "productId")
      images: [${typePrefix}ShopifyProductImage] @link(from: "id", by: "productId")
      collections: [${typePrefix}ShopifyCollection] @link(from: "id", by: "productIds")
    }

    type ${typePrefix}ShopifyCollection implements Node {
      products: [${typePrefix}ShopifyProduct] @link(from: "productIds", by: "id")
    }

    type ${typePrefix}ShopifyProductFeaturedImage {
      localFile: File @link
    }

    type ${typePrefix}ShopifyCollectionImage {
      localFile: File @link
    }

    type ${typePrefix}ShopifyMetafield implements Node {
      productVariant: ${typePrefix}ShopifyProductVariant @link(from: "productVariantId", by: "id")
    }

    type ${typePrefix}ShopifyOrder implements Node {
      lineItems: [${typePrefix}ShopifyLineItem] @link(from: "id", by: "orderId")
    }

    type ${typePrefix}ShopifyLineItem implements Node {
      product: ${typePrefix}ShopifyProduct @link(from: "productId", by: "id")
      order: ${typePrefix}ShopifyOrder @link(from: "orderId", by: "id")
    }

    type ${typePrefix}ShopifyProductImage implements Node {
      altText: String
      originalSrc: String!
      product: ${typePrefix}ShopifyProduct @link(from: "productId", by: "id")
      localFile: File @link
    }
  `);
}

export function createResolvers(
  { createResolvers }: CreateResolversArgs,
  { downloadImages, typePrefix }: ShopifyPluginOptions
) {
  if (!downloadImages) {
    const resolvers = {
      [`${typePrefix}ShopifyProductImage`]: {
        gatsbyImageData: getGatsbyImageResolver(resolveGatsbyImageData),
      },

      [`${typePrefix}ShopifyProductFeaturedImage`]: {
        gatsbyImageData: getGatsbyImageResolver(resolveGatsbyImageData),
      },

      [`${typePrefix}ShopifyCollectionImage`]: {
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
