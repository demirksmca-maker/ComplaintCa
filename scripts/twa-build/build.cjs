// CI-only script: builds and signs the Android App Bundle for the ComplaintCA
// TWA (Trusted Web Activity) from the repo's twa-manifest.json.
//
// Runs the same underlying steps as `bubblewrap init` + `bubblewrap build`,
// but calls @bubblewrap/cli's internal (non-interactive) functions directly
// instead of the interactive CLI wizard, since GitHub Actions has no stdin.
// Requires: JAVA_HOME pointing at a JDK 17, and these env vars set from
// repo secrets: ANDROID_KEYSTORE_BASE64, BUBBLEWRAP_KEYSTORE_PASSWORD,
// BUBBLEWRAP_KEY_PASSWORD (bubblewrap itself reads the latter two).
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const core = require('@bubblewrap/core');
const { AndroidSdkToolsInstaller } = require('@bubblewrap/cli/dist/lib/AndroidSdkToolsInstaller');
const { generateTwaProject, generateManifestChecksumFile } = require('@bubblewrap/cli/dist/lib/cmds/shared');
const { build: runBuild } = require('@bubblewrap/cli/dist/lib/cmds/build');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const MANIFEST_FILE = path.join(REPO_ROOT, 'twa-manifest.json');
const ANDROID_DIR = path.join(REPO_ROOT, 'android-twa');
const SDK_DIR = path.join(REPO_ROOT, '.android-sdk');

// Minimal non-interactive stand-in for @bubblewrap/cli's InquirerPrompt.
// Every prompt that build()/generateTwaProject() can actually reach in this
// flow is satisfied without asking (checksum file is pre-generated, so no
// "update project?" prompt; passwords come from env vars, so no password
// prompt). promptPassword throws so a real, unexpected interactive prompt
// fails loudly in CI logs instead of hanging forever.
class AutoPrompt {
  async printMessage(message) { console.log(message); }
  async promptConfirm(_message, defaultValue) { return defaultValue; }
  async promptInput(_message, defaultValue) { return defaultValue; }
  async promptChoice(_message, _choices, defaultValue) { return defaultValue; }
  async promptPassword() { throw new Error('Unexpected interactive password prompt in CI'); }
  async downloadFile(url, filename) {
    console.log('Downloading', url);
    await core.fetchUtils.downloadFile(url, filename, () => {});
  }
}

function run(cmd, env) {
  console.log('$', cmd);
  execSync(cmd, { env, stdio: 'inherit', shell: '/bin/bash' });
}

// Two guesses at the zip's internal layout have both been wrong (this
// sandbox can't download the real zip to check directly — dl.google.com is
// blocked here even though it's reachable from GitHub Actions). Stop
// guessing: search the extracted tree for the real path instead.
function findSdkManager(dir) {
  try {
    return execSync(`find "${dir}" -type f -name sdkmanager 2>/dev/null | head -1`, { encoding: 'utf8' }).trim() || null;
  } catch (e) { return null; }
}

async function ensureAndroidSdk(prompt) {
  fs.mkdirSync(SDK_DIR, { recursive: true });
  let sdkManagerPath = findSdkManager(SDK_DIR);
  if (!sdkManagerPath) {
    const installer = new AndroidSdkToolsInstaller(process, prompt);
    await installer.install(SDK_DIR);
    sdkManagerPath = findSdkManager(SDK_DIR);
  }
  if (!sdkManagerPath) {
    console.error('sdkmanager not found anywhere under', SDK_DIR, '— full tree:');
    run(`find "${SDK_DIR}" -maxdepth 5`);
    throw new Error('Could not locate sdkmanager after installing the Android SDK');
  }
  console.log('Using sdkmanager at', sdkManagerPath);
  fs.chmodSync(sdkManagerPath, 0o755);
  const env = { ...process.env, ANDROID_HOME: SDK_DIR };
  run(`yes | "${sdkManagerPath}" --sdk_root="${SDK_DIR}" --licenses`, env);
  run(`"${sdkManagerPath}" --sdk_root="${SDK_DIR}" "platform-tools" "platforms;android-36"`, env);
}

async function main() {
  if (!process.env.JAVA_HOME) throw new Error('JAVA_HOME is not set (need a JDK 17 install)');
  if (!process.env.ANDROID_KEYSTORE_BASE64) throw new Error('ANDROID_KEYSTORE_BASE64 secret is not set');
  if (!process.env.BUBBLEWRAP_KEYSTORE_PASSWORD || !process.env.BUBBLEWRAP_KEY_PASSWORD) {
    throw new Error('BUBBLEWRAP_KEYSTORE_PASSWORD / BUBBLEWRAP_KEY_PASSWORD secrets are not set');
  }

  fs.mkdirSync(ANDROID_DIR, { recursive: true });

  const prompt = new AutoPrompt();
  const log = new core.ConsoleLog('build-twa');
  const config = new core.Config(process.env.JAVA_HOME, SDK_DIR);

  await ensureAndroidSdk(prompt);

  const twaManifest = await core.TwaManifest.fromFile(MANIFEST_FILE);
  await generateTwaProject(prompt, new core.TwaGenerator(), ANDROID_DIR, twaManifest);
  await generateManifestChecksumFile(MANIFEST_FILE, ANDROID_DIR);

  // The signing key path in twa-manifest.json is "./android.keystore",
  // resolved relative to cwd during signing — restore it there and chdir,
  // since @bubblewrap/cli's build() always runs gradle in process.cwd().
  fs.writeFileSync(path.join(ANDROID_DIR, 'android.keystore'), Buffer.from(process.env.ANDROID_KEYSTORE_BASE64, 'base64'));
  process.chdir(ANDROID_DIR);

  const ok = await runBuild(config, { directory: ANDROID_DIR, manifest: MANIFEST_FILE }, log, prompt);
  if (!ok) throw new Error('bubblewrap build reported failure');

  const aabPath = path.join(ANDROID_DIR, 'app-release-bundle.aab');
  if (!fs.existsSync(aabPath)) throw new Error(`Expected signed AAB not found at ${aabPath}`);
  console.log('Signed AAB ready at', aabPath);
}

main().catch((e) => { console.error(e); process.exit(1); });
