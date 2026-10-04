<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { potensiApi } from '@/lib/api-potensi'
import { useAuthStore } from '@/stores/auth'
import { useCursorPagination } from '@/composables/useCursorPagination'
import { useToast } from '@/composables/useToast'
import type { ApiError } from '@/lib/api'
import Modal from '@/components/Modal.vue'
import SuperadminBadge from '@/components/SuperadminBadge.vue'

const auth = useAuthStore()
const router = useRouter()
const toast = useToast()
const client = useQueryClient()
const page = useCursorPagination()
const { data, isLoading, isFetching, error, refetch } = useQuery({
  queryKey: ['potensi-versions', page.currentCursor],
  queryFn: () => potensiApi.list(page.currentCursor.value),
})
watch(data, value => page.setNextCursor(value?.next_cursor))
const createOpen = ref(false)
const label = ref('')
const saving = ref(false)
const actionError = ref('')
function openCreate() {
  label.value = ''
  actionError.value = ''
  createOpen.value = true
}
async function createDraft() {
  if (!auth.isSuperadmin || saving.value || !label.value.trim()) return
  saving.value = true
  actionError.value = ''
  try {
    const draft = await potensiApi.createDraft(label.value.trim())
    await client.invalidateQueries({ queryKey: ['potensi-versions'] })
    createOpen.value = false
    toast.success('Draf Potensi dibuat')
    await router.push({ name: 'potensi-detail', params: { id: draft.id } })
  } catch (e) {
    actionError.value = (e as ApiError).message || 'Gagal membuat draf'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div>
    <div class="heading-macro text-xl text-phosphor mb-1">POTENSI</div>
    <p class="text-xs text-phosphor-dim mb-4">Katalog 180 kecenderungan. Versi aktif dipakai hasil lama, tautan share, dan PDF berikutnya.</p>
    <button v-if="auth.isSuperadmin" class="border border-crt-border px-3 min-h-[36px] text-xs mb-4" @click="openCreate">Buat draf <SuperadminBadge /></button>
    <p v-else class="text-xs text-phosphor-faint mb-4">Akses baca saja. Perubahan memerlukan superadmin.</p>
    <div v-if="isLoading" class="text-xs py-8">Memuat versi...</div>
    <div v-else-if="error" role="alert" class="text-xs text-hazard">Gagal memuat versi. <button @click="refetch()">Coba lagi</button></div>
    <p v-else-if="!data?.versions.length" class="text-xs">Belum ada versi katalog.</p>
    <ul v-else class="space-y-3">
      <li v-for="version in data.versions" :key="version.id" class="border-2 border-crt-border p-3">
        <RouterLink :to="{ name: 'potensi-detail', params: { id: version.id } }" class="text-phosphor text-sm underline">{{ version.label }}</RouterLink>
        <span class="ml-3 text-xs border border-crt-border px-2">{{ version.status }}</span>
        <div class="text-[11px] text-phosphor-faint mt-2">Dibuat {{ version.created_at.slice(0, 10) }} · Diubah {{ version.updated_at.slice(0, 10) }}</div>
      </li>
    </ul>
    <div class="flex gap-3 mt-4 text-xs">
      <button :disabled="!page.hasPrev.value || isFetching" @click="page.goPrev">Sebelumnya</button>
      <button :disabled="!page.hasNext.value || isFetching" @click="page.goNext">Berikutnya</button>
    </div>
    <Modal :open="createOpen" title="BUAT DRAF POTENSI" @close="!saving && (createOpen = false)">
      <form @submit.prevent="createDraft" class="space-y-3 text-xs">
        <p>Salin 180 entri dari versi aktif. Draf belum mengubah hasil pengguna.</p>
        <label class="block">Label versi <input v-model="label" required maxlength="80" class="block w-full border border-crt-border p-2 mt-1" /></label>
        <p v-if="actionError" role="alert" class="text-hazard">{{ actionError }}</p>
        <button type="submit" :disabled="saving || !label.trim()" class="border border-crt-border px-3 min-h-[36px]">{{ saving ? 'Menyimpan...' : 'Buat draf' }}</button>
      </form>
    </Modal>
  </div>
</template>
