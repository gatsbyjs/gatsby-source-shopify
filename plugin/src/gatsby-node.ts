import fetch from "node-fetch";
import { createNodeHelpers } from "gatsby-node-helpers";
import { createInterface } from "readline";
import { createOperations, BulkOperationRunQueryResponse } from "./operations";
import { nodeBuilder } from "./node-builder";
import { eventsApi } from "./events";
import {
  CreateResolversArgs,
  CreateSchemaCustomizationArgs,
  PluginOptionsSchemaArgs,
  SourceNodesArgs,
} from "gatsby";
import {
  generateImageData,
  IGatsbyImageHelperArgs,
  IImage,
  ImageFormat,
} from "gatsby-plugin-image";
import { getGatsbyImageResolver } from "gatsby-plugin-image/graphql-utils";

const LAST_SHOPIFY_BULK_OPERATION = `LAST_SHOPIFY_BULK_OPERATION`;

module.exports.pluginOptionsSchema = ({ Joi }: PluginOptionsSchemaArgs) => {
  return Joi.object({
    apiKey: Joi.string().required(),
    password: Joi.string().required(),
    storeUrl: Joi.string().required(),
    downloadImages: Joi.boolean(),
    shopifyConnections: Joi.array()
      .default([])
      .items(Joi.string().valid("orders")),
  });
};

