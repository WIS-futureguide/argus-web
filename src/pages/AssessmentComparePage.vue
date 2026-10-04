<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useQuery } from '@tanstack/vue-query'
import { useCursorPagination } from '@/composables/useCursorPagination'
import { assessmentsApi, type AssessmentDetail, type AssessmentListFilters, type AssessmentListItem, type AnswerItem } from '@/lib/api-assessments'

const router = useRouter()
const route = useRoute()

// Selection state
const selectedIds = ref<string[]>([])
const selectedPreviews = ref<Map<string, AssessmentListItem>>(new Map())

// Initialize from query params
onMounted(() => {
  const idsParam = route.query.ids
  if (idsParam) {
    const parsed = Array.isArray(idsParam)
      ? idsParam.filter(Boolean).map(String)
      : String(idsParam).split(',').filter(Boolean)
    selectedIds.value = parsed.slice(0, 3)
  }
})

function toggleSelection(row: Record<string, unknown>) {
  const id = row.id as string
  const idx = selectedIds.value.indexOf(id)
  if (idx >= 0) {
    selectedIds.value.splice(idx, 1)
    selectedPreviews.value.delete(id)
  } else if (selectedIds.value.length < 3) {
    selectedIds.value.push(id)
    selectedPreviews.value.set(id, row as unknown as AssessmentListItem)
  }
}

function removeSelected(id: string) {
  const idx = selectedIds.value.indexOf(id)
  if (idx >= 0) selectedIds.value.splice(idx, 1)
  selectedPreviews.value.delete(id)
}

function isSelected(id: string): boolean {
  return selectedIds.value.includes(id)
}

// Comparison state
const submittedIds = ref<string[]>([])
const isComparing = computed(() => submittedIds.value.length >= 2)

function startCompare() {
  if (selectedIds.value.length < 2) return
  submittedIds.value = [...selectedIds.value]
}

function resetCompare() {
  submittedIds.value = []
}

// Table filters
const filters = ref<AssessmentListFilters>({
  user_name: '',
  user_email: '',
  status: 'completed',
  model: '',
  date_from: '',
  date_to: '',
})

const { currentCursor, hasNext, hasPrev, goNext, goPrev, reset, setNextCursor } = useCursorPagination()

const { data: tableData, isLoading: tableLoading } = useQuery({
  queryKey: ['assessments-compare-list', filters, currentCursor],
  queryFn: () => assessmentsApi.list(filters.value, currentCursor.value),
})

watch(tableData, (val) => {
  setNextCursor(val?.next_cursor)
})

function applyFilters() {
  reset()
}

function clearFilters() {
  filters.value = { user_name: '', user_email: '', status: 'completed', model: '', date_from: '', date_to: '' }
  applyFilters()
}

// Comparison data queries
const { data: data0, isLoading: loading0, isError: error0 } = useQuery(
  computed(() => ({
    queryKey: ['assessment-compare-0', submittedIds.value[0]] as const,
    queryFn: () => assessmentsApi.detail(submittedIds.value[0]!),
    enabled: submittedIds.value.length > 0,
  }))
)

const { data: data1, isLoading: loading1, isError: error1 } = useQuery(
  computed(() => ({
    queryKey: ['assessment-compare-1', submittedIds.value[1]] as const,
    queryFn: () => assessmentsApi.detail(submittedIds.value[1]!),
    enabled: submittedIds.value.length > 1,
  }))
)

const { data: data2, isLoading: loading2, isError: error2 } = useQuery(
  computed(() => ({
    queryKey: ['assessment-compare-2', submittedIds.value[2]] as const,
    queryFn: () => assessmentsApi.detail(submittedIds.value[2]!),
    enabled: submittedIds.value.length > 2,
  }))
)

const results = computed<(AssessmentDetail | undefined)[]>(() => {
  const arr: (AssessmentDetail | undefined)[] = []
  if (submittedIds.value.length > 0) arr.push(data0.value)
  if (submittedIds.value.length > 1) arr.push(data1.value)
  if (submittedIds.value.length > 2) arr.push(data2.value)
  return arr
})

