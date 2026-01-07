import { z } from 'zod';
import dotenv from 'dotenv';
import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env file from Render Secret Files or local directory
// Render mounts Secret Files at both /etc/secrets/ and the app root
const possiblePaths = [
  '/etc/secrets/.env',           // Render Secret Files (documented location)
  resolve(process.cwd(), '.env'), // App root (where Render also places it)
  resolve(__dirname, '../../.env'), // Project root (for local dev)
];

console.log('Checking for .env file in the following locations:');
possiblePaths.forEach(p => console.log(`  - ${p} (exists: ${existsSync(p)})`));

let envLoaded = false;
for (const envPath of possiblePaths) {
  if (existsSync(envPath)) {
    const result = dotenv.config({ path: envPath });
    if (result.error) {
      console.log(`Failed to load ${envPath}:`, result.error.message);
    } else {
      console.log(`✓ Loaded environment from: ${envPath}`);
      envLoaded = true;
      break;
    }
  }
}

if (!envLoaded) {
  console.log('No .env file found - using process environment variables only');
  dotenv.config(); // Still try to load from default location
}

const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().url(),

  // Statbate Premium API (required for web, optional for worker)
  STATBATE_API_TOKEN: z.string().min(1).optional(),

  // Statbate Plus (optional, for chat import)
  STATBATE_PLUS_SESSION_COOKIE: z.string().optional(),
  STATBATE_PLUS_XSRF_TOKEN: z.string().optional(),

  // Chaturbate Events API
  CHATURBATE_EVENTS_TOKEN: z.string().min(1),

  // Chaturbate Stats API (required for web, optional for worker)
  CHATURBATE_STATS_TOKEN: z.string().min(1).optional(),
  CHATURBATE_USERNAME: z.string().min(1),

  // OpenAI (for AI summaries)
  // Recommended models: gpt-4.1-mini (best balance), gpt-4.1-nano (cheapest), gpt-4o-mini (legacy)
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default('gpt-4.1-mini'),
  OPENAI_MAX_TOKENS: z.string().regex(/^\d+$/).transform(Number).default('6000'),

  // Runtime
  RUN_MODE: z.enum(['web', 'worker']).default('web'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().regex(/^\d+$/).transform(Number).default('3000'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
}).refine(
  (data) => {
    // If running in web mode, require all API tokens
    if (data.RUN_MODE === 'web') {
      return !!(data.STATBATE_API_TOKEN && data.CHATURBATE_STATS_TOKEN);
    }
    return true;
  },
  {
    message: 'STATBATE_API_TOKEN and CHATURBATE_STATS_TOKEN are required when RUN_MODE=web',
    path: ['RUN_MODE'],
  }
);

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | null = null;

export function validateEnv(): Env {
  if (cachedEnv) {
    return cachedEnv;
  }

  try {
    cachedEnv = envSchema.parse(process.env);
    console.log('✓ Environment validation successful');
    return cachedEnv;
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('\n❌ Environment validation failed:');
      error.errors.forEach((err) => {
        const varName = err.path.join('.');
        console.error(`  - ${varName}: ${err.message}`);
      });
      console.error('\nExpected configuration:');
      console.error('  Environment Variables (set in Render UI):');
      console.error('    - DATABASE_URL (linked from database)');
      console.error('    - CHATURBATE_USERNAME');
      console.error('    - NODE_ENV=production');
      console.error('  Secret File (.env in Render Secret Files):');
      console.error('    - RUN_MODE=web|worker');
      console.error('    - STATBATE_API_TOKEN');
      console.error('    - CHATURBATE_EVENTS_TOKEN');
      console.error('    - CHATURBATE_STATS_TOKEN');
      console.error('\nSee DEPLOYMENT.md for configuration instructions.\n');
      process.exit(1);
    }
    throw error;
  }
}

export const env = validateEnv();
