import { api } from '@/lib/api'

export interface AssessmentListItem {
  id: string
  user_name: string
  school_name: string | null
  status: 'pending' | 'processing' | 'completed' | 'failed'
  submitted_at: string
  model_used: string | null
}

export interface AssessmentListResponse {
  assessments: AssessmentListItem[]
  next_cursor?: string
}

export interface AssessmentListFilters {
  school_id?: string
  status?: string
  date_from?: string
  date_to?: string
  user_name?: string
  user_email?: string
  model?: string
}

export interface ScoreItem {
  domain: string
  score: number
}

export interface AnswerItem {
  question_number: number
  question_text: string
  answer: number
  reverse_scored: boolean
}

export interface AssessmentDetail {
  assessment: {
    id: string
    status: string
    submitted_at: string
    completed_at?: string
  }
  user: {
    id: string
    full_name: string
    email: string
    school_name?: string
    grade?: string
    major?: string
  }
  model_info: {
    model: string
    attempts: number
    duration_ms: number
    prompt_tokens: number
    completion_tokens: number
    estimated_cost_usd: number
  } | null
  scores: {
    riasec: ScoreItem[]
    ocean: ScoreItem[]
    viais: ScoreItem[]
  }
  answers: {
    riasec: Record<string, AnswerItem[]>
    ocean: Record<string, AnswerItem[]>
    viais: Record<string, AnswerItem[]>
  }
  analysis_result: {
    profile_summary: {
      signature_title: string
      signature_description: string
      learning_style?: {
        preference: string
        environment: string
      }
    }
    detailed_analysis: {
      strengths: string[]
      weaknesses: string[]
      team_dynamics: {
        natural_role?: string
        collaboration_style?: string
        synergy_needs?: string
      }
    }
    career_pathing: {
      top_industries: string[]
      ideal_work_environment: string
      role_prospects: {
        role_title: string
        match_reason: string
        market_outlook: string
        automation_risk: string
      }[]
    }
    student_recommendations: {
      extracurricular_clubs: {
        club_name: string
        relevance: string
      }[]
      immediate_actions: {
        action: string
        description: string
      }[]
    }
    personal_growth: {
      development_areas: {
        area: string
        action_plan: string
      }[]
      book_recommendations: {
        title: string
        author: string
        relevance: string
      }[]
    }
  } | null
  chat_summary: {
    session_id: string
    message_count: number
    model_used: string
    last_message_at?: string
  } | null
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  token_count?: number
  created_at: string
}

export interface AssessmentChatResponse {
  session: {
    id: string
    model_used: string
    message_count: number
    created_at: string
  }
  messages: ChatMessage[]
}

function buildQuery(params: Record<string, string | undefined>): string {
  const entries = Object.entries(params).filter(([_, v]) => v !== undefined && v !== '')
  if (entries.length === 0) return ''
  return '?' + entries.map(([k, v]) => `${k}=${encodeURIComponent(v!)}`).join('&')
}

export const assessmentsApi = {
  list(filters: AssessmentListFilters, cursor?: string, limit = 20): Promise<AssessmentListResponse> {
    const query = buildQuery({ ...filters, cursor, limit: String(limit) })
    return api.get<AssessmentListResponse>(`/admin/assessments${query}`)
  },

  detail(id: string): Promise<AssessmentDetail> {
    return api.get<AssessmentDetail>(`/admin/assessments/${id}/detail`)
  },

  chat(id: string): Promise<AssessmentChatResponse> {
    return api.get<AssessmentChatResponse>(`/admin/assessments/${id}/chat`)
  },
}
