<script setup lang="ts">
import { useRoute, RouterLink } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

defineProps<{ open?: boolean }>()
const emit = defineEmits<{ close: [] }>()

const route = useRoute()
const auth = useAuthStore()

const sections = [
  {
    label: 'OPERATIONS',
    items: [
      { name: 'overview', label: 'Overview', path: '/app/overview' },
      { name: 'monitoring', label: 'Monitoring', path: '/app/monitoring' },
    ],
  },
  {
    label: 'DATA',
    items: [
      { name: 'users', label: 'Users', path: '/app/users' },
      { name: 'assessments', label: 'Assessments', path: '/app/assessments' },
    ],
  },
  {
    label: 'AI ENGINE',
    items: [
      { name: 'prompts', label: 'Prompts', path: '/app/prompts' },
    ],
  },
  {
    label: 'SYSTEM',
    items: [
      { name: 'config', label: 'Config', path: '/app/config' },
      { name: 'ledger', label: 'Ledger', path: '/app/ledger' },
      { name: 'admins', label: 'Admins', path: '/app/admins' },
    ],
  },
]

function isActive(path: string): boolean {
  return route.path.startsWith(path)
}
</script>

<template>
  <aside
    class="sidebar w-64 sm:w-56 shrink-0 flex flex-col h-screen fixed lg:sticky inset-y-0 left-0 top-0 z-40 transition-transform lg:translate-x-0"
    :class="[
      auth.isSuperadmin ? 'sidebar--super' : 'sidebar--admin',
      open ? 'translate-x-0' : '-translate-x-full',
    ]"
    aria-label="Primary navigation"
  >
    <div class="sidebar-header px-4 py-5 flex items-start justify-between gap-2">
      <div class="flex items-center gap-2.5">
        <img src="/logo-fg.png" alt="FutureGuide" class="w-8 h-8 bg-white p-0.5" />
        <div>
          <div class="heading-macro text-lg tracking-tight sidebar-title">FutureGuide</div>
          <div class="text-[11px] mt-1 tracking-wider sidebar-subtitle">ADMIN TERMINAL</div>
        </div>
      </div>
      <button
        type="button"
        class="lg:hidden text-[14px] sidebar-subtitle hover:sidebar-title transition-colors min-w-[36px] min-h-[36px] inline-flex items-center justify-center"
        aria-label="Close navigation"
        @click="emit('close')"
      >
        [ X ]
      </button>
    </div>

    <nav class="flex-1 overflow-y-auto py-4">
      <div v-for="section in sections" :key="section.label" class="mb-5">
        <div class="px-4 mb-2 text-[11px] font-semibold tracking-widest uppercase sidebar-label">
          {{ section.label }}
        </div>
        <RouterLink
          v-for="item in section.items"
          :key="item.name"
          :to="item.path"
          class="nav-item block px-4 py-2.5 text-[14px] transition-colors border-l-2 min-h-[44px] flex items-center"
          :class="isActive(item.path) ? 'nav-item--active' : 'nav-item--default'"
        >
          {{ item.label }}
        </RouterLink>
      </div>
    </nav>

    <div class="sidebar-footer px-4 py-3 text-[12px]">
      <div class="font-mono truncate sidebar-email" :title="auth.email ?? ''">{{ auth.email }}</div>
      <div class="mt-1 flex items-center gap-1.5 flex-wrap">
        <span
          class="role-pill text-[10px] font-semibold tracking-widest uppercase"
          :class="auth.isSuperadmin ? 'role-pill--super' : 'role-pill--admin'"
        >
          {{ auth.role }}
        </span>
        <span v-if="auth.isSuperadmin" class="text-[10px] sidebar-label tracking-widest">FULL ACCESS</span>
        <span v-else class="text-[10px] sidebar-label tracking-widest">READ + LIMITED</span>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  border-right: 1px solid;
}

/* SUPERADMIN — vibrant green, full presence */
.sidebar--super {
  background-color: #1c352d;
  border-right-color: #142a22;
}
.sidebar--super .sidebar-header,
.sidebar--super .sidebar-footer {
  border-color: #2a4a3a;
}
.sidebar--super .sidebar-title    { color: #e8f5ee; }
.sidebar--super .sidebar-subtitle { color: #6aab85; }
.sidebar--super .sidebar-label    { color: #4d8a65; }
.sidebar--super .sidebar-email    { color: #a8d4b8; }

.sidebar--super .nav-item--default {
  color: #a8d4b8;
  border-color: transparent;
}
.sidebar--super .nav-item--default:hover {
  color: #e8f5ee;
  background-color: #243d31;
}
.sidebar--super .nav-item--active {
  color: #e8f5ee;
  background-color: #2a4a3a;
  border-color: #6aab85;
  font-weight: 500;
}
.sidebar--super .nav-item--active:hover {
  background-color: #2f5240;
}

/* ADMIN — desaturated slate, faded presence */
.sidebar--admin {
  background-color: #232628;
  border-right-color: #181a1c;
}
.sidebar--admin .sidebar-header,
.sidebar--admin .sidebar-footer {
  border-color: #303336;
}
.sidebar--admin .sidebar-title    { color: #d0d3d6; }
.sidebar--admin .sidebar-subtitle { color: #6e7378; }
.sidebar--admin .sidebar-label    { color: #565a5e; }
.sidebar--admin .sidebar-email    { color: #989ca0; }

.sidebar--admin .nav-item--default {
  color: #989ca0;
  border-color: transparent;
}
.sidebar--admin .nav-item--default:hover {
  color: #d0d3d6;
  background-color: #2c2f32;
}
.sidebar--admin .nav-item--active {
  color: #d0d3d6;
  background-color: #303336;
  border-color: #6e7378;
  font-weight: 500;
}
.sidebar--admin .nav-item--active:hover {
  background-color: #353a3d;
}

.sidebar-header {
  border-bottom-style: solid;
  border-bottom-width: 1px;
}

.sidebar-footer {
  border-top-style: solid;
  border-top-width: 1px;
}

.nav-item {
  border-left-style: solid;
}

.role-pill {
  display: inline-flex;
  align-items: center;
  padding: 1px 5px;
  border: 1px solid;
  font-family: var(--font-mono);
  letter-spacing: 0.12em;
}

.role-pill--super {
  color: #FFE6E6;
  background-color: #5b1818;
  border-color: #c43838;
}

.role-pill--admin {
  color: #b0b4b8;
  background-color: transparent;
  border-color: #565a5e;
}
</style>
