// Argus returns narrative claims with resolved reference document UUIDs.
export interface Claim {
  text: string
  reference_ids: string[] | null
}

// Keep historical string results readable without displaying reference metadata.
export function claimText(claim: string | Claim | null | undefined): string {
  if (typeof claim === 'string') return claim
  return claim?.text ?? ''
}
