import { describe, it, expect, vi } from 'vitest'
import { potensiApi, potensiCopyWarnings } from './api-potensi'
import { api } from './api'
vi.mock('./api', () => ({ api: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }))

describe('Potensi API contract', () => {
  it('uses encoded keyset cursors and version-scoped audit', () => {
    potensiApi.list('a+/=')
    expect(api.get).toHaveBeenLastCalledWith('/admin/potensi/versions?limit=20&cursor=a%2B%2F%3D')
    potensiApi.audit('v1', 'cursor')
    expect(api.get).toHaveBeenLastCalledWith('/admin/potensi/versions/v1/audit?limit=20&cursor=cursor')
    potensiApi.detail('v1')
    expect(api.get).toHaveBeenLastCalledWith('/admin/potensi/versions/v1')
  })
  it('sends draft, replacement entry and publish to the exact routes', () => {
    const entry = { cell_id: 'R-ES-Wisdom', name: 'Tenang', description: 'Kecenderungan', example_activities: 'Kegiatan', example_majors: 'Jurusan' }
    potensiApi.createDraft('v2')
    expect(api.post).toHaveBeenLastCalledWith('/admin/potensi/versions', { label: 'v2' })
    potensiApi.updateEntry('v1', entry)
    expect(api.put).toHaveBeenLastCalledWith('/admin/potensi/versions/v1/entries/R-ES-Wisdom', entry)
    potensiApi.publish('v1')
    expect(api.post).toHaveBeenLastCalledWith('/admin/potensi/versions/v1/publish')
  })
})

describe('Potensi editorial copy warnings', () => {
  const normal = { cell_id: 'R-O-Wisdom', name: 'Tenang', description: 'Kecenderungan untuk berlatih', example_activities: 'Membaca', example_majors: 'Sastra' }
  const fields = ['name', 'description', 'example_activities', 'example_majors'] as const
  const terms = ['skill', 'keterampilan', 'talenta', 'kelemahan', 'diagnos']

  it.each(fields)('warns for every D42 term in %s, regardless of case', field => {
    for (const term of terms) {
      for (const text of [term, term.toUpperCase(), term[0]!.toUpperCase() + term.slice(1)]) {
        expect(potensiCopyWarnings({ ...normal, [field]: `Contoh ${text}` })).toEqual([term])
      }
    }
  })
  it('deduplicates repeated terms within and across editorial fields', () => {
    expect(potensiCopyWarnings({ ...normal,
      name: 'Talenta TALENTA talenta', description: 'KETERAMPILAN talenta',
      example_activities: 'keterampilan Skill SKILL', example_majors: 'diagnosis DIAGNOSTIK kelemahan KELEMAHAN',
    })).toEqual(['talenta', 'keterampilan', 'skill', 'diagnos', 'kelemahan'])
  })
  it('keeps normal copy and non-editorial cell IDs warning-free', () => {
    expect(potensiCopyWarnings(normal)).toEqual([])
    expect(potensiCopyWarnings({ ...normal, cell_id: 'skill-keterampilan-talenta' })).toEqual([])
  })
})
