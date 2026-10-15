// Intentionally empty by default.
// Add Drizzle tables here when the site actually needs a database.
// See examples/d1/db/schema.ts for an opt-in example.
import {sqliteTable,text,integer} from "drizzle-orm/sqlite-core";
// Only service-wide request timing is persisted. No coordinates or credentials.
export const serviceLimits=sqliteTable("service_limits",{name:text("name").primaryKey(),nextAt:integer("next_at").notNull()});