const loadingStates = computed(() => {
  const arr: boolean[] = []
  if (submittedIds.value.length > 0) arr.push(loading0.value)
  if (submittedIds.value.length > 1) arr.push(loading1.value)
  if (submittedIds.value.length > 2) arr.push(loading2.value)
  return arr
})

const errorStates = computed(() => {
  const arr: boolean[] = []
  if (submittedIds.value.length > 0) arr.push(error0.value)
  if (submittedIds.value.length > 1) arr.push(error1.value)
  if (submittedIds.value.length > 2) arr.push(error2.value)
  return arr
})

const anyLoading = computed(() => loadingStates.value.some(Boolean))
const colCount = computed(() => submittedIds.value.length)
const compareGridClass = computed(() =>
  colCount.value === 2
    ? 'grid-cols-1 sm:grid-cols-2'
    : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
)

function globalMaxForDomain(domain: 'riasec' | 'ocean' | 'viais'): number {
  let max = 1
  for (const r of results.value) {
    if (r?.scores?.[domain]) {
      const localMax = Math.max(...r.scores[domain].map(s => s.score))
      if (localMax > max) max = localMax
    }
  }
  return max
}

type AssessmentType = 'riasec' | 'ocean' | 'viais'

const answerDomains = computed(() => {
  const types: AssessmentType[] = ['riasec', 'ocean', 'viais']
  const result: Record<AssessmentType, string[]> = { riasec: [], ocean: [], viais: [] }
  for (const type of types) {
    const domainSet = new Set<string>()
    for (const r of results.value) {
      if (r?.answers?.[type]) {
        for (const domain of Object.keys(r.answers[type])) {
          domainSet.add(domain)
        }
      }
    }
    result[type] = Array.from(domainSet).sort()
  }
  return result
})

function getQuestionNumbers(type: AssessmentType, domain: string): number[] {
  const nums = new Set<number>()
  for (const r of results.value) {
    if (r?.answers?.[type]?.[domain]) {
      for (const item of r.answers[type][domain]) {
        nums.add(item.question_number)
      }
    }
  }
  return Array.from(nums).sort((a, b) => a - b)
}

function getAnswer(r: AssessmentDetail | undefined, type: AssessmentType, domain: string, questionNumber: number): AnswerItem | undefined {
  if (!r?.answers?.[type]?.[domain]) return undefined
  return r.answers[type][domain].find(a => a.question_number === questionNumber)
}

function getQuestionText(type: AssessmentType, domain: string, questionNumber: number): string {
  for (const r of results.value) {
    const answer = getAnswer(r, type, domain, questionNumber)
    if (answer) return answer.question_text
  }
  return ''
}

const hasAnyAnswers = computed(() => {
  return results.value.some(r => r?.answers && (
    Object.keys(r.answers.riasec || {}).length > 0 ||
    Object.keys(r.answers.ocean || {}).length > 0 ||
    Object.keys(r.answers.viais || {}).length > 0
  ))
})

const columns = [
  { key: 'user_name', label: 'USER' },
  { key: 'school_name', label: 'SCHOOL', format: (v: unknown) => (v as string) || '\u2014' },
  { key: 'status', label: 'STATUS', class: 'w-24', format: (v: unknown) => (v as string).toUpperCase() },
  { key: 'model_used', label: 'MODEL', class: 'w-40', format: (v: unknown) => (v as string) || '\u2014' },
  { key: 'submitted_at', label: 'SUBMITTED', class: 'w-36', format: (v: unknown) => (v as string).slice(0, 16).replace('T', ' ') },
]
</script>

