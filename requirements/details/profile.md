# BitTasker Profile Feature Specification

## Overview

The profile feature in BitTasker serves as a comprehensive representation of both task hirers and task doers, integrating Nostr-based decentralized identity with professional credentials and platform-specific metrics.

## Technical Architecture

### Frontend Components

#### Core Profile Components
- `ProfileHeader.svelte`: User's primary information and profile actions
- `ProfileStats.svelte`: User's platform statistics and metrics
- `ProfileInfoSection.svelte`: Detailed user information sections
- `ProfileSidebar.svelte`: Additional profile features and quick actions

#### State Management
```typescript
// Profile Store Structure
interface ProfileStore {
  personalInfo: {
    name: string;
    bio: string;
    avatar: string;
    location: string;
    joinDate: string;
    languages: string[];
    timezone: string;
  };
  professionalInfo: {
    skills: Skill[];
    certifications: Certification[];
    specializations: string[];
    experience: Experience[];
  };
  platformMetrics: {
    tasksCompleted: number;
    totalEarnings: number;
    avgRating: number;
    responseRate: number;
    completionRate: number;
  };
  preferences: {
    notificationSettings: NotificationPreferences;
    privacySettings: PrivacySettings;
    displaySettings: DisplaySettings;
  };
}
```

### Nostr Integration

#### Event Kinds
```typescript
enum NostrProfileEventKinds {
  BASIC_PROFILE = 0,
  PROFESSIONAL_INFO = 25000,
  PLATFORM_METRICS = 25001,
  PREFERENCES = 25002,
  VERIFICATION = 25003
}
```

#### Profile Data Structure
```typescript
interface NostrProfileEvent {
  kind: NostrProfileEventKinds;
  pubkey: string;
  created_at: number;
  content: string; // JSON stringified profile data
  tags: string[][];
  sig: string;
}
```

## Implementation Details

### 1. Profile Creation & Management

#### Initial Profile Setup
```typescript
async function createProfile(userKeys: NostrKeys, profileData: ProfileData): Promise<void> {
  const event = {
    kind: NostrProfileEventKinds.BASIC_PROFILE,
    pubkey: userKeys.publicKey,
    created_at: Math.floor(Date.now() / 1000),
    content: JSON.stringify(profileData),
    tags: []
  };
  
  const signedEvent = await signEvent(event, userKeys.privateKey);
  await publishToRelays(signedEvent);
}
```

#### Profile Updates
```typescript
async function updateProfile(
  section: keyof ProfileStore,
  data: Partial<ProfileStore[typeof section]>
): Promise<void> {
  const eventKind = getEventKindForSection(section);
  // Create and publish update event
}
```

### 2. Security & Privacy

#### Encryption for Sensitive Data
```typescript
async function encryptSensitiveData(data: any, publicKey: string): Promise<string> {
  const encryptedData = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv: window.crypto.getRandomValues(new Uint8Array(12)) },
    await deriveKey(publicKey),
    new TextEncoder().encode(JSON.stringify(data))
  );
  return btoa(String.fromCharCode(...new Uint8Array(encryptedData)));
}
```

#### Privacy Controls
```typescript
interface PrivacySettings {
  showEmail: boolean;
  showLocation: boolean;
  showEarnings: boolean;
  showTaskHistory: boolean;
  allowContactByNonConnected: boolean;
}
```

### 3. Profile Components Implementation

#### Profile Header
```svelte
<!-- ProfileHeader.svelte -->
<script lang="ts">
  let { isEditMode, toggleEditMode, saveProfile, logout } = $props();
  let profile = $state(await loadProfileData());
</script>

<div class="profile-header">
  <div class="avatar">
    <img src={profile.avatar} alt={profile.name} />
  </div>
  <div class="info">
    <h1>{profile.name}</h1>
    <p>{profile.bio}</p>
  </div>
  <div class="actions">
    {#if isEditMode}
      <button onclick={saveProfile}>Save Changes</button>
    {:else}
      <button onclick={toggleEditMode}>Edit Profile</button>
    {/if}
    <button onclick={logout}>Logout</button>
  </div>
</div>
```

