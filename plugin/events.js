const { shopifyFetch } = require('./rest')
const fetch = require('node-fetch')

async function fetchEventsSince(date) {
  const resp = await shopifyFetch(`/events.json`)//?created_at_min=${date.toISOString()}`
  const json = await resp.json()

  console.info(`Other page info: `, resp.headers.get('link'))
  console.info(`Rate limit info: `, resp.headers.get(`X-Shopify-Shop-Api-Call-Limit`))

  return json
}

module.exports = {
  fetchEventsSince
}