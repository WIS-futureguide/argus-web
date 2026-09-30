<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { api, type ApiError } from '@/lib/api'
import { useToast } from '@/composables/useToast'

const router = useRouter()
const auth = useAuthStore()
const toast = useToast()

const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const error = ref('')
const loading = ref(false)

async function handleSubmit() {
  error.value = ''

  if (newPassword.value !== confirmPassword.value) {
    error.value = 'Password baru tidak cocok'
    return
  }

  loading.value = true

  try {
    await api.put<{ message: string }>('/admin/admins/me', {
      current_password: currentPassword.value,
      new_password: newPassword.value,
    })
    auth.logout()
    toast.success('Password diubah, silakan login lagi')
    await router.push({ name: 'login' })
  } catch (e) {
    error.value = (e as ApiError).message || 'Gagal mengubah password'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="w-full max-w-sm mx-auto border-2 border-crt-border bg-crt p-6 sm:p-8">
    <div class="heading-macro text-2xl text-hazard mb-1">CHANGE PASSWORD</div>
    <div class="text-[11px] text-phosphor-faint mb-6 sm:mb-8 uppercase">/// MANDATORY PASSWORD RESET REQUIRED</div>

    <form @submit.prevent="handleSubmit" class="space-y-5">
      <div>
        <label class="block text-[11px] text-phosphor-dim mb-1.5 uppercase">CURRENT PASSWORD</label>
        <input
          v-model="currentPassword"
          type="password"
          required
          autocomplete="current-password"
          class="w-full bg-crt-surface border border-crt-border px-3 py-2.5 text-base sm:text-xs text-phosphor focus:outline-none focus:border-hazard min-h-[44px]"
        />
      </div>

      <div>
        <label class="block text-[11px] text-phosphor-dim mb-1.5 uppercase">NEW PASSWORD</label>
        <input
          v-model="newPassword"
          type="password"
          required
          autocomplete="new-password"
          class="w-full bg-crt-surface border border-crt-border px-3 py-2.5 text-base sm:text-xs text-phosphor focus:outline-none focus:border-hazard min-h-[44px]"
        />
      </div>

      <div>
        <label class="block text-[11px] text-phosphor-dim mb-1.5 uppercase">CONFIRM NEW PASSWORD</label>
        <input
          v-model="confirmPassword"
          type="password"
          required
          autocomplete="new-password"
          class="w-full bg-crt-surface border border-crt-border px-3 py-2.5 text-base sm:text-xs text-phosphor focus:outline-none focus:border-hazard min-h-[44px]"
        />
      </div>

      <div class="text-[11px] text-phosphor-faint uppercase">
        8-72 CHARS / UPPER + LOWER + DIGIT + SPECIAL
      </div>

      <div v-if="error" class="border border-hazard px-3 py-2 text-[11px] text-hazard">
        [ ERR ] {{ error }}
      </div>

      <button
        type="submit"
        :disabled="loading"
        class="w-full border-2 border-hazard bg-crt px-4 py-2.5 text-xs text-hazard hover:bg-hazard hover:text-crt transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
      >
        {{ loading ? '>>> PROCESSING...' : '[ UPDATE PASSWORD ]' }}
      </button>
    </form>
  </div>
</template>
