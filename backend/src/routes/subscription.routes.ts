import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authMiddleware } from '../auth/middleware';
import { LicenseService, FREE_TIER, PREMIUM_TIER, generateHardwareId, generateLicenseKey } from '../services/license.service';
import { audit } from '../services/audit.service';
import { getDb } from '../db';
import { licenses as licensesTable, licenseActivations } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import crypto from 'crypto';

export default async function subscriptionRoutes(fastify: FastifyInstance) {
  const licenseService = LicenseService.getInstance();

  // ─── Stripe Webhook (NO auth, NO rate limit) ──────────────
  // This must be registered BEFORE the auth hook so Stripe can reach it
  fastify.post(
    '/api/subscription/webhook',
    {
      config: { rateLimit: false } as any, // skip rate limit for webhooks
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const stripeKey = process.env.STRIPE_SECRET_KEY;
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
      if (!stripeKey || !webhookSecret) {
        return reply.code(503).send({ error: 'Webhook not configured' });
      }

      try {
        const Stripe = (await import('stripe')).default;
        const stripe = new Stripe(stripeKey, { apiVersion: '2024-12-18.acacia' as any });

        const sig = request.headers['stripe-signature'] as string;
        if (!sig) {
          return reply.code(400).send({ error: 'Missing stripe-signature header' });
        }

        // Use the raw body buffer for signature verification
        const rawBody = (request as any).rawBody as Buffer;
        if (!rawBody) {
          return reply.code(400).send({ error: 'Missing raw body for signature verification' });
        }

        const event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);

        switch (event.type) {
          case 'checkout.session.completed': {
            const session = event.data.object as any;
            const hardwareId = session.metadata?.hardwareId || session.client_reference_id;
            const plan = session.metadata?.plan || 'monthly';
            
            if (hardwareId) {
              const db = getDb();

              // Deactivate any existing licenses for this hardware so there's no conflict
              await db
                .update(licensesTable)
                .set({ status: 'expired', updatedAt: new Date() })
                .where(and(
                  eq(licensesTable.hardwareId, hardwareId),
                  eq(licensesTable.status, 'active'),
                ));

              // Generate a premium license key
              const licenseKey = generateLicenseKey();
              
              // Calculate expiry
              let expiresAt: Date | null = null;
              if (plan === 'monthly') {
                expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
              } else if (plan === 'yearly') {
                expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
              }
              // Lifetime = null expiresAt

              const licenseId = crypto.randomUUID();

              await db.insert(licensesTable).values({
                id: licenseId,
                licenseKey,
                tier: 'premium',
                status: 'active',
                email: session.customer_email || session.metadata?.userId || 'stripe@craftos.app',
                hardwareId,
                activatedAt: new Date(),
                expiresAt,
                maxServers: PREMIUM_TIER.maxServers,
                maxRamMb: PREMIUM_TIER.maxRamMb,
                maxPlayers: PREMIUM_TIER.maxPlayers,
                features: JSON.stringify(PREMIUM_TIER.features),
                stripeCustomerId: session.customer || null,
                stripeSubscriptionId: session.subscription || null,
                lastValidatedAt: new Date(),
                validationFailures: 0,
                createdAt: new Date(),
                updatedAt: new Date(),
              });

              // Record activation
              await db.insert(licenseActivations).values({
                licenseId,
                hardwareId,
                hostname: 'stripe-checkout',
                platform: 'web',
                activatedAt: new Date(),
                lastSeenAt: new Date(),
                isActive: true,
              });

              licenseService.clearCache();
              fastify.log.info({ licenseKey, plan, hardwareId }, 'Premium license activated via Stripe');
            }
            break;
          }

          case 'customer.subscription.deleted':
          case 'customer.subscription.updated': {
            const subscription = event.data.object as any;
            if (subscription.status === 'canceled' || subscription.status === 'unpaid') {
              const db = getDb();

              await db
                .update(licensesTable)
                .set({ status: 'expired', updatedAt: new Date() })
                .where(eq(licensesTable.stripeSubscriptionId, subscription.id));

              licenseService.clearCache();
              fastify.log.info({ subscriptionId: subscription.id }, 'Subscription canceled/expired via webhook');
            }
            break;
          }

          case 'invoice.payment_succeeded': {
            const invoice = event.data.object as any;
            if (invoice.subscription) {
              const db = getDb();

              const existing = await db
                .select()
                .from(licensesTable)
                .where(eq(licensesTable.stripeSubscriptionId, invoice.subscription))
                .limit(1);

              if (existing.length > 0) {
                const periodEnd = invoice.lines?.data?.[0]?.period?.end;
                const newExpiry = periodEnd ? new Date(periodEnd * 1000) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

                await db
                  .update(licensesTable)
                  .set({ status: 'active', expiresAt: newExpiry, updatedAt: new Date() })
                  .where(eq(licensesTable.stripeSubscriptionId, invoice.subscription));

                licenseService.clearCache();
                fastify.log.info({ subscription: invoice.subscription }, 'License renewed via payment');
              }
            }
            break;
          }
        }

        return reply.send({ received: true });
      } catch (err: any) {
        fastify.log.error({ err }, 'Stripe webhook error');
        return reply.code(400).send({ error: `Webhook error: ${err.message}` });
      }
    },
  );

  // Apply auth to all remaining subscription routes
  fastify.addHook('preHandler', authMiddleware);

  // ─── Get current subscription status ──────────────────────
  fastify.get(
    '/api/subscription/status',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const info = await licenseService.getLicenseInfo();
      return reply.send(info);
    },
  );

  // ─── Get tier comparison (for upgrade page) ───────────────
  fastify.get(
    '/api/subscription/tiers',
    async (_request: FastifyRequest, reply: FastifyReply) => {
      return reply.send({
        tiers: [
          {
            id: 'free',
            name: 'Free',
            price: 0,
            priceYearly: 0,
            description: 'Perfect for getting started with a single Minecraft server.',
            limits: FREE_TIER,
            highlights: [
              '1 Minecraft server',
              'Vanilla & Paper support',
              'Up to 4GB RAM',
              'Up to 10 players',
              'Basic server management',
              'Console access',
              'File manager',
              'Player management',
            ],
          },
          {
            id: 'premium',
            name: 'Premium',
            price: 9.99,
            priceYearly: 99.99,
            description: 'Unlock everything. Run unlimited servers with advanced features.',
            limits: PREMIUM_TIER,
            highlights: [
              'Unlimited servers',
              'All server types (Forge, Fabric, Spigot, Purpur, Sponge)',
              'Unlimited RAM & players',
              'Advanced analytics & performance monitoring',
              'JVM tuner with Aikar\'s & custom flags',
              'Crash report analyzer with auto-fix',
              'Plugin marketplace (Modrinth + Hangar)',
              'Modpack one-click installer',
              'SFTP access',
              'Discord bridge',
              'Scheduled tasks & automated backups',
              'Unlimited backups with retention policies',
              'Backup downloads',
              'Templates with versioning & sharing',
              'Log search, streaming & alerts',
              'API keys for automation',
              'Sub-user permissions (22 granular perms)',
              'World management, cloning & pre-gen',
              'Console command history',
              'Config optimizer & validator',
              'Server benchmark suite',
              'Resource calculator & forecasting',
              'Server migration wizard',
              'Bulk server actions',
              'Memory leak detection & GC analysis',
              'TPS optimizer & auto-restart',
              'Custom analytics dashboards',
              'TPS degradation prediction',
              'Uptime monitoring & status pages',
              'World border & biome finder',
              'No ads',
              'Priority support',
            ],
          },
        ],
        featureComparison: [
          // Category: Server Management
          { category: 'Server Management', feature: 'Create & manage servers', free: '1 server', premium: 'Unlimited', icon: 'server' },
          { category: 'Server Management', feature: 'Server types', free: 'Vanilla, Paper', premium: 'All 9 types', icon: 'server' },
          { category: 'Server Management', feature: 'RAM allocation', free: 'Up to 4GB', premium: 'Unlimited', icon: 'server' },
          { category: 'Server Management', feature: 'Player slots', free: 'Up to 10', premium: 'Unlimited', icon: 'server' },
          { category: 'Server Management', feature: 'Start / Stop / Restart', free: true, premium: true, icon: 'server' },
          { category: 'Server Management', feature: 'Console access', free: true, premium: true, icon: 'server' },
          { category: 'Server Management', feature: 'Console command history', free: false, premium: true, icon: 'server' },
          { category: 'Server Management', feature: 'Startup / shutdown hooks', free: false, premium: true, icon: 'server' },
          { category: 'Server Management', feature: 'MOTD & server icon editor', free: false, premium: true, icon: 'server' },

          // Category: Files & Plugins
          { category: 'Files & Plugins', feature: 'File manager', free: true, premium: true, icon: 'files' },
          { category: 'Files & Plugins', feature: 'Plugin management', free: 'Up to 5', premium: 'Unlimited', icon: 'plugins' },
          { category: 'Files & Plugins', feature: 'Plugin marketplace', free: false, premium: true, icon: 'plugins' },
          { category: 'Files & Plugins', feature: 'Modpack installer', free: false, premium: true, icon: 'plugins' },
          { category: 'Files & Plugins', feature: 'Datapack management', free: false, premium: true, icon: 'plugins' },
          { category: 'Files & Plugins', feature: 'Config file validation', free: false, premium: true, icon: 'files' },

          // Category: Backups
          { category: 'Backups', feature: 'Create backups', free: 'Up to 3', premium: 'Unlimited', icon: 'backup' },
          { category: 'Backups', feature: 'Restore backups', free: true, premium: true, icon: 'backup' },
          { category: 'Backups', feature: 'Download backups', free: false, premium: true, icon: 'backup' },
          { category: 'Backups', feature: 'Scheduled backups', free: false, premium: true, icon: 'backup' },
          { category: 'Backups', feature: 'Retention policies', free: false, premium: true, icon: 'backup' },

          // Category: Players
          { category: 'Players & Security', feature: 'Player list & history', free: true, premium: true, icon: 'players' },
          { category: 'Players & Security', feature: 'Kick / Ban / Whitelist', free: true, premium: true, icon: 'players' },
          { category: 'Players & Security', feature: 'Player geolocation', free: false, premium: true, icon: 'players' },
          { category: 'Players & Security', feature: 'Sub-user permissions', free: false, premium: true, icon: 'players' },
          { category: 'Players & Security', feature: 'API keys', free: false, premium: true, icon: 'players' },

          // Category: Analytics & Monitoring
          { category: 'Analytics & Monitoring', feature: 'Real-time metrics', free: 'Current snapshot', premium: 'Full history', icon: 'analytics' },
          { category: 'Analytics & Monitoring', feature: 'Performance monitor', free: false, premium: true, icon: 'analytics' },
          { category: 'Analytics & Monitoring', feature: 'Player analytics & heatmaps', free: false, premium: true, icon: 'analytics' },
          { category: 'Analytics & Monitoring', feature: 'Chat analytics & word clouds', free: false, premium: true, icon: 'analytics' },
          { category: 'Analytics & Monitoring', feature: 'TPS degradation prediction', free: false, premium: true, icon: 'analytics' },
          { category: 'Analytics & Monitoring', feature: 'Server comparison reports', free: false, premium: true, icon: 'analytics' },
          { category: 'Analytics & Monitoring', feature: 'Custom metric dashboards', free: false, premium: true, icon: 'analytics' },
          { category: 'Analytics & Monitoring', feature: 'Uptime monitoring & status pages', free: false, premium: true, icon: 'analytics' },
          { category: 'Analytics & Monitoring', feature: 'Export reports (CSV/PDF)', free: false, premium: true, icon: 'analytics' },

          // Category: Network & Proxy
          { category: 'Network & Proxy', feature: 'Proxy networks', free: false, premium: true, icon: 'network' },
          { category: 'Network & Proxy', feature: 'BungeeCord / Waterfall support', free: false, premium: true, icon: 'network' },
          { category: 'Network & Proxy', feature: 'Velocity support', free: false, premium: true, icon: 'network' },
          { category: 'Network & Proxy', feature: 'Multi-server management', free: false, premium: true, icon: 'network' },
          { category: 'Network & Proxy', feature: 'Auto proxy configuration', free: false, premium: true, icon: 'network' },
          { category: 'Network & Proxy', feature: 'Network topology view', free: false, premium: true, icon: 'network' },

          // Category: Tools & Utilities
          { category: 'Tools & Utilities', feature: 'JVM tuner & custom flags', free: false, premium: true, icon: 'tools' },
          { category: 'Tools & Utilities', feature: 'Resource calculator', free: false, premium: true, icon: 'tools' },
          { category: 'Tools & Utilities', feature: 'Server benchmark suite', free: false, premium: true, icon: 'tools' },
          { category: 'Tools & Utilities', feature: 'Config optimizer', free: false, premium: true, icon: 'tools' },
          { category: 'Tools & Utilities', feature: 'Bulk server actions', free: false, premium: true, icon: 'tools' },
          { category: 'Tools & Utilities', feature: 'Server migration wizard', free: false, premium: true, icon: 'tools' },
          { category: 'Tools & Utilities', feature: 'Discord bridge', free: false, premium: true, icon: 'tools' },
          { category: 'Tools & Utilities', feature: 'SFTP access', free: false, premium: true, icon: 'tools' },

          // Category: Logs & Crash Analysis
          { category: 'Logs & Crash Analysis', feature: 'Crash analyzer', free: false, premium: true, icon: 'logs' },
          { category: 'Logs & Crash Analysis', feature: 'Log search & regex', free: false, premium: true, icon: 'logs' },
          { category: 'Logs & Crash Analysis', feature: 'Real-time log streaming', free: false, premium: true, icon: 'logs' },
          { category: 'Logs & Crash Analysis', feature: 'Log pattern alerts', free: false, premium: true, icon: 'logs' },
          { category: 'Logs & Crash Analysis', feature: 'Crash auto-fix suggestions', free: false, premium: true, icon: 'logs' },
          { category: 'Logs & Crash Analysis', feature: 'Log rotation & compression', free: false, premium: true, icon: 'logs' },
          { category: 'Logs & Crash Analysis', feature: 'Export & download logs', free: false, premium: true, icon: 'logs' },

          // Category: Templates
          { category: 'Templates', feature: 'Create & deploy templates', free: false, premium: true, icon: 'templates' },
          { category: 'Templates', feature: 'Template versioning & rollback', free: false, premium: true, icon: 'templates' },
          { category: 'Templates', feature: 'Template sharing', free: false, premium: true, icon: 'templates' },
          { category: 'Templates', feature: 'Scheduled auto-deploy', free: false, premium: true, icon: 'templates' },
          { category: 'Templates', feature: 'Dynamic template variables', free: false, premium: true, icon: 'templates' },

          // Category: Worlds
          { category: 'Worlds', feature: 'World management & reset', free: false, premium: true, icon: 'world' },
          { category: 'Worlds', feature: 'World border management', free: false, premium: true, icon: 'world' },
          { category: 'Worlds', feature: 'World import / export', free: false, premium: true, icon: 'world' },
          { category: 'Worlds', feature: 'World cloning', free: false, premium: true, icon: 'world' },
          { category: 'Worlds', feature: 'Chunk pre-generation', free: false, premium: true, icon: 'world' },
          { category: 'Worlds', feature: 'Biome & structure finder', free: false, premium: true, icon: 'world' },

          // Category: Performance
          { category: 'Performance', feature: 'Performance monitor', free: false, premium: true, icon: 'performance' },
          { category: 'Performance', feature: 'Memory leak detection', free: false, premium: true, icon: 'performance' },
          { category: 'Performance', feature: 'GC analysis & tuning', free: false, premium: true, icon: 'performance' },
          { category: 'Performance', feature: 'TPS optimization suggestions', free: false, premium: true, icon: 'performance' },
          { category: 'Performance', feature: 'Auto-restart on low TPS', free: false, premium: true, icon: 'performance' },
          { category: 'Performance', feature: 'Resource forecasting', free: false, premium: true, icon: 'performance' },

          // Category: Automation & Integrations  
          { category: 'Automation & Integrations', feature: 'Scheduled tasks', free: false, premium: true, icon: 'automation' },
          { category: 'Automation & Integrations', feature: 'Startup / shutdown hooks', free: false, premium: true, icon: 'automation' },
          { category: 'Automation & Integrations', feature: 'API keys', free: false, premium: true, icon: 'automation' },

          // Category: Experience
          { category: 'Experience', feature: 'Ads', free: 'Yes', premium: 'None', icon: 'experience' },
          { category: 'Experience', feature: 'Priority support', free: false, premium: true, icon: 'experience' },
          { category: 'Experience', feature: 'Auto-updates', free: true, premium: true, icon: 'experience' },
        ],
        pricing: {
          monthly: { price: 9.99, currency: 'USD', stripePriceId: process.env.STRIPE_PRICE_MONTHLY || '' },
          yearly: { price: 99.99, currency: 'USD', stripePriceId: process.env.STRIPE_PRICE_YEARLY || '', savings: '17%' },
          lifetime: { price: 199.99, currency: 'USD', stripePriceId: process.env.STRIPE_PRICE_LIFETIME || '', badge: 'Best Value' },
        },
      });
    },
  );

  // ─── Activate a license key ───────────────────────────────
  fastify.post(
    '/api/subscription/activate',
    async (
      request: FastifyRequest<{ Body: { licenseKey: string } }>,
      reply: FastifyReply,
    ) => {
      const { licenseKey } = request.body || {};

      if (!licenseKey || typeof licenseKey !== 'string') {
        return reply.code(400).send({ error: 'License key is required.' });
      }

      const result = await licenseService.activateLicense(licenseKey.trim().toUpperCase());

      audit({
        userId: (request as any).user?.id,
        action: result.success ? 'license.activated' : 'license.activation_failed',
        resource: 'subscription',
        details: {
          licenseKey: licenseKey.substring(0, 10) + '...',
          success: result.success,
          message: result.message,
        },
        ipAddress: request.ip,
      });

      if (!result.success) {
        return reply.code(400).send({ error: result.message });
      }

      return reply.send(result);
    },
  );

  // ─── Deactivate current license ───────────────────────────
  fastify.post(
    '/api/subscription/deactivate',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const result = await licenseService.deactivateLicense();

      audit({
        userId: (request as any).user?.id,
        action: result.success ? 'license.deactivated' : 'license.deactivation_failed',
        resource: 'subscription',
        details: { success: result.success, message: result.message },
        ipAddress: request.ip,
      });

      if (!result.success) {
        return reply.code(400).send({ error: result.message });
      }

      return reply.send(result);
    },
  );

  // ─── Check if a specific feature is available ─────────────
  fastify.get(
    '/api/subscription/feature/:feature',
    async (
      request: FastifyRequest<{ Params: { feature: string } }>,
      reply: FastifyReply,
    ) => {
      const { feature } = request.params;
      const available = await licenseService.hasFeature(feature as any);
      const { tier } = await licenseService.getCurrentTier();

      return reply.send({
        feature,
        available,
        currentTier: tier,
        requiredTier: available ? tier : 'premium',
      });
    },
  );

  // ─── Validate license (manual trigger) ────────────────────
  fastify.post(
    '/api/subscription/validate',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const valid = await licenseService.validateCurrentLicense();
      const info = await licenseService.getLicenseInfo();

      return reply.send({
        valid,
        ...info,
      });
    },
  );

  // ─── Get hardware ID (for support/licensing) ──────────────
  fastify.get(
    '/api/subscription/hardware-id',
    async (_request: FastifyRequest, reply: FastifyReply) => {
      return reply.send({
        hardwareId: generateHardwareId(),
      });
    },
  );

  // ─── Stripe Checkout: Create a payment session ────────────
  fastify.post(
    '/api/subscription/checkout',
    async (
      request: FastifyRequest<{ Body: { plan: 'monthly' | 'yearly' | 'lifetime' } }>,
      reply: FastifyReply,
    ) => {
      const stripeKey = process.env.STRIPE_SECRET_KEY;
      if (!stripeKey) {
        return reply.code(503).send({ error: 'Payment system not configured. Contact support.' });
      }

      const { plan } = request.body || {};
      if (!plan || !['monthly', 'yearly', 'lifetime'].includes(plan)) {
        return reply.code(400).send({ error: 'Invalid plan. Choose monthly, yearly, or lifetime.' });
      }

      const priceMap: Record<string, string | undefined> = {
        monthly: process.env.STRIPE_PRICE_MONTHLY,
        yearly: process.env.STRIPE_PRICE_YEARLY,
        lifetime: process.env.STRIPE_PRICE_LIFETIME,
      };

      const priceId = priceMap[plan];
      if (!priceId) {
        return reply.code(503).send({ error: `Price not configured for ${plan} plan.` });
      }

      try {
        // Dynamic import of Stripe - only loaded when actually needed
        const Stripe = (await import('stripe')).default;
        const stripe = new Stripe(stripeKey, { apiVersion: '2024-12-18.acacia' as any });

        const hardwareId = generateHardwareId();
        const isRecurring = plan !== 'lifetime';

        const appUrl = process.env.APP_URL || `http://localhost:${process.env.PORT || 3001}`;

        const session = await stripe.checkout.sessions.create({
          mode: isRecurring ? 'subscription' : 'payment',
          payment_method_types: ['card'],
          line_items: [{ price: priceId, quantity: 1 }],
          success_url: `${appUrl}/subscription?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${appUrl}/subscription?checkout=cancelled`,
          client_reference_id: hardwareId,
          metadata: {
            plan,
            hardwareId,
            userId: (request as any).user?.id || 'unknown',
          },
          allow_promotion_codes: true,
        });

        audit({
          userId: (request as any).user?.id,
          action: 'checkout.started',
          resource: 'subscription',
          details: { plan, sessionId: session.id },
          ipAddress: request.ip,
        });

        return reply.send({
          checkoutUrl: session.url,
          sessionId: session.id,
        });
      } catch (err: any) {
        fastify.log.error({ err }, 'Stripe checkout error');
        return reply.code(500).send({ error: 'Failed to create checkout session.' });
      }
    },
  );

  // ─── Get Stripe portal link (manage billing) ──────────────
  fastify.post(
    '/api/subscription/portal',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const stripeKey = process.env.STRIPE_SECRET_KEY;
      if (!stripeKey) {
        return reply.code(503).send({ error: 'Payment system not configured.' });
      }

      const info = await licenseService.getLicenseInfo();
      if (!info.stripeCustomerId) {
        return reply.code(400).send({ error: 'No billing account found. Purchase a subscription first.' });
      }

      try {
        const Stripe = (await import('stripe')).default;
        const stripe = new Stripe(stripeKey, { apiVersion: '2024-12-18.acacia' as any });

        const appUrl = process.env.APP_URL || `http://localhost:${process.env.PORT || 3001}`;
        const portalSession = await stripe.billingPortal.sessions.create({
          customer: info.stripeCustomerId,
          return_url: `${appUrl}/subscription`,
        });

        return reply.send({ portalUrl: portalSession.url });
      } catch (err: any) {
        fastify.log.error({ err }, 'Stripe portal error');
        return reply.code(500).send({ error: 'Failed to open billing portal.' });
      }
    },
  );

  // ─── Create a permanent distributable license key ────────
  fastify.post(
    '/api/subscription/create-key',
    async (
      request: FastifyRequest<{ Body: { email?: string; expiresInDays?: number | null } }>,
      reply: FastifyReply,
    ) => {
      const { email = 'customer@craftos.app', expiresInDays = null } = request.body || {};

      const db = getDb();
      const licenseKey = generateLicenseKey();
      const id = crypto.randomUUID();
      const now = new Date();
      const expiresAt = expiresInDays
        ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
        : null;

      await db.insert(licensesTable).values({
        id,
        licenseKey,
        tier: 'premium',
        status: 'active',
        email,
        hardwareId: null,
        activatedAt: null,
        expiresAt,
        maxServers: PREMIUM_TIER.maxServers,
        maxRamMb: PREMIUM_TIER.maxRamMb,
        maxPlayers: PREMIUM_TIER.maxPlayers,
        features: JSON.stringify(PREMIUM_TIER.features),
        lastValidatedAt: now,
        validationFailures: 0,
        createdAt: now,
        updatedAt: now,
      });

      audit({
        userId: (request as any).user?.id || (request as any).user?.userId,
        action: 'license.key_created',
        resource: 'subscription',
        details: { licenseKey, email, expiresAt: expiresAt?.toISOString() || 'never' },
        ipAddress: request.ip,
      });

      return reply.send({
        licenseKey,
        email,
        tier: 'premium',
        expiresAt: expiresAt?.toISOString() || null,
        message: expiresAt
          ? `Premium key created! Expires ${expiresAt.toLocaleDateString()}.`
          : 'Permanent premium key created! No expiration.',
      });
    },
  );

  // ─── Create a temporary trial license key ─────────────────
  fastify.post(
    '/api/subscription/create-trial-key',
    async (
      request: FastifyRequest<{ Body: { durationMinutes?: number } }>,
      reply: FastifyReply,
    ) => {
      const { durationMinutes = 15 } = request.body || {};

      // Clamp duration 1–1440 minutes (max 24 hours)
      const minutes = Math.max(1, Math.min(1440, durationMinutes));
      const expiresAt = new Date(Date.now() + minutes * 60 * 1000);

      const db = getDb();
      const licenseKey = generateLicenseKey();
      const id = crypto.randomUUID();
      const now = new Date();

      await db.insert(licensesTable).values({
        id,
        licenseKey,
        tier: 'premium',
        status: 'active',
        email: 'trial@craftos.app',
        hardwareId: null,
        activatedAt: null,
        expiresAt,
        maxServers: PREMIUM_TIER.maxServers,
        maxRamMb: PREMIUM_TIER.maxRamMb,
        maxPlayers: PREMIUM_TIER.maxPlayers,
        features: JSON.stringify(PREMIUM_TIER.features),
        lastValidatedAt: now,
        validationFailures: 0,
        createdAt: now,
        updatedAt: now,
      });

      audit({
        userId: (request as any).user?.id || (request as any).user?.userId,
        action: 'trial.key_created',
        resource: 'subscription',
        details: { licenseKey, durationMinutes: minutes, expiresAt: expiresAt.toISOString() },
        ipAddress: request.ip,
      });

      return reply.send({
        licenseKey,
        expiresAt: expiresAt.toISOString(),
        durationMinutes: minutes,
        message: `Trial key created! Expires in ${minutes} minute(s) at ${expiresAt.toLocaleTimeString()}.`,
      });
    },
  );
}
