require("dotenv").config()
const fetch = require("node-fetch")
const { createNodeHelpers } = require("gatsby-node-helpers")
const { createInterface } = require("readline")
const { GraphQLClient } = require("graphql-request")

const adminUrl = `https://${process.env.SHOPIFY_ADMIN_API_KEY}:${process.env.SHOPIFY_ADMIN_PASSWORD}@${process.env.SHOPIFY_STORE_URL}/admin/api/2021-01/graphql.json`
const client = new GraphQLClient(adminUrl)

module.exports.sourceNodes = async function({ reporter, actions, createNodeId, createContentDigest }) {
  const nodeHelpers = createNodeHelpers({
    typePrefix: `Shopify`,
    createNodeId,
    createContentDigest,
  })

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
                variants {
                  edges {
                    node {
                      id
                      availableForSale
                      compareAtPrice
                      price
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

  /* FIXME
   * This will fail if there's an operation in progress
   * for this shop. Should we just keep polling if we
   * get this error?
   */
  const { bulkOperationRunQuery: { userErrors, bulkOperation} } = await client.request(productsOperation)

  if (userErrors.length) {
    reporter.panic({
      context: {
        sourceMessage: `Couldn't perform bulk operation`
      }
    }, ...userErrors)
  }

  let operationResponse

  while(true) {
    console.info(`Polling bulk operation status`)
    operationResponse = await client.request(operationStatusQuery)
    console.info(bulkOperation, operationResponse)
    const { currentBulkOperation } = operationResponse
    if (currentBulkOperation.status === 'COMPLETED' && currentBulkOperation.id === bulkOperation.id) {
      break
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000))
  }

  const results = await fetch(operationResponse.currentBulkOperation.url)
  const rl = createInterface({
    input: results.body,
    crlfDelay: Infinity,
  })

  const objects = []
  for await (const line of rl) {
    objects.push(JSON.parse(line))
  }

  // 'gid://shopify/Metafield/6936247730264'
  const pattern = /^gid:\/\/shopify\/(\w+)\/(.+)$/
  const factoryMap = {}
  for(var i = objects.length - 1; i >= 0; i--) {
    const obj = objects[i]
    console.log(obj)
    const [_, remoteType, shopifyId] = obj.id.match(pattern)
    if (!factoryMap[remoteType]) {
      factoryMap[remoteType] = nodeHelpers.createNodeFactory(remoteType)
    }

    if (obj.__parentId) {
      const [_, remoteType, id] = obj.__parentId.match(pattern)
      const field = remoteType.charAt(0).toLowerCase() + remoteType.slice(1)
      const idField = `${field}Id`
      obj[idField] = id
      delete obj.__parentId
    }

    const Node = factoryMap[remoteType]
    const node = Node({ ...obj, id: shopifyId })
    actions.createNode(node)
  }
}

exports.createSchemaCustomization = ({ actions }) => {
  actions.createTypes(`
    type ShopifyProductVariant implements Node {
      product: ShopifyProduct @link(from: "productId", by: "shopifyId")
    }

    type ShopifyProduct implements Node {
      variants: [ShopifyProductVariant]
    }
  `)
}

exports.createResolvers = ({ createResolvers }) => {
  createResolvers({
    ShopifyProduct: {
      variants: {
        type: ["ShopifyProductVariant"],
        resolve(source, args, context, info) {
          return context.nodeModel.runQuery({
            query: {
              filter: {
                productId: { eq: source.shopifyId }
              }
            },
            type: "ShopifyProductVariant",
            firstOnly: false,
          })
        }
      }
    },
  })
}