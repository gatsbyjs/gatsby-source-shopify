require("dotenv").config();

module.exports = {
  plugins: [
    {
      resolve: "gatsby-source-shopify-experimental",
      options: {
        apiKey: process.env.SHOPIFY_ADMIN_API_KEY,
        password: process.env.SHOPIFY_ADMIN_PASSWORD,
        storeUrl: process.env.SHOPIFY_STORE_URL,
        shopifyConnections: ["collections", "orders"],
      },
    },
  ],
};
