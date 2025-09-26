# MediaUploader Component Changes

## Overview
The MediaUploader component has been modified to support a new upload flow where files are selected first and uploaded later when a "Next" button is clicked. This addresses both the authentication issue and provides better user control over the upload process.

## Key Changes

### 1. New Props Added
- `onFileSelect?: (files: File[]) => void` - Callback when files are selected
- `autoUpload?: boolean` - Whether to upload immediately (default: true)

### 2. New State Management
- `selectedFiles: File[]` - Stores the original selected files
- `processedFiles: File[]` - Stores processed/compressed files ready for upload
- `isDragOver: boolean` - Tracks drag and drop state

### 3. New Methods
- `uploadFiles()` - Exported method to manually trigger upload
- `processSelectedFiles()` - Internal method to process files for validation and compression
- `uploadProcessedFiles()` - Internal method to handle the actual upload
- `handleDragOver()` - Handles drag over events
- `handleDragLeave()` - Handles drag leave events
- `handleDrop()` - Handles file drop events

### 4. Enhanced Error Handling
- Better authentication error messages
- Improved error handling in upload service
- Authentication check before upload

### 5. Drag and Drop Support
- Full drag and drop functionality with visual feedback
- Drag over state with blue highlighting
- Drop zone with proper accessibility attributes
- Seamless integration with existing file selection flow

## Usage Examples

### Basic Usage (Auto Upload - Default Behavior)
```svelte
<MediaUploader
  id="basic-uploader"
  label="Upload Images"
  allowedTypes={['image/*']}
  maxFiles={3}
  onChange={handleUploadResults}
/>
```

### Manual Upload Flow (New Behavior)
```svelte
<script>
  import MediaUploader from '$lib/components/MediaUploader.svelte';
  
  let mediaUploaderRef: MediaUploader;
  let selectedFiles: File[] = [];
  
  function handleFileSelect(files: File[]) {
    selectedFiles = files;
    console.log('Files selected:', files.map(f => f.name));
  }
  
  async function handleNextClick() {
    if (selectedFiles.length === 0) {
      alert('Please select at least one file');
      return;
    }
    
    try {
      await mediaUploaderRef.uploadFiles();
      console.log('Upload successful!');
    } catch (error) {
      console.error('Upload failed:', error);
    }
  }
</script>

<MediaUploader
  bind:this={mediaUploaderRef}
  id="manual-uploader"
  label="Select Images"
  allowedTypes={['image/*']}
  maxFiles={3}
  autoUpload={false}
  onFileSelect={handleFileSelect}
  onChange={handleUploadResults}
/>

<button onclick={handleNextClick} disabled={selectedFiles.length === 0}>
  Next
</button>
```

## Migration Guide

### For Existing Components
If you want to keep the current auto-upload behavior, no changes are needed. The component defaults to `autoUpload={true}`.

### For New Manual Upload Flow
1. Set `autoUpload={false}`
2. Add `onFileSelect` callback to track selected files
3. Use the `uploadFiles()` method when ready to upload
4. Handle the upload results in the `onChange` callback

## Authentication Fixes

### Enhanced Error Handling
The upload service now provides better error messages:
- "Authentication failed. Please log in again." (401 errors)
- "Access denied. You do not have permission to upload files." (403 errors)
- "File too large. Please choose a smaller file." (413 errors)
- "Server error. Please try again later." (500+ errors)

### Authentication Check
Before each upload, the service now checks if the user is properly authenticated by making a verification request to `/auth/verify`.

## Benefits

1. **Better User Control**: Users can select files, review them, and upload when ready
2. **Improved Error Handling**: Clear error messages for different failure scenarios
3. **Authentication Safety**: Proactive authentication checks prevent upload failures
4. **Backward Compatibility**: Existing implementations continue to work unchanged
5. **Flexible Usage**: Supports both auto-upload and manual upload flows
6. **Drag and Drop Support**: Modern file selection with visual feedback
7. **No Loader During Selection**: Blue loader only appears during actual upload, not file selection
8. **Accessibility**: Proper ARIA labels and roles for screen readers

## File Processing Flow

1. **File Selection**: User selects files via file input
2. **Validation**: Files are validated for type, size, and other constraints
3. **Compression**: Images are compressed if enabled
4. **Storage**: Processed files are stored in `processedFiles` array
5. **Preview**: File previews are shown using object URLs
6. **Upload**: Files are uploaded when `uploadFiles()` is called or `autoUpload` is true

## State Management

The component now maintains three file arrays:
- `selectedFiles`: Original files selected by user
- `processedFiles`: Validated and compressed files ready for upload
- `files`: File URLs/objects for display (previews and uploaded results)

This separation allows for better control over the upload process and provides clear feedback to users about the current state of their files.
