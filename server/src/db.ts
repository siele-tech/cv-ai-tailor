import mongoose from 'mongoose';
import type { Config } from './config.js';
import { log } from './logger.js';

export interface DbState {
  /** False when running against the throwaway in-memory database used for local development. */
  persistent: boolean;
}

export const dbState: DbState = { persistent: false };

let stopMemoryServer: (() => Promise<unknown>) | undefined;
let listening = false;

export const dbConnected = (): boolean => mongoose.connection.readyState === 1;

export async function connectDb(config: Config): Promise<void> {
  mongoose.set('strictQuery', true);
  // Fail fast instead of queueing operations forever when the database is unreachable.
  mongoose.set('bufferCommands', false);

  let uri = config.mongoUri;
  dbState.persistent = Boolean(uri);

  if (!uri) {
    // Development convenience only. loadConfig() refuses to start in production without MONGODB_URI.
    const { MongoMemoryServer } = await import('mongodb-memory-server-core');
    const server = await MongoMemoryServer.create();
    stopMemoryServer = () => server.stop();
    uri = server.getUri('cv-tailor-dev');
    log.warn('MONGODB_URI is not set: using a temporary in-memory database. Data is lost on restart.');
  }

  if (!listening) {
    listening = true;
    mongoose.connection.on('disconnected', () => log.warn('MongoDB disconnected'));
    mongoose.connection.on('reconnected', () => log.info('MongoDB reconnected'));
    // Name only: connection errors can embed the URI, which contains credentials.
    mongoose.connection.on('error', (err: Error) => log.error(`MongoDB error: ${err.name}`));
  }

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 });
  log.info(`MongoDB connected (${dbState.persistent ? 'persistent' : 'in-memory'})`);
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
  await stopMemoryServer?.();
  stopMemoryServer = undefined;
}
