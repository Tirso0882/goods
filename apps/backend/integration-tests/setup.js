const { MetadataStorage } = require("@medusajs/framework/mikro-orm/core")

MetadataStorage.clear()

// Defaults match the local Docker setup in the README. The test runner creates
// and drops its own database; Redis database 1 keeps tests apart from dev data.
process.env.DB_USERNAME ??= "postgres"
process.env.DB_PASSWORD ??= "postgres"
process.env.REDIS_URL ??= "redis://localhost:6379/1"
