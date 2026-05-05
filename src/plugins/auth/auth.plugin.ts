import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { emailOTP } from 'better-auth/plugins';
import nodemailer, { type Transporter } from 'nodemailer';
import type { IPlugin, IPluginRegistry } from '../plugin.interface';
import { DATABASE_PLUGIN, type IDatabasePlugin } from '../database';
import { AUTH_PLUGIN, type IAuthPlugin } from './auth.interface';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';

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
    const isProduction = env.NODE_ENV === 'production';

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

    this._auth = betterAuth({
      database: prismaAdapter(dbPlugin.prisma, {
        provider: 'postgresql',
      }),
      trustedOrigins: [env.FRONTEND_URL || 'http://localhost:5173'],
      plugins: [
        emailOTP({
          otpLength: 6,
          expiresIn: 300,
          allowedAttempts: 5,
          sendVerificationOTP: async ({ email, otp, type }) => {
            // Domain Whitelist Check
            const allowedDomainsStr = env.ALLOWED_DOMAINS;
            if (allowedDomainsStr) {
              const allowedDomains = allowedDomainsStr.split(',').map((d) => d.trim().toLowerCase());
              const userDomain = email.split('@')[1]?.toLowerCase();

              if (!userDomain || !allowedDomains.includes(userDomain)) {
                logger.warn({ email, type }, 'AuthPlugin: Attempted login from unauthorized domain');
                throw new Error('This domain is not authorized to access this platform. Please use your company email.');
              }
            }

            if (!isProduction) {
              logger.info(
                { email, type },
                'AuthPlugin: OTP generated (development)',
              );
            }

            if (!this.smtpTransporter) {
              if (devFallbackEnabled) {
                logger.info({ type, email }, 'AuthPlugin: OTP generated (dev fallback enabled)');
                return;
              }
              throw new Error('[AuthPlugin] SMTP transporter not available');
            }

            const from = env.EMAIL_FROM || env.SMTP_USER;
            if (!from) {
              throw new Error('[AuthPlugin] EMAIL_FROM is required when sending OTP emails');
            }

            await this.smtpTransporter.sendMail({
              from,
              to: email,
              subject: 'Your verification code',
              text: `Your OTP is ${otp}. It expires in 10 minutes.`,
              html: `<p>Your OTP is <strong>${otp}</strong>.</p><p>This code expires in 10 minutes.</p>`,
            });
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
