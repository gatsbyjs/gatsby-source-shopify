const { createRemoteFileNode } = require("gatsby-source-filesystem");

// 'gid://shopify/Metafield/6936247730264'
const pattern = /^gid:\/\/shopify\/(\w+)\/(.+)$/;

function attachParentId(obj) {
  if (obj.__parentId) {
    const [_, remoteType, id] = obj.__parentId.match(pattern);
    const field = remoteType.charAt(0).toLowerCase() + remoteType.slice(1);
    const idField = `${field}Id`;
    obj[idField] = id;
    delete obj.__parentId;
  }
}

async function buildFromId(obj, getFactory, gatsbyApi) {
  const [_, remoteType, shopifyId] = obj.id.match(pattern);
  const {
    createNodeId,
    actions: { createNode },
    getCache,
  } = gatsbyApi;

  attachParentId(obj);

  /* FIXME
   * This is becoming littered with type checks.
   * To clean this up, maybe we can introduce a
   * mapping of custom processor functions.
   * ~sslotsky
   */
  if (remoteType === `ShopifyLineItem` && obj.product) {
    const [_match, _type, shopifyId] = obj.product.id.match(pattern);
    obj.productId = shopifyId;
    delete obj.product;
  }

  const Node = getFactory(remoteType);
  const node = Node({ ...obj, id: shopifyId });

  if (remoteType === `ProductImage`) {
    const fileNode = await createRemoteFileNode({
      url: node.src,
      getCache,
      createNode,
      createNodeId,
      parentNodeId: node.id,
    });

    node.localFile = fileNode.id;
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
