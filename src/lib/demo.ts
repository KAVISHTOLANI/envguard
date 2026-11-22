export const DEMO_SCHEMA = `# Demo schema for a fictional web service
NODE_ENV enum:development,staging,production
PORT port                 # HTTP port the server listens on
DATABASE_URL url          # Postgres connection string
REDIS_URL? url            # optional cache
SESSION_SECRET string secret
STRIPE_API_KEY string secret
SUPPORT_EMAIL email
ENABLE_SIGNUPS boolean
MAX_UPLOAD_MB int`;

/** Fictional values. None of these are real credentials. */
export const DEMO_ENV = `# Demo .env — every value here is a made-up placeholder
NODE_ENV=prod
PORT=8080
DATABASE_URL="postgres://app:demo-password@localhost:5432/app"
SESSION_SECRET=
STRIPE_API_KEY=demo-not-a-real-key-replace-me
SUPPORT_EMAIL=help@example
MAX_UPLOAD_MB=25
LEGACY_FEATURE_FLAG=1
debug-mode=true
PORT=3000`;
