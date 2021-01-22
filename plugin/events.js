const { shopifyFetch } = require('./rest')
const fetch = require('node-fetch')

async function fetchEventsSince(date) {
  let resp = await shopifyFetch(`/events.json?limit=250`)//?created_at_min=${date.toISOString()}`

  console.info(`Other page info: `, resp.headers.get('link'))
  console.info(`Rate limit info: `, resp.headers.get(`X-Shopify-Shop-Api-Call-Limit`))
  const { events } = await resp.json()

  while(true) {
    const paginationInfo = resp.headers.get('link')
    if (!paginationInfo) {
      break
    }

    const pageLinks = paginationInfo.split(',').map(pageData => {
      const [_, url, rel] = pageData.match(/<(.*)>; rel="(.*)"/)
      return {
        url,
        rel
      }
    })

    console.info(pageLinks)

    const nextPage = pageLinks.find(l => l.rel === `next`)

    if (nextPage) {
      resp = await shopifyFetch(nextPage.url)
      const { events: nextEvents } = await resp.json()
      events.push(...nextEvents)
    } else {
      console.info(`We're done here`)
      break
    }
  }

  return events
}

module.exports = {
  fetchEventsSince
}