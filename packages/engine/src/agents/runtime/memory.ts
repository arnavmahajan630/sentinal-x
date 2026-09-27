import { MemorySaver } from '@langchain/langgraph';
import type { BaseCheckpointSaver } from '@langchain/langgraph';
import { MongoDBSaver } from '@langchain/langgraph-checkpoint-mongodb';
import mongoose from 'mongoose';

export const CHECKPOINT_COLLECTION = 'agent_checkpoints';
export const CHECKPOINT_WRITES_COLLECTION = 'agent_checkpoint_writes';

/** LangGraph checkpoints in Mongo (reuses mongoose's connection). `thread_id` = runId. Used for state inspection/replay and later cross-run memory. */
export function createMongoCheckpointer(): BaseCheckpointSaver {
  const client = mongoose.connection.getClient();
  return new MongoDBSaver({
    client: client as any,
    dbName: mongoose.connection.name,
    checkpointCollectionName: CHECKPOINT_COLLECTION,
    checkpointWritesCollectionName: CHECKPOINT_WRITES_COLLECTION,
  });
}

export const createMemoryCheckpointer = (): BaseCheckpointSaver => new MemorySaver();
