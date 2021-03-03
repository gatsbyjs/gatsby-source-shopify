import { NodeInput, SourceNodesArgs } from "gatsby";
import { createRemoteFileNode } from "gatsby-source-filesystem";

// 'gid://shopify/Metafield/6936247730264'
export const pattern = /^gid:\/\/shopify\/(\w+)\/(.+)$/;

function attachParentId(obj: Record<string, any>) {
  if (obj.__parentId) {
    const [fullId, remoteType] = obj.__parentId.match(pattern) || [];
    const field = remoteType.charAt(0).toLowerCase() + remoteType.slice(1);
    const idField = `${field}Id`;
    obj[idField] = fullId;
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

const processorMap: ProcessorMap = {
  LineItem: async (node) => {
    const lineItem = node;
    lineItem.productId = (lineItem.product as { id: string }).id;
    delete lineItem.product;
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
  Product: async (node, gatsbyApi, options) => {
    if (options.downloadImages) {
      const featuredImage = node.featuredImage as
        | {
            originalSrc: string;
            localFile: string | undefined;
          }
        | undefined;

      if (featuredImage) {
        const url = featuredImage.originalSrc;
        const fileNodeId = await downloadImageAndCreateFileNode(
          {
            url,
            nodeId: node.id,
          },
          gatsbyApi
        );

        featuredImage.localFile = fileNodeId;
      }
    }
  },
};

async function buildFromId(
  obj: Record<string, any>,
  getFactory: (remoteType: string) => (node: BulkResult) => NodeInput,
  gatsbyApi: SourceNodesArgs,
  options: ShopifyPluginOptions
) {
  const [, remoteType] = obj.id.match(pattern) || [];

  const Node = getFactory(remoteType);
  const processor = processorMap[remoteType] || (() => Promise.resolve());

  attachParentId(obj);
  const node = Node(obj);
  await processor(node, gatsbyApi, options);

  return node;
}

export function nodeBuilder(
  gatsbyApi: SourceNodesArgs,
  options: ShopifyPluginOptions
): NodeBuilder {
  const factoryMap: {
    [k: string]: (node: BulkResult) => NodeInput;
  } = {};
  function createNodeFactory(remoteType: string) {
    return (result: BulkResult) => {
      const id = result.id as string;
      if (!id) {
        throw new Error("Cannot build node without an ID");
      }

      return {
        ...result,
        shopifyId: id,
        id: gatsbyApi.createNodeId(id),
        internal: {
          type: `Shopify${remoteType}`,
          contentDigest: gatsbyApi.createContentDigest(result),
        },
      };
    };
  }

  const getFactory = (remoteType: string) => {
    if (!factoryMap[remoteType]) {
      factoryMap[remoteType] = createNodeFactory(remoteType);
    }
    return factoryMap[remoteType];
  };

  return {
    async buildNode(obj: Record<string, any>) {
      if (obj.id) {
        return await buildFromId(obj, getFactory, gatsbyApi, options);
      }

      throw new Error(`Cannot create a node without type information`);
    },
  };
}
