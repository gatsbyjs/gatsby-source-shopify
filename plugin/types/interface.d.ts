interface ShopifyPluginOptions {
  apiKey: string;
  password: string;
  storeUrl: string;
  downloadImages?: boolean;
  shopifyConnections?: string[];
}

interface NodeBuilder {
  buildNode: (obj: Record<string, any>) => Promise<NodeInput>;
}

type BulkResult = Record<string, any>;
type BulkResults = BulkResult[];
