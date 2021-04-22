import { BulkQuery } from "./bulk-query";

export class CollectionsQuery extends BulkQuery {
  get usesPublicationData() {
    const connections = this.pluginOptions.shopifyConnections || [];
    return connections.includes("publications");
  }

  query(date?: Date) {
    const filters = [];
    if (date) {
      const isoDate = date.toISOString();
      filters.push(`created_at:>='${isoDate}' OR updated_at:>='${isoDate}'`);
    }

    const queryString = filters.map((f) => `(${f})`).join(" AND ");

    const query = `
      {
        collections(query: "${queryString}") {
          edges {
            node {
              products {
                edges {
                  node {
                    id
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
              description
              descriptionHtml
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
              handle
              id
              image {
                id
                altText
                height
                width
                originalSrc
                transformedSrc
              }
              legacyResourceId
              productsCount
              ruleSet {
                appliedDisjunctively
                rules {
                  column
                  condition
                  relation
                }
              }
              seo {
                description
                title
              }
              ${this.conditionalField(
                "publishedOnCurrentPublication",
                this.usesPublicationData
              )}
              sortOrder
              storefrontId
              templateSuffix
              title
              updatedAt
            }
          }
        }
      }
      `;

    return this.bulkOperationQuery(query);
  }
}
