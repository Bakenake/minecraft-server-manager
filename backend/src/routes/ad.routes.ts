import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authMiddleware } from '../auth/middleware';
import { LicenseService } from '../services/license.service';

/**
 * Ad configuration routes.
 * Tells the frontend whether to show ads and provides ad unit config.
 * Free tier users see ads; premium users don't.
 */
export default async function adRoutes(fastify: FastifyInstance) {
  const licenseService = LicenseService.getInstance();

  // Public — no auth required (ads load before login on some screens)
  fastify.get(
    '/api/ads/config',
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const { tier } = await licenseService.getCurrentTier();
      const showAds = tier !== 'premium';

      return reply.send({
        showAds,
        tier,
        placements: showAds
          ? {
              // Ad unit IDs — replace with your real AdSense / Carbon Ads IDs
              sidebar: {
                enabled: true,
                type: 'banner',
                slot: process.env.AD_SLOT_SIDEBAR || 'ca-pub-XXXXXXX/sidebar',
                size: { width: 250, height: 250 },
                refreshInterval: 120000, // 2 minutes
              },
              dashboard: {
                enabled: true,
                type: 'banner',
                slot: process.env.AD_SLOT_DASHBOARD || 'ca-pub-XXXXXXX/dashboard',
                size: { width: 728, height: 90 },
                refreshInterval: 90000,
              },
              pageFooter: {
                enabled: true,
                type: 'banner',
                slot: process.env.AD_SLOT_FOOTER || 'ca-pub-XXXXXXX/footer',
                size: { width: 728, height: 90 },
                refreshInterval: 120000,
              },
              interstitial: {
                enabled: false, // Keep disabled by default — too aggressive
                type: 'interstitial',
                slot: process.env.AD_SLOT_INTERSTITIAL || '',
                frequency: 300000, // Max once per 5 minutes
              },
            }
          : {},
        // Self-promo: even without external ads we can show upgrade CTAs
        selfPromo: showAds
          ? {
              upgradeMessages: [
                'Remove ads and unlock all features with Premium!',
                'Upgrade to Premium for unlimited servers, advanced analytics, and more.',
                'Running a bigger server? Premium removes all limits.',
                'Get crash analysis, JVM tuning, and SFTP with Premium.',
              ],
              upgradeUrl: '/subscription',
            }
          : null,
      });
    },
  );

  // Authenticated — track ad impressions for analytics
  fastify.post<{ Body: { placement: string; adSlot: string } }>(
    '/api/ads/impression',
    { preHandler: [authMiddleware] },
    async (request, reply) => {
      const { placement, adSlot } = request.body || {};
      fastify.log.info({ placement, adSlot }, 'Ad impression');
      return reply.send({ ok: true });
    },
  );
}
