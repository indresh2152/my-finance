import type { Request, Response, NextFunction } from 'express';
import type { Pool } from 'pg';
import pino from 'pino';

const logger = pino({ name: 'audit' });

const SKIP_PATHS = new Set(['/health', '/ready']);

const ROUTE_ACTION_MAP: Record<string, string> = {
  'POST /api/v1/auth/register': 'USER_REGISTER',
  'POST /api/v1/auth/login': 'USER_LOGIN',
  'POST /api/v1/auth/logout': 'USER_LOGOUT',
  'DELETE /api/v1/auth/logout': 'USER_LOGOUT',
  'POST /api/v1/auth/refresh': 'TOKEN_REFRESH',
  'DELETE /api/v1/users/me': 'USER_DELETE',
  'GET /api/v1/users/me': 'USER_PROFILE_VIEW',
  'PATCH /api/v1/users/me': 'USER_PROFILE_UPDATE',
  'POST /api/v1/pan/register': 'PAN_REGISTER',
  'GET /api/v1/pan': 'PAN_VIEW',
  'GET /api/v1/overview': 'OVERVIEW_VIEW',
  'GET /api/v1/credit-cards': 'CARD_LIST',
  'GET /api/v1/credit-cards/:cardId': 'CARD_VIEW',
};

const RESOURCE_TYPE_MAP: Record<string, string> = {
  'GET /api/v1/credit-cards': 'credit_card',
  'GET /api/v1/credit-cards/:cardId': 'credit_card',
  'POST /api/v1/pan/register': 'pan_profile',
  'GET /api/v1/pan': 'pan_profile',
};

export const auditMiddleware =
  (pool: Pool) =>
  (req: Request, res: Response, next: NextFunction): void => {
    if (SKIP_PATHS.has(req.path)) {
      next();
      return;
    }

    const startMs = Date.now();

    res.on('finish', () => {
      const routePath = req.route?.path as string | undefined;
      const routeKey = routePath ? `${req.method} /api/v1${routePath}` : null;
      if (!routeKey) return;

      let action = ROUTE_ACTION_MAP[routeKey];
      if (!action) return;

      if (routeKey === 'POST /api/v1/auth/login' && res.statusCode === 401) {
        action = 'USER_LOGIN_FAILED';
      }

      const resourceType = RESOURCE_TYPE_MAP[routeKey] ?? null;
      const resourceId =
        (req.params as Record<string, string>)['cardId'] ??
        (req.params as Record<string, string>)['id'] ??
        null;

      pool
        .query(
          `INSERT INTO audit_logs
             (user_id, action, resource_type, resource_id, ip_address, metadata)
           VALUES ($1, $2, $3, $4, $5::inet, $6)`,
          [
            req.user?.id ?? null,
            action,
            resourceType,
            resourceId ?? null,
            req.ip ?? null,
            JSON.stringify({ statusCode: res.statusCode, durationMs: Date.now() - startMs }),
          ],
        )
        .catch((err: unknown) => {
          logger.error({ err }, '[audit] write failed');
        });
    });

    next();
  };
