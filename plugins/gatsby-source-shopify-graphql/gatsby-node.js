const {
  loadSchema,
  createDefaultQueryExecutor,
  readOrGenerateDefaultFragments,
  compileNodeQueries,
  buildNodeDefinitions,
  createSchemaCustomization,
  sourceAllNodes,
  writeCompiledQueries,
} = require(`gatsby-graphql-source-toolkit`);
require("dotenv").config();

async function createConfig(gatsbyApi) {
  const shop = process.env.SHOP_NAME;
  const token = process.env.SHOPIFY_ACCESS_TOKEN;
  const password = process.env.SHOPIFY_PASSWORD;
  const schemaUrl = `https://${token}:${password}@${shop}.myshopify.com/admin/api/2021-01/graphql.json`;

  const execute = createDefaultQueryExecutor(schemaUrl)

  const schema = await loadSchema(execute);

  const type = schema.getType(`QueryRoot`);
  const collectionTypes = Object.keys(type.getFields()).filter(t => {
    let queryType = schema.getQueryType()
    let fields = queryType.getFields()
    let remoteTypeName = fields[t].type.toString()

    return remoteTypeName.includes(`Connection`)
  })

  const gatsbyNodeTypes = collectionTypes.map((t) => {
    let queryType = schema.getQueryType()
    let fields = queryType.getFields()

    let remoteTypeName = fields[t].type.toString().replace(`!`, ``)

    // FIXME: can this be tightened up through the schema API?
    // if (remoteTypeName.includes(`Connection`)) {
    //   remoteTypeName = remoteTypeName.replace(`Connection`, ``)
    // }

    const queries = `
      query LIST_${t} ($first: Int, $after: String) {
        ${t}(first: $first, after: $after) {
          edges {
            node {
              ..._${remoteTypeName}Id_
            }
          }
          pageInfo {
            hasNextPage
            hasPreviousPage
          }
        }
      }

      fragment _${remoteTypeName}Id_ on ${remoteTypeName} {
        __typename
        sys { id }
      }
    `;

    return { remoteTypeName, queries };
  });

  console.log(gatsbyNodeTypes)

  const fragments = await readOrGenerateDefaultFragments(`./`, {
    schema,
    gatsbyNodeTypes,
  });

  const documents = compileNodeQueries({
    schema,
    gatsbyNodeTypes,
    customFragments: fragments,
  });

  await writeCompiledQueries("./sourcing-queries", documents);

  return {
    gatsbyApi,
    schema,
    execute,
    gatsbyTypePrefix: `Shopify`,
    gatsbyNodeDefs: buildNodeDefinitions({ gatsbyNodeTypes, documents }),
  };
}

exports.sourceNodes = async (gatsbyApi) => {
  const config = await createConfig(gatsbyApi);

  await createSchemaCustomization(config);

  await sourceAllNodes(config);
};