#### Profile Stats
```svelte
<!-- ProfileStats.svelte -->
<script lang="ts">
  let metrics = $state(await loadProfileMetrics());
</script>

<div class="stats-grid">
  <div class="stat">
    <span class="value">{metrics.tasksCompleted}</span>
    <span class="label">Tasks Completed</span>
  </div>
  <!-- Additional stats -->
</div>
```

### 4. Data Persistence

#### Local Storage
```typescript
interface LocalProfileCache {
  lastUpdate: number;
  profile: ProfileStore;
  expiresAt: number;
}

async function cacheProfile(profile: ProfileStore): Promise<void> {
  const cache: LocalProfileCache = {
    lastUpdate: Date.now(),
    profile,
    expiresAt: Date.now() + (24 * 60 * 60 * 1000) // 24 hours
  };
  await localforage.setItem('profile_cache', cache);
}
```

#### Relay Synchronization
```typescript
async function syncProfileWithRelays(): Promise<void> {
  const localCache = await localforage.getItem('profile_cache');
  if (!localCache || localCache.expiresAt < Date.now()) {
    const profile = await fetchProfileFromRelays();
    await cacheProfile(profile);
  }
}
```

### 5. Profile Verification

#### Credential Verification
```typescript
interface VerificationEvent {
  kind: NostrProfileEventKinds.VERIFICATION;
  pubkey: string;
  created_at: number;
  content: string;
  tags: [
    ['p', string], // pubkey being verified
    ['c', string], // credential type
    ['s', string]  // signature from issuer
  ];
  sig: string;
}
```

#### Verification Process
```typescript
async function verifyCredential(
  credential: Credential,
  issuerPubkey: string
): Promise<boolean> {
  const verificationEvent = await fetchVerificationEvent(credential.id);
  return verifySignature(verificationEvent, issuerPubkey);
}
```

## Testing Strategy

### Unit Tests
```typescript
describe('Profile Management', () => {
  test('should create new profile', async () => {
    const profile = await createProfile(mockKeys, mockProfileData);
    expect(profile).toBeDefined();
  });

  test('should update profile section', async () => {
    const update = await updateProfile('personalInfo', { bio: 'New bio' });
    expect(update).toBeSuccessful();
  });
});
```

### Integration Tests
```typescript
describe('Profile Component Integration', () => {
  test('should render profile with data from Nostr', async () => {
    const { getByText } = render(ProfilePage);
    await waitFor(() => {
      expect(getByText('Profile Stats')).toBeInTheDocument();
    });
  });
});
```

### E2E Tests
```typescript
test('should edit and save profile', async ({ page }) => {
  await page.goto('/profile');
  await page.click('button:text("Edit Profile")');
  await page.fill('[data-testid="bio-input"]', 'New bio content');
  await page.click('button:text("Save Changes")');
  await expect(page.locator('[data-testid="bio-text"]')).toHaveText('New bio content');
});
```

## Performance Considerations

1. **Caching Strategy**
   - Implement aggressive caching for profile data
   - Use service workers for offline access
   - Implement lazy loading for profile sections

2. **Image Optimization**
   - Implement responsive images
   - Use WebP format with fallbacks
   - Implement lazy loading for images

3. **State Management**
   - Use fine-grained reactivity with Svelte 5 runes
   - Implement optimistic updates
   - Batch profile updates

## Security Measures

1. **Data Protection**
   - Implement E2E encryption for sensitive data
   - Use secure key storage
   - Implement rate limiting for profile updates

2. **Access Control**
   - Implement granular privacy settings
   - Verify ownership before updates
   - Implement session management

## Error Handling

```typescript
async function handleProfileError(error: Error): Promise<void> {
  if (error instanceof NostrError) {
    // Handle Nostr-specific errors
  } else if (error instanceof NetworkError) {
    // Handle network-related errors
  } else {
    // Handle general errors
  }
  // Log error and notify user
}
```
