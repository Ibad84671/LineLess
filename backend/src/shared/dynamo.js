// DynamoDB access layer. All services go through the `store` interface so
// tests can substitute a faithful in-memory implementation (tests/helpers).

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  DeleteCommand,
  UpdateCommand,
  QueryCommand,
  TransactWriteCommand,
  BatchGetCommand,
} from '@aws-sdk/lib-dynamodb';
import { env } from './env.js';

let defaultStore = null;

export function createStore({ endpoint } = {}) {
  const ddb = DynamoDBDocumentClient.from(
    new DynamoDBClient({
      region: env.region,
      ...(endpoint ? { endpoint } : {}),
    }),
    { marshallOptions: { removeUndefinedValues: true } },
  );
  const Table = () => env.tableName;
  return {
    client: ddb,
    async get(Key) {
      return (await ddb.send(new GetCommand({ TableName: Table(), Key }))).Item ?? null;
    },
    async put(Item) {
      await ddb.send(new PutCommand({ TableName: Table(), Item }));
    },
    async delete(Key) {
      await ddb.send(new DeleteCommand({ TableName: Table(), Key }));
    },
    async update(args) {
      return (
        await ddb.send(new UpdateCommand({ TableName: Table(), ...args }))
      ).Attributes ?? null;
    },
    async query(args) {
      const res = await ddb.send(new QueryCommand({ TableName: Table(), ...args }));
      return { items: res.Items ?? [], count: res.Count ?? 0, nextCursor: res.LastEvaluatedKey ?? null };
    },
    async transactWrite(TransactItems) {
      await ddb.send(new TransactWriteCommand({ TransactItems }));
    },
    async batchGet(Keys) {
      const res = await ddb.send(new BatchGetCommand({ RequestItems: { [Table()]: { Keys } } }));
      return res.Responses?.[Table()] ?? [];
    },
  };
}

export function db() {
  if (!defaultStore) defaultStore = createStore();
  return defaultStore;
}

/** Test seam: override the process-wide store. */
export function setStore(store) {
  defaultStore = store;
}
