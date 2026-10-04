import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import { createRouter, createMemoryHistory } from 'vue-router'
import { VueQueryPlugin, QueryClient } from '@tanstack/vue-query'
import AssessmentDetailPage from '@/pages/AssessmentDetailPage.vue'

const mockDetail = vi.fn()

vi.mock('@/lib/api-assessments', () => ({
  assessmentsApi: {
    detail: (...args: unknown[]) => mockDetail(...args),
  },
}))

const fullDetail = {
  assessment: {
    id: 'a1',
    status: 'completed',
    submitted_at: '2026-05-15T08:30:00Z',
    completed_at: '2026-05-15T08:31:45Z',
  },
  user: {
    id: 'u1',
    full_name: 'John Doe',
    email: 'john@example.com',
    school_name: 'SMA Negeri 1',
    grade: '12',
    major: 'IPA',
  },
  model_info: {
    model: 'gemini-2.5-flash',
    attempts: 1,
    duration_ms: 3200,
    prompt_tokens: 1200,
    completion_tokens: 2400,
    estimated_cost_usd: 0.003,
  },
  scores: {
    riasec: [{ domain: 'R', score: 85 }, { domain: 'I', score: 70 }],
    ocean: [{ domain: 'O', score: 78 }],
    viais: [{ domain: 'Creativity', score: 90 }],
  },
  analysis_result: {
    profile_summary: {
      signature_title: 'The Analytical Creator',
      signature_description: 'A creative thinker',
      learning_style: { preference: 'Self-directed exploration', environment: 'Quiet spaces' },
    },
    detailed_analysis: {
      strengths: ['Problem solving'],
      weaknesses: ['Impatience'],
      team_dynamics: { natural_role: 'Strategic advisor', collaboration_style: 'Small-group deep work', synergy_needs: 'Action-oriented teammates' },
    },
    career_pathing: {
      top_industries: ['Technology', 'Design'],
      ideal_work_environment: 'Remote',
      role_prospects: [
        {
          role_title: 'UX Researcher',
          match_reason: 'High Investigative + Artistic',
          market_outlook: '13% growth',
          automation_risk: 'Low',
          wage_structure: { currency: 'IDR', entry_level: '8000000', junior: '12000000', senior: '20000000', max_potential: '30000000', average: '15000000' },
        },
      ],
    },
    student_recommendations: {
      extracurricular_clubs: [{ club_name: 'Design Thinking Lab', relevance: 'Channels creative problem-solving' }],
      immediate_actions: [{ action: 'Start a research journal', description: 'Document one observation per day' }],
    },
    personal_growth: {
      development_areas: [{ area: 'Decision speed', action_plan: 'Practice 2-minute decision drills' }],
      book_recommendations: [{ title: 'Thinking, Fast and Slow', author: 'Daniel Kahneman', relevance: 'Addresses analytical-intuitive tension' }],
    },
  },
  chat_summary: {
    session_id: 's1',
    message_count: 12,
    model_used: 'google/gemini-2.5-flash',
    last_message_at: '2026-05-15T09:15:00Z',
  },
}

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory('/app/assessments/a1'),
    routes: [
      { path: '/app/assessments', name: 'assessments', component: { template: '<div />' } },
      { path: '/app/assessments/:id', name: 'assessment-detail', component: { template: '<div />' } },
      { path: '/app/assessments/:id/chat', name: 'assessment-chat', component: { template: '<div />' } },
      { path: '/app/users/:id', name: 'user-detail', component: { template: '<div />' } },
    ],
  })
}

function mountPage() {
  const router = createTestRouter()
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return mount(AssessmentDetailPage, {
    global: {
      plugins: [
        createTestingPinia({ createSpy: vi.fn }),
        router,
        [VueQueryPlugin, { queryClient }],
      ],
    },
  })
}

