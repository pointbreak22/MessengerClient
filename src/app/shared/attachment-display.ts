// Blob URLs preserve the original filename (AttachmentsController stores as
// `{guid}/{file.FileName}`), so the extension in the URL path is reliable —
// same assumption right-sidebar's old isImageAttachment already made, just
// extended to the other allowed content types (see AttachmentsController's
// AllowedContentTypes: jpeg/png/gif/webp/pdf/mp4).
export type AttachmentKind = 'image' | 'pdf' | 'video' | 'file';

export function attachmentKind(url: string): AttachmentKind {
  const path = url.split('?')[0].toLowerCase();
  if (/\.(png|jpe?g|gif|webp)$/.test(path)) return 'image';
  if (/\.pdf$/.test(path)) return 'pdf';
  if (/\.mp4$/.test(path)) return 'video';
  return 'file';
}

export function attachmentLabel(url: string): string {
  switch (attachmentKind(url)) {
    case 'image':
      return 'Photo';
    case 'pdf':
      return 'Document';
    case 'video':
      return 'Video';
    default:
      return 'File';
  }
}

// appIcon id for the non-image/non-video fallback card — image/video get a
// real preview instead (thumbnail / inline player), so this only covers pdf/file.
export function attachmentIcon(url: string): string {
  return attachmentKind(url) === 'pdf' ? 'file-text' : 'attach';
}
