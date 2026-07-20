import { betterAuth } from 'better-auth';
import { createAuthMiddleware } from 'better-auth/api';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { emailOTP, bearer } from 'better-auth/plugins';
import nodemailer, { type Transporter } from 'nodemailer';
import type { IPlugin, IPluginRegistry } from '../plugin.interface';
import { DATABASE_PLUGIN, type IDatabasePlugin } from '../database';
import { AUTH_PLUGIN, type IAuthPlugin } from './auth.interface';
import { env } from '../../config/env';
import {
  buildSessionCookieAttributes,
  buildTrustedFrontendOrigins,
  resolveBetterAuthClientBaseUrl,
} from '../../utils/cors-origins';
import { logger } from '../../utils/logger';
import { redactLogFields } from '../../utils/log-redaction';
import { enforceActiveSessionLimit } from './session-limit.policy';
import {
  SESSION_COOKIE_CACHE_MAX_AGE_SEC,
  SESSION_IDLE_TIMEOUT_SEC,
  SESSION_UPDATE_AGE_SEC,
} from './session.config';

export class AuthPlugin implements IPlugin, IAuthPlugin {
  readonly name = AUTH_PLUGIN;

  private _auth: unknown = null;
  private smtpTransporter: Transporter | null = null;

  get auth(): unknown {
    if (!this._auth) {
      throw new Error('[AuthPlugin] Auth instance not initialized');
    }
    return this._auth;
  }

