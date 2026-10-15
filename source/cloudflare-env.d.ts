declare namespace Cloudflare {
  interface Env {
    PUBLIC_WEB_ORIGINS?: string;
    DB?: D1Database;
    BUCKET?: R2Bucket;
  }
}
