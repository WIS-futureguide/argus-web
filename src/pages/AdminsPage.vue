<script setup lang="ts">
import { ref } from 'vue'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'
import { adminsApi, type AdminUser } from '@/lib/api-admins'
import Modal from '@/components/Modal.vue'
import type { ApiError } from '@/lib/api'

const auth = useAuthStore()
const router = useRouter()
const toast = useToast()
const queryClient = useQueryClient()

const { data, isLoading } = useQuery({
  queryKey: ['admins'],
  queryFn: () => adminsApi.list(),
})

const activeModal = ref<string | null>(null)
const actionLoading = ref(false)

// Create form
const createEmail = ref('')
const createName = ref('')
const createPassword = ref('')
const createRole = ref<'admin' | 'superadmin'>('admin')

// Edit form
const editId = ref('')
const editEmail = ref('')
const editName = ref('')
const editRole = ref<'admin' | 'superadmin'>('admin')

// Delete
const deleteTarget = ref<AdminUser | null>(null)

// Reset password
const resetId = ref('')
const resetPassword = ref('')

// Self-edit
const selfName = ref('')
const selfCurrentPassword = ref('')
const selfNewPassword = ref('')

function openSelfEdit() {
  const me = data.value?.admins.find(a => a.id === auth.adminId)
  selfName.value = me?.full_name || ''
  selfCurrentPassword.value = ''
  selfNewPassword.value = ''
  activeModal.value = 'self-edit'
}

async function handleSelfEdit() {
  actionLoading.value = true
  try {
    const me = data.value?.admins.find(a => a.id === auth.adminId)
    const body: { full_name?: string; current_password?: string; new_password?: string } = {}
    if (selfName.value && selfName.value !== me?.full_name) {
      body.full_name = selfName.value
    }
    if (selfCurrentPassword.value && selfNewPassword.value) {
      body.current_password = selfCurrentPassword.value
      body.new_password = selfNewPassword.value
    }
    if (!body.full_name && !body.current_password) {
      toast.error('No changes to save')
      actionLoading.value = false
      return
    }
    const res = await adminsApi.updateMe(body)
    if (body.new_password) {
      auth.logout()
      toast.success('Password diubah, silakan login lagi')
      closeModal()
      await router.push({ name: 'login' })
      return
    }
    toast.success(res.message)
    invalidate()
    closeModal()
  } catch (e) {
    toast.error((e as ApiError).message || 'Terjadi kesalahan')
  } finally {
    actionLoading.value = false
  }
}

function openCreate() {
  createEmail.value = ''
  createName.value = ''
  createPassword.value = ''
  createRole.value = 'admin'
  activeModal.value = 'create'
}

function openEdit(admin: AdminUser) {
  editId.value = admin.id
  editEmail.value = admin.email
  editName.value = admin.full_name
  editRole.value = admin.role
  activeModal.value = 'edit'
}

function openDelete(admin: AdminUser) {
  deleteTarget.value = admin
  activeModal.value = 'delete'
}

function openResetPassword(admin: AdminUser) {
  resetId.value = admin.id
  resetPassword.value = ''
  activeModal.value = 'reset-password'
}

function closeModal() {
  activeModal.value = null
  deleteTarget.value = null
}

function invalidate() {
  queryClient.invalidateQueries({ queryKey: ['admins'] })
}

async function handleCreate() {
  actionLoading.value = true
  try {
    const res = await adminsApi.create(createEmail.value, createName.value, createPassword.value, createRole.value)
    toast.success(res.message)
    invalidate()
    closeModal()
  } catch (e) {
    toast.error((e as ApiError).message || 'Terjadi kesalahan')
  } finally {
    actionLoading.value = false
  }
}

async function handleEdit() {
  actionLoading.value = true
  try {
    const res = await adminsApi.update(editId.value, {
      email: editEmail.value,
      full_name: editName.value,
      role: editRole.value,
    })
    toast.success(res.message)
    invalidate()
    closeModal()
  } catch (e) {
    toast.error((e as ApiError).message || 'Terjadi kesalahan')
  } finally {
    actionLoading.value = false
  }
}

