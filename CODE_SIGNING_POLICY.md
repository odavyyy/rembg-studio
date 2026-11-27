# Code signing policy

Last updated: 2026-11-27

## Current status

**Rembg Studio builds are not code-signed.** No certificate has been issued to this project and no application for a
code signing program has been approved or submitted. Windows SmartScreen may warn when you run the builds. The
maintainer intends to apply for free code signing for open-source projects; this page will be updated if that
changes.

*Em português: as versões do Rembg Studio ainda não têm assinatura digital, e nenhum pedido foi enviado ou aprovado.*

## Team and roles

The project has a single maintainer.

| Role | Responsibility | Member |
|---|---|---|
| Authors (committers) | Can change the source code without further review | [odavyyy](https://github.com/odavyyy) |
| Reviewers | Review every change proposed by non-committers, including CI and build scripts | [odavyyy](https://github.com/odavyyy) |
| Approvers | Manually approve each signing request | [odavyyy](https://github.com/odavyyy) |

All team members must use multi-factor authentication for the source repository and for any signing service. No one
else has been given write access.

## Source, review and build

- Source: <https://github.com/odavyyy/rembg-studio>. Releases are built from a version tag.
- Contributions from others arrive as pull requests and are reviewed before merging. Most of the code was written
  with AI assistance under the maintainer's direction (see the README).
- **Today:** release builds are made on the maintainer's computer from a clean copy of the tagged source
  (`npm ci`, `npm run dist`) and tested there with `tests/e2e.mjs` and `tests/update-e2e.mjs`.
- **Planned for signing:** `.github/workflows/release.yml` builds on GitHub-hosted runners from the tag. The GPU
  tests cannot run there. Signing through this workflow has never been run.
- Dependencies are pinned by `package-lock.json`.

## Planned signing process

This applies only if a signing service accepts the project:

1. A version tag is pushed. The GitHub-hosted workflow builds the unpacked app.
2. The project's own executable (`Rembg Studio.exe`) is submitted for signing. A maintainer approves the request
   manually.
3. The installer, portable and ZIP packages are produced from the signed app; the installer and portable executables
   are submitted and approved the same way.
4. The workflow checks every signature with `Get-AuthenticodeSignature`, generates `SHA256SUMS.txt` and creates a
   **draft** release. A maintainer reviews and publishes it by hand.

Rules: only binaries built by this project from this repository are submitted. Third-party binaries (Electron,
Chromium, FFmpeg libraries) are **not** signed with the project's signature. Product name is `Rembg Studio` and the
product version matches the tag in every signed file. The uninstaller embedded in the NSIS installer is not signed
by this process.

## Credential security

- The repository contains no certificates, keys or tokens.
- A signing service token, if issued, will be stored only as a secret of a protected GitHub environment named
  `signing`, with manual approval required.
- Signing jobs run only for version tags of this repository, never for pull requests.

## Verifying your download

Today:

```powershell
Get-FileHash .\RembgStudio-1.1.0-portatil.exe -Algorithm SHA256
```

Compare the value with `SHA256SUMS.txt` on the official release page. This detects damaged or altered downloads, but
because the checksums are published next to the files, it does not protect against a compromised repository or
account.

Once signed builds exist:

```powershell
Get-AuthenticodeSignature .\RembgStudio-1.1.0-portatil.exe | Format-List Status, SignerCertificate
```

`Status` must be `Valid` and the signer must be the one announced on this page. Until a signer is announced here,
treat any claim that a build is officially signed as unverified.

The in-app updater applies this rule automatically once a signed version is installed: it then refuses updates that
are not validly signed by the same signer.

## Privacy

This program will not transfer any information to other networked systems unless specifically requested by the user
or the person installing or operating it. See the [privacy policy](PRIVACY.md), which also lists the third-party
services and components involved.

## Installation, system changes and removal

- The installer (per user, no administrator rights) copies the app, creates Start menu and desktop shortcuts and an
  uninstall entry. Remove it from **Windows Settings → Apps**.
- The portable and ZIP versions install nothing: delete the files to remove them.
- User data in `%APPDATA%\Rembg Studio` is kept; delete the folder if you want it gone.
- The app does not install or change Python, rembg, CUDA, drivers or models.

## Reporting a problem

Open a [GitHub issue](https://github.com/odavyyy/rembg-studio/issues). Do not include personal data. A private
channel for security reports is not set up yet.
