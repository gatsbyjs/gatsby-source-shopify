const fetch = require('node-fetch')

const eventsBaseUrl = `https://${process.env.SHOPIFY_ADMIN_API_KEY}:${process.env.SHOPIFY_ADMIN_PASSWORD}@${process.env.SHOPIFY_STORE_URL}/admin/api/2021-01/events.json`

async function fetchEventsSince(date) {
  const url = `${eventsBaseUrl}?created_at_min=${date.toISOString()}`
  const resp = await fetch(url)
  const json = await resp.json()

  console.info(json)

  return json
}

module.exports = {
  fetchEventsSince
}