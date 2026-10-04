<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useQuery } from '@tanstack/vue-query'
import { assessmentsApi, type ScoreItem } from '@/lib/api-assessments'

const route = useRoute()
const router = useRouter()

const assessmentId = computed(() => route.params.id as string)

const { data, isLoading } = useQuery({
  queryKey: ['assessment-detail', assessmentId],
  queryFn: () => assessmentsApi.detail(assessmentId.value),
})

const assessment = computed(() => data.value?.assessment)
const user = computed(() => data.value?.user)
const modelInfo = computed(() => data.value?.model_info)
const scores = computed(() => data.value?.scores)
const answers = computed(() => data.value?.answers)
const analysisResult = computed(() => data.value?.analysis_result)
const chatSummary = computed(() => data.value?.chat_summary)

const expandedAnswerSections = ref<Record<string, boolean>>({})

function toggleAnswerSection(key: string) {
  expandedAnswerSections.value[key] = !expandedAnswerSections.value[key]
}

function isAnswerSectionExpanded(key: string): boolean {
  return !!expandedAnswerSections.value[key]
}

function statusClass(status: string): string {
  switch (status) {
    case 'completed': return 'text-green-700'
    case 'failed': return 'text-red-600'
    case 'processing': return 'text-amber-600'
    case 'queued':
    case 'pending': return 'text-amber-600'
    default: return 'text-phosphor-faint'
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function formatCost(usd: number): string {
  return `$${usd.toFixed(4)}`
}

function getMaxScore(items: ScoreItem[]): number {
  return Math.max(...items.map(s => s.score), 1)
}

function goToChat() {
  router.push({ name: 'assessment-chat', params: { id: assessmentId.value } })
}
</script>

<template>
  <div v-if="isLoading" class="text-phosphor-faint text-xs py-8 text-center">>>> LOADING ASSESSMENT DATA...</div>

  <div v-else-if="!assessment" class="text-hazard text-xs py-8 text-center">[ ASSESSMENT NOT FOUND ]</div>

  <div v-else>
    <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
      <div class="min-w-0">
        <button class="text-[11px] text-phosphor-dim hover:text-phosphor mb-2 uppercase min-h-[32px] inline-flex items-center" @click="router.push({ name: 'assessments' })">
          &lt;&lt;&lt; BACK TO ASSESSMENTS
        </button>
        <div class="heading-macro text-xl text-phosphor">ASSESSMENT QA</div>
        <div class="text-[11px] text-phosphor-faint mt-1 break-all">/// {{ assessmentId }}</div>
      </div>
      <div class="flex items-center gap-2 flex-wrap">
        <button
          class="border border-crt-border px-3 text-[11px] text-phosphor-dim hover:text-phosphor hover:border-phosphor-dim transition-colors uppercase min-h-[36px]"
          @click="router.push({ name: 'assessment-compare', query: { ids: assessmentId } })"
        >
          [ COMPARE ]
        </button>
        <div class="border-2 px-3 py-1 text-[11px]" :class="[statusClass(assessment.status), assessment.status === 'failed' ? 'border-hazard' : 'border-crt-border']">
          [ {{ assessment.status.toUpperCase() }} ]
        </div>
      </div>
    </div>

    <!-- ASSESSMENT META + USER -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
      <div class="border-2 border-crt-border p-3 sm:p-4">
        <div class="text-[11px] text-phosphor-dim mb-3 uppercase">[ SUBMISSION ]</div>
        <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
          <dt class="text-phosphor-faint">SUBMITTED</dt>
          <dd>{{ assessment.submitted_at.slice(0, 16).replace('T', ' ') }}</dd>
          <dt class="text-phosphor-faint">COMPLETED</dt>
          <dd>{{ assessment.completed_at ? assessment.completed_at.slice(0, 16).replace('T', ' ') : '\u2014' }}</dd>
          <dt class="text-phosphor-faint">STATUS</dt>
          <dd :class="statusClass(assessment.status)">{{ assessment.status.toUpperCase() }}</dd>
        </dl>
      </div>

      <div class="border-2 border-crt-border p-3 sm:p-4">
        <div class="text-[11px] text-phosphor-dim mb-3 uppercase">[ USER ]</div>
        <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs" v-if="user">
          <dt class="text-phosphor-faint">NAME</dt>
          <dd class="break-words">
            <button class="text-phosphor hover:text-hazard underline text-left" @click="router.push({ name: 'user-detail', params: { id: user.id } })">
              {{ user.full_name }}
            </button>
          </dd>
          <dt class="text-phosphor-faint">EMAIL</dt>
          <dd class="break-all">{{ user.email }}</dd>
          <dt class="text-phosphor-faint">SCHOOL</dt>
          <dd class="break-words">{{ user.school_name || '\u2014' }}</dd>
          <dt class="text-phosphor-faint">GRADE</dt>
          <dd>{{ user.grade || '\u2014' }}</dd>
          <dt class="text-phosphor-faint">MAJOR</dt>
          <dd>{{ user.major || '\u2014' }}</dd>
        </dl>
      </div>
    </div>

    <!-- MODEL INFO -->
    <div class="border-2 border-crt-border p-3 sm:p-4 mb-4" v-if="modelInfo">
      <div class="text-[11px] text-phosphor-dim mb-3 uppercase">[ MODEL INFO ]</div>
      <dl class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-1.5 text-xs">
        <div class="flex flex-col">
          <dt class="text-phosphor-faint uppercase">MODEL</dt>
          <dd class="break-all">{{ modelInfo.model }}</dd>
        </div>
        <div class="flex flex-col">
          <dt class="text-phosphor-faint uppercase">ATTEMPTS</dt>
          <dd>{{ modelInfo.attempts }}</dd>
        </div>
        <div class="flex flex-col">
          <dt class="text-phosphor-faint uppercase">DURATION</dt>
          <dd>{{ formatDuration(modelInfo.duration_ms) }}</dd>
        </div>
        <div class="flex flex-col">
          <dt class="text-phosphor-faint uppercase">PROMPT TOKENS</dt>
          <dd>{{ modelInfo.prompt_tokens.toLocaleString() }}</dd>
        </div>
        <div class="flex flex-col">
          <dt class="text-phosphor-faint uppercase">COMPLETION TOKENS</dt>
          <dd>{{ modelInfo.completion_tokens.toLocaleString() }}</dd>
        </div>
        <div class="flex flex-col">
          <dt class="text-phosphor-faint uppercase">EST. COST</dt>
          <dd>{{ formatCost(modelInfo.estimated_cost_usd) }}</dd>
        </div>
      </dl>
    </div>

    <div v-else class="border-2 border-crt-border p-4 mb-4">
      <div class="text-[11px] text-phosphor-dim mb-3 uppercase">[ MODEL INFO ]</div>
      <div class="text-xs text-phosphor-faint text-center py-2">/// NOT YET ANALYZED</div>
    </div>

    <!-- SCORES -->
    <div class="border-2 border-crt-border p-3 sm:p-4 mb-4" v-if="scores">
      <div class="text-[11px] text-phosphor-dim mb-3 uppercase">[ SCORES ]</div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <!-- RIASEC -->
        <div>
          <div class="text-[11px] text-phosphor-faint mb-2 uppercase">RIASEC</div>
          <div class="space-y-1">
            <div v-for="s in scores.riasec" :key="s.domain" class="flex items-center gap-2 text-xs">
              <span class="w-4 text-phosphor-faint shrink-0">{{ s.domain }}</span>
              <div class="flex-1 h-3 bg-crt-surface border border-crt-border relative min-w-0">
                <div
                  class="absolute inset-y-0 left-0 bg-hazard"
                  :style="{ width: `${(s.score / getMaxScore(scores.riasec)) * 100}%` }"
                ></div>
              </div>
              <span class="w-10 text-right text-phosphor shrink-0">{{ s.score }}</span>
            </div>
          </div>
        </div>

        <!-- OCEAN -->
        <div>
          <div class="text-[11px] text-phosphor-faint mb-2 uppercase">OCEAN</div>
          <div class="space-y-1">
            <div v-for="s in scores.ocean" :key="s.domain" class="flex items-center gap-2 text-xs">
              <span class="w-4 text-phosphor-faint shrink-0">{{ s.domain }}</span>
              <div class="flex-1 h-3 bg-crt-surface border border-crt-border relative min-w-0">
                <div
                  class="absolute inset-y-0 left-0 bg-hazard"
                  :style="{ width: `${(s.score / getMaxScore(scores.ocean)) * 100}%` }"
                ></div>
              </div>
              <span class="w-10 text-right text-phosphor shrink-0">{{ s.score }}</span>
            </div>
          </div>
        </div>

        <!-- VIAIS -->
        <div>
          <div class="text-[11px] text-phosphor-faint mb-2 uppercase">VIAIS</div>
          <div class="space-y-1">
            <div v-for="s in scores.viais" :key="s.domain" class="flex items-center gap-2 text-xs">
              <span class="w-20 text-phosphor-faint truncate shrink-0" :title="s.domain">{{ s.domain }}</span>
              <div class="flex-1 h-3 bg-crt-surface border border-crt-border relative min-w-0">
                <div
                  class="absolute inset-y-0 left-0 bg-hazard"
                  :style="{ width: `${(s.score / getMaxScore(scores.viais)) * 100}%` }"
                ></div>
              </div>
              <span class="w-10 text-right text-phosphor shrink-0">{{ s.score }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ANSWERS -->
    <div class="border-2 border-crt-border p-3 sm:p-4 mb-4" v-if="answers">
      <div class="text-[11px] text-phosphor-dim mb-3 uppercase">[ ANSWERS ]</div>

      <div v-for="(assessmentType, typeKey) in { riasec: 'RIASEC', ocean: 'OCEAN', viais: 'VIAIS' }" :key="typeKey" class="mb-3 last:mb-0">
        <div class="text-[11px] text-phosphor-faint mb-2 uppercase">{{ assessmentType }}</div>
        <div v-if="answers[typeKey as keyof typeof answers]" class="space-y-1">
          <div v-for="(domainAnswers, domain) in answers[typeKey as keyof typeof answers]" :key="domain">
            <button
              class="w-full flex items-center justify-between gap-2 border border-crt-border px-3 py-2 text-[11px] text-phosphor-dim hover:text-phosphor hover:border-phosphor-dim transition-colors min-h-[36px]"
              @click="toggleAnswerSection(`${typeKey}-${domain}`)"
            >
              <span class="text-left">{{ domain }} ({{ domainAnswers.length }} items)</span>
              <span>{{ isAnswerSectionExpanded(`${typeKey}-${domain}`) ? '[-]' : '[+]' }}</span>
            </button>
            <div v-if="isAnswerSectionExpanded(`${typeKey}-${domain}`)" class="border border-t-0 border-crt-border overflow-x-auto">
              <table class="w-full text-xs min-w-[480px]">
                <thead>
                  <tr class="border-b border-crt-border text-phosphor-faint">
                    <th class="text-left px-2 py-1 w-8">#</th>
                    <th class="text-left px-2 py-1">QUESTION</th>
                    <th class="text-center px-2 py-1 w-16">ANSWER</th>
                    <th class="text-center px-2 py-1 w-12">REV</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="item in domainAnswers" :key="item.question_number" class="border-b border-crt-border last:border-b-0">
                    <td class="px-2 py-1 text-phosphor-faint">{{ item.question_number }}</td>
                    <td class="px-2 py-1 text-phosphor">{{ item.question_text }}</td>
                    <td class="px-2 py-1 text-center text-phosphor">{{ item.answer }}</td>
                    <td class="px-2 py-1 text-center" :class="item.reverse_scored ? 'text-hazard' : 'text-phosphor-faint'">{{ item.reverse_scored ? 'R' : '\u2014' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <div v-else class="text-xs text-phosphor-faint">/// NO DATA</div>
      </div>
    </div>

    <!-- ANALYSIS RESULT -->
    <div class="border-2 border-crt-border p-4 mb-4" v-if="analysisResult">
      <div class="text-[11px] text-phosphor-dim mb-3 uppercase">[ ANALYSIS RESULT ]</div>

      <!-- Profile Summary -->
      <div class="mb-4">
        <div class="text-[11px] text-phosphor-faint mb-1 uppercase">PROFILE SUMMARY</div>
        <div class="text-sm text-phosphor font-bold">{{ analysisResult.profile_summary.signature_title }}</div>
        <div class="text-xs text-phosphor-dim mt-1">{{ analysisResult.profile_summary.signature_description }}</div>
        <div v-if="analysisResult.profile_summary.learning_style" class="mt-2">
          <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
            <dt class="text-phosphor-faint">LEARNING PREFERENCE</dt>
            <dd>{{ analysisResult.profile_summary.learning_style.preference }}</dd>
            <dt class="text-phosphor-faint">LEARNING ENVIRONMENT</dt>
            <dd>{{ analysisResult.profile_summary.learning_style.environment }}</dd>
          </dl>
        </div>
      </div>

      <!-- Detailed Analysis -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <div>
          <div class="text-[11px] text-phosphor-faint mb-1 uppercase">STRENGTHS</div>
          <ul class="text-xs text-phosphor space-y-0.5">
            <li v-for="(s, i) in analysisResult.detailed_analysis.strengths" :key="i">/// {{ s }}</li>
          </ul>
        </div>
        <div>
          <div class="text-[11px] text-phosphor-faint mb-1 uppercase">WEAKNESSES</div>
          <ul class="text-xs text-phosphor space-y-0.5">
            <li v-for="(w, i) in analysisResult.detailed_analysis.weaknesses" :key="i">/// {{ w }}</li>
          </ul>
        </div>
      </div>

      <!-- Team Dynamics -->
      <div class="mb-4" v-if="analysisResult.detailed_analysis.team_dynamics && (analysisResult.detailed_analysis.team_dynamics.natural_role || analysisResult.detailed_analysis.team_dynamics.collaboration_style || analysisResult.detailed_analysis.team_dynamics.synergy_needs)">
        <div class="text-[11px] text-phosphor-faint mb-1 uppercase">TEAM DYNAMICS</div>
        <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
          <template v-if="analysisResult.detailed_analysis.team_dynamics.natural_role">
            <dt class="text-phosphor-faint">NATURAL ROLE</dt>
            <dd>{{ analysisResult.detailed_analysis.team_dynamics.natural_role }}</dd>
          </template>
          <template v-if="analysisResult.detailed_analysis.team_dynamics.collaboration_style">
            <dt class="text-phosphor-faint">COLLABORATION STYLE</dt>
            <dd>{{ analysisResult.detailed_analysis.team_dynamics.collaboration_style }}</dd>
          </template>
          <template v-if="analysisResult.detailed_analysis.team_dynamics.synergy_needs">
            <dt class="text-phosphor-faint">SYNERGY NEEDS</dt>
            <dd>{{ analysisResult.detailed_analysis.team_dynamics.synergy_needs }}</dd>
          </template>
        </dl>
      </div>

      <!-- Career Pathing -->
      <div class="mb-4">
        <div class="text-[11px] text-phosphor-faint mb-1 uppercase">CAREER PATHING</div>
        <div class="text-xs text-phosphor-dim mb-1">TOP INDUSTRIES:</div>
        <div class="flex flex-wrap gap-2 mb-2">
          <span
            v-for="(ind, i) in analysisResult.career_pathing.top_industries"
            :key="i"
            class="border border-crt-border px-2 py-0.5 text-[11px] text-phosphor"
          >
            {{ ind }}
          </span>
        </div>
        <div class="text-xs mb-2">
          <span class="text-phosphor-faint">IDEAL ENVIRONMENT:</span>
          <span class="text-phosphor ml-2">{{ analysisResult.career_pathing.ideal_work_environment }}</span>
        </div>
        <div v-if="analysisResult.career_pathing.role_prospects.length">
          <div class="text-xs text-phosphor-dim mb-2">ROLE PROSPECTS:</div>
          <p class="text-xs text-phosphor-faint mb-2">Perkiraan umum, bukan data pasar.</p>
          <div class="space-y-3">
            <div v-for="(role, i) in analysisResult.career_pathing.role_prospects" :key="i" class="border border-crt-border p-3">
              <div class="text-xs text-phosphor font-bold mb-1">{{ role.role_title }}</div>
              <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
                <dt class="text-phosphor-faint">MATCH REASON</dt>
                <dd>{{ role.match_reason }}</dd>
                <dt class="text-phosphor-faint">MARKET OUTLOOK</dt>
                <dd>{{ role.market_outlook }}</dd>
                <dt class="text-phosphor-faint">AUTOMATION RISK</dt>
                <dd>{{ role.automation_risk }}</dd>
              </dl>
            </div>
          </div>
        </div>
      </div>

      <!-- Student Recommendations -->
      <div class="mb-4" v-if="analysisResult.student_recommendations.extracurricular_clubs.length || analysisResult.student_recommendations.immediate_actions.length">
        <div class="text-[11px] text-phosphor-faint mb-1 uppercase">STUDENT RECOMMENDATIONS</div>
        <div v-if="analysisResult.student_recommendations.immediate_actions.length" class="mb-3">
          <div class="text-xs text-phosphor-dim mb-1">IMMEDIATE ACTIONS:</div>
          <div class="space-y-1.5">
            <div v-for="(item, i) in analysisResult.student_recommendations.immediate_actions" :key="i" class="text-xs">
              <div class="text-phosphor">>>> {{ item.action }}</div>
              <div class="text-phosphor-faint ml-4">{{ item.description }}</div>
            </div>
          </div>
        </div>
        <div v-if="analysisResult.student_recommendations.extracurricular_clubs.length">
          <div class="text-xs text-phosphor-dim mb-1">EXTRACURRICULAR CLUBS:</div>
          <div class="space-y-1.5">
            <div v-for="(club, i) in analysisResult.student_recommendations.extracurricular_clubs" :key="i" class="text-xs">
              <div class="text-phosphor">/// {{ club.club_name }}</div>
              <div class="text-phosphor-faint ml-4">{{ club.relevance }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Personal Growth -->
      <div v-if="analysisResult.personal_growth.development_areas.length || analysisResult.personal_growth.book_recommendations.length">
        <div class="text-[11px] text-phosphor-faint mb-1 uppercase">PERSONAL GROWTH</div>
        <div v-if="analysisResult.personal_growth.development_areas.length" class="mb-3">
          <div class="text-xs text-phosphor-dim mb-1">DEVELOPMENT AREAS:</div>
          <div class="space-y-1.5">
            <div v-for="(item, i) in analysisResult.personal_growth.development_areas" :key="i" class="text-xs">
              <div class="text-phosphor">/// {{ item.area }}</div>
              <div class="text-phosphor-faint ml-4">{{ item.action_plan }}</div>
            </div>
          </div>
        </div>
        <div v-if="analysisResult.personal_growth.book_recommendations.length">
          <div class="text-xs text-phosphor-dim mb-1">BOOK RECOMMENDATIONS:</div>
          <div class="space-y-1.5">
            <div v-for="(book, i) in analysisResult.personal_growth.book_recommendations" :key="i" class="text-xs">
              <div class="text-phosphor">/// {{ book.title }} — <span class="text-phosphor-faint">{{ book.author }}</span></div>
              <div class="text-phosphor-faint ml-4">{{ book.relevance }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="border-2 border-crt-border p-4 mb-4">
      <div class="text-[11px] text-phosphor-dim mb-3 uppercase">[ ANALYSIS RESULT ]</div>
      <div class="text-xs text-phosphor-faint text-center py-2">/// NO ANALYSIS AVAILABLE</div>
    </div>

    <!-- CHAT SUMMARY -->
    <div class="border-2 border-crt-border p-4 mb-4">
      <div class="text-[11px] text-phosphor-dim mb-3 uppercase">[ CHAT SESSION ]</div>
      <div v-if="chatSummary">
        <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs mb-3">
          <dt class="text-phosphor-faint">SESSION ID</dt>
          <dd class="text-phosphor">{{ chatSummary.session_id }}</dd>
          <dt class="text-phosphor-faint">MODEL</dt>
          <dd>{{ chatSummary.model_used }}</dd>
          <dt class="text-phosphor-faint">MESSAGES</dt>
          <dd>{{ chatSummary.message_count }}</dd>
          <dt class="text-phosphor-faint">LAST MESSAGE</dt>
          <dd>{{ chatSummary.last_message_at ? chatSummary.last_message_at.slice(0, 16).replace('T', ' ') : '\u2014' }}</dd>
        </dl>
        <button
          class="border border-crt-border px-3 py-1.5 text-[11px] text-phosphor-dim hover:text-phosphor hover:border-phosphor-dim transition-colors"
          @click="goToChat"
        >
          VIEW CHAT MESSAGES >>>
        </button>
      </div>
      <div v-else class="text-xs text-phosphor-faint text-center py-2">/// NO CHAT SESSION</div>
    </div>
  </div>
</template>
