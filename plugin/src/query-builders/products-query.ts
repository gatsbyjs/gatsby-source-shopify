import { BulkQuery } from "./bulk-query";

export class ProductsQuery extends BulkQuery {
  query(date?: Date) {
    const filters = [`status:active`];
    if (date) {
      const isoDate = date.toISOString();
      filters.push(`created_at:>='${isoDate}' OR updated_at:>='${isoDate}'`);
    }

    const queryString = filters.map((f) => `(${f})`).join(" AND ");

    const query = `
      {
        products(query: "${queryString}") {
          edges {
            node {
              id
              storefrontId
              ${this.conditionalField(
                "availablePublicationCount",
                this.canReadPublications
              )}
              createdAt
              description
              descriptionHtml
              featuredImage {
                id
                altText
                height
                width
                originalSrc
                transformedSrc
              }
              featuredMedia {
                alt
                mediaContentType
                mediaErrors {
                  details
                }
                preview {
                  image {
                    id
                    altText
                    height
                    width
                    originalSrc
                    transformedSrc
                  }
                  status
                }
                status
              }
              feedback {
                details {
                  app {
                    id
                  }
                  link {
                    label
                    url
                  }
                  messages {
                    field
                    message
                  }
                }
                summary
              }
              giftCardTemplateSuffix
              handle
              hasOnlyDefaultVariant
              hasOutOfStockVariants
              isGiftCard
              legacyResourceId
              mediaCount
              onlineStorePreviewUrl
              onlineStoreUrl
              options {
                id
                name
                position
                values
              }
              priceRangeV2 {
                maxVariantPrice {
                  amount
                  currencyCode
                }
                minVariantPrice {
                  amount
                  currencyCode
                }
              }
              productType
              ${this.conditionalField(
                "publicationCount",
                this.canReadPublications
              )}
              publishedAt
              publishedOnCurrentPublication
              requiresSellingPlan
              sellingPlanGroupCount
              seo {
                description
                title
              }
              status
              tags
              templateSuffix
              title
              totalInventory
              totalVariants
              tracksInventory
              updatedAt
              vendor
              images {
                edges {
                  node {
                    id
                    altText
                    src
                    originalSrc
                    width
                    height
                  }
                }
              }
              metafields {
                edges {
                  node {
                    createdAt
                    description
                    id
                    key
                    legacyResourceId
                    namespace
                    ownerType
                    updatedAt
                    value
                    valueType
                  }
                }
              }
              variants {
                edges {
                  node {
                    availableForSale
                    barcode
                    compareAtPrice
                    createdAt
                    displayName
                    id
                    image {
                      id
                      altText
                      height
                      width
                      originalSrc
                      transformedSrc
                    }
                    inventoryPolicy
                    inventoryQuantity
                    legacyResourceId
                    position
                    price
                    selectedOptions {
                      name
                      value
                    }
                    sellingPlanGroupCount
                    sku
                    storefrontId
                    taxCode
                    taxable
                    title
                    updatedAt
                    weight
                    weightUnit
                    metafields {
                      edges {
                        node {
                          createdAt
                          description
                          id
                          key
                          legacyResourceId
                          namespace
                          ownerType
                          updatedAt
                          value
                          valueType
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;

    return this.bulkOperationQuery(query);
  }
}
