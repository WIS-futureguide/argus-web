import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import { createRouter, createMemoryHistory } from 'vue-router'
import { VueQueryPlugin, QueryClient } from '@tanstack/vue-query'
import AssessmentComparePage from '@/pages/AssessmentComparePage.vue'

const { mockDetail } = vi.hoisted(() => ({ mockDetail: vi.fn() }))
vi.mock('@/lib/api-assessments', () => ({
  assessmentsApi: {
    detail: (...args: unknown[]) => mockDetail(...args),
    list: () => Promise.resolve({ assessments: [] }),
  },
}))

function legacyDetail(id: string, kind: string) {
  const wage = kind === 'legacy'
    ? { currency: 'IDR', entry_level: '8900001', junior: '8900002', senior: '8900003', max_potential: '8900004', average: '8900005' }
    : {}
  return {
    assessment: { id, status: 'completed', submitted_at: '2026-05-15T08:30:00Z' },
    user: { id: 'u1', full_name: 'Siswa Contoh', email: 'student@example.com' },
    scores: { riasec: [], ocean: [], viais: [] },
    answers: { riasec: {}, ocean: {}, viais: {} },
    model_info: null,
    analysis_result: {
      profile_summary: { signature_title: 'The Sage', signature_description: 'Profil lama' },
      detailed_analysis: { strengths: [], weaknesses: [], team_dynamics: {} },
      career_pathing: {
        top_industries: ['Penelitian'], ideal_work_environment: 'Ruang diskusi',
        role_prospects: [{ role_title: 'Peneliti', match_reason: 'Minat investigatif',
          market_outlook: kind === 'qualitative' ? { label: 'stable', sentence: 'Peluang umum.' } : 'Peluang umum',
          automation_risk: kind === 'qualitative' ? { label: 'low', sentence: 'Pertimbangan manusia diperlukan.' } : 'Rendah',
          ...(kind === 'missing' ? {} : { wage_structure: wage }),
        }],
      },
      student_recommendations: { extracurricular_clubs: [], immediate_actions: [] },
      personal_growth: { development_areas: [], book_recommendations: [] },
    },
    chat_summary: null,
  }
}

describe('AssessmentComparePage legacy career results', () => {
  it.each(['legacy', 'empty', 'missing', 'qualitative'])('compares %s results without salary data', async (kind) => {
    mockDetail.mockImplementation((id: string) => Promise.resolve(legacyDetail(id, kind)))
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/compare', component: { template: '<div />' } }],
    })
    await router.push('/compare?ids=a1,a2')
    await router.isReady()
    const wrapper = mount(AssessmentComparePage, {
      global: { plugins: [
        createTestingPinia({ createSpy: vi.fn }), router,
        [VueQueryPlugin, { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }],
      ] },
    })
    await flushPromises()
    const compare = wrapper.findAll('button').find(button => button.text().includes('COMPARE 2 ASSESSMENTS'))!
    expect(compare.exists()).toBe(true)
    await compare.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('COMPARING 2 ASSESSMENTS')
    for (const retained of ['The Sage', 'Peneliti', 'Minat investigatif', 'Ruang diskusi', 'Perkiraan umum, bukan data pasar.']) {
      expect(wrapper.text()).toContain(retained)
    }
    for (const forbidden of ['WAGE', 'IDR', '8900001', '8900002', '8900003', '8900004', '8900005']) {
      expect(wrapper.text()).not.toContain(forbidden)
    }
    wrapper.unmount()
  })
})
