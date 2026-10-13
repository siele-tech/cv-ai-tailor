import { createApp } from './app.js';
import { aiConfigured, loadConfig } from './config.js';
import { connectDb, disconnectDb } from './db.js';
import { log } from './logger.js';

async function main() {
  const config = loadConfig();
  const app = createApp(config);

  // Listen first so the host's health check gets an answer (503) even while the database
  // is still connecting or temporarily unreachable.
  const server = app.listen(config.port, () => {
    log.info(`CV Tailor AI listening on port ${config.port} (${config.env})`);
    log.info(aiConfigured(config) ? `AI provider configured (model: ${config.ai.model})` : 'AI_API_KEY is not set: running in demo mode');
    if (config.usingDevCredentials) {
      log.warn('Using built-in development credentials (password "dev-password"). Set APP_PASSWORD and JWT_SECRET before exposing this server.');
    }
  });

  try {
    await connectDb(config);
  } catch (err) {
    // Name only: the message can include the connection string.
    log.error(`Could not connect to MongoDB (${err instanceof Error ? err.name : 'unknown error'}). Check MONGODB_URI and Atlas network access. Retrying in the background.`);
    const retry = setInterval(() => {
      connectDb(config).then(() => clearInterval(retry)).catch(() => undefined);
    }, 15_000);
    retry.unref();
  }

  const shutdown = () => {
    server.close(() => {
      disconnectDb().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 8_000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
