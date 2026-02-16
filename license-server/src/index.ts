/**
 * CraftOS License Server
 *
 * Lightweight API for license key validation, activation, and management.
 * Deploy on a VPS with HTTPS (Let's Encrypt / Caddy / nginx).
 *
 * Public endpoints (called by desktop app):
 *   POST /v1/license/validate
 *   POST /v1/license/activate
 *   POST /v1/license/deactivate
 *
 * Admin endpoints (for key management):
 *   POST   /admin/login
 *   GET    /admin/licenses
 *   POST   /admin/licenses
 *   GET    /admin/licenses/:id
 *   PATCH  /admin/licenses/:id
 *   DELETE /admin/licenses/:id
 *   POST   /admin/licenses/:id/revoke
 *   POST   /admin/licenses/:id/reactivate
 *   GET    /admin/activations
 *   DELETE /admin/activations/:id
 *   GET    /admin/stats
 *   GET    /admin/logs
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { getDb, closeDb } from './db';
import licenseRoutes from './routes/license';
import adminRoutes from './routes/admin';
import { ensureAdminUser } from './seed';

const app = express();

// ─── Security ───────────────────────────────────────────────

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
    },
  },
}));
app.set('trust proxy', 1); // trust first proxy (nginx/Caddy)

// CORS — allow desktop app (any origin since it's an Electron app)
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (desktop apps, curl, etc.)
    if (!origin) return callback(null, true);
    const allowed = (process.env.ALLOWED_ORIGINS || '*').split(',').map(s => s.trim());
    if (allowed.includes('*') || allowed.includes(origin)) {
      return callback(null, true);
    }
    callback(new Error('CORS policy: origin not allowed'));
  },
  credentials: true,
}));

app.use(express.json({ limit: '1mb' }));

// ─── Rate Limiting ──────────────────────────────────────────

const validateLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_VALIDATE_WINDOW_MS || '60000'),
  max: parseInt(process.env.RATE_LIMIT_VALIDATE_MAX || '30'),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many validation requests. Try again later.' },
});

const adminLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_ADMIN_WINDOW_MS || '60000'),
  max: parseInt(process.env.RATE_LIMIT_ADMIN_MAX || '60'),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many admin requests. Try again later.' },
});

// ─── Routes ─────────────────────────────────────────────────

// Public license validation/activation (called by desktop app)
app.use('/v1/license', validateLimiter, licenseRoutes);

// Admin key management API
app.use('/admin', adminLimiter, adminRoutes);

// Admin Dashboard (static files)
const publicDir = path.join(__dirname, '..', 'public');
app.use('/dashboard', express.static(publicDir));
app.get('/dashboard', (_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Root redirect to dashboard
app.get('/', (_req, res) => {
  res.redirect('/dashboard');
});

// 404
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[error]', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// ─── Start Server ───────────────────────────────────────────

const PORT = parseInt(process.env.PORT || '3100');
const HOST = process.env.HOST || '0.0.0.0';

async function start() {
  // Initialize database
  getDb();

  // Ensure admin user exists
  ensureAdminUser();

  const httpsEnabled = process.env.HTTPS_ENABLED === 'true';

  if (httpsEnabled) {
    const certPath = process.env.HTTPS_CERT_PATH;
    const keyPath = process.env.HTTPS_KEY_PATH;

    if (!certPath || !keyPath || !fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
      console.error('[error] HTTPS enabled but cert/key files not found');
      console.error(`  Cert: ${certPath}`);
      console.error(`  Key:  ${keyPath}`);
      process.exit(1);
    }

    const server = https.createServer({
      cert: fs.readFileSync(certPath),
      key: fs.readFileSync(keyPath),
    }, app);

    server.listen(PORT, HOST, () => {
      console.log(`\n  CraftOS License Server (HTTPS)`);
      console.log(`  Listening on https://${HOST}:${PORT}`);
      console.log(`  Admin:    https://${HOST}:${PORT}/admin/login`);
      console.log(`  Validate: https://${HOST}:${PORT}/v1/license/validate\n`);
    });
  } else {
    app.listen(PORT, HOST, () => {
      console.log(`\n  CraftOS License Server (HTTP)`);
      console.log(`  Listening on http://${HOST}:${PORT}`);
      console.log(`  Admin:    http://${HOST}:${PORT}/admin/login`);
      console.log(`  Validate: http://${HOST}:${PORT}/v1/license/validate\n`);
    });
  }
}

// Graceful shutdown
process.on('SIGINT', () => { closeDb(); process.exit(0); });
process.on('SIGTERM', () => { closeDb(); process.exit(0); });

start().catch((err) => {
  console.error('[fatal]', err);
  process.exit(1);
});
