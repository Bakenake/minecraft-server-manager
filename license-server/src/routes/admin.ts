/**
 * Admin Routes — Key Management & Dashboard
 *
 * All routes require admin JWT authentication.
 *
 * POST   /admin/login          — Login to get admin JWT
 * GET    /admin/licenses       — List all licenses (with pagination/filters)
 * POST   /admin/licenses       — Create a new license key
 * GET    /admin/licenses/:id   — Get license details + activations
 * PATCH  /admin/licenses/:id   — Update license (status, expiry, notes, etc.)
 * DELETE /admin/licenses/:id   — Delete a license entirely
 * POST   /admin/licenses/:id/revoke     — Revoke a license
 * POST   /admin/licenses/:id/reactivate — Reactivate a revoked/expired license
 * GET    /admin/activations    — List all activations
 * DELETE /admin/activations/:id — Force-deactivate a specific activation
 * GET    /admin/stats          — Dashboard stats
 * GET    /admin/logs           — Validation logs with filters
 */

import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';
import { getDb } from '../db';
import { generateLicenseKey } from '../utils';

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'change-me';

// ─── Auth Middleware ────────────────────────────────────────

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; role: string };
    (req as any).admin = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ─── Login ──────────────────────────────────────────────────

router.post('/login', (req: Request, res: Response): void => {
  const { username, password } = req.body;

  if (!username || !password) {
    res.status(400).json({ error: 'Username and password required' });
    return;
  }

  const db = getDb();
  const user = db.prepare('SELECT * FROM admin_users WHERE username = ?').get(username) as any;

  if (!user) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  if (!bcrypt.compareSync(password, user.password_hash)) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const token = jwt.sign({ userId: user.id, role: 'admin' }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ token, expiresIn: '24h' });
});

// All remaining routes require admin auth
router.use(requireAdmin);

// ─── List Licenses ──────────────────────────────────────────

router.get('/licenses', (req: Request, res: Response): void => {
  const db = getDb();
  const { status, tier, search, page = '1', limit = '50' } = req.query;

  let query = 'SELECT * FROM licenses WHERE 1=1';
  const params: any[] = [];

  if (status && typeof status === 'string') {
    query += ' AND status = ?';
    params.push(status);
  }

  if (tier && typeof tier === 'string') {
    query += ' AND tier = ?';
    params.push(tier);
  }

  if (search && typeof search === 'string') {
    query += ' AND (license_key LIKE ? OR email LIKE ? OR notes LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  // Count total
  const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as total');
  const total = (db.prepare(countQuery).get(...params) as any).total;

  // Paginate
  const pageNum = Math.max(1, parseInt(page as string));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit as string)));
  const offset = (pageNum - 1) * limitNum;

  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(limitNum, offset);

  const licenses = db.prepare(query).all(...params);

  // Add activation count for each license
  const enriched = licenses.map((lic: any) => {
    const activationCount = (db.prepare(
      'SELECT COUNT(*) as count FROM activations WHERE license_id = ? AND is_active = 1'
    ).get(lic.id) as any).count;

    return { ...lic, activeActivations: activationCount };
  });

  res.json({
    licenses: enriched,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum),
    },
  });
});

// ─── Create License ─────────────────────────────────────────

interface CreateLicenseBody {
  email?: string;
  tier?: 'free' | 'premium';
  plan?: 'monthly' | 'yearly' | 'lifetime' | 'trial';
  maxActivations?: number;
  expiresInDays?: number | null;
  expiresInMinutes?: number | null;
  notes?: string;
  count?: number; // Generate multiple keys at once
}

router.post('/licenses', (req: Request<{}, {}, CreateLicenseBody>, res: Response): void => {
  const {
    email = '',
    tier = 'premium',
    plan = 'lifetime',
    maxActivations = 1,
    expiresInDays = null,
    expiresInMinutes = null,
    notes = '',
    count = 1,
  } = req.body;

  const batchCount = Math.min(100, Math.max(1, count));
  const db = getDb();
  const adminId = (req as any).admin?.userId || 'admin';

  let expiresAt: string | null = null;
  if (expiresInMinutes && expiresInMinutes > 0) {
    expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000).toISOString();
  } else if (expiresInDays && expiresInDays > 0) {
    expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();
  }

  const keys: { id: string; licenseKey: string; expiresAt: string | null }[] = [];

  const insert = db.prepare(
    `INSERT INTO licenses (id, license_key, tier, status, email, max_activations, plan, expires_at, notes, created_by)
     VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?, ?)`
  );

  const insertMany = db.transaction(() => {
    for (let i = 0; i < batchCount; i++) {
      const id = uuid();
      const licenseKey = generateLicenseKey();
      insert.run(id, licenseKey, tier, email, maxActivations, plan, expiresAt, notes, adminId);
      keys.push({ id, licenseKey, expiresAt });
    }
  });

  insertMany();

  console.log(`[admin] Created ${batchCount} ${tier} license(s) by ${adminId}`);

  res.status(201).json({
    message: `Created ${batchCount} license key(s)`,
    licenses: keys,
  });
});

