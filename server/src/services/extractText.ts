import path from 'node:path';
import mammoth from 'mammoth';
import { extractText as extractPdfText, getDocumentProxy } from 'unpdf';
import { HttpError } from '../errors.js';

export type DocKind = 'pdf' | 'docx';

const MAX_TEXT_CHARS = 60_000;
const MIN_TEXT_CHARS = 40;

const PDF_MAGIC = Buffer.from('%PDF-');
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

/**
 * Decide what a file is from its extension AND its leading bytes. The client-supplied
 * MIME type is not trusted (Android file pickers often send application/octet-stream).
 */
export function detectKind(buffer: Buffer, filename: string): DocKind {
  const ext = path.extname(filename).toLowerCase();
  if (ext !== '.pdf' && ext !== '.docx') {
    throw new HttpError(415, 'Unsupported file type. Please upload a PDF or DOCX file.', 'unsupported_file');
  }
  if (buffer.length === 0) {
    throw new HttpError(400, 'The uploaded file is empty.', 'empty_file');
  }
  // PDFs may have a little junk before the header; the spec allows it within the first 1024 bytes.
  const isPdf = buffer.subarray(0, 1024).includes(PDF_MAGIC);
  const isZip = buffer.subarray(0, 4).equals(ZIP_MAGIC);
  if (ext === '.pdf' && isPdf) return 'pdf';
  if (ext === '.docx' && isZip) return 'docx';
  throw new HttpError(
    415,
    `This file does not look like a valid ${ext === '.pdf' ? 'PDF' : 'DOCX'} document.`,
    'unsupported_file',
  );
}

function tidy(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_TEXT_CHARS);
}

/** Extract plain text from an in-memory document. Nothing is written to disk. */
export async function extractText(buffer: Buffer, kind: DocKind): Promise<string> {
  let text: string;
  try {
    if (kind === 'pdf') {
      const pdf = await getDocumentProxy(new Uint8Array(buffer));
      const result = await extractPdfText(pdf, { mergePages: true });
      text = result.text;
    } else {
      const result = await mammoth.extractRawText({ buffer });
      text = result.value;
    }
  } catch {
    throw new HttpError(
      422,
      'This document could not be read. It may be corrupted or password-protected. Try another file or enter your details manually.',
      'unreadable_document',
    );
  }

  text = tidy(text);
  if (text.length < MIN_TEXT_CHARS) {
    throw new HttpError(
      422,
      'No readable text was found in this document. If it is a scanned image, upload a text-based PDF or DOCX, or enter your details manually.',
      'no_text',
    );
  }
  return text;
}
