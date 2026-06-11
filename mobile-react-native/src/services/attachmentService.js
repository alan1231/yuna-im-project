import ImageResizer from '@bam.tech/react-native-image-resizer'
import { Image } from 'react-native'
import RNFS from 'react-native-fs'
import Share from 'react-native-share'

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
  return `${RNFS.CachesDirectoryPath}/${Date.now()}-${safeName}`
}

async function fileSize(uri) {
  const info = await RNFS.stat(uri)
  return Number(info.size || 0)
}

async function toDataUrl(uri, mimeType) {
  const base64 = await RNFS.readFile(uri, 'base64')
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
    const result = await ImageResizer.createResizedImage(
      asset.uri,
      resizeAction?.resize?.width || imageSize.width || maxImageDimension,
      resizeAction?.resize?.height || imageSize.height || maxImageDimension,
      'JPEG',
      Math.round(compress * 100),
      0,
      undefined,
      false,
      { mode: 'contain', onlyScaleDown: true },
    )
    candidateUri = result.path || result.uri
    candidateSize = Number(result.size || (await fileSize(candidateUri)))
    if (candidateSize <= maxAttachmentBytes) {
      return {
        uri: candidateUri,
        size: candidateSize,
        type: 'image/jpeg',
        wasCompressed: candidateUri !== asset.uri || compress !== 1,
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

  const targetPath = buildCacheFileUri(attachmentName)
  await RNFS.writeFile(targetPath, stripDataUrlPrefix(attachmentUrl), 'base64')
  await Share.open({
    url: `file://${targetPath}`,
    type: attachmentType || 'application/octet-stream',
    filename: attachmentName || 'attachment',
    title: attachmentName || '分享附件',
    failOnCancel: false,
    saveToFiles: true,
  })
}

export { maxAttachmentBytes }
