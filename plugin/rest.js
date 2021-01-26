const fetch = require("node-fetch");

const baseUrl = `https://${process.env.SHOPIFY_ADMIN_API_KEY}:${process.env.SHOPIFY_ADMIN_PASSWORD}@${process.env.SHOPIFY_STORE_URL}/admin/api/2021-01`;

function authenticatedUrl(urlString) {
  const url = new URL(urlString);
  return url
    .toString()
    .replace(
      url.host,
      `${process.env.SHOPIFY_ADMIN_API_KEY}:${process.env.SHOPIFY_ADMIN_PASSWORD}@${url.host}`
    );
}

async function shopifyFetch(path, options = {}, retries = 3) {
  const url = path.includes(process.env.SHOPIFY_STORE_URL)
    ? authenticatedUrl(path)
    : `${baseUrl}${path}`;
  console.log(path, url);

  const resp = await fetch(url, options);

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

module.exports = { shopifyFetch };
