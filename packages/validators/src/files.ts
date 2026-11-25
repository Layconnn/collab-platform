import { z } from "zod";

// File uploads PRD (FR-4, FR-5): limits and allowed types, shared by the
// composer (checks before uploading) and the server (the real enforcement).

export const FILE_LIMITS = {
  maxFileBytes: 10 * 1024 * 1024,
  maxFilesPerPost: 10,
  maxWorkspaceBytes: 1024 * 1024 * 1024,
} as const;

// Extension → content type and kind. SVG and HTML are deliberately absent:
// both can carry scripts.
export const ALLOWED_FILE_TYPES = {
  png: { contentType: "image/png", kind: "Image" },
  jpg: { contentType: "image/jpeg", kind: "Image" },
  jpeg: { contentType: "image/jpeg", kind: "Image" },
  gif: { contentType: "image/gif", kind: "Image" },
  webp: { contentType: "image/webp", kind: "Image" },
  pdf: { contentType: "application/pdf", kind: "PDF" },
  txt: { contentType: "text/plain", kind: "Text" },
  csv: { contentType: "text/csv", kind: "Spreadsheet" },
  md: { contentType: "text/markdown", kind: "Text" },
  json: { contentType: "application/json", kind: "Text" },
  zip: { contentType: "application/zip", kind: "Archive" },
  doc: { contentType: "application/msword", kind: "Document" },
  docx: { contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", kind: "Document" },
  xls: { contentType: "application/vnd.ms-excel", kind: "Spreadsheet" },
  xlsx: { contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", kind: "Spreadsheet" },
  ppt: { contentType: "application/vnd.ms-powerpoint", kind: "Presentation" },
  pptx: { contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", kind: "Presentation" },
  odt: { contentType: "application/vnd.oasis.opendocument.text", kind: "Document" },
  ods: { contentType: "application/vnd.oasis.opendocument.spreadsheet", kind: "Spreadsheet" },
  odp: { contentType: "application/vnd.oasis.opendocument.presentation", kind: "Presentation" },
} as const;

export type AllowedExtension = keyof typeof ALLOWED_FILE_TYPES;

export function fileExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot > 0 ? fileName.slice(dot + 1).toLowerCase() : "";
}

// The canonical type for a file name, or null when it may not be attached.
export function allowedFileType(fileName: string) {
  const extension = fileExtension(fileName);
  return Object.hasOwn(ALLOWED_FILE_TYPES, extension) ? ALLOWED_FILE_TYPES[extension as AllowedExtension] : null;
}

export const isImageType = (contentType: string) => contentType.startsWith("image/");

// The content type comes from the extension, not the browser: browsers disagree
// (a CSV is application/vnd.ms-excel on Windows). The upload must send it.
export const createUploadInputSchema = z.object({
  workspaceId: z.string().trim().min(1),
  fileName: z.string().trim().min(1).max(200).refine((name) => ![...name].some((c) => c < " " || c === "\u007f" || c === "/" || c === "\\"),"File names cannot contain slashes or control characters."),
  size: z.number().int().min(1).max(FILE_LIMITS.maxFileBytes),
});
export type CreateUploadInput = z.infer<typeof createUploadInputSchema>;

export const attachmentIdsSchema = z.array(z.string().trim().min(1)).max(FILE_LIMITS.maxFilesPerPost);