async function handleDelete() {
  if (!deleteTarget.value) return
  actionLoading.value = true
  try {
    const res = await adminsApi.delete(deleteTarget.value.id)
    toast.success(res.message)
    invalidate()
    closeModal()
  } catch (e) {
    toast.error((e as ApiError).message || 'Terjadi kesalahan')
  } finally {
    actionLoading.value = false
  }
}

async function handleResetPassword() {
  actionLoading.value = true
  try {
    const res = await adminsApi.resetPassword(resetId.value, resetPassword.value)
    toast.success(res.message)
    invalidate()
    closeModal()
  } catch (e) {
    toast.error((e as ApiError).message || 'Terjadi kesalahan')
  } finally {
    actionLoading.value = false
  }
}
</script>

<template>
  <div>
    <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4 sm:mb-6">
      <div>
        <div class="heading-macro text-xl text-phosphor mb-1">ADMINS</div>
        <div class="text-[11px] text-phosphor-faint uppercase">/// ADMIN USER MANAGEMENT</div>
      </div>
      <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        <button
          class="border border-crt-border px-3 text-[11px] text-phosphor-dim hover:text-phosphor hover:border-phosphor-dim transition-colors min-h-[40px] w-full sm:w-auto"
          @click="openSelfEdit"
        >
          [ MY PROFILE ]
        </button>
        <button
          v-if="auth.isSuperadmin"
          class="border border-hazard px-3 text-[11px] text-hazard hover:bg-hazard hover:text-crt transition-colors min-h-[40px] w-full sm:w-auto"
          @click="openCreate"
        >
          [ NEW ADMIN ]
        </button>
      </div>
    </div>

    <div v-if="isLoading" class="text-phosphor-faint text-xs py-8 text-center">>>> LOADING ADMINS...</div>

    <div v-else-if="!data?.admins.length" class="border-2 border-crt-border p-6 text-center text-phosphor-faint text-xs">
      [ NO ADMIN USERS ]
    </div>

    <div v-else class="space-y-2">
      <div
        v-for="admin in data.admins"
        :key="admin.id"
        class="border-2 border-crt-border p-3 sm:p-4"
      >
        <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
          <div class="min-w-0">
            <div class="text-xs text-phosphor font-bold break-words">{{ admin.full_name }}</div>
            <div class="text-[11px] text-phosphor-faint mt-0.5 break-all">{{ admin.email }}</div>
          </div>
          <div class="flex items-center gap-2 flex-wrap shrink-0">
            <span
              class="border px-2 py-0.5 text-[11px] uppercase"
              :class="admin.role === 'superadmin' ? 'border-hazard text-hazard' : 'border-crt-border text-phosphor-dim'"
            >
              {{ admin.role.toUpperCase() }}
            </span>
            <span v-if="admin.must_change_password" class="border border-phosphor-faint px-2 py-0.5 text-[11px] text-phosphor-faint uppercase">
              MUST CHANGE PW
            </span>
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-phosphor-faint mt-2 uppercase">
          <span>CREATED: {{ admin.created_at.slice(0, 10) }}</span>
          <span>UPDATED: {{ admin.updated_at.slice(0, 10) }}</span>
        </div>
        <div v-if="auth.isSuperadmin" class="flex flex-wrap gap-2 mt-3">
          <button
            class="border border-crt-border px-3 text-[11px] text-phosphor-faint hover:text-phosphor hover:border-phosphor-dim transition-colors uppercase min-h-[36px]"
            @click="openEdit(admin)"
          >
            EDIT
          </button>
          <button
            class="border border-crt-border px-3 text-[11px] text-phosphor-faint hover:text-phosphor hover:border-phosphor-dim transition-colors uppercase min-h-[36px]"
            @click="openResetPassword(admin)"
          >
            RESET PW
          </button>
          <button
            class="border border-hazard px-3 text-[11px] text-hazard hover:bg-hazard hover:text-crt transition-colors uppercase min-h-[36px]"
            @click="openDelete(admin)"
          >
            DELETE
          </button>
        </div>
      </div>
    </div>

    <!-- CREATE MODAL -->
    <Modal :open="activeModal === 'create'" title="CREATE ADMIN" @close="closeModal">
      <div class="space-y-3">
        <div>
          <label class="block text-[11px] text-phosphor-faint mb-1 uppercase">EMAIL</label>
          <input v-model="createEmail" class="w-full bg-crt-surface border border-crt-border px-2 py-2 text-base sm:text-xs text-phosphor focus:outline-none focus:border-hazard min-h-[44px] sm:min-h-0" placeholder="admin@futureguide.id" />
        </div>
        <div>
          <label class="block text-[11px] text-phosphor-faint mb-1 uppercase">FULL NAME</label>
          <input v-model="createName" class="w-full bg-crt-surface border border-crt-border px-2 py-2 text-base sm:text-xs text-phosphor focus:outline-none focus:border-hazard min-h-[44px] sm:min-h-0" />
        </div>
        <div>
          <label class="block text-[11px] text-phosphor-faint mb-1 uppercase">PASSWORD</label>
          <input v-model="createPassword" type="password" class="w-full bg-crt-surface border border-crt-border px-2 py-2 text-base sm:text-xs text-phosphor focus:outline-none focus:border-hazard min-h-[44px] sm:min-h-0" placeholder="Min 8 chars, upper+lower+digit+special" />
        </div>
        <div>
          <label class="block text-[11px] text-phosphor-faint mb-1 uppercase">ROLE</label>
          <select v-model="createRole" class="w-full bg-crt-surface border border-crt-border px-2 py-2 text-base sm:text-xs text-phosphor focus:outline-none focus:border-hazard min-h-[44px] sm:min-h-0">
            <option value="admin">ADMIN</option>
            <option value="superadmin">SUPERADMIN</option>
          </select>
        </div>
        <div class="flex flex-col sm:flex-row gap-2">
          <button
            class="border border-crt-border px-3 text-[11px] text-phosphor-dim hover:text-phosphor hover:border-phosphor-dim transition-colors min-h-[40px] w-full sm:w-auto"
            :disabled="actionLoading || !createEmail || !createName || !createPassword"
            @click="handleCreate"
          >
            [ CREATE ]
          </button>
          <button class="border border-crt-border px-3 text-[11px] text-phosphor-dim min-h-[40px] w-full sm:w-auto" @click="closeModal">[ CANCEL ]</button>
        </div>
      </div>
    </Modal>

    <!-- EDIT MODAL -->
    <Modal :open="activeModal === 'edit'" title="EDIT ADMIN" @close="closeModal">
      <div class="space-y-3">
        <div>
          <label class="block text-[11px] text-phosphor-faint mb-1 uppercase">EMAIL</label>
          <input v-model="editEmail" class="w-full bg-crt-surface border border-crt-border px-2 py-2 text-base sm:text-xs text-phosphor focus:outline-none focus:border-hazard min-h-[44px] sm:min-h-0" />
        </div>
        <div>
          <label class="block text-[11px] text-phosphor-faint mb-1 uppercase">FULL NAME</label>
          <input v-model="editName" class="w-full bg-crt-surface border border-crt-border px-2 py-2 text-base sm:text-xs text-phosphor focus:outline-none focus:border-hazard min-h-[44px] sm:min-h-0" />
        </div>
        <div>
          <label class="block text-[11px] text-phosphor-faint mb-1 uppercase">ROLE</label>
          <select v-model="editRole" class="w-full bg-crt-surface border border-crt-border px-2 py-2 text-base sm:text-xs text-phosphor focus:outline-none focus:border-hazard min-h-[44px] sm:min-h-0">
            <option value="admin">ADMIN</option>
            <option value="superadmin">SUPERADMIN</option>
          </select>
        </div>
        <div class="flex flex-col sm:flex-row gap-2">
          <button
            class="border border-crt-border px-3 text-[11px] text-phosphor-dim hover:text-phosphor hover:border-phosphor-dim transition-colors min-h-[40px] w-full sm:w-auto"
            :disabled="actionLoading"
            @click="handleEdit"
          >
            [ SAVE ]
          </button>
          <button class="border border-crt-border px-3 text-[11px] text-phosphor-dim min-h-[40px] w-full sm:w-auto" @click="closeModal">[ CANCEL ]</button>
        </div>
      </div>
    </Modal>

    <!-- DELETE MODAL -->
    <Modal :open="activeModal === 'delete'" title="DELETE ADMIN" @close="closeModal">
      <p class="text-xs text-hazard mb-4 break-words">Delete admin {{ deleteTarget?.full_name }} ({{ deleteTarget?.email }})? This cannot be undone.</p>
      <div class="flex flex-col sm:flex-row gap-2">
        <button
          class="border border-hazard px-3 text-[11px] text-hazard hover:bg-hazard hover:text-crt transition-colors min-h-[40px] w-full sm:w-auto"
          :disabled="actionLoading"
          @click="handleDelete"
        >
          [ DELETE ]
        </button>
        <button class="border border-crt-border px-3 text-[11px] text-phosphor-dim min-h-[40px] w-full sm:w-auto" @click="closeModal">[ CANCEL ]</button>
      </div>
    </Modal>

    <!-- RESET PASSWORD MODAL -->
    <Modal :open="activeModal === 'reset-password'" title="RESET ADMIN PASSWORD" @close="closeModal">
      <div class="space-y-3">
        <div>
          <label class="block text-[11px] text-phosphor-faint mb-1 uppercase">NEW PASSWORD</label>
          <input v-model="resetPassword" type="password" class="w-full bg-crt-surface border border-crt-border px-2 py-2 text-base sm:text-xs text-phosphor focus:outline-none focus:border-hazard min-h-[44px] sm:min-h-0" placeholder="Min 8 chars, upper+lower+digit+special" />
        </div>
        <div class="text-[11px] text-phosphor-faint">/// Admin will be required to change password on next login</div>
        <div class="flex flex-col sm:flex-row gap-2">
          <button
            class="border border-crt-border px-3 text-[11px] text-phosphor-dim hover:text-phosphor hover:border-phosphor-dim transition-colors min-h-[40px] w-full sm:w-auto"
            :disabled="actionLoading || !resetPassword"
            @click="handleResetPassword"
          >
            [ RESET ]
          </button>
          <button class="border border-crt-border px-3 text-[11px] text-phosphor-dim min-h-[40px] w-full sm:w-auto" @click="closeModal">[ CANCEL ]</button>
        </div>
      </div>
    </Modal>

    <!-- SELF-EDIT MODAL -->
    <Modal :open="activeModal === 'self-edit'" title="MY PROFILE" @close="closeModal">
      <div class="space-y-3">
        <div>
          <label class="block text-[11px] text-phosphor-faint mb-1 uppercase">FULL NAME</label>
          <input v-model="selfName" class="w-full bg-crt-surface border border-crt-border px-2 py-2 text-base sm:text-xs text-phosphor focus:outline-none focus:border-hazard min-h-[44px] sm:min-h-0" />
        </div>
        <div class="border-t border-crt-border pt-3">
          <div class="text-[11px] text-phosphor-faint mb-2 uppercase">/// CHANGE PASSWORD (optional)</div>
          <div class="space-y-2">
            <div>
              <label class="block text-[11px] text-phosphor-faint mb-1 uppercase">CURRENT PASSWORD</label>
              <input v-model="selfCurrentPassword" type="password" class="w-full bg-crt-surface border border-crt-border px-2 py-2 text-base sm:text-xs text-phosphor focus:outline-none focus:border-hazard min-h-[44px] sm:min-h-0" />
            </div>
            <div>
              <label class="block text-[11px] text-phosphor-faint mb-1 uppercase">NEW PASSWORD</label>
              <input v-model="selfNewPassword" type="password" class="w-full bg-crt-surface border border-crt-border px-2 py-2 text-base sm:text-xs text-phosphor focus:outline-none focus:border-hazard min-h-[44px] sm:min-h-0" placeholder="Min 8 chars, upper+lower+digit+special" />
            </div>
          </div>
        </div>
        <div class="flex flex-col sm:flex-row gap-2">
          <button
            class="border border-crt-border px-3 text-[11px] text-phosphor-dim hover:text-phosphor hover:border-phosphor-dim transition-colors min-h-[40px] w-full sm:w-auto"
            :disabled="actionLoading"
            @click="handleSelfEdit"
          >
            [ SAVE ]
          </button>
          <button class="border border-crt-border px-3 text-[11px] text-phosphor-dim min-h-[40px] w-full sm:w-auto" @click="closeModal">[ CANCEL ]</button>
        </div>
      </div>
    </Modal>
  </div>
</template>
