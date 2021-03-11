import fetch from "node-fetch";

const adminUrl = (options: ShopifyPluginOptions) =>
  `https://${options.apiKey}:${options.password}@${options.storeUrl}/admin/api/2021-01/graphql.json`;

const MAX_BACKOFF_MILLISECONDS = 60000;

export function createClient(options: ShopifyPluginOptions) {
  const url = adminUrl(options);

  async function graphqlFetch<T>(
    query: string,
    variables?: Record<string, any>,
    retries = 0
  ): Promise<T> {
    console.info(`Attempting graphql fetch`);
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        variables,
      }),
    });

    if (!response.ok) {
      console.error(response);
      const waitTime = 2 ** (retries + 1) + 500;
      if (response.status >= 500 && waitTime < MAX_BACKOFF_MILLISECONDS) {
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        return graphqlFetch(query, variables, retries + 1);
      }

      throw response;
    }

    const json = await response.json();
    return json.data as T;
  }

  return { request: graphqlFetch };
}
