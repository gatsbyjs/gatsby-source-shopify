// 'gid://shopify/Metafield/6936247730264'
const pattern = /^gid:\/\/shopify\/(\w+)\/(.+)$/

function attachParentId(obj) {
  if (obj.__parentId) {
    const [_, remoteType, id] = obj.__parentId.match(pattern)
    const field = remoteType.charAt(0).toLowerCase() + remoteType.slice(1)
    const idField = `${field}Id`
    obj[idField] = id
    delete obj.__parentId
  }
}

function buildFromId(obj, getFactory) {
  const [_, remoteType, shopifyId] = obj.id.match(pattern)

  attachParentId(obj)

  const Node = getFactory(remoteType)
  return Node({ ...obj, id: shopifyId })
}

function buildFromTypename(obj, getFactory) {
  attachParentId(obj)

  const Node = getFactory(obj.__typename)
  return Node(obj)
}

function nodeBuilder(nodeHelpers) {
  const factoryMap = {}
  const getFactory = remoteType => {
    if (!factoryMap[remoteType]) {
      factoryMap[remoteType] = nodeHelpers.createNodeFactory(remoteType)
    }
    return factoryMap[remoteType]
  }

  return {
    buildNode(obj) {
      if (obj.id) {
        return buildFromId(obj, getFactory)
      }

      if (obj.__typename) {
        return buildFromTypename(obj, getFactory)
      }

      throw new Error(`Cannot create a node without type information`)
    }
  }
}

module.exports =  {
  nodeBuilder
}
