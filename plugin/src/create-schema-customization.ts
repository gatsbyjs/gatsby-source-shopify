import { CreateSchemaCustomizationArgs } from "gatsby";

export function createSchemaCustomization(
  { actions, schema }: CreateSchemaCustomizationArgs,
  pluginOptions: ShopifyPluginOptions
) {
  const includeCollections =
    pluginOptions.shopifyConnections &&
    pluginOptions.shopifyConnections.includes("collections");

  // const includeOrders =
  //   pluginOptions.shopifyConnections &&
  //   pluginOptions.shopifyConnections.includes("orders");

  // const productImageFields: Fields = {
  //   product: {
  //     type: "ShopifyProduct",
  //
  //   }
  //   //product: `ShopifyProduct @link(from: "productId", by: "id")`,
  // };

  // if (pluginOptions.downloadImages) {
  //   productImageFields.localFile = `File @link`;
  // }

  const typeDefs = [
    schema.buildObjectType({
      name: "ShopifyProduct",
      fields: {
        // collections: includeCollections ? {
        //   type: "[ShopifyCollection]",
        //   extensions: {
        //     directives: [{
        //       name: "link",
        //       args: {
        //         from: "id",
        //         by: "productIds"
        //       }
        //     }]
        //   }
        // } : undefined,
        variants: {
          type: "[ShopifyProductVariant]",
          extensions: {
            link: {
              from: "id",
              by: "productId",
            },
          },
        },
        images: {
          type: "[ShopifyProductImage]",
          extensions: {
            link: {
              from: "id",
              by: "productId",
            },
          },
        },
      },
      interfaces: ["Node"],
    }),
    schema.buildObjectType({
      name: "ShopifyProductImage",
      fields: {
        product: {
          type: "ShopifyProduct!",
          extensions: {
            link: {
              from: "productId",
              by: "id",
            },
          },
        },
      },
      interfaces: ["Node"],
    }),
    schema.buildObjectType({
      name: "ShopifyProductVariant",
      fields: {
        product: {
          type: "ShopifyProduct",
          extensions: {
            link: {
              from: "productId",
              by: "id",
            },
          },
        },
        metafields: {
          type: `[ShopifyMetafield]`,
          extensions: {
            link: {
              from: "id",
              by: "productVariantId",
            },
          },
        },
      },
      interfaces: ["Node"],
    }),
    /**
     * FIXME: let's change this to e.g. ShopifyProductVariantMetafield,
     * because we will want metafields attached to other resource types
     * as well. This will need to come with a change in node creation logic
     * where the type name is partially derived from the parent ID.
     */
    schema.buildObjectType({
      name: "ShopifyMetafield",
      fields: {
        productVariant: {
          type: "ShopifyProductVariant!",
          extensions: {
            link: {
              from: "productVariantId",
              by: "id",
            },
          },
        },
      },
      interfaces: ["Node"],
    }),
  ];

  if (includeCollections) {
    typeDefs.push(
      schema.buildObjectType({
        name: "ShopifyCollection",
        fields: {
          products: {
            type: "[ShopifyProduct]",
            extensions: {
              link: {
                from: "productIds",
                by: "id",
              },
            },
          },
        },
        interfaces: ["Node"],
      })
    );
  }

  // if (includeOrders) {
  //   typeDefs.push(
  //     schema.buildObjectType({
  //       name: "ShopifyOrder",
  //       fields: {
  //         lineItems: `[ShopifyLineItem] @link(from: "id", by: "orderId")`,
  //       },
  //       interfaces: ["Node"],
  //     }),
  //     schema.buildObjectType({
  //       name: "ShopifyLineItem",
  //       fields: {
  //         product: `ShopifyProduct @link(from: "productId", by: "id")`,
  //         order: `ShopifyOrder! @link(from: "orderId", by: "id")`,
  //       },
  //     })
  //   );
  // }

  // if (pluginOptions.downloadImages) {
  //   typeDefs.push(
  //     schema.buildObjectType({
  //       name: "ShopifyProductFeaturedImage",
  //       fields: {
  //         localFile: `File @link`,
  //       },
  //       interfaces: ["Node"],
  //     })
  //   );

  //   if (includeCollections) {
  //     typeDefs.push(
  //       schema.buildObjectType({
  //         name: "ShopifyCollectionImage",
  //         fields: {
  //           localFile: `File @link`,
  //         },
  //         interfaces: ["Node"],
  //       })
  //     );
  //   }
  // }

  actions.createTypes(typeDefs);
}
