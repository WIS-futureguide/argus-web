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
  it('warns for forbidden copy in all fields, case insensitive, without false clean results', () => {
    expect(potensiCopyWarnings({ cell_id: '', name: 'SKILL', description: 'kelemahan', example_activities: 'diagnosis', example_majors: 'skill' })).toEqual(['skill', 'kelemahan', 'diagnos'])
    expect(potensiCopyWarnings({ cell_id: '', name: 'Tenang', description: 'Kecenderungan', example_activities: 'Latihan', example_majors: 'Sastra' })).toEqual([])
  })
})
