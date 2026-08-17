import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development','test','production']).default('development'),
  PORT: z.coerce.number().default(3000),
  APP_ORIGIN: z.string().url().default('http://localhost:3000'),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  ENCRYPTION_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_MODEL: z.string().default('gpt-5.6'),
  OPENAI_REASONING_MODEL: z.string().default('gpt-5.6'),
  UPLOAD_DIR: z.string().default('./data/uploads'),
  MAX_UPLOAD_BYTES: z.coerce.number().default(524288000),
  S3_ENDPOINT: z.string().optional(), S3_REGION: z.string().optional(), S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(), S3_SECRET_ACCESS_KEY: z.string().optional()
});
export const env = schema.parse(process.env);
