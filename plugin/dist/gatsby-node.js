"use strict";
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sourceNodes = void 0;
const node_fetch_1 = __importDefault(require("node-fetch"));
const gatsby_node_helpers_1 = require("gatsby-node-helpers");
const readline_1 = require("readline");
const operations_1 = require("./operations");
const node_builder_1 = require("./node-builder");
const events_1 = require("./events");
module.exports.pluginOptionsSchema = ({ Joi }) => {
    return Joi.object({
        apiKey: Joi.string().required(),
        password: Joi.string().required(),
        storeUrl: Joi.string().required(),
        shopifyConnections: Joi.array()
            .default([])
            .items(Joi.string().valid("orders")),
    });
};
function makeSourceFromOperation(finishLastOperation, completedOperation, gatsbyApi) {
    return async function sourceFromOperation(op) {
        var e_1, _a;
        const { reporter, actions, createNodeId, createContentDigest } = gatsbyApi;
        const operationComplete = `Sourced from bulk operation`;
        console.time(operationComplete);
        const nodeHelpers = gatsby_node_helpers_1.createNodeHelpers({
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
        const { bulkOperationRunQuery: { userErrors, bulkOperation }, } = await op();
        console.timeEnd(initiating);
        if (userErrors.length) {
            reporter.panic({
                id: ``,
                context: {
                    sourceMessage: `Couldn't perform bulk operation`,
                },
            }, userErrors);
        }
        const waitForCurrentOp = `Completed bulk operation`;
        console.time(waitForCurrentOp);
        let resp = await completedOperation(bulkOperation.id);
        console.timeEnd(waitForCurrentOp);
        if (parseInt(resp.node.objectCount, 10) === 0) {
            reporter.info(`No data was returned for this operation`);
            console.timeEnd(operationComplete);
            return;
        }
        const results = await node_fetch_1.default(resp.node.url);
        const rl = readline_1.createInterface({
            input: results.body,
            crlfDelay: Infinity,
        });
        const builder = node_builder_1.nodeBuilder(nodeHelpers, gatsbyApi);
        const creatingNodes = `Created nodes from bulk operation`;
        console.time(creatingNodes);
        const promises = [];
        try {
            for (var rl_1 = __asyncValues(rl), rl_1_1; rl_1_1 = await rl_1.next(), !rl_1_1.done;) {
                const line = rl_1_1.value;
                const obj = JSON.parse(line);
                promises.push(builder.buildNode(obj));
            }
        }
        catch (e_1_1) { e_1 = { error: e_1_1 }; }
        finally {
            try {
                if (rl_1_1 && !rl_1_1.done && (_a = rl_1.return)) await _a.call(rl_1);
            }
            finally { if (e_1) throw e_1.error; }
        }
        await Promise.all(promises.map(async (promise) => {
            const node = await promise;
            actions.createNode(node);
        }));
        console.timeEnd(creatingNodes);
        console.timeEnd(operationComplete);
    };
}
async function sourceAllNodes(gatsbyApi, pluginOptions) {
    const { createProductsOperation, createOrdersOperation, finishLastOperation, completedOperation, } = operations_1.createOperations(pluginOptions);
    const operations = [createProductsOperation];
    if (pluginOptions.shopifyConnections.includes("orders")) {
        operations.push(createOrdersOperation);
    }
    const sourceFromOperation = makeSourceFromOperation(finishLastOperation, completedOperation, gatsbyApi);
    await Promise.all(operations.map(sourceFromOperation));
}
const shopifyNodeTypes = [
    `ShopifyLineItem`,
    `ShopifyMetafield`,
    `ShopifyOrder`,
    `ShopifyProduct`,
    `ShopifyProductVariant`,
    `ShopifyProductVariantPricePair`,
];
async function sourceChangedNodes(gatsbyApi, pluginOptions) {
    const { incrementalProducts, incrementalOrders, finishLastOperation, completedOperation, } = operations_1.createOperations(pluginOptions);
    const lastBuildTime = await gatsbyApi.cache.get(`LAST_BUILD_TIME`);
    const touchNode = (node) => gatsbyApi.actions.touchNode({ nodeId: node.id });
    for (const nodeType of shopifyNodeTypes) {
        gatsbyApi.getNodesByType(nodeType).forEach(touchNode);
    }
    const operations = [incrementalProducts];
    if (pluginOptions.shopifyConnections.includes("orders")) {
        operations.push(incrementalOrders);
    }
    const sourceFromOperation = makeSourceFromOperation(finishLastOperation, completedOperation, gatsbyApi);
    const deltaSource = (op) => {
        const deltaOp = () => op(new Date(lastBuildTime).toISOString());
        return sourceFromOperation(deltaOp);
    };
    await Promise.all(operations.map(deltaSource));
    const { fetchDestroyEventsSince } = events_1.eventsApi(pluginOptions);
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
                const event = destroyEvents.find((e) => e.subject_id === parseInt(node.shopifyId, 10) &&
                    node.internal.type === `Shopify${e.subject_type}`);
                if (event) {
                    gatsbyApi.actions.deleteNode({ node });
                }
            });
        }
    }
}
async function sourceNodes(gatsbyApi, pluginOptions) {
    const lastBuildTime = await gatsbyApi.cache.get(`LAST_BUILD_TIME`);
    if (lastBuildTime) {
        await sourceChangedNodes(gatsbyApi, pluginOptions);
    }
    else {
        await sourceAllNodes(gatsbyApi, pluginOptions);
    }
    await gatsbyApi.cache.set(`LAST_BUILD_TIME`, Date.now());
}
exports.sourceNodes = sourceNodes;
exports.createSchemaCustomization = ({ actions }) => {
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
/**
 * FIXME
 *
 * What are the types for the resolve functions?
 */
exports.createResolvers = ({ createResolvers }) => {
    createResolvers({
        ShopifyOrder: {
            lineItems: {
                type: ["ShopifyLineItem"],
                resolve(source, _args, context, _info) {
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
                resolve(source, _args, context, _info) {
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
                resolve(source, _args, context, _info) {
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
                resolve(source, _args, context, _info) {
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
                resolve(source, _args, context, _info) {
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
    });
};
//# sourceMappingURL=gatsby-node.js.map