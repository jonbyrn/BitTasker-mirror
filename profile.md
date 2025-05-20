# Profile GraphQL Operations

## Types

```graphql
type User {
  id: ID!
  professionalTitle: String
  profileDescription: String
  videoIntro: VideoIntroData
  availability: AvailabilityData
  standardServices: StandardServicesData
  # ... other user fields
}

type FileUploadResponse {
  key: String!
  url: String!
  mimeType: String
  filename: String
}

type VideoIntroData {
  video: FileUploadResponse!
  thumbnail: FileUploadResponse!
  duration: Float!
}

type AvailabilityData {
  timeSlots: [TimeSlot!]!
  timezone: String!
  noticeHours: Int!
  maxBookingsPerDay: Int!
  breakBetweenBookings: Int!
}

type TimeSlot {
  day: Int!
  start: String!
  end: String!
}

type StandardServicesData {
  services: [ServiceOption!]!
  currency: String!
  customQuoteAvailable: Boolean!
  minimumBookingDuration: Int!
}

type ServiceOption {
  id: ID!
  name: String!
  description: String!
  duration: Int!
  price: Float!
  isCustomizable: Boolean!
}

# Input Types
input UpdateUserProfileInput {
  professionalTitle: String
  profileDescription: String
  videoIntro: VideoIntroInput
  availability: AvailabilityInput
  standardServices: StandardServicesInput
}

input FileUploadInput {
  key: String!
  url: String!
  mimeType: String
  filename: String
}

input VideoIntroInput {
  video: FileUploadInput!
  thumbnail: FileUploadInput!
  duration: Float!
}

input AvailabilityInput {
  timeSlots: [TimeSlotInput!]!
  timezone: String!
  noticeHours: Int!
  maxBookingsPerDay: Int!
  breakBetweenBookings: Int!
}

input TimeSlotInput {
  day: Int!
  start: String!
  end: String!
}

input StandardServicesInput {
  services: [ServiceOptionInput!]!
  currency: String!
  customQuoteAvailable: Boolean!
  minimumBookingDuration: Int!
}

input ServiceOptionInput {
  id: ID!
  name: String!
  description: String!
  duration: Int!
  price: Float!
  isCustomizable: Boolean!
}
```

## Queries

```graphql
query GetUserProfile($userId: ID!) {
  user(id: $userId) {
    id
    professionalTitle
    profileDescription
    videoIntro {
      video {
        url
        key
        mimeType
        filename
      }
      thumbnail {
        url
        key
        mimeType
        filename
      }
      duration
    }
    availability {
      timeSlots {
        day
        start
        end
      }
      timezone
      noticeHours
      maxBookingsPerDay
      breakBetweenBookings
    }
    standardServices {
      services {
        id
        name
        description
        duration
        price
        isCustomizable
      }
      currency
      customQuoteAvailable
      minimumBookingDuration
    }
  }
}
```

## Mutations

```graphql
mutation UpdateUserProfile($input: UpdateUserProfileInput!) {
  updateUserProfile(input: $input) {
    id
    professionalTitle
    profileDescription
    videoIntro {
      video {
        url
        key
        mimeType
        filename
      }
      thumbnail {
        url
        key
        mimeType
        filename
      }
      duration
    }
    availability {
      timeSlots {
        day
        start
        end
      }
      timezone
      noticeHours
      maxBookingsPerDay
      breakBetweenBookings
    }
    standardServices {
      services {
        id
        name
        description
        duration
        price
        isCustomizable
      }
      currency
      customQuoteAvailable
      minimumBookingDuration
    }
  }
}
```

## Usage in Components

### VideoIntro Component

```typescript
// First, upload files using the upload service
const uploadedVideo = await uploadService.uploadSingleFile(videoFile, 'videos');
const uploadedThumbnail = await uploadService.uploadSingleFile(thumbnailFile, 'thumbnails');

// Then update profile with the upload responses
const result = await profileStore.mutate({
  input: {
    videoIntro: {
      video: {
        key: uploadedVideo.key,
        url: uploadedVideo.url,
        mimeType: uploadedVideo.mimeType,
        filename: uploadedVideo.filename
      },
      thumbnail: {
        key: uploadedThumbnail.key,
        url: uploadedThumbnail.url,
        mimeType: uploadedThumbnail.mimeType,
        filename: uploadedThumbnail.filename
      },
      duration: videoDuration
    }
  }
});
```