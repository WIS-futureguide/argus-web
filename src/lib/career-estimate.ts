export type EstimateLabel = 'growing' | 'stable' | 'limited' | 'low' | 'medium' | 'high'

// Historical results keep strings; new results carry a qualitative label/sentence.
export type CareerEstimate = string | { label: EstimateLabel; sentence: string } | null

const labels: Record<EstimateLabel, string> = {
  growing: 'Berkembang', stable: 'Stabil', limited: 'Terbatas',
  low: 'Rendah', medium: 'Sedang', high: 'Tinggi',
}

export function careerEstimateText(estimate: CareerEstimate | undefined): string {
  if (typeof estimate === 'string') return estimate
  if (!estimate) return ''
  const label = labels[estimate.label]
  if (!label) return estimate.sentence || ''
  return estimate.sentence ? `${label}: ${estimate.sentence}` : label
}
