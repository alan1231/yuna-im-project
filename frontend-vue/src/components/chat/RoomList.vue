<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  rooms: {
    type: Array,
    required: true,
  },
  availableUsers: {
    type: Array,
    required: true,
  },
  activeRoomId: {
    type: String,
    required: true,
  },
  error: {
    type: String,
    default: '',
  },
  currentUser: {
    type: Object,
    required: true,
  },
})

const emit = defineEmits(['select', 'start-chat', 'add-friend', 'refresh-friends', 'logout'])
const friendName = ref('')
const searchText = ref('')
const contactSearchText = ref('')
const isMenuOpen = ref(false)
const isAddFriendModalOpen = ref(false)
const drawerView = ref('menu')

const normalizedSearch = computed(() => searchText.value.trim().toLowerCase())
const normalizedContactSearch = computed(() => contactSearchText.value.trim().toLowerCase())

const visibleRooms = computed(() => {
  if (!normalizedSearch.value) return props.rooms

  return props.rooms.filter((room) => {
    return `${room.name} ${room.description}`.toLowerCase().includes(normalizedSearch.value)
  })
})

const visibleUsers = computed(() => {
  if (!normalizedSearch.value) return []

  const roomRecipientIds = new Set(props.rooms.map((room) => room.recipientId))
  const candidates = props.availableUsers.filter((user) => !roomRecipientIds.has(user.user_id))

  return candidates.filter((user) => {
    return user.display_name.toLowerCase().includes(normalizedSearch.value)
  })
})

const hasVisibleTargets = computed(() => {
  return visibleRooms.value.length > 0 || visibleUsers.value.length > 0
})

const friendRooms = computed(() => {
  return props.rooms.filter((room) => room.id !== 'stock_bot' && room.isFriend)
})

const visibleFriendRooms = computed(() => {
  if (!normalizedContactSearch.value) return friendRooms.value

  return friendRooms.value.filter((room) => {
    return room.name.toLowerCase().includes(normalizedContactSearch.value)
  })
})

const formatPresence = (room) => {
  if (room.online) return '在線'
  if (!room.lastSeen) return '最近上線時間未知'

  const lastSeen = new Date(room.lastSeen)
  if (Number.isNaN(lastSeen.getTime())) return '最近上線時間未知'
  if (lastSeen.getFullYear() < 2000) return '最近上線時間未知'

  const diffMinutes = Math.max(0, Math.floor((Date.now() - lastSeen.getTime()) / 60000))
  if (diffMinutes < 1) return '上線於不久前'
  if (diffMinutes < 60) return `最近上線於 ${diffMinutes} 分鐘前`

  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `最近上線於 ${diffHours} 小時前`

  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `最近上線於 ${diffDays} 天前`

  return `最近上線於 ${lastSeen.toLocaleDateString('zh-TW', {
    month: 'long',
    day: 'numeric',
  })}`
}

const openDrawer = () => {
  drawerView.value = 'menu'
  isMenuOpen.value = true
}

const closeDrawer = () => {
  isMenuOpen.value = false
}

const openContacts = () => {
  drawerView.value = 'contacts'
  emit('refresh-friends')
}

const selectContact = (roomId) => {
  emit('select', roomId)
  closeDrawer()
}

const submitFriend = () => {
  const name = friendName.value.trim()
  if (!name) return

  emit('add-friend', name)
  friendName.value = ''
}
</script>

