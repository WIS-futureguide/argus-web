import type { AssessmentDetail } from '@/lib/api-assessments'

// Synthetic data only. Shape follows Atlas GeminiAnalysisResult, scanned directly
// by Argus GetAssessmentDetail; reference_ids are resolved document UUIDs.
export function claimDetail(
  id: string,
  claimKind: 'object' | 'string' | 'mixed',
  estimateKind: 'object' | 'string',
): AssessmentDetail {
  const referenceId = '00000000-0000-4000-8000-000000000001'
  return {
    assessment: { id, status: 'completed', submitted_at: '2026-05-15T08:30:00Z' },
    user: { id: 'u1', full_name: 'Siswa Contoh', email: 'student@example.com' },
    model_info: null,
    scores: { riasec: [], ocean: [], viais: [] },
    answers: { riasec: {}, ocean: {}, viais: {} },
    analysis_result: {
      profile_summary: {
        signature_title: 'The Sage',
        signature_description: claimKind === 'string' ? 'Profil penuh rasa ingin tahu'
          : { text: 'Profil penuh rasa ingin tahu', reference_ids: [referenceId] },
        learning_style: { preference: 'Eksplorasi mandiri', environment: 'Ruang tenang' },
      },
      detailed_analysis: {
        strengths: [
          claimKind === 'string' ? 'Menimbang sudut pandang'
            : { text: 'Menimbang sudut pandang', reference_ids: [referenceId] },
          claimKind !== 'object' ? 'Mencari pola gagasan'
            : { text: 'Mencari pola gagasan', reference_ids: null },
        ],
        team_dynamics: { natural_role: 'Penelaah ide', collaboration_style: 'Diskusi kecil', synergy_needs: 'Rekan pelaksana' },
      },
      career_pathing: {
        top_industries: ['Penelitian'], ideal_work_environment: 'Ruang diskusi',
        role_prospects: [{
          role_title: 'Peneliti',
          match_reason: claimKind === 'object'
            ? { text: 'Minat investigatif', reference_ids: [referenceId] } : 'Minat investigatif',
          market_outlook: estimateKind === 'object'
            ? { label: 'stable', sentence: 'Peluang umum dapat bertahan.' } : 'Peluang umum dapat bertahan.',
          automation_risk: estimateKind === 'object'
            ? { label: 'low', sentence: 'Pertimbangan manusia diperlukan.' } : 'Pertimbangan manusia diperlukan.',
        }],
      },
      student_recommendations: { extracurricular_clubs: [], immediate_actions: [] },
      personal_growth: {
        development_areas: [{ area: 'Latihan mengambil keputusan', action_plan: 'Coba pilihan kecil setiap hari.' }],
        book_recommendations: [],
      },
    },
    chat_summary: null,
  }
}
