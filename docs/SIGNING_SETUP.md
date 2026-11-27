# Signing setup (only after a signing application is approved)

Nothing here is active. The project has no certificate, token or approval. See
[CODE_SIGNING_POLICY.md](../CODE_SIGNING_POLICY.md).

The signing steps of `.github/workflows/release.yml` have **never been run**. Without `SIGNPATH_ENABLED` it builds the
unsigned packages and creates a draft release.

## After approval

1. Turn on multi-factor authentication for GitHub and SignPath.
2. In SignPath: add the GitHub.com trusted build system, link it to the project, install the SignPath GitHub App,
   and require manual approval and origin verification for the release signing policy.
3. Create two artifact configurations (the root element is the zip that GitHub Actions creates):
   - **app**: signs only `Rembg Studio.exe`;
   - **wrappers**: signs only `RembgStudio-Setup-*.exe` and `RembgStudio-*-portatil.exe`.

   Add file metadata restrictions: product name `Rembg Studio`, and the same product version for every file. Check
   the current SignPath artifact configuration reference when writing them; they are not drafted here.
4. In the GitHub repository:
   - create an environment named `signing` with **required reviewers**, and limit it to version tags;
   - add the secret `SIGNPATH_API_TOKEN` **to that environment**;
   - add variables `SIGNPATH_ENABLED` (`true`), `SIGNPATH_ORGANIZATION_ID`, `SIGNPATH_PROJECT_SLUG`,
     `SIGNPATH_SIGNING_POLICY_SLUG`, `SIGNPATH_APP_ARTIFACT_CONFIGURATION`,
     `SIGNPATH_WRAPPERS_ARTIFACT_CONFIGURATION`.
5. Protect `main` and version tags with rulesets.
6. Add the attribution text SignPath requires to the code signing policy and README, **only after approval**.
7. Run a test tag with the test signing policy first and verify the signatures on a clean computer.

## Questions to ask SignPath

- `Rembg Studio.exe` is the official Electron executable with this project's name, icon and version resources. Is
  signing it acceptable under "sign your own binaries only"?
- The packages include unsigned upstream libraries (Electron/Chromium, FFmpeg). The NSIS uninstaller embedded in
  the installer is not signed by this flow. Is that acceptable?
- The app uses a rembg installation provided by the user, which may include NVIDIA's proprietary CUDA libraries
  (not distributed by this project), and can download models under restrictive licenses (BRIA RMBG 2.0). Does this
  affect eligibility?
