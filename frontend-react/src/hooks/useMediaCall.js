import { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

const CALL_ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  ...(import.meta.env.VITE_TURN_URL
    ? [{
        urls: import.meta.env.VITE_TURN_URL,
        username: import.meta.env.VITE_TURN_USERNAME,
        credential: import.meta.env.VITE_TURN_CREDENTIAL,
      }]
    : []),
]
const CALL_TIMEOUT_MS = 30_000

const createInitialCallState = () => ({
  status: 'idle',
  roomId: '',
  peerId: '',
  peerName: '',
  isMuted: false,
  isCameraOn: false,
})

export function useMediaCall({ media, currentUserId, getSocket, getRooms, getActiveRoom, remoteRef, localRef, onError }) {
  const { t } = useTranslation()
  const [call, setCall] = useState(createInitialCallState)
  const peerConnectionRef = useRef(null)
  const localStreamRef = useRef(null)
  const pendingOfferRef = useRef(null)
  const ringtoneRef = useRef(null)
  const callTimeoutRef = useRef(null)

  const signalType = useCallback((suffix) => `${media}_${suffix}`, [media])

  const sendSignal = useCallback(
    (type, room, payload = {}) => {
      const socket = getSocket()
      if (
        !socket ||
        socket.readyState !== WebSocket.OPEN ||
        !room?.recipientId ||
        !room?.conversationId
      ) {
        return false
      }

      socket.send(
        JSON.stringify({
          type,
          sender_id: currentUserId,
          recipient_id: room.recipientId,
          conversation_id: room.conversationId,
          ...payload,
        }),
      )
      return true
    },
    [currentUserId, getSocket],
  )

  const stopRingtone = useCallback(() => {
    const ringtone = ringtoneRef.current
    if (!ringtone) return

    window.clearInterval(ringtone.intervalId)
    ringtone.nodes.forEach((node) => {
      try {
        node.stop()
      } catch {
        // The oscillator may already be stopped by its scheduled end time.
      }
      node.disconnect()
    })
    ringtone.gain?.disconnect()
    ringtone.audioContext?.close().catch(() => {})
    ringtoneRef.current = null
  }, [])

  const clearCallTimeout = useCallback(() => {
    if (!callTimeoutRef.current) return
    window.clearTimeout(callTimeoutRef.current)
    callTimeoutRef.current = null
  }, [])

  const startRingtone = useCallback(() => {
    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext
    if (ringtoneRef.current || !AudioContextConstructor) return

    let audioContext
    try {
      audioContext = new AudioContextConstructor()
      const gain = audioContext.createGain()
      gain.gain.value = 0.05
      gain.connect(audioContext.destination)

      const playTone = () => {
        const now = audioContext.currentTime
        const nodes = []

        ;[0, 0.38].forEach((offset) => {
          const oscillator = audioContext.createOscillator()
          oscillator.type = 'sine'
          oscillator.frequency.setValueAtTime(660, now + offset)
          oscillator.frequency.exponentialRampToValueAtTime(880, now + offset + 0.18)
          oscillator.connect(gain)
          oscillator.start(now + offset)
          oscillator.stop(now + offset + 0.28)
          nodes.push(oscillator)
        })

        ringtoneRef.current = {
          ...ringtoneRef.current,
          nodes,
        }
      }

      ringtoneRef.current = {
        audioContext,
        intervalId: window.setInterval(playTone, 1600),
        gain,
        nodes: [],
      }

      audioContext.resume().then(playTone).catch(() => {
        stopRingtone()
      })
    } catch {
      audioContext?.close().catch(() => {})
      // Mobile browsers may reject AudioContext outside a user gesture.
      // The incoming call UI must still be shown without a ringtone.
    }
  }, [stopRingtone])

  const cleanup = useCallback(() => {
    clearCallTimeout()
    stopRingtone()
    peerConnectionRef.current?.close()
    peerConnectionRef.current = null
    localStreamRef.current?.getTracks().forEach((track) => track.stop())
    localStreamRef.current = null
    pendingOfferRef.current = null
    if (remoteRef.current) {
      remoteRef.current.srcObject = null
    }
    if (localRef?.current) {
      localRef.current.srcObject = null
    }
  }, [clearCallTimeout, localRef, remoteRef, stopRingtone])

  const createPeerConnection = useCallback(
    (room) => {
      const peer = new RTCPeerConnection({ iceServers: CALL_ICE_SERVERS })
      peer.onicecandidate = (event) => {
        if (event.candidate) {
          sendSignal(signalType('ice'), room, { candidate: event.candidate.toJSON() })
        }
      }
      peer.ontrack = (event) => {
        const [stream] = event.streams
        if (remoteRef.current && stream) {
          remoteRef.current.srcObject = stream
          remoteRef.current.play?.().catch(() => {})
        }
      }
      peer.onconnectionstatechange = () => {
        if (['failed', 'disconnected', 'closed'].includes(peer.connectionState)) {
          cleanup()
          setCall(createInitialCallState())
        }
      }
      peerConnectionRef.current = peer
      return peer
    },
    [cleanup, remoteRef, sendSignal, signalType],
  )

  const ensureLocalStream = useCallback(async () => {
    if (localStreamRef.current) return localStreamRef.current

    const constraints =
      media === 'video' ? { audio: true, video: true } : { audio: true, video: false }
    const stream = await window.navigator.mediaDevices.getUserMedia(constraints)
    localStreamRef.current = stream
    if (localRef?.current) {
      localRef.current.srcObject = stream
      localRef.current.play?.().catch(() => {})
    }
    return stream
  }, [localRef, media])

  const findRoomForSignal = useCallback(
    (payload) => {
      return getRooms().find(
        (room) =>
          room.conversationId === payload.conversation_id ||
          room.recipientId === payload.sender_id,
      )
    },
    [getRooms],
  )

  const handleOffer = useCallback(
    (payload) => {
      const room = findRoomForSignal(payload)
      if (!room || room.isGroup) return

      pendingOfferRef.current = payload
      startRingtone()
      setCall({
        status: 'incoming',
        roomId: room.id,
        peerId: payload.sender_id,
        peerName: room.name,
        isMuted: false,
        isCameraOn: media === 'video',
      })
    },
    [findRoomForSignal, media, startRingtone],
  )

  const handleAnswer = useCallback(async (payload) => {
    const peer = peerConnectionRef.current
    if (!peer || !payload.answer) return

    await peer.setRemoteDescription(new RTCSessionDescription(payload.answer))
    clearCallTimeout()
    setCall((current) => ({ ...current, status: 'connected' }))
  }, [clearCallTimeout])

  const handleIce = useCallback(async (payload) => {
    const peer = peerConnectionRef.current
    if (!peer || !payload.candidate) return

    try {
      await peer.addIceCandidate(new RTCIceCandidate(payload.candidate))
    } catch (error) {
      console.error('Failed to add ICE candidate:', error)
    }
  }, [])

  const handleEnd = useCallback(() => {
    cleanup()
    setCall(createInitialCallState())
  }, [cleanup])

  const startCall = useCallback(async () => {
    const room = getActiveRoom()
    if (!room || room.isGroup) return

    try {
      cleanup()
      const stream = await ensureLocalStream()
      const peer = createPeerConnection(room)
      stream.getTracks().forEach((track) => peer.addTrack(track, stream))
      const offer = await peer.createOffer()
      await peer.setLocalDescription(offer)
      if (!sendSignal(signalType('offer'), room, { offer })) return

      setCall({
        status: 'calling',
        roomId: room.id,
        peerId: room.recipientId,
        peerName: room.name,
        isMuted: false,
        isCameraOn: media === 'video',
      })
      callTimeoutRef.current = window.setTimeout(() => {
        sendSignal(signalType('end'), room)
        cleanup()
        setCall(createInitialCallState())
      }, CALL_TIMEOUT_MS)
    } catch (error) {
      console.error('Start call failed:', error)
      cleanup()
      setCall(createInitialCallState())
      onError?.(media === 'video' ? t('chat.errors.videoStartFailed') : t('chat.errors.voiceStartFailed'))
    }
  }, [cleanup, createPeerConnection, ensureLocalStream, getActiveRoom, media, onError, sendSignal, signalType, t])

  const acceptCall = useCallback(async () => {
    const offer = pendingOfferRef.current
    const room = offer ? findRoomForSignal(offer) : null
    if (!offer || !room) return

    try {
      cleanup()
      const stream = await ensureLocalStream()
      const peer = createPeerConnection(room)
      stream.getTracks().forEach((track) => peer.addTrack(track, stream))
      await peer.setRemoteDescription(new RTCSessionDescription(offer.offer))
      const answer = await peer.createAnswer()
      await peer.setLocalDescription(answer)
      sendSignal(signalType('answer'), room, { answer })
      pendingOfferRef.current = null
      setCall({
        status: 'connected',
        roomId: room.id,
        peerId: room.recipientId,
        peerName: room.name,
        isMuted: false,
        isCameraOn: media === 'video',
      })
    } catch (error) {
      console.error('Accept call failed:', error)
      cleanup()
      setCall(createInitialCallState())
      onError?.(media === 'video' ? t('chat.errors.videoStartFailed') : t('chat.errors.voiceStartFailed'))
    }
  }, [cleanup, createPeerConnection, ensureLocalStream, findRoomForSignal, media, onError, sendSignal, signalType, t])

  const rejectCall = useCallback(() => {
    const offer = pendingOfferRef.current
    const room = offer ? findRoomForSignal(offer) : null
    if (room) {
      sendSignal(signalType('reject'), room)
    }
    cleanup()
    setCall(createInitialCallState())
  }, [cleanup, findRoomForSignal, sendSignal, signalType])

  const endCall = useCallback(() => {
    const room = getRooms().find((item) => item.id === call.roomId)
    if (room) {
      sendSignal(signalType('end'), room)
    }
    cleanup()
    setCall(createInitialCallState())
  }, [call.roomId, cleanup, getRooms, sendSignal, signalType])

  const toggleMute = useCallback(() => {
    const nextMuted = !call.isMuted
    localStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted
    })
    setCall((current) => ({ ...current, isMuted: nextMuted }))
  }, [call.isMuted])

  const toggleCamera = useCallback(() => {
    const track = localStreamRef.current?.getVideoTracks()[0]
    if (!track) return

    track.enabled = !track.enabled
    setCall((current) => ({ ...current, isCameraOn: track.enabled }))
  }, [])

  const handleSignal = useCallback(
    (type, payload) => {
      if (type === signalType('offer')) {
        handleOffer(payload)
      } else if (type === signalType('answer')) {
        handleAnswer(payload)
      } else if (type === signalType('ice')) {
        handleIce(payload)
      } else if (type === signalType('reject') || type === signalType('end')) {
        handleEnd()
      }
    },
    [handleAnswer, handleEnd, handleIce, handleOffer, signalType],
  )

  return {
    call,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    toggleMute,
    toggleCamera,
    handleSignal,
    cleanup,
  }
}
