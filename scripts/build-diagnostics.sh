#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
root="$PWD"
staging="$root/.diagnostics"
mkdir -p "$staging"
payload=$(node -e 'const {createRequire}=require("node:module"); const path=require("node:path"); const r=createRequire(require.resolve("jazz-rn/package.json")); process.stdout.write(path.dirname(r.resolve("jazz-rn-android/package.json")))')
lib="$payload/android/src/main/jniLibs/arm64-v8a/libjazz_native_relay.a"
if [[ "${1:-}" == '--restore' ]]; then
  cp "$staging/original-relay.a" "$lib.restore"
  mv "$lib.restore" "$lib"
else
  if [[ ! -d "$staging/jazz/.git" ]]; then
    git clone --depth 1 --branch v2.0.0-alpha.56 https://github.com/garden-co/jazz.git "$staging/jazz"
  fi
  cd "$staging/jazz"
  if git apply --check "$root/diagnostics/native-terminal-error.patch" 2>/dev/null; then
    git apply "$root/diagnostics/native-terminal-error.patch"
  else
    git apply --reverse --check "$root/diagnostics/native-terminal-error.patch"
  fi
  : "${ANDROID_NDK_HOME:?Set ANDROID_NDK_HOME to your installed Android NDK (tested: 27.1.12297006)}"
  case "$(uname -s)" in Darwin) host_tag=darwin-x86_64;; Linux) host_tag=linux-x86_64;; *) echo 'Use macOS or Linux'; exit 1;; esac
  toolchain="$ANDROID_NDK_HOME/toolchains/llvm/prebuilt/$host_tag/bin"
  export CC_aarch64_linux_android="$toolchain/aarch64-linux-android24-clang"
  export AR_aarch64_linux_android="$toolchain/llvm-ar"
  export CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER="$CC_aarch64_linux_android"
  rustup target add --toolchain 1.93.1 aarch64-linux-android
  cargo +1.93.1 build -p jazz-native-relay --target aarch64-linux-android --release
  [[ -f "$staging/original-relay.a" ]] || cp "$lib" "$staging/original-relay.a"
  cp target/aarch64-linux-android/release/libjazz_native_relay.a "$lib.probe"
  mv "$lib.probe" "$lib"
fi
cd "$root/android"
./gradlew assembleDebug -PreactNativeArchitectures=arm64-v8a
printf '\nInstall android/app/build/outputs/apk/debug/app-debug.apk with adb install -r.\n'
