# gatsby-source-shopify-experimental

A scalable solution for sourcing data from Shopify.

This plugin works by leveraging [Shopify's bulk operations API][bulk-operations], which allows us to process large amounts of data at once. This gives us a more resilient and reliable build process. It also enables incremental builds so that your site can build quickly when you change your data in Shopify.

## Getting started

This takes you through the minimal steps to see your Shopify data in your Gatsby site's GraphiQL explorer.

### Install

Install this plugin to your Gatsby site.

```
npm i gatsby-source-wordpress-experimental
```

### Configure

Add the plugin to your `gatsby-config.js`, e.g.

```js
require("dotenv").config();

module.exports = {
  plugins: [
    {
      resolve: "gatsby-source-shopify-experimental",
      options: {
        apiKey: process.env.SHOPIFY_ADMIN_API_KEY,
        password: process.env.SHOPIFY_ADMIN_PASSWORD,
        storeUrl: process.env.SHOPIFY_STORE_URL,
      },
    },
  ],
};
```

_TODO_: add instructions for finding these values

### Fire it up

Run your site with `gatsby develop`. When the site builds successfully, you should see output like this:

```
You can now view test-site in the browser.
⠀
  http://localhost:8000/
⠀
View GraphiQL, an in-browser IDE, to explore your site's data and schema
⠀
  http://localhost:8000/___graphql
⠀
Note that the development build is not optimized.
To create a production build, use gatsby build
```

Now follow the second link to explore your Shopify data!

## Plugin options

`apiKey: string`

The admin API key for the Shopify store + app you're using

`password: string`

The admin password for the Shopify store + app you're using

`storeUrl: string`

Your Shopify store URL, e.g. some-shop.myshopify.com

`shopifyConnections: string[]`

An optional array of additional data types to source.

Accepted values: `'orders'`, `'collections'`

`downloadImages: bool`

Not set by default. If set to `true`, this plugin will download and process images during the build.

The plugin's default behavior is to fall back to Shopify's CDN.

## Images

We offer two options for displaying Shopify images in your Gatsby site. The default option is to use the Shopify CDN along with [gatsby-plugin-image][gatsby-plugin-image], but you can also opt-in to downloading the images as part of the build process. Your choice will result in differences to the schema. Both options are explained below.

### Use Shopify CDN

This is the default behavior and is intended to be used in conjunction with [gatsby-plugin-image][gatsby-plugin-image]. In this case, querying for image data from your Gatsby site might look like this:

```gql
products: allShopifyProduct(
  sort: { fields: [publishedAt], order: ASC }
) {
  edges {
    node {
      id
      storefrontId
      featuredImage {
        id
        altText
        gatsbyImageData(width: 910, height: 910)
      }
    }
  }
}
```

You could then display the image in your component like this:

```js
import { GatsbyImage } from "gatsby-plugin-image";

function ProductListing(product) {
  return (
    <GatsbyImage
      image={product.featuredImage.gatsbyImageData}
      alt={product.featuredImage.altText}
    />
  );
}
```

### Download up front

If you wish to download your images during the build, you can specify `downloadImages: true` as a plugin option:

```js
require("dotenv").config();

module.exports = {
  plugins: [
    {
      resolve: "gatsby-source-shopify-experimental",
      options: {
        apiKey: process.env.SHOPIFY_ADMIN_API_KEY,
        password: process.env.SHOPIFY_ADMIN_PASSWORD,
        storeUrl: process.env.SHOPIFY_STORE_URL,
        downloadImages: true,
      },
    },
  ],
};
```

This will make the build take longer but will make images appear on your page faster at runtime. If you use this option, you can query for your image data like this.

```gql
products: allShopifyProduct(
  sort: { fields: [publishedAt], order: ASC }
) {
  edges {
    node {
      id
      storefrontId
      featuredImage {
        id
        localFile {
          childImageSharp {
            fluid(maxWidth: 910, maxHeight: 910) {
              ...GatsbyImageSharpFluid_withWebp
            }
          }
        }
        altText
      }
    }
  }
}
```

Then you would use `gatsby-image` to render the image:

```js
import Image from "gatsby-image";

function ProductListing(product) {
  const fluid = product.featuredImage.localFile.childImageSharp.fluid;

  return <Image fluid={fluid} alt={product.featuredImage.altText} />;
}
```

## Limitations

The bulk API was chosen for resiliency, but it comes with some limitations. For a given store + app combination, only one bulk operation can be run at a time, so this plugin will wait for in-progress operations to complete. If your store contains a lot of data and there are multiple developers doing a clean build at the same time, they could be waiting on each other for a significant period of time.

Possible workarounds include:

1. Using a smaller test store for development so that bulk operations finish fast
1. Creating multiple apps for the same store

## Development

This is a yarn workspace with the plugin code in a `plugin/` folder and a test Gatsby site in the `test-site/` folder. After cloning the repo, you can run `yarn` from the project root and all dependencies for both the plugin and the test site will be installed. Then you compile the plugin in watch mode and run the test site. In other words,

1. From the project root, run `yarn`
1. `cd plugin`
1. `yarn watch`
1. Open a new terminal window to the `test-site/` folder
1. `yarn start`

Subsequent builds will be incremental unless you run `yarn clean` from the `test-site/` folder to clear Gatsby's cache.

You can also test an incremental build without restarting the test site by running `yarn refresh` from the `test-site/` folder.

[bulk-operations]: https://shopify.dev/tutorials/perform-bulk-operations-with-admin-api
[gatsby-plugin-image]: https://www.npmjs.com/package/gatsby-plugin-image
