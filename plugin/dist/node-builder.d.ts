import { NodeInput, SourceNodesArgs } from "gatsby";
import { NodeHelpers } from "gatsby-node-helpers";
interface Record {
    id: string;
    __parentId?: string;
}
export declare function nodeBuilder(nodeHelpers: NodeHelpers, gatsbyApi: SourceNodesArgs): {
    buildNode<T extends Record>(obj: T): Promise<NodeInput>;
};
export {};
