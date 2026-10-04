import { api } from '@/lib/api'

export interface PotensiVersion {
  id: string
  label: string
  status: 'draft' | 'active' | 'retired'
  created_by: string | null
  created_at: string
  updated_at: string
}
export interface PotensiEntry {
  cell_id: string
  name: string
  description: string
  example_activities: string
  example_majors: string
}
export interface PotensiDetail extends PotensiVersion { entries: PotensiEntry[] }
export interface PotensiVersions { versions: PotensiVersion[]; next_cursor?: string }
export interface PotensiAuditEntry {
  id: string
  action: string
  admin_email: string
  ip_address: string
  details: Record<string, unknown> | null
  created_at: string
}
export interface PotensiAudit { audit: PotensiAuditEntry[]; next_cursor?: string }

function pageQuery(cursor?: string): string {
  const params = new URLSearchParams({ limit: '20' })
  if (cursor) params.set('cursor', cursor)
  return params.toString()
}
const base = '/admin/potensi/versions'
export const potensiApi = {
  list(cursor?: string): Promise<PotensiVersions> {
    return api.get(`${base}?${pageQuery(cursor)}`)
  },
  detail(id: string): Promise<PotensiDetail> {
    return api.get(`${base}/${encodeURIComponent(id)}`)
  },
  createDraft(label: string): Promise<PotensiDetail> {
    return api.post(base, { label })
  },
  updateEntry(id: string, entry: PotensiEntry): Promise<{ updated: boolean }> {
    return api.put(`${base}/${encodeURIComponent(id)}/entries/${encodeURIComponent(entry.cell_id)}`, entry)
  },
  publish(id: string): Promise<{ published: boolean }> {
    return api.post(`${base}/${encodeURIComponent(id)}/publish`)
  },
  audit(id: string, cursor?: string): Promise<PotensiAudit> {
    return api.get(`${base}/${encodeURIComponent(id)}/audit?${pageQuery(cursor)}`)
  },
}

export const riasecOptions = ['R', 'I', 'A', 'S', 'E', 'C']
export const oceanOptions = ['O', 'C', 'E', 'A', 'ES']
export const virtueOptions = ['Wisdom', 'Courage', 'Humanity', 'Justice', 'Temperance', 'Transcendence']

// Editorial warning only. The server still validates text and publication.
export function potensiCopyWarnings(entry: PotensiEntry): string[] {
  return [...new Set([entry.name, entry.description, entry.example_activities, entry.example_majors]
    .flatMap(text => text.match(/skill|kelemahan|diagnos/gi) ?? []).map(term => term.toLowerCase()))]
}