<template>
  <aside class="room-sidebar" aria-label="聊天清單">
    <button
      v-if="isMenuOpen"
      type="button"
      class="drawer-backdrop"
      aria-label="關閉選單"
      @click="closeDrawer"
    />

    <aside class="side-drawer" :class="{ 'side-drawer-open': isMenuOpen }" aria-label="主選單">
      <template v-if="drawerView === 'menu'">
        <div class="drawer-profile">
          <span class="drawer-avatar">{{ currentUser.displayName.slice(0, 1).toUpperCase() }}</span>
          <div class="drawer-profile-text">
            <strong>{{ currentUser.displayName }}</strong>
            <span>目前使用者</span>
          </div>
          <button type="button" class="drawer-close" aria-label="關閉選單" @click="closeDrawer">
            ×
          </button>
        </div>

        <div class="drawer-menu">
          <button type="button" class="drawer-menu-item" @click="openContacts">
            <span class="drawer-menu-icon">◎</span>
            <span>聯絡人</span>
          </button>

          <button type="button" class="drawer-menu-item" @click="emit('logout')">
            <span class="drawer-menu-icon">↪</span>
            <span>登出</span>
          </button>
        </div>
      </template>

      <template v-else>
        <div class="drawer-toolbar">
          <button type="button" class="drawer-back-button" aria-label="返回主選單" @click="drawerView = 'menu'">
            ‹
          </button>
          <h3>聯絡人</h3>
          <button type="button" class="drawer-close" aria-label="關閉選單" @click="closeDrawer">
            ×
          </button>
        </div>

        <div class="drawer-search">
          <input
            v-model="contactSearchText"
            type="search"
            placeholder="搜尋"
            autocomplete="off"
          />
        </div>

        <nav class="drawer-contact-list" aria-label="好友列表">
          <button
            v-for="friend in visibleFriendRooms"
            :key="friend.id"
            type="button"
            class="drawer-contact-item"
            @click="selectContact(friend.id)"
          >
            <span class="room-avatar">{{ friend.initials }}</span>
            <span class="drawer-contact-content">
              <span class="drawer-contact-topline">
                <strong>{{ friend.name }}</strong>
                <time v-if="friend.lastMessageAt">{{ friend.lastMessageAt }}</time>
              </span>
              <span class="drawer-contact-bottomline">
                <span
                  class="presence-text"
                  :class="{ 'presence-online': friend.online }"
                >
                  {{ formatPresence(friend) }}
                </span>
                <span
                  v-if="friend.lastMessageIsSelf"
                  class="read-checks"
                  :class="{ 'read-checks-read': friend.lastMessageReadAt }"
                  :aria-label="friend.lastMessageReadAt ? '已讀' : '未讀'"
                  :title="friend.lastMessageReadAt ? '已讀' : '未讀'"
                >
                  <span />
                  <span v-if="friend.lastMessageReadAt" />
                </span>
                <span v-else-if="friend.unreadCount" class="unread-badge">
                  {{ friend.unreadCount > 99 ? '99+' : friend.unreadCount }}
                </span>
              </span>
            </span>
          </button>
          <p v-if="!visibleFriendRooms.length" class="drawer-empty">
            尚無符合的好友
          </p>
        </nav>

        <div class="drawer-contact-footer">
          <button
            type="button"
            class="drawer-add-toggle"
            @click="isAddFriendModalOpen = true"
          >
            添加聯絡人
          </button>
        </div>
      </template>
    </aside>

    <div
      v-if="isAddFriendModalOpen"
      class="modal-backdrop"
      role="presentation"
      @click.self="isAddFriendModalOpen = false"
    >
      <form class="add-contact-modal" @submit.prevent="submitFriend">
        <div class="modal-header">
          <h3>添加聯絡人</h3>
          <button
            type="button"
            class="modal-close"
            aria-label="關閉新增聯絡人"
            @click="isAddFriendModalOpen = false"
          >
            ×
          </button>
        </div>
        <label>
          <span>送出好友邀請</span>
          <input
            v-model="friendName"
            type="text"
            maxlength="32"
            placeholder="輸入朋友名稱"
            autocomplete="off"
          />
        </label>
        <p v-if="error" class="room-error">{{ error }}</p>
        <button type="submit" :disabled="!friendName.trim()">新增</button>
      </form>
    </div>

    <div class="room-sidebar-header">
      <button
        type="button"
        class="menu-button"
        aria-label="開啟選單"
        @click="openDrawer"
      >
        <span />
        <span />
        <span />
      </button>
      <div>
        <p class="eyebrow">Messages</p>
        <h2>聊天室</h2>
      </div>
    </div>

    <div class="sidebar-search">
      <input
        v-model="searchText"
        type="search"
        placeholder="搜尋聊天或使用者"
        autocomplete="off"
      />
    </div>

    <nav class="room-list" aria-label="聊天與使用者清單">
      <button
        v-for="room in visibleRooms"
        :key="room.id"
        type="button"
        class="room-item"
        :class="{ 'room-item-active': room.id === activeRoomId }"
        @click="emit('select', room.id)"
      >
        <span class="room-avatar">{{ room.initials }}</span>
        <span class="room-content">
          <span class="room-topline">
            <span class="room-name">{{ room.name }}</span>
            <time v-if="room.lastMessageAt" class="room-time">{{ room.lastMessageAt }}</time>
          </span>
          <span class="room-bottomline">
            <span class="room-preview">
              {{ room.lastMessage || room.description }}
            </span>
            <span
              v-if="room.lastMessageIsSelf"
              class="read-checks"
              :class="{ 'read-checks-read': room.lastMessageReadAt }"
              :aria-label="room.lastMessageReadAt ? '已讀' : '未讀'"
              :title="room.lastMessageReadAt ? '已讀' : '未讀'"
            >
              <span />
              <span v-if="room.lastMessageReadAt" />
            </span>
            <span v-else-if="room.unreadCount" class="unread-badge">
              {{ room.unreadCount > 99 ? '99+' : room.unreadCount }}
            </span>
          </span>
        </span>
      </button>
      <button
        v-for="user in visibleUsers"
        :key="user.user_id"
        type="button"
        class="room-item user-menu-item"
        @click="emit('start-chat', user)"
      >
        <span class="room-avatar">{{ user.display_name.slice(0, 1).toUpperCase() }}</span>
        <span class="room-content">
          <span class="room-topline">
            <span class="room-name">{{ user.display_name }}</span>
          </span>
          <span class="room-bottomline">
            <span class="room-preview">可直接聊天</span>
          </span>
        </span>
      </button>

      <p v-if="!hasVisibleTargets" class="empty-menu">沒有符合的聊天或使用者</p>
    </nav>
  </aside>
</template>
