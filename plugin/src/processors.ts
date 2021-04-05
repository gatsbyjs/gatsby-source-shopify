import { NodeInput, SourceNodesArgs } from "gatsby";
import { pattern as idPattern, createNodeId } from "./node-builder";

export function collectionsProcessor(
  objects: BulkResults,
  builder: NodeBuilder,
  gatsbyApi: SourceNodesArgs,
  pluginOptions: ShopifyPluginOptions
): Promise<NodeInput>[] {
  const promises = [];
  const collectionProductIndex: { [collectionId: string]: string[] } = {};

  for (let i = objects.length - 1; i >= 0; i--) {
    const result = objects[i];
    const [id, remoteType] = result.id.match(idPattern) || [];
    if (remoteType === `Product`) {
      if (!collectionProductIndex[result.__parentId]) {
        collectionProductIndex[result.__parentId] = [];
      }

      collectionProductIndex[result.__parentId].push(
        createNodeId(id, gatsbyApi, pluginOptions)
      );
    }

    if (remoteType == `Collection`) {
      const collection = objects[i];
      collection.productIds = collectionProductIndex[result.id] || [];
      promises.push(builder.buildNode(collection));
    }
  }

  return promises;
}
