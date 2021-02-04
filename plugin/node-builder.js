const { createRemoteFileNode } = require("gatsby-source-filesystem");

// 'gid://shopify/Metafield/6936247730264'
const pattern = /^gid:\/\/shopify\/(\w+)\/(.+)$/;

function attachParentId(obj) {
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
  { createNode, createNodeId, touchNode, cache, getCache, store, reporter }
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
    getCache,
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

async function buildFromId(obj, getFactory, gatsbyApi) {
  const [shopifyId, remoteType] = obj.id.match(pattern);
  const {
    createNodeId,
    actions: { createNode, touchNode },
    getCache,
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
  if (remoteType === `ShopifyLineItem` && obj.product) {
    obj.productId = obj.product.id;
    delete obj.product;
  }

  const Node = getFactory(remoteType);
  const node = Node({ ...obj, id: shopifyId });

  if (remoteType === `ProductImage`) {
    const fileNodeId = await downloadImageAndCreateFileNode(
      {
        url: node.originalSrc && node.originalSrc.split(`?`)[0],
        nodeId: node.id,
      },
      {
        createNode,
        createNodeId,
        touchNode,
        getCache,
        cache,
        store,
        reporter,
      }
    );

    node.localFile = fileNodeId;
  }

  return node;
}

function nodeBuilder(nodeHelpers, gatsbyApi) {
  const factoryMap = {};
  const getFactory = (remoteType) => {
    if (!factoryMap[remoteType]) {
      factoryMap[remoteType] = nodeHelpers.createNodeFactory(remoteType);
    }
    return factoryMap[remoteType];
  };

  return {
    async buildNode(obj) {
      if (obj.id) {
        return await buildFromId(obj, getFactory, gatsbyApi);
      }

      throw new Error(`Cannot create a node without type information`);
    },
  };
}

module.exports = {
  nodeBuilder,
};
