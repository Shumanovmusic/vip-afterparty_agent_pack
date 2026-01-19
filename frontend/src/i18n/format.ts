/**
 * Formatting utilities for i18n
 * Handles numbers, multipliers, and currency display
 */

/** Format a multiplier value (e.g., 123.45 -> "123.45x") */
export function formatX(multiplier: number): string {
  // Use 2 decimal places for display, no locale-specific separators for consistency
  return `${multiplier.toFixed(2)}x`
}

/** Format an integer value */
export function formatInt(n: number): string {
  return Math.round(n).toString()
}

/** Format currency (USD-style, used for bet display) */
export function formatCurrency(amount: number, currencySymbol = '$'): string {
  return `${currencySymbol}${amount.toFixed(2)}`
}

/** Format win amount with + prefix */
export function formatWinAmount(amount: number): string {
  return `+${amount.toFixed(2)}`
}

/** Format heat level display (e.g., "5/10") */
export function formatHeatLevel(level: number, max = 10): string {
  return `${level}/${max}`
}