function makeSourceFromOperation(
  finishLastOperation: () => Promise<void>,
  completedOperation: (
    id: string
  ) => Promise<{ node: { objectCount: string; url: string } }>,
  gatsbyApi: SourceNodesArgs,
  options: ShopifyPluginOptions
) {
  return async function sourceFromOperation(
    op: () => Promise<BulkOperationRunQueryResponse>
  ) {
    const {
      reporter,
      actions,
      createNodeId,
      createContentDigest,
      cache,
    } = gatsbyApi;

    try {
      const operationComplete = `Sourced from bulk operation`;
      console.time(operationComplete);
      const nodeHelpers = createNodeHelpers({
        typePrefix: `Shopify`,
        createNodeId,
        createContentDigest,
      });

      const finishLastOp = `Checked for operations in progress`;
      console.time(finishLastOp);
      await finishLastOperation();
      console.timeEnd(finishLastOp);

      const initiating = `Initiated bulk operation query`;
      console.time(initiating);
      const {
        bulkOperationRunQuery: { userErrors, bulkOperation },
      } = await op();
      console.timeEnd(initiating);

      if (userErrors.length) {
        reporter.panic(
          {
            id: ``, // TODO: decide on some error IDs
            context: {
              sourceMessage: `Couldn't perform bulk operation`,
            },
          },
          userErrors
        );
      }

      const waitForCurrentOp = `Completed bulk operation`;
      console.time(waitForCurrentOp);

      await cache.set(LAST_SHOPIFY_BULK_OPERATION, bulkOperation.id);

      let resp = await completedOperation(bulkOperation.id);
      console.timeEnd(waitForCurrentOp);

      if (parseInt(resp.node.objectCount, 10) === 0) {
        reporter.info(`No data was returned for this operation`);
        console.timeEnd(operationComplete);
        return;
      }

      const results = await fetch(resp.node.url);

      const rl = createInterface({
        input: results.body,
        crlfDelay: Infinity,
      });

      const builder = nodeBuilder(nodeHelpers, gatsbyApi, options);

      const creatingNodes = `Created nodes from bulk operation`;
      console.time(creatingNodes);

      const promises = [];
      for await (const line of rl) {
        const obj = JSON.parse(line);
        promises.push(builder.buildNode(obj));
      }

      await Promise.all(
        promises.map(async (promise) => {
          const node = await promise;
          actions.createNode(node);
        })
      );

      console.timeEnd(creatingNodes);

      console.timeEnd(operationComplete);

      await cache.set(LAST_SHOPIFY_BULK_OPERATION, undefined);
    } catch (e) {
      reporter.panic(
        {
          id: ``,
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
    finishLastOperation,
    completedOperation,
  } = createOperations(pluginOptions);

  const operations = [createProductsOperation];
  if (pluginOptions.shopifyConnections?.includes("orders")) {
    operations.push(createOrdersOperation);
  }

  const sourceFromOperation = makeSourceFromOperation(
    finishLastOperation,
    completedOperation,
    gatsbyApi,
    pluginOptions
  );
  await Promise.all(operations.map(sourceFromOperation));
}

const shopifyNodeTypes = [
  `ShopifyLineItem`,
  `ShopifyMetafield`,
  `ShopifyOrder`,
  `ShopifyProduct`,
  `ShopifyProductImage`,
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
    finishLastOperation,
    completedOperation,
  } = createOperations(pluginOptions);
  const lastBuildTime = await gatsbyApi.cache.get(`LAST_BUILD_TIME`);
  const touchNode = (node: { id: string }) =>
    gatsbyApi.actions.touchNode({ nodeId: node.id });
  for (const nodeType of shopifyNodeTypes) {
    gatsbyApi.getNodesByType(nodeType).forEach(touchNode);
  }

  const operations = [incrementalProducts];
  if (pluginOptions.shopifyConnections?.includes("orders")) {
    operations.push(incrementalOrders);
  }

  const sourceFromOperation = makeSourceFromOperation(
    finishLastOperation,
    completedOperation,
    gatsbyApi,
    pluginOptions
  );

  const deltaSource = (
    op: (date: Date) => Promise<BulkOperationRunQueryResponse>
  ) => {
    const deltaOp = () => op(new Date(lastBuildTime));
    return sourceFromOperation(deltaOp);
  };

  await Promise.all(operations.map(deltaSource));

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
    console.info(`Cancelling last operation`);
    const cancelled = await createOperations(pluginOptions).cancelOperation(
      lastOperationId
    );
    console.info(cancelled);
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

exports.createSchemaCustomization = ({
  actions,
}: CreateSchemaCustomizationArgs) => {
  actions.createTypes(`
    type ShopifyProductVariant implements Node {
      product: ShopifyProduct @link(from: "productId", by: "shopifyId")
      metafields: [ShopifyMetafield]
      presentmentPrices: [ShopifyProductVariantPricePair]
    }

    type ShopifyProduct implements Node {
      variants: [ShopifyProductVariant]
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
};

const validFormats = new Set(["jpg", "png", "webp"]);
type ImageLayout = "constrained" | "fixed" | "fullWidth";
async function resolveGatsbyImageData(
  image: Node & { width: number; height: number; originalSrc: string },
  {
    formats = ["auto", "webp"],
    layout = "constrained",
    ...options
  }: { formats: Array<ImageFormat>; layout: ImageLayout }
) {
  let [basename, version] = image.originalSrc.split("?");

  const dot = basename.lastIndexOf(".");
  let ext = "";
  if (dot !== -1) {
    ext = basename.slice(dot + 1);
    basename = basename.slice(0, dot);
  }

  const generateImageSource: IGatsbyImageHelperArgs["generateImageSource"] = (
    filename,
    width,
    height,
    toFormat
  ): IImage => {
    if (!validFormats.has(toFormat)) {
      console.warn(
        `${toFormat} is not a valid format. Valid formats are: ${[
          ...validFormats,
        ].join(", ")}`
      );
      toFormat = "jpg";
    }
    let suffix = "";
    if (toFormat === ext) {
      suffix = `.${toFormat}`;
    } else {
      suffix = `.${ext}.${toFormat}`;
    }

    return {
      width,
      height,
      format: toFormat,
      src: `${filename}_${width}x${height}_crop_center${suffix}?${version}`,
    };
  };
  const sourceMetadata = {
    width: image.width,
    height: image.height,
    format: ext as ImageFormat,
  };

  return generateImageData({
    ...options,
    formats,
    layout,
    sourceMetadata,
    pluginName: `gatsby-source-shopify-experimental`,
    filename: basename,
    generateImageSource,
  });
}

/**
 * FIXME
 *
 * What are the types for the resolve functions?
 */
exports.createResolvers = (
  { createResolvers }: CreateResolversArgs,
  { downloadImages }: ShopifyPluginOptions
) => {
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
  }

  createResolvers(resolvers);
};
