import { CreateSchemaCustomizationArgs } from "gatsby";

export function createSchemaCustomization(
  { actions, schema }: CreateSchemaCustomizationArgs,
  pluginOptions: ShopifyPluginOptions
) {
  const includeCollections = pluginOptions.shopifyConnections?.includes(
    "collections"
  );

  const includeOrders = pluginOptions.shopifyConnections?.includes("orders");

  const name = (name: string) => `${pluginOptions.typePrefix || ""}${name}`;

  const productDef = schema.buildObjectType({
    name: name("ShopifyProduct"),
    fields: {
      variants: {
        type: `[${name("ShopifyProductVariant")}]`,
        extensions: {
          link: {
            from: "id",
            by: "productId",
          },
        },
      },
      images: {
        type: `[${name("ShopifyProductImage")}]`,
        extensions: {
          link: {
            from: "id",
            by: "productId",
          },
        },
      },
    },
    interfaces: ["Node"],
  });

  const productImageDef = schema.buildObjectType({
    name: name("ShopifyProductImage"),
    fields: {
      product: {
        type: name("ShopifyProduct!"),
        extensions: {
          link: {
            from: "productId",
            by: "id",
          },
        },
      },
    },
    interfaces: ["Node"],
  });

  if (pluginOptions.downloadImages && productImageDef.config.fields) {
    productImageDef.config.fields.localFile = {
      type: "File",
      extensions: {
        link: {},
      },
    };
  }

  if (includeCollections && productDef.config.fields) {
    productDef.config.fields.collections = {
      type: `[${name("ShopifyCollection")}]`,
      extensions: {
        link: {
          from: "id",
          by: "productIds",
        },
      },
    };
  }

  const typeDefs = [
    productDef,
    productImageDef,
    schema.buildObjectType({
      name: name("ShopifyProductVariant"),
      fields: {
        product: {
          type: name("ShopifyProduct!"),
          extensions: {
            link: {
              from: "productId",
              by: "id",
            },
          },
        },
        metafields: {
          type: `[${name("ShopifyMetafield")}]`,
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
      name: name("ShopifyMetafield"),
      fields: {
        productVariant: {
          type: name("ShopifyProductVariant!"),
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
        name: name("ShopifyCollection"),
        fields: {
          products: {
            type: `[${name("ShopifyProduct")}]`,
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

  if (includeOrders) {
    typeDefs.push(
      schema.buildObjectType({
        name: name("ShopifyOrder"),
        fields: {
          lineItems: {
            type: `[${name("ShopifyLineItem")}]`,
            extensions: {
              link: {
                from: "id",
                by: "orderId",
              },
            },
          },
        },
        interfaces: ["Node"],
      }),
      schema.buildObjectType({
        name: name("ShopifyLineItem"),
        fields: {
          product: {
            type: name("ShopifyProduct"),
            extensions: {
              link: {
                from: "productId",
                by: "id",
              },
            },
          },
          order: {
            type: name("ShopifyOrder!"),
            extensions: {
              link: {
                from: "orderId",
                by: "id",
              },
            },
          },
        },
        interfaces: ["Node"],
      })
    );
  }

  if (pluginOptions.downloadImages) {
    typeDefs.push(
      schema.buildObjectType({
        name: name("ShopifyProductFeaturedImage"),
        fields: {
          localFile: {
            type: "File",
            extensions: {
              link: {},
            },
          },
        },
        interfaces: ["Node"],
      })
    );

    if (includeCollections) {
      typeDefs.push(
        schema.buildObjectType({
          name: name("ShopifyCollectionImage"),
          fields: {
            localFile: {
              type: "File",
              extensions: {
                link: {},
              },
            },
          },
          interfaces: ["Node"],
        })
      );
    }
  }

  actions.createTypes(typeDefs);
}
