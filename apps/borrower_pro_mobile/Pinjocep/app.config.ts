import type { ConfigContext, ExpoConfig } from 'expo/config';

// Shared mobile code (Expo Router routes, components, lib, brand, assets) lives one level up at
// `apps/borrower_pro_mobile/`. This per-client app only carries identity + native config; keep the
// shared bits (router `root`, `../assets/*` paths, plugins, experiments) in sync with sibling clients.
// Mirrors the web app `apps/borrower_pro/Pinjocep`. Brand is selected at bundle time via
// `EXPO_PUBLIC_CLIENT_ID=pinjocep` (see `.env.example` and `brand/active.ts`).

/** Hostname only (no scheme), same as the deployed borrower web app — enables Universal / App Links when set. */
function universalLinkHost(): string | undefined {
  const raw = process.env.EXPO_PUBLIC_UNIVERSAL_LINK_HOST?.trim();
  if (!raw) return undefined;
  return raw.replace(/^https?:\/\//i, '').replace(/\/$/, '');
}

export default function appConfig(_context: ConfigContext): ExpoConfig {
  const linkHost = universalLinkHost();

  return {
    name: 'Pinjocep',
    slug: 'Pinjocep',
    version: '1.0.0',
    orientation: 'portrait',
    icon: '../assets/images/icon.png',
    scheme: 'pinjocep',
    userInterfaceStyle: 'automatic',
    ios: {
      /** Required for `expo prebuild` / `expo run:ios` — cannot be inferred when using dynamic `app.config.ts`. */
      bundleIdentifier: 'com.anonymous.Pinjocep',
      icon: '../assets/expo.icon',
      ...(linkHost ? { associatedDomains: [`applinks:${linkHost}`] } : {}),
    },
    android: {
      package: 'com.anonymous.pinjocep',
      adaptiveIcon: {
        backgroundColor: '#E6F4FE',
        foregroundImage: '../assets/images/android-icon-foreground.png',
        backgroundImage: '../assets/images/android-icon-background.png',
        monochromeImage: '../assets/images/android-icon-monochrome.png',
      },
      predictiveBackGestureEnabled: false,
      ...(linkHost
        ? {
            intentFilters: [
              {
                action: 'VIEW',
                autoVerify: true,
                data: [
                  { scheme: 'https', host: linkHost, pathPrefix: '/reset-password' },
                  { scheme: 'https', host: linkHost, pathPrefix: '/verify-email' },
                ],
                category: ['BROWSABLE', 'DEFAULT'],
              },
            ],
          }
        : {}),
    },
    web: {
      output: 'static',
      favicon: '../assets/images/favicon.png',
    },
    plugins: [
      // Routes live in the shared `apps/borrower_pro_mobile/app` directory (one level up).
      ['expo-router', { root: '../app' }],
      'expo-video',
      [
        'expo-notifications',
        {
          icon: '../assets/images/android-icon-monochrome.png',
          color: '#208AEF',
          sounds: [],
        },
      ],
      [
        'expo-splash-screen',
        {
          backgroundColor: '#208AEF',
          android: {
            image: '../assets/images/splash-icon.png',
            imageWidth: 76,
          },
        },
      ],
      ['expo-video'],
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },
  };
}
