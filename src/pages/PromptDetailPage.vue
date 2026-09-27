<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'
import { promptsApi } from '@/lib/api-prompts'
import Modal from '@/components/Modal.vue'
import SuperadminBadge from '@/components/SuperadminBadge.vue'
import type { ApiError } from '@/lib/api'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const toast = useToast()
const queryClient = useQueryClient()

const promptId = computed(() => route.params.id as string)

const { data: prompt, isLoading } = useQuery({
  queryKey: ['prompt', promptId],
  queryFn: () => promptsApi.detail(promptId.value),
})

const { data: versionsData } = useQuery({
  queryKey: ['prompt-versions', promptId],
  queryFn: () => promptsApi.versions(promptId.value, 20),
})

const activeModal = ref<string | null>(null)
const actionLoading = ref(false)

// Edit form
const editContent = ref('')
const editVariables = ref('')
const editReason = ref('')

// Revert form
const revertVersion = ref<number>(1)
const revertReason = ref('')

function openModal(name: string) {
  if (name === 'edit' && prompt.value) {
    editContent.value = prompt.value.content
    editVariables.value = prompt.value.variables.join(', ')
    editReason.value = ''
  }
  activeModal.value = name
}

function closeModal() {
  activeModal.value = null
}

function invalidateAll() {
  queryClient.invalidateQueries({ queryKey: ['prompt', promptId.value] })
  queryClient.invalidateQueries({ queryKey: ['prompt-versions', promptId.value] })
}

async function handleUpdate() {
  actionLoading.value = true
  try {
    const vars = editVariables.value.split(',').map(v => v.trim()).filter(Boolean)
    const res = await promptsApi.update(promptId.value, editContent.value, vars, editReason.value)
    toast.success(res.message)
    if (res.cache_warning) toast.success(res.cache_warning)
    if (res.variable_warnings?.length) {
      res.variable_warnings.forEach(w => toast.error(w))
    }
    invalidateAll()
    closeModal()
  } catch (e) {
    toast.error((e as ApiError).message || 'Terjadi kesalahan')
  } finally {
    actionLoading.value = false
  }
}

async function handleRevert() {
  actionLoading.value = true
  try {
    const res = await promptsApi.revert(promptId.value, revertVersion.value, revertReason.value)
    toast.success(res.message)
    if (res.cache_warning) toast.success(res.cache_warning)
    invalidateAll()
    closeModal()
  } catch (e) {
    toast.error((e as ApiError).message || 'Terjadi kesalahan')
  } finally {
    actionLoading.value = false
  }
}

async function handleToggle() {
  if (!prompt.value) return
  actionLoading.value = true
  try {
    const res = await promptsApi.toggle(promptId.value, !prompt.value.is_active)
    toast.success(res.message)
    invalidateAll()
    closeModal()
  } catch (e) {
    toast.error((e as ApiError).message || 'Terjadi kesalahan')
  } finally {
    actionLoading.value = false
  }
}
</script>