describe('AssessmentDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows loading state', () => {
    mockDetail.mockReturnValue(new Promise(() => {}))
    const wrapper = mountPage()
    expect(wrapper.text()).toContain('LOADING ASSESSMENT DATA')
  })

  it('renders assessment status badge', async () => {
    mockDetail.mockResolvedValue(fullDetail)
    const wrapper = mountPage()
    await flushPromises()
    expect(wrapper.text()).toContain('[ COMPLETED ]')
  })

  it('renders user info with link', async () => {
    mockDetail.mockResolvedValue(fullDetail)
    const wrapper = mountPage()
    await flushPromises()
    expect(wrapper.text()).toContain('John Doe')
    expect(wrapper.text()).toContain('john@example.com')
    expect(wrapper.text()).toContain('SMA Negeri 1')
  })

  it('renders model info section', async () => {
    mockDetail.mockResolvedValue(fullDetail)
    const wrapper = mountPage()
    await flushPromises()
    expect(wrapper.text()).toContain('gemini-2.5-flash')
    expect(wrapper.text()).toContain('3.2s')
    expect(wrapper.text()).toMatch(/1[.,]200/)
    expect(wrapper.text()).toMatch(/2[.,]400/)
    expect(wrapper.text()).toContain('$0.0030')
  })

  it('renders scores with bar charts', async () => {
    mockDetail.mockResolvedValue(fullDetail)
    const wrapper = mountPage()
    await flushPromises()
    expect(wrapper.text()).toContain('RIASEC')
    expect(wrapper.text()).toContain('OCEAN')
    expect(wrapper.text()).toContain('VIAIS')
    expect(wrapper.text()).toContain('85')
    expect(wrapper.text()).toContain('78')
    expect(wrapper.text()).toContain('90')
  })

  it('renders analysis result sections', async () => {
    mockDetail.mockResolvedValue(fullDetail)
    const wrapper = mountPage()
    await flushPromises()
    expect(wrapper.text()).toContain('The Analytical Creator')
    expect(wrapper.text()).toContain('Problem solving')
    expect(wrapper.text()).toContain('Impatience')
    expect(wrapper.text()).toContain('Technology')
    expect(wrapper.text()).toContain('Design')
    expect(wrapper.text()).toContain('Remote')
    expect(wrapper.text()).toContain('Self-directed exploration')
    expect(wrapper.text()).toContain('Strategic advisor')
    expect(wrapper.text()).toContain('UX Researcher')
    expect(wrapper.text()).toContain('Design Thinking Lab')
    expect(wrapper.text()).toContain('Start a research journal')
    expect(wrapper.text()).toContain('Decision speed')
    expect(wrapper.text()).toContain('Thinking, Fast and Slow')
    expect(wrapper.text()).toContain('Daniel Kahneman')
  })

  it.each(['legacy', 'empty', 'missing'])('hides salary fields for %s results', async (kind) => {
    const detail = structuredClone(fullDetail)
    const role = detail.analysis_result.career_pathing.role_prospects[0]!
    if (kind === 'empty') Object.assign(role, { wage_structure: {} })
    if (kind === 'missing') Reflect.deleteProperty(role, 'wage_structure')
    mockDetail.mockResolvedValue(detail)
    const wrapper = mountPage()
    await flushPromises()
    expect(wrapper.text()).toContain('UX Researcher')
    expect(wrapper.text()).toContain('High Investigative + Artistic')
    expect(wrapper.text()).toContain('Perkiraan umum, bukan data pasar.')
    for (const forbidden of ['WAGE', 'IDR', '8000000', '12000000', '20000000', '30000000', '15000000']) {
      expect(wrapper.text()).not.toContain(forbidden)
    }
  })

  it('renders chat summary with view button', async () => {
    mockDetail.mockResolvedValue(fullDetail)
    const wrapper = mountPage()
    await flushPromises()
    expect(wrapper.text()).toContain('12')
    expect(wrapper.text()).toContain('google/gemini-2.5-flash')
    expect(wrapper.text()).toContain('VIEW CHAT MESSAGES')
  })

  it('shows placeholder when model_info is null', async () => {
    mockDetail.mockResolvedValue({ ...fullDetail, model_info: null })
    const wrapper = mountPage()
    await flushPromises()
    expect(wrapper.text()).toContain('NOT YET ANALYZED')
  })

  it('shows placeholder when analysis_result is null', async () => {
    mockDetail.mockResolvedValue({ ...fullDetail, analysis_result: null })
    const wrapper = mountPage()
    await flushPromises()
    expect(wrapper.text()).toContain('NO ANALYSIS AVAILABLE')
  })

  it('shows placeholder when chat_summary is null', async () => {
    mockDetail.mockResolvedValue({ ...fullDetail, chat_summary: null })
    const wrapper = mountPage()
    await flushPromises()
    expect(wrapper.text()).toContain('NO CHAT SESSION')
  })

  it('displays em dash for missing completed_at', async () => {
    mockDetail.mockResolvedValue({
      ...fullDetail,
      assessment: { ...fullDetail.assessment, completed_at: undefined },
    })
    const wrapper = mountPage()
    await flushPromises()
    expect(wrapper.text()).toContain('\u2014')
  })
})
