import { useMemo, useRef, useState } from 'react'

const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024
const MAX_IMAGE_DIMENSION = 1600
const MIN_IMAGE_QUALITY = 0.55

const blobToDataUrl = (blob) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

const loadImage = (url) => {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = reject
    image.src = url
  })
}

const canvasToBlob = (canvas, type, quality) => {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob)
        return
      }
      reject(new Error('canvas export failed'))
    }, type, quality)
  })
}

const compressedImageName = (name) => {
  const baseName = name.replace(/\.[^.]+$/, '') || 'image'
  return `${baseName}.jpg`
}

export default function ChatComposer({
  value,
  onChange,
  fileAttachment = null,
  allowAttachments = true,
  canSend,
  placeholder = '輸入訊息...',
  submitLabel = '送出',
  onAttachFile,
  onClearFile,
  onSend,
}) {
  const fileInput = useRef(null)
  const [isDraggingFile, setIsDraggingFile] = useState(false)
  const [fileError, setFileError] = useState('')
  const [isProcessingFile, setIsProcessingFile] = useState(false)
  const fileSizeLabel = useMemo(() => {
    if (!fileAttachment?.size) return ''
    const sizeKb = fileAttachment.size / 1024
    if (sizeKb < 1024) return `${Math.round(sizeKb)} KB`
    return `${(sizeKb / 1024).toFixed(1)} MB`
  }, [fileAttachment])
  const isImageAttachment = fileAttachment?.type?.startsWith('image/')

  const openFilePicker = () => {
    setFileError('')
    fileInput.current?.click()
  }

  const compressImageFile = async (file) => {
    const objectUrl = URL.createObjectURL(file)
    try {
      const image = await loadImage(objectUrl)
      const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(image.width, image.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(image.width * scale))
      canvas.height = Math.max(1, Math.round(image.height * scale))

      const context = canvas.getContext('2d')
      if (!context) throw new Error('canvas context unavailable')

      context.drawImage(image, 0, 0, canvas.width, canvas.height)

      let quality = 0.86
      let blob = await canvasToBlob(canvas, 'image/jpeg', quality)
      while (blob.size > MAX_FILE_SIZE_BYTES && quality > MIN_IMAGE_QUALITY) {
        quality -= 0.08
        blob = await canvasToBlob(canvas, 'image/jpeg', quality)
      }

      return blob
    } finally {
      URL.revokeObjectURL(objectUrl)
    }
  }

  const attachBlob = async ({ blob, name, type, compressed = false }) => {
    const url = await blobToDataUrl(blob)
    setFileError(compressed ? '圖片已自動壓縮。' : '')
    onAttachFile({
      url,
      name,
      type,
      size: blob.size,
    })
  }

  const readAttachmentFile = async (file) => {
    if (!allowAttachments) return
    if (!file) return

    setIsProcessingFile(true)
    setFileError('')

    try {
      if (file.size <= MAX_FILE_SIZE_BYTES) {
        await attachBlob({
          blob: file,
          name: file.name,
          type: file.type,
        })
        return
      }

      if (!file.type.startsWith('image/')) {
        setFileError('檔案需小於 2 MB；目前只有圖片可自動壓縮。')
        return
      }

      const compressedBlob = await compressImageFile(file)
      if (compressedBlob.size > MAX_FILE_SIZE_BYTES) {
        setFileError('圖片已壓縮，但仍超過 2 MB。請改用較小的圖片。')
        return
      }

      await attachBlob({
        blob: compressedBlob,
        name: compressedImageName(file.name),
        type: compressedBlob.type || 'image/jpeg',
        compressed: true,
      })
    } catch (error) {
      console.error('檔案處理失敗:', error)
      setFileError('檔案處理失敗。')
    } finally {
      setIsProcessingFile(false)
    }
  }

  const handleFileChange = (event) => {
    readAttachmentFile(event.target.files?.[0])
    event.target.value = ''
  }

  const handleDragEnter = (event) => {
    if (!allowAttachments) return
    if (!Array.from(event.dataTransfer?.types || []).includes('Files')) return
    setIsDraggingFile(true)
  }

  const handleDrop = (event) => {
    setIsDraggingFile(false)
    readAttachmentFile(event.dataTransfer?.files?.[0])
  }

  const submit = (event) => {
    event.preventDefault()
    setFileError('')
    onSend()
  }

  return (
    <form
      className={`composer ${isDraggingFile && allowAttachments ? 'composer-dragging' : ''}`}
      onSubmit={submit}
      onDragEnter={(event) => {
        event.preventDefault()
        handleDragEnter(event)
      }}
      onDragOver={(event) => {
        event.preventDefault()
        if (allowAttachments) setIsDraggingFile(true)
      }}
      onDragLeave={(event) => {
        event.preventDefault()
        setIsDraggingFile(false)
      }}
      onDrop={(event) => {
        event.preventDefault()
        handleDrop(event)
      }}
    >
      <div className="composer-input-stack">
        {fileAttachment ? (
          <div className="file-attachment-preview">
            {isImageAttachment ? (
              <img src={fileAttachment.url} alt={fileAttachment.name || '待傳送圖片'} />
            ) : (
              <span className="file-attachment-icon" aria-hidden="true">
                檔
              </span>
            )}
            <span>
              <strong>{fileAttachment.name || '檔案'}</strong>
              {fileSizeLabel ? <small>{fileSizeLabel}</small> : null}
            </span>
            <button
              type="button"
              className="file-attachment-remove"
              aria-label="移除檔案"
              title="移除檔案"
              onClick={onClearFile}
            >
              ×
            </button>
          </div>
        ) : null}

        {fileError ? <p className="composer-error">{fileError}</p> : null}
        {!fileError && isProcessingFile ? <p className="composer-status">正在處理檔案...</p> : null}

        <input
          value={value}
          type="text"
          placeholder={placeholder}
          autoComplete="off"
          onChange={(event) => onChange(event.target.value)}
        />
      </div>

      <input ref={fileInput} className="composer-file-input" type="file" onChange={handleFileChange} />

      {allowAttachments ? (
        <button
          type="button"
          className="composer-file-button"
          aria-label="選擇檔案"
          title="選擇檔案"
          onClick={openFilePicker}
        >
          檔案
        </button>
      ) : null}

      <button type="submit" disabled={!canSend || isProcessingFile}>
        {submitLabel}
      </button>
    </form>
  )
}
