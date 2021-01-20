const { GraphQLClient } = require("graphql-request")

const adminUrl = `https://${process.env.SHOPIFY_ADMIN_API_KEY}:${process.env.SHOPIFY_ADMIN_PASSWORD}@${process.env.SHOPIFY_STORE_URL}/admin/api/2021-01/graphql.json`
module.exports.client = new GraphQLClient(adminUrl)
