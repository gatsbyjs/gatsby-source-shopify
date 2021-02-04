"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.nodeBuilder = void 0;
const gatsby_source_filesystem_1 = require("gatsby-source-filesystem");
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
const downloadImageAndCreateFileNode = async ({ url, nodeId }, { createNode, createNodeId, touchNode, cache, store, reporter }) => {
    const mediaDataCacheKey = `Shopify__Media__${url}`;
    const cacheMediaData = await cache.get(mediaDataCacheKey);
    if (cacheMediaData) {
        const fileNodeID = cacheMediaData.fileNodeID;
        touchNode({ nodeId: fileNodeID });
        return fileNodeID;
    }
    const fileNode = await gatsby_source_filesystem_1.createRemoteFileNode({
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
async function buildFromId(obj, getFactory, gatsbyApi) {
    const [_, remoteType, shopifyId] = obj.id.match(pattern);
    const { createNodeId, actions: { createNode, touchNode }, cache, store, reporter, } = gatsbyApi;
    attachParentId(obj);
    /* FIXME
     * This is becoming littered with type checks.
     * To clean this up, maybe we can introduce a
     * mapping of custom processor functions.
     * ~sslotsky
     */
    if (remoteType === `ShopifyLineItem`) {
        const lineItem = obj;
        const [_match, _type, shopifyId] = lineItem.product.id.match(pattern);
        lineItem.productId = shopifyId;
        delete lineItem.product;
    }
    const Node = getFactory(remoteType);
    const node = Node(Object.assign(Object.assign({}, obj), { id: shopifyId }));
    if (remoteType === `ProductImage`) {
        const src = node.originalSrc;
        const fileNodeId = await downloadImageAndCreateFileNode({
            url: src && src.split(`?`)[0],
            nodeId: node.id,
        }, {
            createNode,
            createNodeId,
            touchNode,
            cache,
            store,
            reporter,
        });
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
exports.nodeBuilder = nodeBuilder;
//# sourceMappingURL=node-builder.js.map