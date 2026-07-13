import { describe, expect, it } from 'vitest'
import { isTrayMarkPixel } from '../src/main/trayIcon'

describe('tray icon motif', () => {
  it('draws the same vertical path and verification check as the app icon', () => {
    expect(isTrayMarkPixel(4, 5)).toBe(true)
    expect(isTrayMarkPixel(7, 12)).toBe(true)
    expect(isTrayMarkPixel(12, 7)).toBe(true)
    expect(isTrayMarkPixel(13, 13)).toBe(false)
  })
})
