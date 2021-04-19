import fetch from "node-fetch";
import { SourceNodesArgs } from "gatsby";
import { createInterface } from "readline";

import { nodeBuilder } from "./node-builder";
import { ShopifyBulkOperation } from "./operations";
import {
  OperationError,
  HttpError,
  pluginErrorCodes as errorCodes,
} from "./errors";
import { LAST_SHOPIFY_BULK_OPERATION } from "./constants";
import { shiftLeft } from "shift-left";

export function makeSourceFromOperation(
  finishLastOperation: () => Promise<void>,
  completedOperation: (id: string) => Promise<{ node: BulkOperationNode }>,
  cancelOperationInProgress: () => Promise<void>,
  gatsbyApi: SourceNodesArgs,
  pluginOptions: ShopifyPluginOptions
) {
  return async function sourceFromOperation(
    op: ShopifyBulkOperation,
    isPriorityBuild = process.env.IS_PRODUCTION_BRANCH === `true`
  ): Promise<void> {
    const { reporter, actions, cache } = gatsbyApi;
    const cacheKey =
      LAST_SHOPIFY_BULK_OPERATION + pluginOptions.typePrefix || "";

    const operationTimer = reporter.activityTimer(
      `Source from bulk operation ${op.name}`
    );

    operationTimer.start();

    try {
      if (isPriorityBuild) {
        await cancelOperationInProgress();
      } else {
        await finishLastOperation();
      }

      reporter.info(`Initiating bulk operation query ${op.name}`);
      const {
        bulkOperationRunQuery: { userErrors, bulkOperation },
      } = await op.execute();

      if (userErrors.length) {
        reporter.panic(
          userErrors.map((e) => {
            const msg = e.field
              ? `${e.field.join(".")}: ${e.message}`
              : e.message;

            return {
              id: errorCodes.bulkOperationFailed,
              context: {
                sourceMessage: `Couldn't initiate bulk operation query`,
              },
              error: new Error(msg),
            };
          })
        );
      }

      await cache.set(cacheKey, bulkOperation.id);

      let resp = await completedOperation(bulkOperation.id);
      reporter.info(`Completed bulk operation ${op.name}: ${bulkOperation.id}`);

      if (parseInt(resp.node.objectCount, 10) === 0) {
        reporter.info(`No data was returned for this operation`);
        operationTimer.end();
        return;
      }

      operationTimer.setStatus(
        `Fetching ${resp.node.objectCount} results for ${op.name}: ${bulkOperation.id}`
      );

      const results = await fetch(resp.node.url);

      operationTimer.setStatus(
        `Processing ${resp.node.objectCount} results for ${op.name}: ${bulkOperation.id}`
      );
      const rl = createInterface({
        input: results.body,
        crlfDelay: Infinity,
      });

      reporter.info(`Creating nodes from bulk operation ${op.name}`);

      const objects: BulkResults = [];

      for await (const line of rl) {
        objects.push(JSON.parse(line));
      }

      await Promise.all(
        op
          .process(
            objects,
            nodeBuilder(gatsbyApi, pluginOptions),
            gatsbyApi,
            pluginOptions
          )
          .map(async (promise) => {
            const node = await promise;
            actions.createNode(node);
          })
      );

      operationTimer.end();

      await cache.set(cacheKey, undefined);
    } catch (e) {
      if (e instanceof OperationError) {
        const code = errorCodes.bulkOperationFailed;

        if (e.node.status === `CANCELED`) {
          if (isPriorityBuild) {
            /**
             * There are at least two production sites for this Shopify
             * store trying to run an operation at the same time.
             */
            reporter.panic({
              id: errorCodes.apiConflict,
              error: e,
              context: {
                sourceMessage: shiftLeft`
                  Your operation was canceled. You might have another production site for this Shopify store.

                  Shopify only allows one bulk operation at a time for a given shop, so we recommend that you
                  avoid having two production sites that point to the same Shopify store.

                  If the duplication is intentional, please wait for the other operation to finish before trying
                  again. Otherwise, consider deleting the other site or pointing it to a test store instead.
                `,
              },
            });
          }

          // A prod build canceled me, wait and try again
          operationTimer.setStatus(
            "This operation has been canceled by a higher priority build. It will retry shortly."
          );
          operationTimer.end();
          await new Promise((resolve) => setTimeout(resolve, 5000));
          await sourceFromOperation(op);
        }

        if (e.node.errorCode === `ACCESS_DENIED`) {
          reporter.panic({
            id: code,
            context: {
              sourceMessage: `Your credentials don't have access to a resource you requested`,
            },
            error: e,
          });
        }

        reporter.panic({
          id: errorCodes.unknownSourcingFailure,
          context: {
            sourceMessage: `Could not source from bulk operation: ${e.node.errorCode}`,
          },
          error: e,
        });
      }

      if (e instanceof HttpError) {
        reporter.panic({
          id: errorCodes.unknownApiError,
          context: {
            sourceMessage: `Received error ${
              e.response.status
            } from Shopify: ${await e.response.text()}`,
          },
          error: e,
        });
      }

      reporter.panic({
        id: errorCodes.unknownSourcingFailure,
        context: {
          sourceMessage: `Could not source from bulk operation`,
        },
        error: e,
      });
    }
  };
}
