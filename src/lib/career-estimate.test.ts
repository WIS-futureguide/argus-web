import { describe, expect, it } from 'vitest'
import { careerEstimateText } from './career-estimate'

describe('careerEstimateText', () => {
  it('keeps historical text without guessing a label', () => {
    expect(careerEstimateText('13% growth')).toBe('13% growth')
    expect(careerEstimateText('')).toBe('')
  })
  it('omits missing and null estimates', () => {
    expect(careerEstimateText(undefined)).toBe('')
    expect(careerEstimateText(null)).toBe('')
  })
  it.each([
    ['growing', 'Berkembang'], ['stable', 'Stabil'], ['limited', 'Terbatas'],
    ['low', 'Rendah'], ['medium', 'Sedang'], ['high', 'Tinggi'],
  ] as const)('displays %s as %s with its sentence', (label, display) => {
    expect(careerEstimateText({ label, sentence: 'Perkiraan kontekstual.' })).toBe(`${display}: Perkiraan kontekstual.`)
  })
})
