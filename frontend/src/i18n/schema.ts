/**
 * Type-safe i18n message schema
 * Auto-generated structure from en.json
 */
import type en from '../locales/en.json'

/** Message schema type derived from English locale */
export type MessageSchema = typeof en

/** All valid i18n keys (flattened) */
export type I18nKey =
  | `common.${keyof MessageSchema['common']}`
  | `hud.${keyof MessageSchema['hud']}`
  | `win.${keyof MessageSchema['win']}`
  | `bonus.${keyof MessageSchema['bonus']}`
  | `modes.${keyof MessageSchema['modes']}`
  | `events.${keyof MessageSchema['events']}`
  | `errors.${keyof MessageSchema['errors']}`

/** Error code keys from error_codes.md */
export type ErrorCode =
  | 'INVALID_REQUEST'
  | 'INVALID_BET'
  | 'FEATURE_DISABLED'
  | 'INSUFFICIENT_FUNDS'
  | 'ROUND_IN_PROGRESS'
  | 'IDEMPOTENCY_CONFLICT'
  | 'RATE_LIMIT_EXCEEDED'
  | 'MAINTENANCE'
  | 'INTERNAL_ERROR'
  | 'NOT_IMPLEMENTED'
