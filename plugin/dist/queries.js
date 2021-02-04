"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.incrementalOrdersQuery = exports.incrementalProductsQuery = exports.CREATE_ORDERS_OPERATION = exports.CREATE_PRODUCTS_OPERATION = exports.OPERATION_BY_ID = exports.OPERATION_STATUS_QUERY = void 0;
exports.OPERATION_STATUS_QUERY = `
    query {
      currentBulkOperation {
        id
        status
        errorCode
        createdAt
        completedAt
        objectCount
        fileSize
        url
        partialDataUrl
      }
    }
  `;
exports.OPERATION_BY_ID = `
query OPERATION_BY_ID($id: ID!) {
  node(id: $id) {
    ... on BulkOperation {
      id
      status
      errorCode
      createdAt
      completedAt
      objectCount
      fileSize
      url
      partialDataUrl
    }
  }
}
`;
function bulkOperationQuery(query) {
    return `
    mutation {
      bulkOperationRunQuery(
      query: """
        ${query}
      """
    ) {
      bulkOperation {
        id
        status
      }
      userErrors {
        field
        message
      }
    }
  }
  `;
}
const ordersQuery = (date) => `
{
  orders${date ? `(query: "created_at:>=${date} OR updated_at:>=${date}")` : ``} {
    edges {
      node {
        id
        edited
        closed
        closedAt
        refunds {
          id
          createdAt
        }
        lineItems {
          edges {
            node {
              id
              product {
                id
              }
            }
          }
        }
      }
    }
  }
}
`;
const productsQuery = (date) => `
{
  products${date ? `(query: "created_at:>=${date} OR updated_at:>=${date}")` : ``} {
    edges {
      node {
        id
        title
        handle
        description
        productType
        publishedAt
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
        images {
          edges {
            node {
              id
              altText
              src
              originalSrc
            }
          }
        }
        variants {
          edges {
            node {
              id
              availableForSale
              compareAtPrice
              title
              selectedOptions {
                name
                value
              }
              price
              metafields {
                edges {
                  node {
                    description
                    id
                    key
                    namespace
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
exports.CREATE_PRODUCTS_OPERATION = bulkOperationQuery(productsQuery());
exports.CREATE_ORDERS_OPERATION = bulkOperationQuery(ordersQuery());
const incrementalProductsQuery = (date) => bulkOperationQuery(productsQuery(date));
exports.incrementalProductsQuery = incrementalProductsQuery;
const incrementalOrdersQuery = (date) => bulkOperationQuery(ordersQuery(date));
exports.incrementalOrdersQuery = incrementalOrdersQuery;
//# sourceMappingURL=queries.js.map