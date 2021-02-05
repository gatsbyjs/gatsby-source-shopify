import fetch, { Response } from "node-fetch";

const getBaseUrl = (options: ShopifyPluginOptions) =>
  `https://${options.apiKey}:${options.password}@${options.storeUrl}/admin/api/2021-01`;

export function makeShopifyFetch(options: ShopifyPluginOptions) {
  const baseUrl = getBaseUrl(options);

  function authenticatedUrl(urlString: string) {
    const url = new URL(urlString);
    return url
      .toString()
      .replace(url.host, `${options.apiKey}:${options.password}@${url.host}`);
  }

  async function shopifyFetch(
    path: string,
    fetchOptions = {},
    retries = 3
  ): Promise<Response> {
    const url = path.includes(options.storeUrl)
      ? authenticatedUrl(path)
      : `${baseUrl}${path}`;

    const resp = await fetch(url, fetchOptions);

    if (!resp.ok) {
      if (retries > 0) {
        if (resp.status === 429) {
          // rate limit
          const retryAfter = parseFloat(resp.headers.get("Retry-After") || "");
          await new Promise((resolve) => setTimeout(resolve, retryAfter));
          return shopifyFetch(path, options, retries - 1);
        }
      }
    }

    return resp;
  }

  return shopifyFetch;
}
