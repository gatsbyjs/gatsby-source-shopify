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
  const schemaUrl = `https://${process.env.SHOPIFY_STORE_URL}/api/2021-01/graphql`;
  const execute = createDefaultQueryExecutor(
    schemaUrl,
    {
      headers: {
        "X-Shopify-Storefront-Access-Token": process.env.SHOPIFY_ACCESS_TOKEN,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
    },
    { concurrency: 1 }
  )

  // const execute = args => {
  //   // console.log(args.operationName, args.variables)
  //   return defaultExecute(args)
  // }

  const schema = await loadSchema(execute)

  const type = schema.getType(`QueryRoot`);
  const collectionTypes = Object.keys(type.getFields()).filter(t => {
    const fields = schema.getQueryType().getFields()

    if (!fields[t].type.toString().includes(`Connection`)) {
      return false
    }

    let connectionType = fields[t].type.ofType
    const typeInfo = schema.getType(connectionType)
    const edgeType = typeInfo.toConfig().fields.edges.type.ofType.ofType.ofType
    const remoteTypeName = edgeType.toConfig().fields.node.type.ofType
    return !isScalarType(remoteTypeName)
  })

  const gatsbyNodeTypes = collectionTypes.map((t) => {
    let queryType = schema.getQueryType()
    let fields = queryType.getFields()


    let connectionType = fields[t].type.ofType
    const typeInfo = schema.getType(connectionType)
    const edgeType = typeInfo.toConfig().fields.edges.type.ofType.ofType.ofType
    const remoteTypeName = edgeType.toConfig().fields.node.type.ofType
    const nodeDefinition = isScalarType(remoteTypeName) ?
      `node` :
      `node { ..._${remoteTypeName}Id_ }`
    
    const fragmentDefinition = isScalarType(remoteTypeName) ? `` : `
      fragment _${remoteTypeName}Id_ on ${remoteTypeName} {
        __typename
        id
      }
    `

    const queries = `
      query LIST_${t.toUpperCase()} {
        ${t}(first: $first, after: $after) {
          edges {
            ${nodeDefinition}
            cursor
          }
          pageInfo { hasNextPage }
        }
      }
      ${fragmentDefinition}
    `;

    return { remoteTypeName: `${remoteTypeName}`, queries };
  });


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