import { Migration } from '@medusajs/framework/mikro-orm/migrations'

export class Migration20261115091912 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "verification_grant" drop constraint if exists "verification_grant_token_hash_unique";`
    )
    this.addSql(
      `create table if not exists "verification_attempt" ("id" text not null, "case_id" text not null, "method" text not null, "email_hash" text not null, "order_number" text not null, "outcome" text check ("outcome" in ('granted', 'failed', 'locked')) not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "verification_attempt_pkey" primary key ("id"));`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_verification_attempt_deleted_at" ON "verification_attempt" ("deleted_at") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_verification_attempt_case_id_outcome" ON "verification_attempt" ("case_id", "outcome") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_verification_attempt_email_hash_outcome_created_at" ON "verification_attempt" ("email_hash", "outcome", "created_at") WHERE deleted_at IS NULL;`
    )

    this.addSql(
      `create table if not exists "verification_grant" ("id" text not null, "token_hash" text not null, "case_id" text not null, "tier" text check ("tier" in ('read')) not null, "order_id" text not null, "order_number" text not null, "expires_at" timestamptz not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "verification_grant_pkey" primary key ("id"));`
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_verification_grant_token_hash_unique" ON "verification_grant" ("token_hash") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_verification_grant_deleted_at" ON "verification_grant" ("deleted_at") WHERE deleted_at IS NULL;`
    )
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "verification_attempt" cascade;`)

    this.addSql(`drop table if exists "verification_grant" cascade;`)
  }
}
