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
              handle
              description
              productType
              publishedAt
              media {
                edges {
                  node {
                    __typename
                    alt
                    mediaContentType
                    preview {
                      image {
                        id
                        altText
                        originalSrc
                      }
                    }
                    status
                  }
                }
              }
              variants {
                edges {
                  node {
                    id
                    title
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
                    presentmentPrices {
                      edges {
                        node {
                          __typename
                          price {
                            amount
                            currencyCode
                          }
                          compareAtPrice {
                            amount
                            currencyCode
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