<template>
  <div>
    <div class="flex items-start justify-between mb-6">
      <div>
        <button class="text-[11px] text-phosphor-dim hover:text-phosphor mb-2 uppercase" @click="router.push({ name: 'assessments' })">
          &lt;&lt;&lt; BACK TO ASSESSMENTS
        </button>
        <div class="heading-macro text-xl text-phosphor">ASSESSMENT COMPARE</div>
        <div class="text-[11px] text-phosphor-faint mt-1 uppercase">/// SIDE-BY-SIDE ANALYSIS COMPARISON (MAX 3)</div>
      </div>
    </div>

    <!-- SELECTION MODE -->
    <template v-if="!isComparing">
      <!-- SELECTED SLOTS -->
      <div class="border-2 border-crt-border p-3 sm:p-4 mb-4">
        <div class="text-[11px] text-phosphor-dim mb-3 uppercase">[ SELECTED — {{ selectedIds.length }}/3 ]</div>
        <div v-if="selectedIds.length === 0" class="text-xs text-phosphor-faint">/// Click rows below to select assessments for comparison</div>
        <div v-else class="space-y-2">
          <div v-for="id in selectedIds" :key="id" class="flex items-center justify-between gap-2 border border-crt-border p-2">
            <div class="text-xs min-w-0">
              <span class="text-phosphor truncate inline-block max-w-full">{{ selectedPreviews.get(id)?.user_name || id.slice(0, 8) + '...' }}</span>
              <span v-if="selectedPreviews.get(id)" class="text-phosphor-faint ml-2">{{ selectedPreviews.get(id)?.submitted_at?.slice(0, 10) }}</span>
            </div>
            <button
              class="text-[11px] text-phosphor-faint hover:text-hazard transition-colors min-h-[36px] min-w-[36px] inline-flex items-center justify-center shrink-0"
              @click="removeSelected(id)"
            >
              [ X ]
            </button>
          </div>
        </div>
        <div class="mt-3">
          <button
            class="border border-hazard px-3 text-[11px] text-hazard hover:bg-hazard hover:text-crt transition-colors uppercase disabled:opacity-30 disabled:cursor-not-allowed min-h-[40px] w-full sm:w-auto"
            :disabled="selectedIds.length < 2"
            @click="startCompare"
          >
            [ COMPARE {{ selectedIds.length }} ASSESSMENTS ]
          </button>
        </div>
      </div>

      <!-- FILTERS -->
      <div class="border border-crt-border p-2 sm:p-3 mb-4">
        <div class="text-[10px] sm:text-[11px] text-phosphor-dim mb-2 uppercase">[ FILTERS ]</div>
        <form class="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4" @submit.prevent="applyFilters">
          <div>
            <label class="block text-[10px] sm:text-[11px] text-phosphor-faint mb-1 uppercase">USER NAME</label>
            <input
              v-model="filters.user_name"
              class="w-full bg-crt-surface border border-crt-border px-2 py-1.5 text-[13px] sm:text-xs text-phosphor focus:outline-none focus:border-hazard"
              placeholder="SEARCH..."
            />
          </div>
          <div>
            <label class="block text-[10px] sm:text-[11px] text-phosphor-faint mb-1 uppercase">USER EMAIL</label>
            <input
              v-model="filters.user_email"
              class="w-full bg-crt-surface border border-crt-border px-2 py-1.5 text-[13px] sm:text-xs text-phosphor focus:outline-none focus:border-hazard"
              placeholder="SEARCH..."
            />
          </div>
          <div>
            <label class="block text-[10px] sm:text-[11px] text-phosphor-faint mb-1 uppercase">STATUS</label>
            <select
              v-model="filters.status"
              class="w-full bg-crt-surface border border-crt-border px-2 py-1.5 text-[13px] sm:text-xs text-phosphor focus:outline-none focus:border-hazard"
            >
              <option value="">ALL</option>
              <option value="pending">PENDING</option>
              <option value="processing">PROCESSING</option>
              <option value="completed">COMPLETED</option>
              <option value="failed">FAILED</option>
            </select>
          </div>
          <div class="flex gap-2 mt-1 lg:mt-0 lg:items-end">
            <button
              type="submit"
              class="flex-1 sm:flex-initial border border-hazard px-3 py-1.5 text-[11px] text-hazard hover:bg-hazard hover:text-crt transition-colors"
            >
              [ APPLY ]
            </button>
            <button
              type="button"
              class="flex-1 sm:flex-initial border border-crt-border px-3 py-1.5 text-[11px] text-phosphor-dim hover:text-phosphor hover:border-phosphor-dim transition-colors"
              @click="clearFilters"
            >
              [ CLEAR ]
            </button>
          </div>
        </form>
      </div>

      <!-- TABLE -->
      <div class="border-2 border-crt-border">
        <div class="overflow-x-auto">
          <table class="w-full text-[13px]">
            <thead>
              <tr class="border-b-2 border-crt-border bg-crt-surface">
                <th class="px-3 py-2 text-left text-[11px] text-phosphor-dim font-normal uppercase w-10"></th>
                <th v-for="col in columns" :key="col.key" class="px-3 py-2 text-left text-[11px] text-phosphor-dim font-normal uppercase" :class="col.class">
                  {{ col.label }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="tableLoading">
                <td :colspan="columns.length + 1" class="px-3 py-8 text-center text-phosphor-faint">>>> LOADING...</td>
              </tr>
              <tr v-else-if="!tableData?.assessments?.length">
                <td :colspan="columns.length + 1" class="px-3 py-8 text-center text-phosphor-faint">[ NO RECORDS FOUND ]</td>
              </tr>
              <tr
                v-else
                v-for="row in tableData.assessments"
                :key="row.id"
                class="border-b border-crt-border cursor-pointer transition-colors"
                :class="isSelected(row.id) ? 'bg-crt-surface' : 'hover:bg-crt-surface'"
                @click="toggleSelection(row as unknown as Record<string, unknown>)"
              >
                <td class="px-3 py-2 text-center">
                  <span v-if="isSelected(row.id)" class="text-hazard text-xs">[x]</span>
                  <span v-else class="text-phosphor-faint text-xs">[ ]</span>
                </td>
                <td class="px-3 py-2 text-phosphor">{{ row.user_name }}</td>
                <td class="px-3 py-2 text-phosphor">{{ row.school_name || '\u2014' }}</td>
                <td class="px-3 py-2 text-phosphor w-24">{{ row.status.toUpperCase() }}</td>
                <td class="px-3 py-2 text-phosphor w-40 font-mono text-[11px]">{{ row.model_used || '\u2014' }}</td>
                <td class="px-3 py-2 text-phosphor">{{ row.submitted_at.slice(0, 16).replace('T', ' ') }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div
          v-if="hasPrev || hasNext"
          class="flex items-center justify-between px-3 py-2 border-t-2 border-crt-border bg-crt-surface"
        >
          <button
            :disabled="!hasPrev"
            class="text-xs text-phosphor-dim hover:text-phosphor disabled:opacity-30 disabled:cursor-not-allowed"
            @click="goPrev"
          >
            &lt;&lt;&lt; PREV
          </button>
          <button
            :disabled="!hasNext"
            class="text-xs text-phosphor-dim hover:text-phosphor disabled:opacity-30 disabled:cursor-not-allowed"
            @click="goNext"
          >
            NEXT &gt;&gt;&gt;
          </button>
        </div>
      </div>
    </template>

    <!-- COMPARISON VIEW -->
    <template v-if="isComparing">
      <div class="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <div class="text-[11px] text-phosphor-dim uppercase">COMPARING {{ colCount }} ASSESSMENTS</div>
        <button
          class="border border-crt-border px-3 text-[11px] text-phosphor-dim hover:text-phosphor hover:border-phosphor-dim transition-colors uppercase min-h-[36px]"
          @click="resetCompare"
        >
          [ RESET ]
        </button>
      </div>

      <div v-if="anyLoading" class="text-phosphor-faint text-xs py-8 text-center">>>> LOADING ASSESSMENT DATA...</div>

      <template v-else>
        <!-- COLUMN HEADERS -->
        <div class="grid gap-3 mb-4" :class="compareGridClass">
          <div v-for="(r, i) in results" :key="i" class="border-2 border-crt-border p-3">
            <template v-if="errorStates[i]">
              <div class="text-hazard text-xs">[ FETCH ERROR ]</div>
              <div class="text-[11px] text-phosphor-faint mt-1">{{ submittedIds[i] }}</div>
            </template>
            <template v-else-if="r">
              <div class="text-xs text-phosphor font-bold">{{ r.user.full_name }}</div>
              <div class="text-[11px] text-phosphor-faint mt-0.5">{{ r.user.email }}</div>
              <div class="text-[11px] text-phosphor-faint mt-0.5">{{ r.user.school_name || '\u2014' }} / {{ r.user.grade || '\u2014' }}</div>
              <div class="flex items-center gap-2 mt-1">
                <span class="text-[11px] uppercase" :class="r.assessment.status === 'completed' ? 'text-phosphor' : 'text-hazard'">[ {{ r.assessment.status }} ]</span>
                <span class="text-[11px] text-phosphor-faint">{{ r.assessment.submitted_at.slice(0, 10) }}</span>
              </div>
            </template>
          </div>
        </div>

        <!-- SECTION: SCORES -->
        <div class="border-2 border-crt-border p-4 mb-4">
          <div class="text-[11px] text-phosphor-dim mb-4 uppercase">[ SCORES ]</div>
          <div class="mb-4">
            <div class="text-[11px] text-phosphor-faint mb-2 uppercase">RIASEC</div>
            <div class="grid gap-3" :class="compareGridClass">
              <div v-for="(r, i) in results" :key="i">
                <template v-if="r?.scores?.riasec">
                  <div v-for="s in r.scores.riasec" :key="s.domain" class="flex items-center gap-2 text-xs mb-1">
                    <span class="w-4 text-phosphor-faint">{{ s.domain }}</span>
                    <div class="flex-1 h-3 bg-crt-surface border border-crt-border relative">
                      <div class="absolute inset-y-0 left-0 bg-hazard" :style="{ width: `${(s.score / globalMaxForDomain('riasec')) * 100}%` }"></div>
                    </div>
                    <span class="w-8 text-right text-phosphor">{{ s.score }}</span>
                  </div>
                </template>
                <div v-else class="text-xs text-phosphor-faint">/// NO DATA</div>
              </div>
            </div>
          </div>
          <div class="mb-4">
            <div class="text-[11px] text-phosphor-faint mb-2 uppercase">OCEAN</div>
            <div class="grid gap-3" :class="compareGridClass">
              <div v-for="(r, i) in results" :key="i">
                <template v-if="r?.scores?.ocean">
                  <div v-for="s in r.scores.ocean" :key="s.domain" class="flex items-center gap-2 text-xs mb-1">
                    <span class="w-4 text-phosphor-faint">{{ s.domain }}</span>
                    <div class="flex-1 h-3 bg-crt-surface border border-crt-border relative">
                      <div class="absolute inset-y-0 left-0 bg-hazard" :style="{ width: `${(s.score / globalMaxForDomain('ocean')) * 100}%` }"></div>
                    </div>
                    <span class="w-8 text-right text-phosphor">{{ s.score }}</span>
                  </div>
                </template>
                <div v-else class="text-xs text-phosphor-faint">/// NO DATA</div>
              </div>
            </div>
          </div>
          <div>
            <div class="text-[11px] text-phosphor-faint mb-2 uppercase">VIAIS</div>
            <div class="grid gap-3" :class="compareGridClass">
              <div v-for="(r, i) in results" :key="i">
                <template v-if="r?.scores?.viais">
                  <div v-for="s in r.scores.viais" :key="s.domain" class="flex items-center gap-2 text-xs mb-1">
                    <span class="w-16 text-phosphor-faint truncate" :title="s.domain">{{ s.domain }}</span>
                    <div class="flex-1 h-3 bg-crt-surface border border-crt-border relative">
                      <div class="absolute inset-y-0 left-0 bg-hazard" :style="{ width: `${(s.score / globalMaxForDomain('viais')) * 100}%` }"></div>
                    </div>
                    <span class="w-8 text-right text-phosphor">{{ s.score }}</span>
                  </div>
                </template>
                <div v-else class="text-xs text-phosphor-faint">/// NO DATA</div>
              </div>
            </div>
          </div>
        </div>

        <!-- SECTION: ANSWERS -->
        <div v-if="hasAnyAnswers" class="border-2 border-crt-border p-4 mb-4">
          <div class="text-[11px] text-phosphor-dim mb-4 uppercase">[ ANSWERS ]</div>

          <div v-for="type in (['riasec', 'ocean', 'viais'] as AssessmentType[])" :key="type" class="mb-4 last:mb-0">
            <template v-if="answerDomains[type].length > 0">
              <div class="text-[11px] text-phosphor-faint mb-2 uppercase">{{ type.toUpperCase() }}</div>

              <div v-for="domain in answerDomains[type]" :key="domain" class="mb-3 last:mb-0">
                <div class="text-[11px] text-phosphor-dim mb-1">{{ domain }}</div>
                <div class="overflow-x-auto">
                  <table class="w-full text-xs border border-crt-border">
                    <thead>
                      <tr class="border-b border-crt-border bg-crt-surface">
                        <th class="px-2 py-1 text-left text-[11px] text-phosphor-faint font-normal w-8">#</th>
                        <th class="px-2 py-1 text-left text-[11px] text-phosphor-faint font-normal">QUESTION</th>
                        <th v-for="(_, i) in results" :key="i" class="px-2 py-1 text-center text-[11px] text-phosphor-faint font-normal w-12">
                          {{ String.fromCharCode(65 + i) }}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="qNum in getQuestionNumbers(type, domain)" :key="qNum" class="border-b border-crt-border last:border-b-0">
                        <td class="px-2 py-1 text-phosphor-faint">{{ qNum }}</td>
                        <td class="px-2 py-1 text-phosphor text-xs max-w-xs truncate" :title="getQuestionText(type, domain, qNum)">{{ getQuestionText(type, domain, qNum) }}</td>
                        <td v-for="(r, i) in results" :key="i" class="px-2 py-1 text-center">
                          <template v-if="getAnswer(r, type, domain, qNum)">
                            <span class="text-phosphor">{{ getAnswer(r, type, domain, qNum)!.answer }}</span>
                            <span v-if="getAnswer(r, type, domain, qNum)!.reverse_scored" class="text-hazard ml-0.5 text-[10px]">R</span>
                          </template>
                          <span v-else class="text-phosphor-faint">&mdash;</span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </template>
          </div>
        </div>

        <!-- SECTION: PROFILE SUMMARY -->
        <div class="border-2 border-crt-border p-4 mb-4">
          <div class="text-[11px] text-phosphor-dim mb-4 uppercase">[ PROFILE SUMMARY ]</div>
          <div class="grid gap-3" :class="compareGridClass">
            <div v-for="(r, i) in results" :key="i">
              <template v-if="r?.analysis_result?.profile_summary">
                <div class="text-sm text-phosphor font-bold mb-1">{{ r.analysis_result.profile_summary.signature_title }}</div>
                <div class="text-xs text-phosphor-dim leading-relaxed">{{ r.analysis_result.profile_summary.signature_description }}</div>
                <div v-if="r.analysis_result.profile_summary.learning_style" class="mt-2">
                  <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                    <dt class="text-phosphor-faint">PREFERENCE</dt>
                    <dd>{{ r.analysis_result.profile_summary.learning_style.preference }}</dd>
                    <dt class="text-phosphor-faint">ENVIRONMENT</dt>
                    <dd>{{ r.analysis_result.profile_summary.learning_style.environment }}</dd>
                  </dl>
                </div>
              </template>
              <div v-else class="text-xs text-phosphor-faint">/// NO ANALYSIS</div>
            </div>
          </div>
        </div>

        <!-- SECTION: STRENGTHS & WEAKNESSES -->
        <div class="border-2 border-crt-border p-4 mb-4">
          <div class="text-[11px] text-phosphor-dim mb-4 uppercase">[ STRENGTHS & WEAKNESSES ]</div>
          <div class="mb-4">
            <div class="text-[11px] text-phosphor-faint mb-2 uppercase">STRENGTHS</div>
            <div class="grid gap-3" :class="compareGridClass">
              <div v-for="(r, i) in results" :key="i">
                <template v-if="r?.analysis_result?.detailed_analysis?.strengths">
                  <ul class="text-xs text-phosphor space-y-0.5">
                    <li v-for="(s, j) in r.analysis_result.detailed_analysis.strengths" :key="j">/// {{ s }}</li>
                  </ul>
                </template>
                <div v-else class="text-xs text-phosphor-faint">/// NO DATA</div>
              </div>
            </div>
          </div>
          <div>
            <div class="text-[11px] text-phosphor-faint mb-2 uppercase">WEAKNESSES</div>
            <div class="grid gap-3" :class="compareGridClass">
              <div v-for="(r, i) in results" :key="i">
                <template v-if="r?.analysis_result?.detailed_analysis?.weaknesses">
                  <ul class="text-xs text-phosphor space-y-0.5">
                    <li v-for="(w, j) in r.analysis_result.detailed_analysis.weaknesses" :key="j">/// {{ w }}</li>
                  </ul>
                </template>
                <div v-else class="text-xs text-phosphor-faint">/// NO DATA</div>
              </div>
            </div>
          </div>
        </div>

        <!-- SECTION: CAREER PATHING -->
        <div class="border-2 border-crt-border p-4 mb-4">
          <div class="text-[11px] text-phosphor-dim mb-4 uppercase">[ CAREER PATHING ]</div>
          <div class="mb-4">
            <div class="text-[11px] text-phosphor-faint mb-2 uppercase">TOP INDUSTRIES</div>
            <div class="grid gap-3" :class="compareGridClass">
              <div v-for="(r, i) in results" :key="i">
                <template v-if="r?.analysis_result?.career_pathing?.top_industries">
                  <div class="flex flex-wrap gap-1">
                    <span v-for="(ind, j) in r.analysis_result.career_pathing.top_industries" :key="j" class="border border-crt-border px-2 py-0.5 text-[11px] text-phosphor">{{ ind }}</span>
                  </div>
                </template>
                <div v-else class="text-xs text-phosphor-faint">/// NO DATA</div>
              </div>
            </div>
          </div>
          <div class="mb-4">
            <div class="text-[11px] text-phosphor-faint mb-2 uppercase">IDEAL WORK ENVIRONMENT</div>
            <div class="grid gap-3" :class="compareGridClass">
              <div v-for="(r, i) in results" :key="i">
                <template v-if="r?.analysis_result?.career_pathing?.ideal_work_environment">
                  <div class="text-xs text-phosphor leading-relaxed">{{ r.analysis_result.career_pathing.ideal_work_environment }}</div>
                </template>
                <div v-else class="text-xs text-phosphor-faint">/// NO DATA</div>
              </div>
            </div>
          </div>
          <div>
            <div class="text-[11px] text-phosphor-faint mb-2 uppercase">ROLE PROSPECTS</div>
            <p class="text-xs text-phosphor-faint mb-2">Perkiraan umum, bukan data pasar.</p>
            <div class="grid gap-3" :class="compareGridClass">
              <div v-for="(r, i) in results" :key="i">
                <template v-if="r?.analysis_result?.career_pathing?.role_prospects?.length">
                  <div class="space-y-2">
                    <div v-for="(role, j) in r.analysis_result.career_pathing.role_prospects" :key="j" class="border border-crt-border p-2">
                      <div class="text-xs text-phosphor font-bold">{{ role.role_title }}</div>
                      <div class="text-[11px] text-phosphor-faint mt-0.5">{{ role.match_reason }}</div>
                    </div>
                  </div>
                </template>
                <div v-else class="text-xs text-phosphor-faint">/// NO DATA</div>
              </div>
            </div>
          </div>
        </div>

        <!-- SECTION: STUDENT RECOMMENDATIONS -->
        <div class="border-2 border-crt-border p-4 mb-4">
          <div class="text-[11px] text-phosphor-dim mb-4 uppercase">[ STUDENT RECOMMENDATIONS ]</div>
          <div class="mb-4">
            <div class="text-[11px] text-phosphor-faint mb-2 uppercase">IMMEDIATE ACTIONS</div>
            <div class="grid gap-3" :class="compareGridClass">
              <div v-for="(r, i) in results" :key="i">
                <template v-if="r?.analysis_result?.student_recommendations?.immediate_actions?.length">
                  <div class="space-y-1.5">
                    <div v-for="(item, j) in r.analysis_result.student_recommendations.immediate_actions" :key="j" class="text-xs">
                      <div class="text-phosphor">>>> {{ item.action }}</div>
                      <div class="text-phosphor-faint ml-4">{{ item.description }}</div>
                    </div>
                  </div>
                </template>
                <div v-else class="text-xs text-phosphor-faint">/// NO DATA</div>
              </div>
            </div>
          </div>
          <div>
            <div class="text-[11px] text-phosphor-faint mb-2 uppercase">EXTRACURRICULAR CLUBS</div>
            <div class="grid gap-3" :class="compareGridClass">
              <div v-for="(r, i) in results" :key="i">
                <template v-if="r?.analysis_result?.student_recommendations?.extracurricular_clubs?.length">
                  <div class="space-y-1.5">
                    <div v-for="(club, j) in r.analysis_result.student_recommendations.extracurricular_clubs" :key="j" class="text-xs">
                      <div class="text-phosphor">/// {{ club.club_name }}</div>
                      <div class="text-phosphor-faint ml-4">{{ club.relevance }}</div>
                    </div>
                  </div>
                </template>
                <div v-else class="text-xs text-phosphor-faint">/// NO DATA</div>
              </div>
            </div>
          </div>
        </div>

        <!-- SECTION: PERSONAL GROWTH -->
        <div class="border-2 border-crt-border p-4 mb-4">
          <div class="text-[11px] text-phosphor-dim mb-4 uppercase">[ PERSONAL GROWTH ]</div>
          <div class="mb-4">
            <div class="text-[11px] text-phosphor-faint mb-2 uppercase">DEVELOPMENT AREAS</div>
            <div class="grid gap-3" :class="compareGridClass">
              <div v-for="(r, i) in results" :key="i">
                <template v-if="r?.analysis_result?.personal_growth?.development_areas?.length">
                  <div class="space-y-1.5">
                    <div v-for="(item, j) in r.analysis_result.personal_growth.development_areas" :key="j" class="text-xs">
                      <div class="text-phosphor">/// {{ item.area }}</div>
                      <div class="text-phosphor-faint ml-4">{{ item.action_plan }}</div>
                    </div>
                  </div>
                </template>
                <div v-else class="text-xs text-phosphor-faint">/// NO DATA</div>
              </div>
            </div>
          </div>
          <div>
            <div class="text-[11px] text-phosphor-faint mb-2 uppercase">BOOK RECOMMENDATIONS</div>
            <div class="grid gap-3" :class="compareGridClass">
              <div v-for="(r, i) in results" :key="i">
                <template v-if="r?.analysis_result?.personal_growth?.book_recommendations?.length">
                  <div class="space-y-1.5">
                    <div v-for="(book, j) in r.analysis_result.personal_growth.book_recommendations" :key="j" class="text-xs">
                      <div class="text-phosphor">/// {{ book.title }} — <span class="text-phosphor-faint">{{ book.author }}</span></div>
                      <div class="text-phosphor-faint ml-4">{{ book.relevance }}</div>
                    </div>
                  </div>
                </template>
                <div v-else class="text-xs text-phosphor-faint">/// NO DATA</div>
              </div>
            </div>
          </div>
        </div>

        <!-- SECTION: MODEL INFO -->
        <div class="border-2 border-crt-border p-4 mb-4">
          <div class="text-[11px] text-phosphor-dim mb-4 uppercase">[ MODEL INFO ]</div>
          <div class="grid gap-3" :class="compareGridClass">
            <div v-for="(r, i) in results" :key="i">
              <template v-if="r?.model_info">
                <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                  <dt class="text-phosphor-faint">MODEL</dt>
                  <dd>{{ r.model_info.model }}</dd>
                  <dt class="text-phosphor-faint">DURATION</dt>
                  <dd>{{ r.model_info.duration_ms < 1000 ? `${r.model_info.duration_ms}ms` : `${(r.model_info.duration_ms / 1000).toFixed(1)}s` }}</dd>
                  <dt class="text-phosphor-faint">TOKENS</dt>
                  <dd>{{ r.model_info.prompt_tokens + r.model_info.completion_tokens }}</dd>
                  <dt class="text-phosphor-faint">COST</dt>
                  <dd>${{ r.model_info.estimated_cost_usd.toFixed(4) }}</dd>
                </dl>
              </template>
              <div v-else class="text-xs text-phosphor-faint">/// NOT ANALYZED</div>
            </div>
          </div>
        </div>
      </template>
    </template>
  </div>
</template>
