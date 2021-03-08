interface ShopifyPluginOptions {
  apiKey: string;
  password: string;
  storeUrl: string;
  downloadImages?: boolean;
  verboseLogging?: boolean;
  shopifyConnections?: string[];
}

interface NodeBuilder {
  buildNode: (obj: Record<string, any>) => Promise<NodeInput>;
}

type BulkResult = Record<string, any>;
type BulkResults = BulkResult[];

interface BulkOperationNode {
  status: string;
  objectCount: number;
  url: string;
  id: string;
  errorCode: "ACCESS_DENIED" | "INTERNAL_SERVER_ERROR" | "TIMEOUT";
  query: string;
}
