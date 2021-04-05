import { NodeInput, SourceNodesArgs } from "gatsby";
import { pattern as idPattern, createNodeId } from "./node-builder";

export function collectionsProcessor(
  objects: BulkResults,
  builder: NodeBuilder,
  gatsbyApi: SourceNodesArgs,
  pluginOptions: ShopifyPluginOptions
): Promise<NodeInput>[] {
  const promises = [];

  /**
   * Read results in reverse so we can collect child node IDs.
   * See Shopify Bulk Operation guide for more info.
   *
   * https://shopify.dev/tutorials/perform-bulk-operations-with-admin-api#download-result-data
   */
  for (let i = objects.length - 1; i >= 0; i--) {
    const result = objects[i];
    const [, remoteType] = result.id.match(idPattern) || [];
    if (remoteType !== `Collection`) {
      /**
       * Collect product node IDs until we get to the parent collection.
       * This is necessary for many-to-many relationships, like the
       * products connection, which is currently the only connection
       * we are requesting.
       *
       * One-to-many relationships wouldn't need this,
       * e.g. if the remote type is a metafield we can just create a
       * metafield node with a collectionId.
       *
       */
      const productIds = [];
      let j = i;

      while (objects[j].id !== result.__parentId) {
        const [siblingId, siblingRemoteType] =
          objects[j].id.match(idPattern) || [];

        if (pluginOptions.debugMode) {
          console.info(
            `Processing collection ${result.__parentId} child node ${objects[j].id}`
          );
        }

        if (siblingRemoteType === `Product`) {
          productIds.push(createNodeId(siblingId, gatsbyApi, pluginOptions));
        }

        j--;
      }

      const collection = objects[j];

      collection.productIds = productIds;
      promises.push(builder.buildNode(collection));

      const nextSlice = objects.slice(0, j);

      if (pluginOptions.debugMode) {
        console.info(
          `Ready to create collection '${collection.title}' with child product IDs:`,
          collection.productIds
        );
      }

      return promises.concat(
        collectionsProcessor(nextSlice, builder, gatsbyApi, pluginOptions)
      );
    } else {
      if (pluginOptions.debugMode) {
        console.info(
          `Ready to create collection '${result.title}' with no child products`
        );
      }
      promises.push(builder.buildNode(result));
    }
  }

  return promises;
}