// ─── Get License Details ────────────────────────────────────

router.get('/licenses/:id', (req: Request, res: Response): void => {
  const db = getDb();
  const license = db.prepare('SELECT * FROM licenses WHERE id = ?').get(req.params.id) as any;

  if (!license) {
    res.status(404).json({ error: 'License not found' });
    return;
  }

  const activations = db.prepare(
    'SELECT * FROM activations WHERE license_id = ? ORDER BY activated_at DESC'
  ).all(license.id);

  const recentLogs = db.prepare(
    'SELECT * FROM validation_log WHERE license_key = ? ORDER BY validated_at DESC LIMIT 50'
  ).all(license.license_key);

  res.json({ license, activations, recentLogs });
});

// ─── Update License ─────────────────────────────────────────

router.patch('/licenses/:id', (req: Request, res: Response): void => {
  const db = getDb();
  const license = db.prepare('SELECT * FROM licenses WHERE id = ?').get(req.params.id) as any;

  if (!license) {
    res.status(404).json({ error: 'License not found' });
    return;
  }

  const allowedFields = ['status', 'tier', 'email', 'max_activations', 'expires_at', 'notes', 'plan'];
  const updates: string[] = [];
  const values: any[] = [];

  for (const field of allowedFields) {
    // Convert camelCase from request body to snake_case
    const camelField = field.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    if (req.body[camelField] !== undefined || req.body[field] !== undefined) {
      updates.push(`${field} = ?`);
      values.push(req.body[camelField] ?? req.body[field]);
    }
  }

  if (updates.length === 0) {
    res.status(400).json({ error: 'No valid fields to update' });
    return;
  }

  updates.push('updated_at = datetime(?)');
  values.push(new Date().toISOString());
  values.push(req.params.id);

  db.prepare(`UPDATE licenses SET ${updates.join(', ')} WHERE id = ?`).run(...values);

  const updated = db.prepare('SELECT * FROM licenses WHERE id = ?').get(req.params.id);
  res.json({ message: 'License updated', license: updated });
});

// ─── Delete License ─────────────────────────────────────────

router.delete('/licenses/:id', (req: Request, res: Response): void => {
  const db = getDb();
  const result = db.prepare('DELETE FROM licenses WHERE id = ?').run(req.params.id);

  if (result.changes === 0) {
    res.status(404).json({ error: 'License not found' });
    return;
  }

  res.json({ message: 'License deleted' });
});

// ─── Revoke License ─────────────────────────────────────────

router.post('/licenses/:id/revoke', (req: Request, res: Response): void => {
  const db = getDb();
  const result = db.prepare(
    'UPDATE licenses SET status = ?, updated_at = datetime(?) WHERE id = ?'
  ).run('revoked', new Date().toISOString(), req.params.id);

  if (result.changes === 0) {
    res.status(404).json({ error: 'License not found' });
    return;
  }

  // Deactivate all activations
  db.prepare(
    'UPDATE activations SET is_active = 0, deactivated_at = datetime(?) WHERE license_id = ?'
  ).run(new Date().toISOString(), req.params.id);

  console.log(`[admin] Revoked license ${req.params.id}`);
  res.json({ message: 'License revoked and all activations deactivated' });
});

// ─── Reactivate License ─────────────────────────────────────

router.post('/licenses/:id/reactivate', (req: Request, res: Response): void => {
  const db = getDb();
  const { expiresInDays } = req.body || {};

  let expiresAt: string | null = null;
  if (expiresInDays && expiresInDays > 0) {
    expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();
  }

  const updates = expiresAt
    ? 'status = ?, expires_at = ?, updated_at = datetime(?)'
    : 'status = ?, updated_at = datetime(?)';
  const params = expiresAt
    ? ['active', expiresAt, new Date().toISOString(), req.params.id]
    : ['active', new Date().toISOString(), req.params.id];

  const result = db.prepare(`UPDATE licenses SET ${updates} WHERE id = ?`).run(...params);

  if (result.changes === 0) {
    res.status(404).json({ error: 'License not found' });
    return;
  }

  console.log(`[admin] Reactivated license ${req.params.id}`);
  res.json({ message: 'License reactivated' });
});

