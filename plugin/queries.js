module.exports.OPERATION_STATUS_QUERY = `
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
module.exports.OPERATION_BY_ID = `
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
  orders${
    date ? `(query: "created_at:>=${date} OR updated_at:>=${date}")` : ``
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

const productsQuery = (date) => `
{
  products${
    date ? `(query: "created_at:>=${date} OR updated_at:>=${date}")` : ``
  } {
    edges {
      node {
        id
        title
        handle
        description
        productType
        publishedAt
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

module.exports.CREATE_PRODUCTS_OPERATION = bulkOperationQuery(productsQuery());
module.exports.CREATE_ORDERS_OPERATION = bulkOperationQuery(ordersQuery());

module.exports.incrementalProductsQuery = (date) =>
  bulkOperationQuery(productsQuery(date));
module.exports.incrementalOrdersQuery = (date) =>
  bulkOperationQuery(ordersQuery(date));
