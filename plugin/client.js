const { GraphQLClient } = require("graphql-request");

const adminUrl = (options) =>
  `https://${options.apiKey}:${options.password}@${options.storeUrl}/admin/api/2021-01/graphql.json`;
module.exports.createClient = (options) => new GraphQLClient(adminUrl(options));
