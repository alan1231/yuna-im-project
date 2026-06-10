import * as FileSystem from 'expo-file-system'
import * as ImageManipulator from 'expo-image-manipulator'
import * as Sharing from 'expo-sharing'
import { Image } from 'react-native'

const maxAttachmentBytes = 2 * 1024 * 1024
const imageCompressionQualities = [0.82, 0.72, 0.6, 0.48, 0.36]
const maxImageDimension = 1600

function readImageSize(uri) {
  return new Promise((resolve) => {
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      () => resolve({ width: 0, height: 0 }),
    )
  })
}

function stripDataUrlPrefix(value) {
  const index = String(value || '').indexOf(',')
  return index === -1 ? String(value || '') : String(value).slice(index + 1)
}

function buildCacheFileUri(fileName) {
  const safeName = String(fileName || 'attachment').replace(/[^a-zA-Z0-9._-]/g, '_')
  return `${FileSystem.cacheDirectory}${Date.now()}-${safeName}`
}

async function fileSize(uri) {
  const info = await FileSystem.getInfoAsync(uri)
  return info.exists ? Number(info.size || 0) : 0
}

async function toDataUrl(uri, mimeType) {
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  })
  return `data:${mimeType};base64,${base64}`
}

async function compressImage(asset) {
  const imageSize = await readImageSize(asset.uri)
  const shouldResize =
    imageSize.width > maxImageDimension || imageSize.height > maxImageDimension
  const resizeAction = shouldResize
    ? imageSize.width >= imageSize.height
      ? { resize: { width: maxImageDimension } }
      : { resize: { height: maxImageDimension } }
    : null

  let candidateUri = asset.uri
  let candidateSize = asset.size || (await fileSize(asset.uri))

  for (const compress of imageCompressionQualities) {
    const result = await ImageManipulator.manipulateAsync(
      asset.uri,
      resizeAction ? [resizeAction] : [],
      {
        compress,
        format: ImageManipulator.SaveFormat.JPEG,
      },
    )
    candidateUri = result.uri
    candidateSize = await fileSize(result.uri)
    if (candidateSize <= maxAttachmentBytes) {
      return {
        uri: result.uri,
        size: candidateSize,
        type: 'image/jpeg',
        wasCompressed: result.uri !== asset.uri || compress !== 1,
      }
    }
  }

  throw new Error('圖片壓縮後仍超過 2 MB。')
}

export async function prepareAttachment(asset) {
  if (!asset?.uri) throw new Error('無法讀取附件。')

  const mimeType = asset.mimeType || 'application/octet-stream'
  const originalSize = asset.size || (await fileSize(asset.uri))

  if (mimeType.startsWith('image/')) {
    const preparedImage =
      originalSize > maxAttachmentBytes || mimeType !== 'image/jpeg'
        ? await compressImage(asset)
        : {
            uri: asset.uri,
            size: originalSize,
            type: mimeType,
            wasCompressed: false,
          }

    return {
      name: asset.name || 'image.jpg',
      size: preparedImage.size,
      type: preparedImage.type,
      url: await toDataUrl(preparedImage.uri, preparedImage.type),
      localUri: preparedImage.uri,
      wasCompressed: preparedImage.wasCompressed,
      originalSize,
    }
  }

  if (originalSize > maxAttachmentBytes) {
    throw new Error('附件需小於 2 MB。')
  }

  return {
    name: asset.name || 'attachment',
    size: originalSize,
    type: mimeType,
    url: await toDataUrl(asset.uri, mimeType),
    localUri: asset.uri,
    wasCompressed: false,
    originalSize,
  }
}

export async function shareAttachment({ attachmentName, attachmentType, attachmentUrl }) {
  if (!attachmentUrl) throw new Error('找不到附件內容。')
  const canShare = await Sharing.isAvailableAsync()
  if (!canShare) throw new Error('這台裝置不支援分享附件。')

  const targetUri = buildCacheFileUri(attachmentName)
  await FileSystem.writeAsStringAsync(targetUri, stripDataUrlPrefix(attachmentUrl), {
    encoding: FileSystem.EncodingType.Base64,
  })
  await Sharing.shareAsync(targetUri, {
    mimeType: attachmentType || 'application/octet-stream',
    dialogTitle: attachmentName || '分享附件',
    UTI: attachmentType || undefined,
  })
}

export { maxAttachmentBytes }
