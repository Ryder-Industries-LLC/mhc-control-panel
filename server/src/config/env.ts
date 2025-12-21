import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().url(),

  // Statbate Premium API
  STATBATE_API_TOKEN: z.string().min(1),

  // Statbate Plus (optional, for chat import)
  STATBATE_PLUS_SESSION_COOKIE: z.string().optional(),
  STATBATE_PLUS_XSRF_TOKEN: z.string().optional(),

  // Chaturbate Events API
  CHATURBATE_EVENTS_TOKEN: z.string().min(1),

  // Chaturbate Stats API
  CHATURBATE_STATS_TOKEN: z.string().min(1),
  CHATURBATE_USERNAME: z.string().min(1),

  // Runtime
  RUN_MODE: z.enum(['web', 'worker']).default('web'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().regex(/^\d+$/).transform(Number).default('3000'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | null = null;

export function validateEnv(): Env {
  if (cachedEnv) {
    return cachedEnv;
  }

  try {
    cachedEnv = envSchema.parse(process.env);
    return cachedEnv;
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('Environment validation failed:');
      error.errors.forEach((err) => {
        console.error(`  - ${err.path.join('.')}: ${err.message}`);
      });
      process.exit(1);
    }
    throw error;
  }
}

export const env = validateEnv();
