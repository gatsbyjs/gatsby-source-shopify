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
  `
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
`

module.exports.CREATE_OPERATION = `
  mutation {
    bulkOperationRunQuery(
    query: """
      {
        products {
          edges {
            node {
              id
              title
              variants {
                edges {
                  node {
                    id
                    availableForSale
                    compareAtPrice
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

                    #######################################################
                    # FIXME!!
                    # How do we handle presentment prices?
                    # Because they are a connection, they are treated
                    # like a node, but they don't come back with an ID,
                    # so we don't actually know what they are, since the ID
                    # is what contains the type info. Can we verify that we
                    # actually need this data? How do customers use it?

                    # presentmentPrices {
                    #   edges {
                    #     node {
                    #       price {
                    #         amount
                    #         currencyCode
                    #       }
                    #       compareAtPrice {
                    #         amount
                    #         currencyCode
                    #       }
                    #     }
                    #   }
                    # }
                    #######################################################
                  }
                }
              }
            }
          }
        }
      }
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
`
