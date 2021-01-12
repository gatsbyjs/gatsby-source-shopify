require("dotenv").config()
const fetch = require("node-fetch")
const GraphQLClient = require("graphql-request").GraphQLClient

const adminUrl = `https://${process.env.SHOPIFY_ADMIN_API_KEY}:${process.env.SHOPIFY_ADMIN_PASSWORD}@${process.env.SHOPIFY_STORE_URL}/admin/api/2021-01/graphql.json`
const client = new GraphQLClient(adminUrl)

module.exports.sourceNodes = async function() {
  const productsOperation = `
    mutation {
      bulkOperationRunQuery(
      query: """
        {
          products {
            edges {
              node {
                id
                title
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

  const operationStatusQuery = `
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

  const response = await client.request(productsOperation)

  let operationResponse

  while(true) {
    operationResponse = await client.request(operationStatusQuery)
    if (operationResponse.currentBulkOperation.status === `COMPLETED`) {
      break
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000))
  }

  const results = await fetch(operationResponse.currentBulkOperation.url)
  console.log(await results.text())
}
