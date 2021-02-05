import { GraphQLClient } from "graphql-request";

const adminUrl = (options: ShopifyPluginOptions) =>
  `https://${options.apiKey}:${options.password}@${options.storeUrl}/admin/api/2021-01/graphql.json`;

export function createClient(options: ShopifyPluginOptions) {
  return new GraphQLClient(adminUrl(options));
}
