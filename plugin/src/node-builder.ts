import { NodeInput, SourceNodesArgs } from "gatsby";
import { IdentifiableRecord, NodeHelpers } from "gatsby-node-helpers";
import { createRemoteFileNode } from "gatsby-source-filesystem";

// 'gid://shopify/Metafield/6936247730264'
const pattern = /^gid:\/\/shopify\/(\w+)\/(.+)$/;

interface Record {
  id: string;
  __parentId?: string;
}

function attachParentId<T extends Record>(obj: T) {
  if (obj.__parentId) {
    const [fullId, remoteType] = obj.__parentId.match(pattern);
    const field = remoteType.charAt(0).toLowerCase() + remoteType.slice(1);
    const idField = `${field}Id`;
    obj[idField] = fullId;
    delete obj.__parentId;
  }
}

const downloadImageAndCreateFileNode = async (
  { url, nodeId },
  { createNode, createNodeId, touchNode, cache, store, reporter }
) => {
  const mediaDataCacheKey = `Shopify__Media__${url}`;
  const cacheMediaData = await cache.get(mediaDataCacheKey);

  if (cacheMediaData) {
    const fileNodeID = cacheMediaData.fileNodeID;
    touchNode({ nodeId: fileNodeID });
    return fileNodeID;
  }

  const fileNode = await createRemoteFileNode({
    url,
    cache,
    createNode,
    createNodeId,
    parentNodeId: nodeId,
    store,
    reporter,
  });

  if (fileNode) {
    const fileNodeID = fileNode.id;
    await cache.set(mediaDataCacheKey, { fileNodeID });
    return fileNodeID;
  }

  return undefined;
};

interface LineItem extends Record {
  product: Record;
  productId: string;
}

async function buildFromId<T extends Record>(
  obj: T,
  getFactory: (remoteType: string) => (node: IdentifiableRecord) => NodeInput,
  gatsbyApi: SourceNodesArgs
) {
  const [shopifyId, remoteType] = obj.id.match(pattern);
  const {
    createNodeId,
    actions: { createNode, touchNode },
    cache,
    store,
    reporter,
  } = gatsbyApi;

  attachParentId(obj);

  /* FIXME
   * This is becoming littered with type checks.
   * To clean this up, maybe we can introduce a
   * mapping of custom processor functions.
   * ~sslotsky
   */
  if (remoteType === `ShopifyLineItem`) {
    const lineItem = (obj as unknown) as LineItem;
    lineItem.productId = lineItem.product.id;
    delete lineItem.product;
  }

  const Node = getFactory(remoteType);
  const node = Node({ ...obj, id: shopifyId });

  if (remoteType === `ProductImage`) {
    const src = node.originalSrc as string;
    const fileNodeId = await downloadImageAndCreateFileNode(
      {
        url: src && src.split(`?`)[0],
        nodeId: node.id,
      },
      {
        createNode,
        createNodeId,
        touchNode,
        cache,
        store,
        reporter,
      }
    );

    node.localFile = fileNodeId;
  }

  return node;
}

export function nodeBuilder(
  nodeHelpers: NodeHelpers,
  gatsbyApi: SourceNodesArgs
) {
  const factoryMap = {};
  const getFactory = (remoteType: string) => {
    if (!factoryMap[remoteType]) {
      factoryMap[remoteType] = nodeHelpers.createNodeFactory(remoteType);
    }
    return factoryMap[remoteType];
  };

  return {
    async buildNode<T extends Record>(obj: T) {
      if (obj.id) {
        return await buildFromId(obj, getFactory, gatsbyApi);
      }

      throw new Error(`Cannot create a node without type information`);
    },
  };
}
