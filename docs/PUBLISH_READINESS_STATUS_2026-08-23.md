# CricScore publish-readiness status - 2026-08-23

Classification: **NOT AN ACTIVE STORE SUBMISSION - EXTERNAL PRODUCT/INFRASTRUCTURE SETUP REQUIRED**

This repository is a separate CricScore product. It is not one of the three Devara Ventures apps currently submitted to Apple review. No upload, App Store record creation, or production deployment was performed during this audit.

## Evidence

- Mobile identity: `CricScore` 1.0.0, iOS and Android identifier `com.cricscore.app`.
- App Store Connect contains no app for `com.cricscore.app`.
- Apple Certificates, Identifiers & Profiles contains no registered bundle ID for `com.cricscore.app`.
- `apps/mobile/app.config.ts` has an empty EAS project ID and uses `https://u.expo.dev/cricscore`, which cannot identify a real EAS project until the app is linked.
- `apps/mobile/eas.json` has empty `appleId`, `ascAppId`, `appleTeamId`, and Android service-account path values.
- The configured production and staging API health hosts, `api.cricscore.app` and `staging-api.cricscore.app`, were unreachable during the 2026-08-23 audit.
- The repository contains no App Store/Play listing metadata, final screenshot packet, or store privacy submission evidence for this product.
- No private Android release keystore or Google Play service-account credential was available in the authorized local release assets.

## Required gates before store work

1. Deploy and validate the production API, database, real-time services, public web origin, backups, and rollback procedure.
2. Confirm the final bundle/package identifier, then register it with Apple and Google and create the corresponding store records.
3. Link a real EAS project or establish a reproducible local native signing lane; replace all empty submit identifiers with secret-backed release configuration.
4. Create and approve support/privacy URLs, privacy labels/data safety, age rating, listing copy, screenshots, review contact, export compliance, and availability.
5. Create Android release signing and Play service-account credentials outside Git.
6. Run unit, integration, native archive/bundle inspection, physical-device, and production-backend end-to-end gates against one immutable candidate.

Creating a store record or uploading the current mobile shell before these gates would turn known infrastructure placeholders into a review submission. That is intentionally prohibited.
