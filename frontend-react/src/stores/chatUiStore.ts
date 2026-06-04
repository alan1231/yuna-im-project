import { create } from 'zustand'

export type MobileChatView = 'rooms' | 'chat'

type ChatUiState = {
  mobileView: MobileChatView
  setMobileView: (view: MobileChatView) => void
}

export const useChatUiStore = create<ChatUiState>((set) => ({
  mobileView: 'rooms',
  setMobileView: (mobileView) => set({ mobileView }),
}))
