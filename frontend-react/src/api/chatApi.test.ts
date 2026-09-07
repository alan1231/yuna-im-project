// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { fetchCurrentUser } from './chatApi'
import { useAuthStore } from '../stores/authStore'

afterEach(() => { vi.unstubAllGlobals(); useAuthStore.getState().clearCurrentUser() })

it('clears the matching authenticated session on 401', async () => {
  useAuthStore.getState().setCurrentUser({ id: 'me', displayName: 'Me', token: 'old' })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 401 })))
  await expect(fetchCurrentUser()).rejects.toMatchObject({ status: 401 })
  expect(useAuthStore.getState().currentUser).toBeNull()
})

it('does not clear a newer session for a delayed 401', async () => {
  useAuthStore.getState().setCurrentUser({ id: 'me', displayName: 'Me', token: 'old' })
  let resolve!: (response: Response) => void
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((done) => { resolve = done })))
  const request = fetchCurrentUser()
  useAuthStore.getState().setCurrentUser({ id: 'me', displayName: 'Me', token: 'new' })
  resolve(new Response('', { status: 401 }))
  await expect(request).rejects.toMatchObject({ status: 401 })
  expect(useAuthStore.getState().currentUser?.token).toBe('new')
})

it('preserves the session on transient dependency failure', async () => {
  useAuthStore.getState().setCurrentUser({ id: 'me', displayName: 'Me', token: 'old' })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 503 })))
  await expect(fetchCurrentUser()).rejects.toMatchObject({ status: 503 })
  expect(useAuthStore.getState().currentUser?.token).toBe('old')
})
