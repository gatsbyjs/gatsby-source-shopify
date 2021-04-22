export const OPERATION_STATUS_QUERY = `
    query OPERATION_STATUS {
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
        query
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
      query
    }
  }
}
`;

export const CANCEL_OPERATION = `
mutation CANCEL_OPERATION($id: ID!) {
  bulkOperationCancel(id: $id) {
    bulkOperation {
      status
    }
    userErrors {
      field
      message
    }
  }
}
`;

function bulkOperationQuery(query: string) {
  return `
    mutation INITIATE_BULK_OPERATION {
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
      ? `(query: "created_at:>='${dateString}' OR updated_at:>='${dateString}'")`
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

export const CREATE_ORDERS_OPERATION = bulkOperationQuery(ordersQuery());

export const incrementalOrdersQuery = (date: Date) =>
  bulkOperationQuery(ordersQuery(date.toISOString()));
