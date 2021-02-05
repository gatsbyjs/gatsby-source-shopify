export const OPERATION_STATUS_QUERY = `
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

export const OPERATION_BY_ID = `
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

function bulkOperationQuery(query: string) {
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

const ordersQuery = (dateString?: string) => `
{
  orders${
    dateString
      ? `(query: "created_at:>=${dateString} OR updated_at:>=${dateString}")`
      : ``
  } {
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

const productsQuery = (dateString?: string) => `
{
  products${
    dateString
      ? `(query: "created_at:>=${dateString} OR updated_at:>=${dateString}")`
      : ``
  } {
    edges {
      node {
        id
        storefrontId
        title
        handle
        description
        productType
        publishedAt
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
              storefrontId
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

export const CREATE_PRODUCTS_OPERATION = bulkOperationQuery(productsQuery());
export const CREATE_ORDERS_OPERATION = bulkOperationQuery(ordersQuery());

export const incrementalProductsQuery = (date: Date) =>
  bulkOperationQuery(productsQuery(date.toISOString()));
export const incrementalOrdersQuery = (date: Date) =>
  bulkOperationQuery(ordersQuery(date.toISOString()));
