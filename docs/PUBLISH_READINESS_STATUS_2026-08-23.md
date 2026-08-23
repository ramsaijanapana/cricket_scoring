# CricScore Publish Readiness Status

Date: 2026-08-23
Branch: `wip/publish-readiness-classification`
Bundle IDs: `com.cricscore.app` (iOS and Android)

## Decision

The repository-controlled quality gates pass, but CricScore is **not eligible for store submission yet**. The remaining blockers are external product infrastructure, signing, store provisioning, and an Expo SDK migration. No App Store Connect or Google Play submission was attempted because the app records and credentials do not exist.

## Verified repository gates

- `npm run lint`: exit 0; 0 errors and 352 existing warnings.
- `npm test`: 309 tests pass.
- Mobile: 56 tests pass.
- API: 171 tests pass.
- Web: 82 tests pass.
- API TypeScript production build: pass.
- Web production PWA build with Vite 7.3.6: pass.
- Expo export for iOS and Android: pass.
- `npx expo install --check`: dependencies are compatible with Expo SDK 52.

## Release-readiness repairs completed

- Added an ESLint 10 flat configuration and fixed all newly enforced lint errors.
- Repaired Expo monorepo module resolution and made native build configuration self-contained.
- Pinned Expo SDK 52-compatible React Native, NativeWind, Reanimated, Metro, font, and native module versions.
- Upgraded Vitest to 4.1.11 and Vite to 7.3.6.
- Upgraded the API authentication and serving stack, including `@fastify/jwt`, Fastify, `@fastify/static`, Swagger UI, Drizzle ORM, BullMQ, UUID, and Nodemailer.
- Aligned DLS and prediction payloads with the shared snake_case wire contracts.
- Prevented incomplete websocket delivery fragments from being treated as complete score snapshots.
- Preserved missing-file deletion as a no-op while rethrowing other storage failures.

## Security evidence and residual risk

The critical JWT, direct Fastify/static, ORM, mail, Vitest, Vite, and shell parser advisories were remediated and their tests/builds pass.

The final full-monorepo `npm audit` reports 72 dependency findings: 47 moderate, 24 high, and 1 critical. The remaining critical finding is `tar@6.2.1` under the Expo SDK 52 CLI/cacache toolchain. npm identifies Expo 57 as the available fix. Attempts to override tar independently did not change the actual dependency tree, so no ineffective override was retained. This is a build-toolchain exposure, not the patched API runtime, but it must be resolved by a planned Expo SDK migration before calling the app fully publish-ready.

## External blockers

- App Store Connect has no CricScore app record.
- Apple Developer has no registered `com.cricscore.app` bundle ID.
- `extra.eas.projectId` is empty.
- EAS submit fields for Apple app ID, ASC app ID, Apple team ID, and Google service account are empty.
- No Android production keystore or Google Play service-account key is available.
- `https://api.cricscore.app/api/v1` and the configured staging API were unreachable during this audit.
- Store listings, privacy declarations, screenshots, review notes, and billing products are not provisioned in either store.

## Required before submission

1. Provision production and staging API hosts, database, secrets, observability, and health checks.
2. Migrate Expo SDK 52 to a supported patched SDK and rerun the full gate plus native signed builds.
3. Register both bundle/package IDs and create App Store Connect and Google Play app records.
4. Create the EAS project and populate all submit/signing credentials.
5. Configure store metadata, privacy forms, screenshots, support/privacy URLs, age rating, review notes, and billing products.
6. Produce signed release candidates, complete device/billing tests, then upload and submit.
