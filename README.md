# Jazz Android foreground tick reproduction

Small Expo app with Better Auth email/password login, editable to-dos, and editable subtasks. It reproduces `Jazz native foreground runtime failed during tick` on Android. The app uses basic React Native controls and the Jazz session API, with no custom connection management.

## Confirmed cause

On `jazz-tools` / `jazz-rn` **2.0.0-alpha.56**, the native transport classifier treats these connection failures as terminal:

- Android DNS failure in airplane mode: `IO error: failed to lookup address information: No address associated with hostname`. The diagnostic build reports `ErrorKind::Uncategorized`.
- A TLS socket closed without `close_notify` during an idle, online diagnostic capture: `IO error: peer closed connection without sending TLS close_notify`.

The relay worker stores the terminal error. A later foreground tick checks that error and returns `LifecycleFailure` (native status 5), which the React Native bridge exposes as the generic tick error. Ticks are also scheduled by background runtime work; a user edit is not required. `Reconnecting` does not clear the saved terminal error; `Connected` does.

The DNS case was reproduced in **this minimal app**, with a local-first account, one to-do and one subtask. Better Auth is not required for that case. Better Auth signup and the same to-do/subtask writes were separately verified against the included local server. Additional native diagnostic evidence captures the idle TLS failure; this repository's idle variant is provided but has not yet been observed failing. The reason the remote peer closed TLS is unknown; the erroneous promotion of connection loss into a local runtime failure is directly observed.

See [native logs](evidence/native-transport-errors.log), [minimal app logs](evidence/minimal-offline-native-errors.log), and [minimal app screenshot](evidence/minimal-offline-tick.png). The diagnostic patch only adds logging; it does not alter classification, retries, or tick behavior.

Tagged upstream code:

- [Transport classifier](https://github.com/garden-co/jazz/blob/v2.0.0-alpha.56/crates/jazz-native-transport/src/lib.rs#L90-L146)
- [Stored terminal error and event handling](https://github.com/garden-co/jazz/blob/v2.0.0-alpha.56/crates/jazz-native-relay/src/lib.rs#L1011-L1053)
- [Foreground tick guard](https://github.com/garden-co/jazz/blob/v2.0.0-alpha.56/crates/jazz-native-relay/src/lib.rs#L1428-L1443)

The upstream fix needs to classify ordinary DNS/connection loss as retryable without weakening certificate, authentication, or protocol validation. Adding a network listener to the application avoids some triggers but does not address idle TLS connection loss.

## Versions

Pinned dependency versions: Jazz tools, React Native wrapper and native payload **2.0.0-alpha.56**; Better Auth and its Expo plugin **1.7.1**; Expo **57.0.24**; React Native **0.86.3**; React **19.2.3**. All direct app dependencies are pinned and `pnpm-lock.yaml` is included. The only default Jazz patch enables Android 16 KB linker alignment. Native diagnostic logging is opt-in.

Requires Node 22.12+, pnpm 11.19.0, Android SDK/JDK and an ARM64 Android emulator. Tested with Android API 36.1. Use a development build, not Expo Go.

## Install and build

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm exec expo prebuild --platform android --no-install
corepack pnpm android
```

The Android package is `dev.bmoore.jazztickrepro`. The regular Metro port is 8095.

## Better Auth + local Jazz server

Run these in separate terminals, in order:

```sh
corepack pnpm server
corepack pnpm deploy
corepack pnpm auth
corepack pnpm start --localhost
```

Connect the emulator to the local services:

```sh
adb -s emulator-5554 reverse tcp:1625 tcp:1625
adb -s emulator-5554 reverse tcp:3005 tcp:3005
adb -s emulator-5554 reverse tcp:8095 tcp:8095
adb -s emulator-5554 shell am start -n dev.bmoore.jazztickrepro/.MainActivity \
  -a android.intent.action.VIEW \
  -d 'exp+jazz-android-tick-repro://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8095'
```

Create a Better Auth account or sign in, add a to-do and subtask, then edit their titles. Local server credentials in `package.json` and `server.ts` are deliberately fixed test values, not deployment credentials. Bindings and secrets are for local development only. `.data/` contains local test data and is ignored by Git.

**Airplane mode does not sever ADB reverse tunnels.** Use the hosted variant below for the real Android DNS failure. The local backend provides an isolated Better Auth test environment.

## Minimal hosted/offline reproduction

Provision a separate, temporary Jazz namespace and deploy this schema:

```sh
corepack pnpm cloud:provision
corepack pnpm cloud:start
adb -s emulator-5554 reverse tcp:8097 tcp:8097
adb -s emulator-5554 shell am start -n dev.bmoore.jazztickrepro/.MainActivity \
  -a android.intent.action.VIEW \
  -d 'exp+jazz-android-tick-repro://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8097'
```

Credentials are saved in ignored `.credentials/cloud.env`, not printed. Unclaimed hosted apps expire after 14 days. This mode uses the **Create local-first account (control)** button and removes Better Auth from the failing path. The local Better Auth server is configured for the local Jazz namespace; its login buttons are not configured for the hosted namespace.

Then run:

```sh
corepack pnpm repro:offline
```

The script creates a local-first account if needed, adds a to-do/subtask, enables airplane mode and disables Wi-Fi, edits the title, and checks the reproduction app's own logcat PID for the exact tick error. It restores the prior airplane/Wi-Fi settings in `finally`. Exit **1 / RED** means the bug was reproduced; exit **0 / GREEN** means no tick error was seen during the bounded observation; other Python errors are harness failures. The stock build can reproduce the error; the diagnostic build adds its cause to logcat.

After a failed run, force-stop and reopen the app before repeating. For an idle observation with no radio changes:

```sh
python3 scripts/android-repro.py --idle-seconds 1800
```

A green idle run only means no error occurred during that interval. Connection closure timing is not deterministic.

## Native diagnostics

Install Rust 1.93.1 with `rustup`, set `ANDROID_NDK_HOME` (tested with NDK 27.1.12297006), and run:

```sh
bash scripts/build-diagnostics.sh
adb -s emulator-5554 install -r android/app/build/outputs/apk/debug/app-debug.apk
adb -s emulator-5554 logcat -v time 'JazzTickProbe:*' 'ReactNativeJS:*' '*:S'
```

The script clones the exact release tag (`8af685e184c8691a244da1171a51c745a7208e3b`), applies [the logging-only patch](diagnostics/native-terminal-error.patch), builds the ARM64 native library, and replaces only this repository's installed payload before rebuilding. A copy of the stock payload is saved under ignored `.diagnostics/`. To restore and rebuild:

```sh
bash scripts/build-diagnostics.sh --restore
```

Review logs before sharing. The included evidence contains only targeted error messages, timestamps, and process IDs.

## Validation

- `corepack pnpm typecheck` passes.
- Android debug APK built and installed on emulator API 36.1.
- Better Auth signup, to-do creation, and subtask creation work against the local server.
- The hosted local-first control reproduces the exact tick error with both the stock and logging-only native binaries. The stock run also failed before the scripted edit, demonstrating that background ticks can surface the outage. See [stock result](evidence/minimal-stock-result.log).
- Native diagnostics confirm Android DNS `Uncategorized` → terminal event → tick terminal-error guard → generic JS exception.
- Additional native diagnostics confirm idle TLS EOF → terminal event → tick terminal-error guard → generic JS exception.

This repository contains a reproduction and diagnostic evidence, not an application workaround or an upstream fix.
