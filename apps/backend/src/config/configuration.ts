import * as Joi from 'joi';

export const validationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().default(3001),
  DATABASE_URL: Joi.string().required(),
  REDIS_URL: Joi.string().required(),
  JWT_SECRET: Joi.string().min(32).required(),
  JWT_EXPIRES_IN: Joi.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),
  ENCRYPTION_KEY: Joi.string().length(64).required(),
  LINE_CHANNEL_SECRET: Joi.string().allow('').default(''),
  LINE_CHANNEL_ACCESS_TOKEN: Joi.string().allow('').default(''),
  LIFF_ID: Joi.string().allow('').default(''),
  LIFF_TOKEN_TTL_SECONDS: Joi.number().default(14400),
  FRONTEND_URL: Joi.string().default('http://localhost:3000'),
  SMTP_HOST: Joi.string().allow('').default(''),
  SMTP_PORT: Joi.number().default(587),
  SMTP_USER: Joi.string().allow('').default(''),
  SMTP_PASS: Joi.string().allow('').default(''),
  MAIL_FROM: Joi.string().allow('').default(''),
  SWAGGER_DOCS_URL: Joi.string().allow('').default(''),
});

export default () => ({
  port: parseInt(process.env.PORT ?? '3001', 10),
  database: { url: process.env.DATABASE_URL },
  redis: { url: process.env.REDIS_URL },
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN ?? '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  },
  encryption: { key: process.env.ENCRYPTION_KEY },
  line: {
    channelId: process.env.CHANNEL_ID ?? '',
    channelSecret: process.env.LINE_CHANNEL_SECRET,
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
    liffId: process.env.LIFF_ID,
    liffTokenTtl: parseInt(process.env.LIFF_TOKEN_TTL_SECONDS ?? '14400', 10),
  },
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:3000',
  mail: {
    host: process.env.SMTP_HOST ?? '',
    port: parseInt(process.env.SMTP_PORT ?? '587', 10),
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
    from: process.env.MAIL_FROM ?? '',
  },
  swaggerDocsUrl: process.env.SWAGGER_DOCS_URL ?? '',
});
