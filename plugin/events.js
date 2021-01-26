const { shopifyFetch } = require("./rest");
const fetch = require("node-fetch");

async function fetchDestroyEventsSince(date) {
  let resp = await shopifyFetch(
    `/events.json?limit=250&verb=destroy&created_at_min=${date.toISOString()}`
  );

  const { events } = await resp.json();

  while (true) {
    const paginationInfo = resp.headers.get("link");
    if (!paginationInfo) {
      break;
    }

    const pageLinks = paginationInfo.split(",").map((pageData) => {
      const [_, url, rel] = pageData.match(/<(.*)>; rel="(.*)"/);
      return {
        url,
        rel,
      };
    });

    const nextPage = pageLinks.find((l) => l.rel === `next`);

    if (nextPage) {
      resp = await shopifyFetch(nextPage.url);
      const { events: nextEvents } = await resp.json();
      events.push(...nextEvents);
    } else {
      break;
    }
  }

  return events;
}

module.exports = {
  fetchDestroyEventsSince,
};
