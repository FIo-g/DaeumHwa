import { describe, expect, it, vi } from 'vitest'
import {
  type PowerInfo,
  UNKNOWN_POWER,
  lowPowerWarning,
  parseEnergyMode,
  parsePowerSource,
  powerSummary,
  readPowerInfo,
} from './power'

// Power and energy mode parsers for the local-run records (track M1). Pure: no disk, no clock.

const PMSET_G = (powermode: number) => `System-wide power settings:
Currently in use:
 standby              1
 Sleep On Power Button 1
 hibernatefile        /var/vm/sleepimage
 powernap             1
 networkoversleep     0
 disksleep            10
 sleep                0 (sleep prevented by caffeinate, powerd, Claude)
 hibernatemode        3
 ttyskeepawake        1
 displaysleep         10
 tcpkeepalive         1
 powermode            ${powermode}
 womp                 1
`
const BATT_AC =
  "Now drawing from 'AC Power'\n -InternalBattery-0 (id=22806627)\t95%; charging; 0:24 remaining present: true\n"
const BATT_BATTERY =
  "Now drawing from 'Battery Power'\n -InternalBattery-0 (id=22806627)\t90%; discharging; 4:10 remaining present: true\n"
const LOW: PowerInfo = { source: 'ac', mode: 'low', modeRaw: 'powermode 1' }
const HIGH: PowerInfo = { source: 'ac', mode: 'high', modeRaw: 'powermode 2' }

describe('parsePowerSource', () => {
  it('reads the pmset batt line', () => {
    expect(parsePowerSource(BATT_AC)).toBe('ac')
    expect(parsePowerSource(BATT_BATTERY)).toBe('battery')
    expect(parsePowerSource("Now drawing from 'UPS Power'\n")).toBe('ups')
    expect(parsePowerSource('')).toBe('unknown')
    expect(parsePowerSource("Now drawing from 'Something'\n")).toBe('unknown')
  })
})

describe('parseEnergyMode', () => {
  it('maps powermode', () => {
    expect(parseEnergyMode(PMSET_G(2))).toEqual({ mode: 'high', modeRaw: 'powermode 2' })
    expect(parseEnergyMode(PMSET_G(1))).toEqual({ mode: 'low', modeRaw: 'powermode 1' })
    expect(parseEnergyMode(PMSET_G(0))).toEqual({ mode: 'automatic', modeRaw: 'powermode 0' })
    expect(parseEnergyMode(PMSET_G(9))).toEqual({ mode: 'unknown', modeRaw: 'powermode 9' })
  })

  it('lowpowermode wins and is the fallback', () => {
    expect(parseEnergyMode('lowpowermode 1\npowermode 2\n')).toEqual({
      mode: 'low',
      modeRaw: 'lowpowermode 1',
    })
    expect(parseEnergyMode('lowpowermode 0\n')).toEqual({
      mode: 'automatic',
      modeRaw: 'lowpowermode 0',
    })
    expect(parseEnergyMode('lowpowermode 1\n')).toEqual({ mode: 'low', modeRaw: 'lowpowermode 1' })
  })

  it('no key gives unknown', () => {
    expect(parseEnergyMode(' Sleep On Power Button 1\n womp 1\n')).toEqual({
      mode: 'unknown',
      modeRaw: null,
    })
    expect(parseEnergyMode('')).toEqual({ mode: 'unknown', modeRaw: null })
  })

  it('only the Currently in use block counts', () => {
    const text = `Battery Power:
 powermode            1
AC Power:
 powermode            0
Currently in use:
 powermode            2
`
    expect(parseEnergyMode(text)).toEqual({ mode: 'high', modeRaw: 'powermode 2' })
  })
})

describe('readPowerInfo', () => {
  it('combines both reads', () => {
    const run = vi.fn((args: string[]) => {
      const key = args.join(' ')
      if (key === '-g batt') return BATT_AC
      if (key === '-g') return PMSET_G(2)
      throw new Error(`unexpected ${key}`)
    })
    expect(readPowerInfo({ run, platform: 'darwin' })).toEqual(HIGH)
    expect(run.mock.calls).toEqual([[['-g', 'batt']], [['-g']]])
  })

  it('a failing read keeps the other value', () => {
    const batt = readPowerInfo({
      run: (args) => {
        if (args.join(' ') === '-g batt') throw new Error('boom')
        return PMSET_G(2)
      },
      platform: 'darwin',
    })
    expect(batt).toEqual({ source: 'unknown', mode: 'high', modeRaw: 'powermode 2' })

    const mode = readPowerInfo({
      run: (args) => {
        if (args.join(' ') === '-g') throw new Error('boom')
        return BATT_AC
      },
      platform: 'darwin',
    })
    expect(mode).toEqual({ source: 'ac', mode: 'unknown', modeRaw: null })

    const both = readPowerInfo({
      run: () => {
        throw new Error('boom')
      },
      platform: 'darwin',
    })
    expect(both).toEqual(UNKNOWN_POWER)
  })

  it('off darwin it reads nothing', () => {
    const run = vi.fn(() => '')
    expect(readPowerInfo({ run, platform: 'linux' })).toEqual(UNKNOWN_POWER)
    expect(run).not.toHaveBeenCalled()
  })
})

describe('powerSummary', () => {
  it('counts samples', () => {
    expect(powerSummary([])).toBeNull()
    expect(
      powerSummary([LOW, HIGH, { source: 'battery', mode: 'low', modeRaw: 'powermode 1' }]),
    ).toEqual({
      sampled: 3,
      lowPower: 2,
      onBattery: 1,
      byMode: { low: 2, high: 1 },
      bySource: { ac: 2, battery: 1 },
    })
  })
})

describe('lowPowerWarning', () => {
  it('is null when no low mode appears anywhere', () => {
    expect(lowPowerWarning({ live: HIGH, samples: [HIGH] })).toBeNull()
    expect(lowPowerWarning({ live: null, samples: [] })).toBeNull()
    expect(
      lowPowerWarning({ live: { source: 'ac', mode: 'unknown', modeRaw: null }, samples: [] }),
    ).toBeNull()
  })

  it('says now when the live reading is low', () => {
    const text = lowPowerWarning({ live: LOW, samples: [] })
    expect(text).toContain('Low Power')
    expect(text).toContain('now')
    expect(text).not.toContain('recorded')
  })

  it('counts recorded low calls', () => {
    const samples = [LOW, LOW, HIGH, HIGH, HIGH]
    const text = lowPowerWarning({ live: HIGH, samples })
    expect(text).toContain('2 of 5')
    expect(text).not.toContain('now')
  })

  it('says both when both hold, and ends with the same advice', () => {
    const both = lowPowerWarning({ live: LOW, samples: [LOW, HIGH] })
    expect(both).toContain('now')
    expect(both).toContain('1 of 2')
    for (const text of [both, lowPowerWarning({ live: LOW, samples: [] })]) {
      expect(text?.endsWith('Automatic or High Power.')).toBe(true)
    }
  })
})
