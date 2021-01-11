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
const { isScalarType } = require("graphql");
require("dotenv").config();

async function createConfig(gatsbyApi) {
  const execute = createDefaultQueryExecutor(
    `https://${process.env.SHOPIFY_ADMIN_API_KEY}:${process.env.SHOPIFY_ADMIN_PASSWORD}@${process.env.SHOPIFY_STORE_URL}/admin/api/2021-01/graphql.json`,
    {
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",

      }
    },
    { concurrency: 1 }
  )

  const schema = await loadSchema(execute)

  const type = schema.getType(`QueryRoot`);
  const collectionTypes = Object.keys(type.getFields()).filter(t => {
    if (type.getFields()[t].isDeprecated) {
      return false
    }

    const fields = schema.getQueryType().getFields()

    if (!fields[t].type.toString().includes(`Connection`)) {
      return false
    }

    let connectionType = fields[t].type.ofType
    const typeInfo = schema.getType(connectionType)
    const edgeType = typeInfo.toConfig().fields.edges.type.ofType.ofType.ofType
    const remoteTypeName = edgeType.toConfig().fields.node.type.ofType

    if (remoteTypeName.toString().endsWith(`Event`)) {
      /* We'll get events separately when we delta sync!
       */
      return false
    }

    if (!remoteTypeName.toConfig().fields.id) {
      /* Maybe we'll figure out a different way to deal with things
       * like this, e.g. TranslatableResource which has a resourceId
       */
      return false
    }

    const typesWeMightNotNeedThatHaveHugeFragmentDefinitions = [
      `AppInstallation`,
      `DiscountAutomaticNode`,
      `DiscountCodeNode`,
      `DraftOrder`,
      `MarketingActivity`,
      `Order`,
      `PriceRule`,
    ]

    if (typesWeMightNotNeedThatHaveHugeFragmentDefinitions.includes(remoteTypeName.toString())) {
      /* Don't think we need this and its default fragment is enormous
       */
      return false
    }

    return !isScalarType(remoteTypeName)
  })

  const gatsbyNodeTypes = collectionTypes.map((t) => {
    let queryType = schema.getQueryType()
    let fields = queryType.getFields()


    let connectionType = fields[t].type.ofType
    const typeInfo = schema.getType(connectionType)
    const edgeType = typeInfo.toConfig().fields.edges.type.ofType.ofType.ofType
    const remoteTypeName = edgeType.toConfig().fields.node.type.ofType

    const someOtherQueries = Object.keys(fields).filter(f => {
      return fields[f].type.toString() === remoteTypeName.toString()
    })

    console.log(`Other queries return ${remoteTypeName} type:`, someOtherQueries)

    const queries = `
      query LIST_${t.toUpperCase()} {
        ${t}(first: $first, after: $after) {
          edges {
            node { ..._${remoteTypeName}Id_ }
            cursor
          }
          pageInfo { hasNextPage }
        }
      }
      fragment _${remoteTypeName}Id_ on ${remoteTypeName} {
        __typename
        id
      }
    `;

    return { remoteTypeName: `${remoteTypeName}`, queries };
  });

  console.log(gatsbyNodeTypes)
  const typeMap = {}
  for(nodeType of gatsbyNodeTypes) {
    const count = typeMap[nodeType.remoteTypeName] || 0
    typeMap[nodeType.remoteTypeName] = count + 1
  }

  const provideConnectionArgs = (field, parentType) => {
    if (field.args.some(arg => arg.name === `first`)) {
      return { first: 10 }
    }
  }
  const fragments = await readOrGenerateDefaultFragments(`./shopify-fragments`, {
    schema,
    gatsbyNodeTypes,
    defaultArgumentValues: [provideConnectionArgs]
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