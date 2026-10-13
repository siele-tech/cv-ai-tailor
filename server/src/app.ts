import { existsSync } from 'node:fs';
import path from 'node:path';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { repoRoot, type Config } from './config.js';
import { requestLogger } from './logger.js';
import { apiNotFound, errorHandler } from './middleware/error.js';
import { apiRouter } from './routes/api.js';

export function createApp(config: Config): Express {
  const app = express();
  app.disable('x-powered-by');
  // Render (and most hosts) terminate TLS at a proxy; needed for correct client IPs in rate limiting.
  app.set('trust proxy', 1);

  app.use(
    helmet({
      // HTTPS-only policies apply in production; locally they would break plain-http testing
      // from a phone on the same network.
      hsts: config.isProduction,
      contentSecurityPolicy: {
        directives: { upgradeInsecureRequests: config.isProduction ? [] : null },
      },
    }),
  );
  app.use(requestLogger);

  // Same-origin requests need no CORS headers. Cross-origin access is opt-in via CORS_ORIGINS.
  if (config.corsOrigins.length) {
    app.use(
      '/api',
      cors({
        origin: config.corsOrigins,
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        exposedHeaders: ['Content-Disposition'],
        maxAge: 600,
      }),
    );
  }

  app.use('/api', (_req, res, next) => {
    // Responses contain personal data: keep them out of shared and browser caches.
    res.set('Cache-Control', 'no-store');
    next();
  });
  app.use('/api', express.json({ limit: '1mb' }));
  app.use('/api', apiRouter(config));
  app.use('/api', apiNotFound);

  const clientDist = path.join(repoRoot, 'client', 'dist');
  if (config.serveClient && existsSync(path.join(clientDist, 'index.html'))) {
    app.use(
      express.static(clientDist, {
        index: false,
        setHeaders(res, filePath) {
          // Hashed build assets can be cached forever; everything else must revalidate.
          const immutable = filePath.includes(`${path.sep}assets${path.sep}`);
          res.set('Cache-Control', immutable ? 'public, max-age=31536000, immutable' : 'no-cache');
        },
      }),
    );
    // Single-page app: any other GET returns the shell and the client router takes over.
    app.use((req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      res.set('Cache-Control', 'no-cache').sendFile(path.join(clientDist, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}
