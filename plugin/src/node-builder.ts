import { NodeInput, SourceNodesArgs } from "gatsby";
import { createRemoteFileNode } from "gatsby-source-filesystem";

// 'gid://shopify/Metafield/6936247730264'
export const pattern = /^gid:\/\/shopify\/(\w+)\/(.+)$/;

function attachParentId(obj: Record<string, any>, gatsbyApi: SourceNodesArgs) {
  if (obj.__parentId) {
    const [fullId, remoteType] = obj.__parentId.match(pattern) || [];
    const field = remoteType.charAt(0).toLowerCase() + remoteType.slice(1);
    const idField = `${field}Id`;
    obj[idField] = gatsbyApi.createNodeId(fullId);
    delete obj.__parentId;
  }
}

const downloadImageAndCreateFileNode = async (
  { url, nodeId }: { url: string; nodeId: string },
  {
    actions: { createNode },
    createNodeId,
    cache,
    store,
    reporter,
  }: SourceNodesArgs
): Promise<string> => {
  const fileNode = await createRemoteFileNode({
    url,
    cache,
    createNode,
    createNodeId,
    parentNodeId: nodeId,
    store,
    reporter,
  });

  return fileNode.id;
};

interface ProcessorMap {
  [remoteType: string]: (
    node: NodeInput,
    gatsbyApi: SourceNodesArgs,
    options: ShopifyPluginOptions
  ) => Promise<void>;
}

async function processChildImage(
  node: NodeInput,
  childKey: string,
  gatsbyApi: SourceNodesArgs,
  options: ShopifyPluginOptions
) {
  if (options.downloadImages) {
    const image = node[childKey] as
      | {
          id: string;
          originalSrc: string;
          localFile: string | undefined;
        }
      | undefined;

    if (image) {
      const url = image.originalSrc;
      const fileNodeId = await downloadImageAndCreateFileNode(
        {
          url,
          nodeId: node.id,
        },
        gatsbyApi
      );

      image.localFile = fileNodeId;
    }
  }
}

const processorMap: ProcessorMap = {
  LineItem: async (node, gatsbyApi) => {
    const lineItem = node;
    if (lineItem.product) {
      lineItem.productId = gatsbyApi.createNodeId(
        (lineItem.product as BulkResult).id
      );
      delete lineItem.product;
    }
  },
  ProductImage: async (node, gatsbyApi, options) => {
    if (options.downloadImages) {
      const url = node.originalSrc as string;
      const fileNodeId = await downloadImageAndCreateFileNode(
        {
          url,
          nodeId: node.id,
        },
        gatsbyApi
      );

      node.localFile = fileNodeId;
    }
  },
  Collection: async (node, gatsbyApi, options) => {
    return processChildImage(node, "image", gatsbyApi, options);
  },
  Product: async (node, gatsbyApi, options) => {
    return processChildImage(node, "featuredImage", gatsbyApi, options);
  },
};

export function nodeBuilder(
  gatsbyApi: SourceNodesArgs,
  options: ShopifyPluginOptions
): NodeBuilder {
  return {
    async buildNode(result: BulkResult) {
      if (!pattern.test(result.id)) {
        throw new Error(
          `Expected an ID in the format gid://shopify/<typename>/<id>`
        );
      }

      const [, remoteType] = result.id.match(pattern) || [];

      const processor = processorMap[remoteType] || (() => Promise.resolve());

      attachParentId(result, gatsbyApi);

      const node = {
        ...result,
        shopifyId: result.id,
        id: gatsbyApi.createNodeId(result.id),
        internal: {
          type: `${options.typeName}Shopify${remoteType}`,
          contentDigest: gatsbyApi.createContentDigest(result),
        },
      };

      await processor(node, gatsbyApi, options);

      return node;
    },
  };
}
