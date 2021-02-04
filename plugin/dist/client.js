"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createClient = void 0;
const graphql_request_1 = require("graphql-request");
const adminUrl = (options) => `https://${options.apiKey}:${options.password}@${options.storeUrl}/admin/api/2021-01/graphql.json`;
function createClient(options) {
    return new graphql_request_1.GraphQLClient(adminUrl(options));
}
exports.createClient = createClient;
//# sourceMappingURL=client.js.map