<template>
  <div v-if="isLoading" class="text-phosphor-faint text-xs py-8 text-center">>>> LOADING TEMPLATE...</div>

  <div v-else-if="!prompt" class="text-hazard text-xs py-8 text-center">[ TEMPLATE NOT FOUND ]</div>

  <div v-else>
    <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
      <div class="min-w-0">
        <button class="text-[11px] text-phosphor-dim hover:text-phosphor mb-2 uppercase min-h-[32px] inline-flex items-center" @click="router.push({ name: 'prompts' })">
          &lt;&lt;&lt; BACK TO PROMPTS
        </button>
        <div class="heading-macro text-xl text-phosphor break-words">{{ prompt.name }}</div>
        <div class="text-[11px] text-phosphor-faint mt-1 break-all">/// {{ prompt.template_key }}</div>
      </div>
      <div class="flex items-center gap-2 flex-wrap">
        <span
          class="border px-2 py-0.5 text-[11px] uppercase"
          :class="prompt.is_active ? 'border-phosphor-dim text-phosphor-dim' : 'border-hazard text-hazard'"
        >
          {{ prompt.is_active ? 'ACTIVE' : 'INACTIVE' }}
        </span>
        <span class="border border-crt-border px-2 py-0.5 text-[11px] text-phosphor-faint">v{{ prompt.version }}</span>
      </div>
    </div>

    <!-- ACTIONS (superadmin) -->
    <div v-if="auth.isSuperadmin" class="border-2 border-crt-border p-3 sm:p-4 mb-4">
      <div class="text-[11px] text-phosphor-dim mb-3 uppercase flex items-center">
        [ ACTIONS ]
        <SuperadminBadge />
      </div>
      <div class="flex flex-wrap gap-2">
        <button
          class="border border-crt-border px-3 text-[11px] text-phosphor-dim hover:text-phosphor hover:border-phosphor-dim transition-colors min-h-[36px]"
          @click="openModal('edit')"
        >
          EDIT CONTENT
        </button>
        <button
          class="border border-crt-border px-3 text-[11px] text-phosphor-dim hover:text-phosphor hover:border-phosphor-dim transition-colors min-h-[36px]"
          @click="openModal('revert')"
        >
          REVERT VERSION
        </button>
        <button
          class="border px-3 text-[11px] transition-colors min-h-[36px]"
          :class="prompt.is_active ? 'border-hazard text-hazard hover:bg-hazard hover:text-crt' : 'border-crt-border text-phosphor-dim hover:text-phosphor hover:border-phosphor-dim'"
          @click="openModal('toggle')"
        >
          {{ prompt.is_active ? 'DEACTIVATE' : 'ACTIVATE' }}
        </button>
      </div>
    </div>

    <!-- META -->
    <div class="border-2 border-crt-border p-3 sm:p-4 mb-4">
      <div class="text-[11px] text-phosphor-dim mb-3 uppercase">[ METADATA ]</div>
      <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
        <dt class="text-phosphor-faint">DESCRIPTION</dt>
        <dd class="break-words">{{ prompt.description }}</dd>
        <dt class="text-phosphor-faint">CACHE TYPE</dt>
        <dd>{{ prompt.cache_type.toUpperCase() }}</dd>
        <dt class="text-phosphor-faint">VARIABLES</dt>
        <dd class="break-all">{{ prompt.variables.length ? prompt.variables.join(', ') : '\u2014' }}</dd>
        <dt class="text-phosphor-faint">UPDATED BY</dt>
        <dd class="break-all">{{ prompt.updated_by || '\u2014' }}</dd>
        <dt class="text-phosphor-faint">CREATED</dt>
        <dd>{{ prompt.created_at.slice(0, 16).replace('T', ' ') }}</dd>
        <dt class="text-phosphor-faint">UPDATED</dt>
        <dd>{{ prompt.updated_at.slice(0, 16).replace('T', ' ') }}</dd>
      </dl>
    </div>

    <!-- CONTENT -->
    <div class="border-2 border-crt-border p-3 sm:p-4 mb-4">
      <div class="text-[11px] text-phosphor-dim mb-3 uppercase">[ CONTENT ]</div>
      <pre class="text-xs text-phosphor whitespace-pre-wrap leading-relaxed bg-crt-surface p-3 border border-crt-border overflow-x-auto max-h-96 break-words">{{ prompt.content }}</pre>
    </div>

    <!-- VERSION HISTORY -->
    <div class="border-2 border-crt-border p-3 sm:p-4">
      <div class="text-[11px] text-phosphor-dim mb-3 uppercase">[ VERSION HISTORY ]</div>
      <div v-if="!versionsData?.versions.length" class="text-xs text-phosphor-faint text-center py-2">
        [ NO VERSION HISTORY ]
      </div>
      <div v-else class="space-y-2">
        <div
          v-for="v in versionsData.versions"
          :key="v.id"
          class="border border-crt-border p-3"
        >
          <div class="flex flex-wrap items-center justify-between gap-2 mb-1">
            <span class="text-xs text-phosphor">v{{ v.version }}</span>
            <span class="text-[11px] text-phosphor-faint">{{ v.created_at.slice(0, 16).replace('T', ' ') }}</span>
          </div>
          <div class="text-xs text-phosphor-dim break-words">{{ v.change_reason }}</div>
          <div class="text-[11px] text-phosphor-faint mt-1 break-all">
            BY: {{ v.changed_by || '\u2014' }} / VARS: {{ v.variables.join(', ') || '\u2014' }}
          </div>
        </div>
      </div>
    </div>

    <!-- EDIT MODAL -->
    <Modal :open="activeModal === 'edit'" title="EDIT TEMPLATE" @close="closeModal">
      <div class="space-y-3">
        <div>
          <label class="block text-[11px] text-phosphor-faint mb-1 uppercase">CONTENT</label>
          <textarea
            v-model="editContent"
            rows="12"
            class="w-full bg-crt-surface border border-crt-border px-2 py-2 text-base sm:text-xs text-phosphor focus:outline-none focus:border-hazard resize-y"
          ></textarea>
        </div>
        <div>
          <label class="block text-[11px] text-phosphor-faint mb-1 uppercase">VARIABLES (comma-separated)</label>
          <input
            v-model="editVariables"
            class="w-full bg-crt-surface border border-crt-border px-2 py-2 text-base sm:text-xs text-phosphor focus:outline-none focus:border-hazard min-h-[44px] sm:min-h-0"
            placeholder="scores, references"
          />
        </div>
        <div>
          <label class="block text-[11px] text-phosphor-faint mb-1 uppercase">CHANGE REASON</label>
          <input
            v-model="editReason"
            class="w-full bg-crt-surface border border-crt-border px-2 py-2 text-base sm:text-xs text-phosphor focus:outline-none focus:border-hazard min-h-[44px] sm:min-h-0"
            placeholder="Reason for this change..."
          />
        </div>
        <div class="flex flex-col sm:flex-row gap-2">
          <button
            class="border border-hazard px-3 text-[11px] text-hazard hover:bg-hazard hover:text-crt transition-colors min-h-[40px] w-full sm:w-auto"
            :disabled="actionLoading || !editContent || !editReason"
            @click="handleUpdate"
          >
            [ SAVE ]
          </button>
          <button class="border border-crt-border px-3 text-[11px] text-phosphor-dim min-h-[40px] w-full sm:w-auto" @click="closeModal">
            [ CANCEL ]
          </button>
        </div>
      </div>
    </Modal>

    <!-- REVERT MODAL -->
    <Modal :open="activeModal === 'revert'" title="REVERT TO VERSION" @close="closeModal">
      <div class="space-y-3">
        <div>
          <label class="block text-[11px] text-phosphor-faint mb-1 uppercase">TARGET VERSION</label>
          <input
            v-model.number="revertVersion"
            type="number"
            min="1"
            class="w-full bg-crt-surface border border-crt-border px-2 py-2 text-base sm:text-xs text-phosphor focus:outline-none focus:border-hazard min-h-[44px] sm:min-h-0"
          />
        </div>
        <div>
          <label class="block text-[11px] text-phosphor-faint mb-1 uppercase">REASON</label>
          <input
            v-model="revertReason"
            class="w-full bg-crt-surface border border-crt-border px-2 py-2 text-base sm:text-xs text-phosphor focus:outline-none focus:border-hazard min-h-[44px] sm:min-h-0"
            placeholder="Reason for reverting..."
          />
        </div>
        <div class="flex flex-col sm:flex-row gap-2">
          <button
            class="border border-hazard px-3 text-[11px] text-hazard hover:bg-hazard hover:text-crt transition-colors min-h-[40px] w-full sm:w-auto"
            :disabled="actionLoading || !revertVersion || !revertReason"
            @click="handleRevert"
          >
            [ REVERT ]
          </button>
          <button class="border border-crt-border px-3 text-[11px] text-phosphor-dim min-h-[40px] w-full sm:w-auto" @click="closeModal">
            [ CANCEL ]
          </button>
        </div>
      </div>
    </Modal>

    <!-- TOGGLE MODAL -->
    <Modal :open="activeModal === 'toggle'" :title="prompt.is_active ? 'DEACTIVATE TEMPLATE' : 'ACTIVATE TEMPLATE'" @close="closeModal">
      <p class="text-xs text-phosphor mb-4">
        {{ prompt.is_active ? 'Deactivate this template? Worker will fall back to hardcoded prompts.' : 'Activate this template?' }}
      </p>
      <div class="flex flex-col sm:flex-row gap-2">
        <button
          class="border border-hazard px-3 text-[11px] text-hazard hover:bg-hazard hover:text-crt transition-colors min-h-[40px] w-full sm:w-auto"
          :disabled="actionLoading"
          @click="handleToggle"
        >
          [ CONFIRM ]
        </button>
        <button class="border border-crt-border px-3 text-[11px] text-phosphor-dim min-h-[40px] w-full sm:w-auto" @click="closeModal">
          [ CANCEL ]
        </button>
      </div>
    </Modal>

  </div>
</template>