  async initialize(registry: IPluginRegistry): Promise<void> {
    const dbPlugin = registry.get<IDatabasePlugin>(DATABASE_PLUGIN);
    const prisma = dbPlugin.prisma;
    const isProduction = env.NODE_ENV === 'production';
    const maxActiveSessions = Math.max(1, Number(env.MAX_ACTIVE_USER_SESSIONS || '1'));
    const blockSuspiciousConcurrent = env.BLOCK_SUSPICIOUS_CONCURRENT_SESSIONS === 'true';

    if (isProduction && !env.FRONTEND_URL) {
      throw new Error('[AuthPlugin] FRONTEND_URL is required in production');
    }

    const devFallbackEnabled = env.EMAIL_OTP_DEV_FALLBACK === 'true' && !isProduction;
    const isSmtpConfigured = Boolean(env.SMTP_HOST && env.SMTP_PORT && env.SMTP_USER && env.SMTP_PASS);

    if (!isSmtpConfigured && !devFallbackEnabled) {
      throw new Error(
        '[AuthPlugin] Email OTP is not configured. Set SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS or enable EMAIL_OTP_DEV_FALLBACK=true for local testing.',
      );
    }

    if (isSmtpConfigured) {
      this.smtpTransporter = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: Number(env.SMTP_PORT),
        secure: env.SMTP_SECURE === 'true',
        auth: {
          user: env.SMTP_USER,
          pass: env.SMTP_PASS,
        },
      });
    }

    logger.info(
      {
        maxActiveSessions,
        blockSuspiciousConcurrent,
        sessionExpiresInSec: SESSION_IDLE_TIMEOUT_SEC,
        crossSiteCookies: buildSessionCookieAttributes().sameSite,
      },
      'AuthPlugin: Session concurrency policy configured',
    );

    const trustedOrigins = buildTrustedFrontendOrigins();
    const sessionCookieAttributes = buildSessionCookieAttributes();

    const authBaseURL = resolveBetterAuthClientBaseUrl();

    this._auth = betterAuth({
      secret: env.BETTER_AUTH_SECRET,
      ...(authBaseURL ? { baseURL: authBaseURL } : {}),
      database: prismaAdapter(dbPlugin.prisma, {
        provider: 'postgresql',
      }),
      trustedOrigins,
      session: {
        expiresIn: SESSION_IDLE_TIMEOUT_SEC,
        updateAge: SESSION_UPDATE_AGE_SEC,
        cookieCache: {
          enabled: true,
          maxAge: SESSION_COOKIE_CACHE_MAX_AGE_SEC,
        },
      },
      advanced: {
        defaultCookieAttributes: sessionCookieAttributes,
      },
      cookies: {
        sessionToken: {
          options: sessionCookieAttributes,
        },
      },
      user: {
        additionalFields: {
          role: {
            type: ['SUPERADMIN', 'CLIENTADMIN', 'CLIENTMEMBER'],
            required: false,
            defaultValue: 'CLIENTMEMBER',
            input: false,
          },
        },
      },
      plugins: [
        bearer(),
        {
          id: 'session-concurrency-policy',
          hooks: {
            after: [
              {
                matcher: () => true,
                handler: createAuthMiddleware(async (ctx) => {
                  const newSession = ctx.context.newSession;
                  if (!newSession) return;

                  const result = await enforceActiveSessionLimit(
                    dbPlugin.prisma,
                    {
                      token: newSession.session.token,
                      userId: newSession.user.id,
                      ipAddress: newSession.session.ipAddress ?? null,
                      userAgent: newSession.session.userAgent ?? null,
                    },
                    maxActiveSessions,
                    { blockSuspiciousConcurrent },
                  );

                  if (result.revokedSessionTokens.length > 0) {
                    logger.info(
                      {
                        userId: newSession.user.id,
                        activeSessionCount: result.activeSessionCount,
                        revokedSessionCount: result.revokedSessionTokens.length,
                        maxActiveSessions,
                      },
                      'Revoked older sessions after new login',
                    );
                  }
                }),
              },
            ],
          },
        } as any,
        emailOTP({
          otpLength: 6,
          expiresIn: 300,
          storeOTP: 'hashed',
          allowedAttempts: 5,
          sendVerificationOTP: async ({ email, otp, type }) => {
            logger.info(redactLogFields({ email, type }), 'Auth pipeline: SMTP send start');

            const whitelistedEmails = await prisma.user.findMany({
              where: { email: email.toLowerCase().trim() },
            });
            const isEmailWhitelisted = whitelistedEmails.length > 0;

            if (!isEmailWhitelisted) {
              logger.error(redactLogFields({ email, type }), 'Auth pipeline: domain whitelist rejected');
              throw new Error('This email or domain is not authorized. Please contact your administrator.');
            }
            if (!this.smtpTransporter) {
              if (devFallbackEnabled) {
                logger.info(redactLogFields({ type, email }), 'Auth pipeline: OTP generated (dev fallback, no SMTP)');
                return;
              }
              logger.error(redactLogFields({ email, type }), 'Auth pipeline: SMTP transporter not available');
              throw new Error('[AuthPlugin] SMTP transporter not available');
            }

            const from = env.EMAIL_FROM || env.SMTP_USER;
            if (!from) {
              logger.error(redactLogFields({ email, type }), 'Auth pipeline: EMAIL_FROM is not configured');
              throw new Error('[AuthPlugin] EMAIL_FROM is required when sending OTP emails');
            }

            const smtpStartMs = Date.now();
            try {
              await this.smtpTransporter.sendMail({
                from,
                to: email,
                subject: 'Your verification code',
                text: `Your OTP is ${otp}. It expires in 10 minutes.`,
                html: `<p>Your OTP is <strong>${otp}</strong>.</p><p>This code expires in 10 minutes.</p>`,
              });
              logger.info(
                redactLogFields({
                  email,
                  type,
                  smtpHost: env.SMTP_HOST,
                  durationMs: Date.now() - smtpStartMs,
                }),
                'Auth pipeline: SMTP send succeeded',
              );
            } catch (error) {
              logger.error(
                redactLogFields({
                  email,
                  type,
                  smtpHost: env.SMTP_HOST,
                  durationMs: Date.now() - smtpStartMs,
                  err: error,
                }),
                'Auth pipeline: SMTP send failed',
              );
              throw error;
            }
          },
        }),
      ],
    });

    logger.info('AuthPlugin: Better Auth initialized');
  }

  async shutdown(): Promise<void> {
    this.smtpTransporter?.close();
    this.smtpTransporter = null;
    this._auth = null;
    logger.info('AuthPlugin: stopped');
  }
}
