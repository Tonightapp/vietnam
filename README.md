# Tonight — Nightlife Events Booking App

A React Native + Expo app for discovering and booking nightlife events across Southeast Asia.

## Prerequisites

- Node.js 18+
- Expo CLI: `npm install -g expo-cli`
- iOS Simulator (Xcode, macOS only) or Android Emulator (Android Studio) or a physical device with [Expo Go](https://expo.dev/client)

## Setup

### 1. Clone and install

```bash
git clone <your-repo-url>
cd tonight-app
npm install
```

### 2. Supabase setup

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Go to **Project Settings → API**
3. Copy your **Project URL** and **anon/public key**
4. Create a `.env` file from the example:

```bash
cp .env.example .env
```

5. Fill in your keys:

```
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### 3. Database

1. In your Supabase project, go to **SQL Editor**
2. Paste the contents of `supabase/schema.sql` and run it
3. This creates all tables, RLS policies, and the auto-profile trigger

### 4. Run the app

```bash
npx expo start
```

This opens the Expo Dev Tools. Then:
- Press `i` to open iOS Simulator
- Press `a` to open Android Emulator
- Scan the QR code with Expo Go on your phone

```bash
# Or run directly on a platform:
npx expo start --ios
npx expo start --android
npx expo start --web
```

## Building for Production

### Prerequisites for production builds

- [Expo account](https://expo.dev/) (free)
- EAS CLI: `npm install -g eas-cli`
- Login: `eas login`

```bash
# Initialize EAS
eas build:configure
```

### iOS Build

Requires:
- Apple Developer account ($99/year)
- Enrolled in the Apple Developer Program

```bash
# Build for TestFlight / App Store
npx eas build --platform ios

# Build for simulator (testing only, no Apple account needed)
npx eas build --platform ios --profile preview
```

**App Store submission steps:**
1. Run `eas build --platform ios --profile production`
2. Once the build completes, run `eas submit --platform ios`
3. This uploads to App Store Connect
4. Fill in the app metadata (screenshots, description, etc.) in App Store Connect
5. Submit for Apple review (typically 1–3 days)

### Android Build

```bash
# Build APK / AAB for Play Store
npx eas build --platform android
```

**Play Store submission steps:**
1. Run `eas build --platform android --profile production` (generates .aab)
2. Create an app in [Google Play Console](https://play.google.com/console)
3. Upload the `.aab` file to the Internal Testing track
4. Fill in store listing (screenshots, description, content rating)
5. Submit for Play review (typically a few hours to 3 days)

## Project Structure

```
app/
  _layout.tsx          — Root layout, stack navigator
  (tabs)/
    _layout.tsx        — Bottom tab navigator
    index.tsx          — Home screen
    events.tsx         — Browse events
    search.tsx         — Search
    tickets.tsx        — My tickets
    profile.tsx        — User profile
  event/[id].tsx       — Event detail
  booking/[id].tsx     — Booking flow + ticket confirmation
  (auth)/
    login.tsx          — Login screen
    signup.tsx         — Signup screen

components/
  EventCard.tsx        — Portrait event card
  WideCard.tsx         — Wide event card (festivals)
  Top10Card.tsx        — Row card for top events grid
  DealCard.tsx         — Deal card with countdown
  SectionHeader.tsx    — Section title + "See all"

constants/
  Colors.ts            — Design system colors
  Data.ts              — Mock events, artists, deals, cities

lib/
  supabase.ts          — Supabase client
  storage.ts           — AsyncStorage helpers (tickets, favourites)

supabase/
  schema.sql           — Full database schema
```

## Design System

| Token | Value |
|-------|-------|
| bg | #0a0b14 |
| bg2 | #0f1020 |
| bg3 | #141525 |
| card | #131422 |
| card2 | #1a1b2e |
| green | #00d084 |
| gold | #f5c842 |
| red | #ff3b5c |
| text | #ffffff |
| text2 | #d8dce8 |
| text3 | #9098b8 |

## Tech Stack

- **Expo** ~52 with Expo Router ~4
- **React Native** 0.76
- **Supabase** for auth and database (optional — app works offline with AsyncStorage)
- **expo-linear-gradient** for overlays
- **react-native-qrcode-svg** for ticket QR codes
- **@expo/vector-icons** (Ionicons)

## Notes

- The app is fully functional without Supabase — events use local mock data, tickets are saved to AsyncStorage
- Supabase is only required for auth (login/signup) and cloud ticket sync
- All screens work in offline mode
