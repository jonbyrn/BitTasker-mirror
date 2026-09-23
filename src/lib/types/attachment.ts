/**
 * Attachment types for task completion evidence, chat messages, etc.
 */

export interface Attachment {
  /** Unique identifier for the attachment */
  id: string;
  /** Type of attachment */
  type: 'image' | 'video' | 'audio' | 'file' | 'link';
  /** URL or data URI of the attachment */
  url: string;
  /** Original filename */
  name?: string;
  /** MIME type */
  mimeType?: string;
  /** File size in bytes */
  size?: number;
  /** Optional thumbnail URL for media */
  thumbnailUrl?: string;
  /** Width in pixels (for images/videos) */
  width?: number;
  /** Height in pixels (for images/videos) */
  height?: number;
  /** Duration in seconds (for audio/video) */
  duration?: number;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}