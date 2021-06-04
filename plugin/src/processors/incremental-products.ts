import { NodeInput, SourceNodesArgs } from "gatsby";
import { pattern as idPattern, createNodeId } from "../node-builder";

export function incrementalProductsProcessor(
  objects: BulkResults,
  builder: NodeBuilder,
  gatsbyApi: SourceNodesArgs,
  pluginOptions: ShopifyPluginOptions
): Promise<NodeInput>[] {
  const products = objects.filter((obj) => {
    const [, remoteType] = obj.id.match(idPattern) || [];

    return remoteType === 'Product';
  })

  const nodeIds = products.map(product => {
    return createNodeId(product.id, gatsbyApi, pluginOptions)
  })

  const variants = gatsbyApi.getNodesByType(`${pluginOptions.typePrefix || ``}ShopifyProductVariant`).filter((node) => nodeIds.includes(node.productId as string))

  variants.forEach(variant => {
    gatsbyApi.actions.deleteNode(variant)
  })

  return objects.map(builder.buildNode);
}
