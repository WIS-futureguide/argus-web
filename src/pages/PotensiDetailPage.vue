<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { potensiApi, potensiCopyWarnings, riasecOptions, oceanOptions, virtueOptions, type PotensiEntry } from '@/lib/api-potensi'
import { useAuthStore } from '@/stores/auth'
import { useCursorPagination } from '@/composables/useCursorPagination'
import { useToast } from '@/composables/useToast'
import type { ApiError } from '@/lib/api'
import Modal from '@/components/Modal.vue'

const route = useRoute()
const auth = useAuthStore()
const toast = useToast()
const client = useQueryClient()
const id = computed(() => String(route.params.id))
const { data: version, isLoading, error, refetch } = useQuery({
  queryKey: ['potensi-version', id],
  queryFn: () => potensiApi.detail(id.value),
})
const auditPage = useCursorPagination()
const { data: history, isLoading: auditLoading, isFetching: auditFetching, error: auditError, refetch: refetchAudit } = useQuery({
  queryKey: ['potensi-audit', id, auditPage.currentCursor],
  queryFn: () => potensiApi.audit(id.value, auditPage.currentCursor.value),
})
watch(history, value => auditPage.setNextCursor(value?.next_cursor))
const riasec = ref('')
const ocean = ref('')
const virtue = ref('')
const filtered = computed(() => (version.value?.entries ?? []).filter(entry => {
  const [r, o, v] = entry.cell_id.split('-')
  return (!riasec.value || r === riasec.value) && (!ocean.value || o === ocean.value) && (!virtue.value || v === virtue.value)
}))
const editable = computed(() => auth.isSuperadmin && version.value?.status === 'draft')
const edit = ref<PotensiEntry | null>(null)
const publishOpen = ref(false)
const confirmed = ref(false)
const saving = ref(false)
const actionError = ref('')
const warnings = computed(() => edit.value ? potensiCopyWarnings(edit.value) : [])
function openEdit(entry: PotensiEntry) {
  if (!editable.value || saving.value) return
  edit.value = { ...entry }
  actionError.value = ''
}
function openPublish() {
  if (!editable.value || saving.value) return
  confirmed.value = false
  actionError.value = ''
  publishOpen.value = true
}
function closeModals() {
  if (saving.value) return
  edit.value = null
  publishOpen.value = false
}
watch(id, () => {
  auditPage.reset()
  riasec.value = ocean.value = virtue.value = ''
  edit.value = null
  publishOpen.value = false
})
async function refresh(target: string) {
  await Promise.all([
    client.invalidateQueries({ queryKey: ['potensi-version', target] }),
    client.invalidateQueries({ queryKey: ['potensi-audit', target] }),
    client.invalidateQueries({ queryKey: ['potensi-versions'] }),
  ])
}
async function saveEntry() {
  if (!editable.value || !edit.value || saving.value) return
  const target = id.value
  saving.value = true
  actionError.value = ''
  try {
    await potensiApi.updateEntry(target, { ...edit.value })
    edit.value = null
    toast.success('Entri Potensi disimpan')
    await refresh(target)
  } catch (e) {
    actionError.value = (e as ApiError).message || 'Gagal menyimpan entri'
  } finally {
    saving.value = false
  }
}
async function publish() {
  if (!editable.value || !confirmed.value || saving.value) return
  const target = id.value
  saving.value = true
  actionError.value = ''
  try {
    await potensiApi.publish(target)
    publishOpen.value = false
    toast.success('Versi Potensi dipublikasikan')
    await refresh(target)
  } catch (e) {
    actionError.value = (e as ApiError).message || 'Gagal mempublikasikan versi'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div>
    <RouterLink :to="{ name: 'potensi' }" class="text-xs underline">Kembali ke katalog</RouterLink>
    <p v-if="isLoading" class="text-xs py-8">Memuat katalog...</p>
    <div v-else-if="error" role="alert" class="text-xs text-hazard">Gagal memuat katalog. <button @click="refetch()">Coba lagi</button></div>
    <div v-else-if="version">
      <h1 class="heading-macro text-xl text-phosphor mt-4">POTENSI · {{ version.label }}</h1>
      <p class="text-xs text-phosphor-dim my-3">{{ version.status }} · {{ version.entries.length }} entri</p>
      <button v-if="editable" :disabled="saving" class="border border-crt-border px-3 min-h-[36px] text-xs mb-4" @click="openPublish">Publikasikan versi</button>
      <p v-else class="text-xs text-phosphor-faint mb-4">Akses baca saja. Superadmin dapat mengubah entri pada draf baru.</p>
      <div class="flex flex-wrap gap-3 text-xs mb-4">
        <label>RIASEC <select v-model="riasec" aria-label="Filter RIASEC" class="border border-crt-border p-2"><option value="">Semua</option><option v-for="r in riasecOptions" :key="r">{{ r }}</option></select></label>
        <label>OCEAN <select v-model="ocean" aria-label="Filter OCEAN" class="border border-crt-border p-2"><option value="">Semua</option><option v-for="o in oceanOptions" :key="o">{{ o }}</option></select></label>
        <label>Virtue <select v-model="virtue" aria-label="Filter virtue" class="border border-crt-border p-2"><option value="">Semua</option><option v-for="v in virtueOptions" :key="v">{{ v }}</option></select></label>
      </div>
      <p class="text-xs mb-3">Menampilkan {{ filtered.length }} dari {{ version.entries.length }} entri.</p>
      <div class="overflow-x-auto border border-crt-border">
        <table class="w-full text-xs text-left">
          <caption class="sr-only">Entri katalog Potensi</caption>
          <thead><tr><th scope="col" class="p-3">Sel</th><th scope="col" class="p-3">Nama dan deskripsi</th><th scope="col" class="p-3">Contoh aktivitas / jurusan</th><th v-if="editable" scope="col" class="p-3">Aksi</th></tr></thead>
          <tbody><tr v-for="entry in filtered" :key="entry.cell_id" class="border-t border-crt-border align-top" data-testid="entry-row">
            <th scope="row" class="p-3 whitespace-nowrap">{{ entry.cell_id }}</th>
            <td class="p-3 min-w-48 break-words"><strong>{{ entry.name }}</strong><p class="mt-1">{{ entry.description }}</p></td>
            <td class="p-3 min-w-48 break-words"><p>{{ entry.example_activities }}</p><p class="text-phosphor-faint mt-1">{{ entry.example_majors }}</p></td>
            <td v-if="editable" class="p-3"><button :disabled="saving" :aria-label="`Edit ${entry.cell_id}`" class="underline min-h-[36px]" @click="openEdit(entry)">Edit</button></td>
          </tr></tbody>
        </table>
        <p v-if="!filtered.length" class="p-3 text-xs">Tidak ada entri sesuai filter.</p>
      </div>
      <section class="border border-crt-border p-3 mt-6 text-xs" aria-label="Riwayat audit">
        <h2 class="heading-macro mb-3">RIWAYAT AUDIT</h2>
        <p v-if="auditLoading">Memuat audit...</p>
        <p v-else-if="auditError" role="alert">Gagal memuat audit. <button @click="refetchAudit()">Coba lagi</button></p>
        <p v-else-if="!history?.audit.length">Belum ada audit untuk versi ini.</p>
        <ul v-else class="space-y-3"><li v-for="item in history.audit" :key="item.id" class="border-t border-crt-border pt-2 break-words">
          <p>{{ item.action }} · {{ item.created_at }}</p>
          <p>{{ item.admin_email }} · {{ item.ip_address }}</p>
          <pre class="whitespace-pre-wrap break-all mt-1">{{ JSON.stringify(item.details, null, 2) }}</pre>
        </li></ul>
        <div class="flex gap-3 mt-3"><button :disabled="!auditPage.hasPrev.value || auditFetching" @click="auditPage.goPrev">Audit sebelumnya</button><button :disabled="!auditPage.hasNext.value || auditFetching" @click="auditPage.goNext">Audit berikutnya</button></div>
      </section>
    </div>
    <Modal :open="!!edit" title="EDIT ENTRI POTENSI" @close="closeModals">
      <form v-if="edit" @submit.prevent="saveEntry" class="text-xs space-y-3">
        <p>{{ edit.cell_id }} · hanya entri draf</p>
        <label class="block">Nama <input v-model="edit.name" required maxlength="120" class="block w-full border border-crt-border p-2" /></label>
        <label class="block">Deskripsi <textarea v-model="edit.description" required maxlength="1000" class="block w-full border border-crt-border p-2" /></label>
        <label class="block">Contoh aktivitas <textarea v-model="edit.example_activities" required maxlength="1000" class="block w-full border border-crt-border p-2" /></label>
        <label class="block">Contoh jurusan <textarea v-model="edit.example_majors" required maxlength="500" class="block w-full border border-crt-border p-2" /></label>
        <p v-if="warnings.length" role="alert" class="text-hazard">Peringatan copy: {{ warnings.join(', ') }}. Gunakan bahasa kecenderungan Potensi; hindari klaim diagnosis dan pelabelan negatif.</p>
        <p v-if="actionError" role="alert" class="text-hazard">{{ actionError }}</p>
        <button type="submit" :disabled="saving || !editable" class="border border-crt-border px-3 min-h-[36px]">{{ saving ? 'Menyimpan...' : 'Simpan entri' }}</button>
      </form>
    </Modal>
    <Modal :open="publishOpen" title="KONFIRMASI PUBLIKASI" @close="closeModals">
      <form @submit.prevent="publish" class="text-xs space-y-3">
        <p>Publikasikan {{ version?.label }}? Versi aktif sebelumnya menjadi retired. Semua hasil lama, tautan share, dan PDF berikutnya memakai katalog ini. Versi terbit tidak dapat diedit.</p>
        <label class="flex gap-2"><input v-model="confirmed" type="checkbox" /> Saya sudah meninjau 180 entri dan memahami dampaknya.</label>
        <p v-if="actionError" role="alert" class="text-hazard">{{ actionError }}</p>
        <button type="submit" :disabled="saving || !confirmed || !editable" class="border border-hazard px-3 min-h-[36px]">{{ saving ? 'Mempublikasikan...' : 'Konfirmasi publikasi' }}</button>
      </form>
    </Modal>
  </div>
</template>