// ─── List All Activations ───────────────────────────────────

router.get('/activations', (req: Request, res: Response): void => {
  const db = getDb();
  const { active } = req.query;

  let query = `
    SELECT a.*, l.license_key, l.tier, l.email, l.status as license_status
    FROM activations a
    JOIN licenses l ON a.license_id = l.id
  `;

  if (active === 'true') query += ' WHERE a.is_active = 1';
  else if (active === 'false') query += ' WHERE a.is_active = 0';

  query += ' ORDER BY a.last_seen_at DESC LIMIT 200';

  const activations = db.prepare(query).all();
  res.json({ activations });
});

// ─── Force Deactivate ───────────────────────────────────────

router.delete('/activations/:id', (req: Request, res: Response): void => {
  const db = getDb();
  const result = db.prepare(
    'UPDATE activations SET is_active = 0, deactivated_at = datetime(?) WHERE id = ?'
  ).run(new Date().toISOString(), req.params.id);

  if (result.changes === 0) {
    res.status(404).json({ error: 'Activation not found' });
    return;
  }

  res.json({ message: 'Activation deactivated' });
});

// ─── Dashboard Stats ────────────────────────────────────────

router.get('/stats', (_req: Request, res: Response): void => {
  const db = getDb();

  const totalLicenses = (db.prepare('SELECT COUNT(*) as count FROM licenses').get() as any).count;
  const activeLicenses = (db.prepare("SELECT COUNT(*) as count FROM licenses WHERE status = 'active'").get() as any).count;
  const premiumLicenses = (db.prepare("SELECT COUNT(*) as count FROM licenses WHERE tier = 'premium' AND status = 'active'").get() as any).count;
  const revokedLicenses = (db.prepare("SELECT COUNT(*) as count FROM licenses WHERE status = 'revoked'").get() as any).count;
  const expiredLicenses = (db.prepare("SELECT COUNT(*) as count FROM licenses WHERE status = 'expired'").get() as any).count;

  const totalActivations = (db.prepare('SELECT COUNT(*) as count FROM activations WHERE is_active = 1').get() as any).count;

  const validationsToday = (db.prepare(
    "SELECT COUNT(*) as count FROM validation_log WHERE validated_at >= datetime('now', '-1 day')"
  ).get() as any).count;

  const failedValidationsToday = (db.prepare(
    "SELECT COUNT(*) as count FROM validation_log WHERE validated_at >= datetime('now', '-1 day') AND result != 'valid'"
  ).get() as any).count;

  // Recent validations by result type
  const validationsByResult = db.prepare(
    "SELECT result, COUNT(*) as count FROM validation_log WHERE validated_at >= datetime('now', '-7 days') GROUP BY result"
  ).all();

  // Last 10 activations
  const recentActivations = db.prepare(
    `SELECT a.*, l.license_key, l.email
     FROM activations a JOIN licenses l ON a.license_id = l.id
     ORDER BY a.activated_at DESC LIMIT 10`
  ).all();

  res.json({
    licenses: { total: totalLicenses, active: activeLicenses, premium: premiumLicenses, revoked: revokedLicenses, expired: expiredLicenses },
    activations: { active: totalActivations },
    validations: { today: validationsToday, failedToday: failedValidationsToday, byResult: validationsByResult },
    recentActivations,
  });
});

// ─── Validation Logs ────────────────────────────────────────

router.get('/logs', (req: Request, res: Response): void => {
  const db = getDb();
  const { result, licenseKey, page = '1', limit = '100' } = req.query;

  let query = 'SELECT * FROM validation_log WHERE 1=1';
  const params: any[] = [];

  if (result && typeof result === 'string') {
    query += ' AND result = ?';
    params.push(result);
  }

  if (licenseKey && typeof licenseKey === 'string') {
    query += ' AND license_key = ?';
    params.push(licenseKey);
  }

  const pageNum = Math.max(1, parseInt(page as string));
  const limitNum = Math.min(500, Math.max(1, parseInt(limit as string)));
  const offset = (pageNum - 1) * limitNum;

  query += ' ORDER BY validated_at DESC LIMIT ? OFFSET ?';
  params.push(limitNum, offset);

  const logs = db.prepare(query).all(...params);
  res.json({ logs });
});

export default router;
