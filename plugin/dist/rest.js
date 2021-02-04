"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.makeShopifyFetch = void 0;
const node_fetch_1 = __importDefault(require("node-fetch"));
const getBaseUrl = (options) => `https://${options.apiKey}:${options.password}@${options.storeUrl}/admin/api/2021-01`;
function makeShopifyFetch(options) {
    const baseUrl = getBaseUrl(options);
    function authenticatedUrl(urlString) {
        const url = new URL(urlString);
        return url
            .toString()
            .replace(url.host, `${options.apiKey}:${options.password}@${url.host}`);
    }
    async function shopifyFetch(path, fetchOptions = {}, retries = 3) {
        const url = path.includes(options.storeUrl)
            ? authenticatedUrl(path)
            : `${baseUrl}${path}`;
        const resp = await node_fetch_1.default(url, fetchOptions);
        if (!resp.ok) {
            if (retries > 0) {
                if (resp.status === 429) {
                    // rate limit
                    const retryAfter = parseFloat(resp.headers.get("Retry-After"));
                    await new Promise((resolve) => setTimeout(resolve, retryAfter));
                    return shopifyFetch(path, options, retries - 1);
                }
            }
        }
        return resp;
    }
    return shopifyFetch;
}
exports.makeShopifyFetch = makeShopifyFetch;
//# sourceMappingURL=rest.js.map