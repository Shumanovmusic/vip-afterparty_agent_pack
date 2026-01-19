/**
 * i18n Key Integrity Tests
 * Verifies: All keys present in both locales
 *           No empty string values
 *           No raw keys in rendered UI
 */
import { describe, it, expect } from 'vitest'
import en from '../src/locales/en.json'
import ru from '../src/locales/ru.json'

/** Get all keys from a nested object as dot-notation paths */
function getAllKeys(obj: object, prefix = ''): string[] {
  const keys: string[] = []
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      keys.push(...getAllKeys(value as object, fullKey))
    } else {
      keys.push(fullKey)
    }
  }
  return keys.sort()
}

/** Get value at dot-notation path */
function getValueAtPath(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.')
  let current: unknown = obj
  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = (current as Record<string, unknown>)[part]
    } else {
      return undefined
    }
  }
  return current
}

describe('i18n Key Integrity', () => {
  describe('A) Key parity between locales', () => {
    it('en.json and ru.json have identical key sets', () => {
      const enKeys = getAllKeys(en)
      const ruKeys = getAllKeys(ru)

      // Check for keys in EN but missing in RU
      const missingInRu = enKeys.filter(k => !ruKeys.includes(k))
      if (missingInRu.length > 0) {
        throw new Error(`Keys in en.json but missing in ru.json:\n  ${missingInRu.join('\n  ')}`)
      }

      // Check for keys in RU but missing in EN
      const missingInEn = ruKeys.filter(k => !enKeys.includes(k))
      if (missingInEn.length > 0) {
        throw new Error(`Keys in ru.json but missing in en.json:\n  ${missingInEn.join('\n  ')}`)
      }

      // Both should have same count
      expect(enKeys.length).toBe(ruKeys.length)
      expect(enKeys).toEqual(ruKeys)
    })

    it('all required key namespaces are present', () => {
      const requiredNamespaces = ['common', 'hud', 'win', 'bonus', 'modes', 'events', 'errors']

      for (const ns of requiredNamespaces) {
        expect(en).toHaveProperty(ns)
        expect(ru).toHaveProperty(ns)
      }
    })
  })

  describe('B) No empty or TODO values', () => {
    it('en.json has no empty strings', () => {
      const enKeys = getAllKeys(en)
      const emptyKeys = enKeys.filter(k => {
        const value = getValueAtPath(en as Record<string, unknown>, k)
        return value === '' || value === null || value === undefined
      })

      if (emptyKeys.length > 0) {
        throw new Error(`Empty values in en.json:\n  ${emptyKeys.join('\n  ')}`)
      }

      expect(emptyKeys).toHaveLength(0)
    })

    it('ru.json has no empty strings', () => {
      const ruKeys = getAllKeys(ru)
      const emptyKeys = ruKeys.filter(k => {
        const value = getValueAtPath(ru as Record<string, unknown>, k)
        return value === '' || value === null || value === undefined
      })

      if (emptyKeys.length > 0) {
        throw new Error(`Empty values in ru.json:\n  ${emptyKeys.join('\n  ')}`)
      }

      expect(emptyKeys).toHaveLength(0)
    })

    it('en.json has no TODO placeholders', () => {
      const enKeys = getAllKeys(en)
      const todoKeys = enKeys.filter(k => {
        const value = getValueAtPath(en as Record<string, unknown>, k)
        return typeof value === 'string' && value.toLowerCase().includes('todo')
      })

      if (todoKeys.length > 0) {
        throw new Error(`TODO placeholders in en.json:\n  ${todoKeys.join('\n  ')}`)
      }

      expect(todoKeys).toHaveLength(0)
    })

    it('ru.json has no TODO placeholders', () => {
      const ruKeys = getAllKeys(ru)
      const todoKeys = ruKeys.filter(k => {
        const value = getValueAtPath(ru as Record<string, unknown>, k)
        return typeof value === 'string' && value.toLowerCase().includes('todo')
      })

      if (todoKeys.length > 0) {
        throw new Error(`TODO placeholders in ru.json:\n  ${todoKeys.join('\n  ')}`)
      }

      expect(todoKeys).toHaveLength(0)
    })
  })

  describe('C) Required error codes are localized', () => {
    const requiredErrorCodes = [
      'INVALID_REQUEST',
      'INVALID_BET',
      'FEATURE_DISABLED',
      'INSUFFICIENT_FUNDS',
      'ROUND_IN_PROGRESS',
      'IDEMPOTENCY_CONFLICT',
      'RATE_LIMIT_EXCEEDED',
      'MAINTENANCE',
      'INTERNAL_ERROR',
      'NOT_IMPLEMENTED'
    ]

    it('en.json has all required error codes', () => {
      for (const code of requiredErrorCodes) {
        expect(en.errors).toHaveProperty(code)
        expect((en.errors as Record<string, string>)[code]).toBeTruthy()
      }
    })

    it('ru.json has all required error codes', () => {
      for (const code of requiredErrorCodes) {
        expect(ru.errors).toHaveProperty(code)
        expect((ru.errors as Record<string, string>)[code]).toBeTruthy()
      }
    })
  })

  describe('Raw key detection patterns', () => {
    // These patterns would indicate untranslated keys if found in rendered output
    const rawKeyPatterns = [
      /^hud\./,
      /^win\./,
      /^bonus\./,
      /^modes\./,
      /^events\./,
      /^errors\./,
      /^common\./
    ]

    it('raw key patterns are defined for all namespaces', () => {
      // Sanity check that our patterns cover all namespaces
      const namespaces = Object.keys(en)
      for (const ns of namespaces) {
        const hasPattern = rawKeyPatterns.some(p => p.source.includes(ns))
        expect(hasPattern).toBe(true)
      }
    })

    it('all en values are non-empty strings (not raw keys)', () => {
      const enKeys = getAllKeys(en)
      for (const key of enKeys) {
        const value = getValueAtPath(en as Record<string, unknown>, key)
        expect(typeof value).toBe('string')
        // Value should NOT look like an i18n key
        for (const pattern of rawKeyPatterns) {
          expect(value).not.toMatch(pattern)
        }
      }
    })
  })
})
