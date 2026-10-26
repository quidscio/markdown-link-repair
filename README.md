# Markdown Link Repair

Personal Windows VS Code extension. Ctrl+click the existing destination in a Markdown source link such as `[Report](C:\reports\comparison.html)`. The destination is repaired in memory, checked asynchronously, and passed to VS Code's normal opener. No conversion, paste operation, document edit, clipboard change, or save is involved.

## Install

In a normal VS Code window, select the **Default** profile, run **Extensions: Install from VSIX…**, and select `markdown-link-repair-0.1.0.vsix` from this repository. Run **Developer: Reload Window** if requested. Open a local, trusted Markdown file and Ctrl+click a native Windows destination. A development window is not needed after installation.

Equivalent PowerShell command (use the matching VSIX filename for a later version):

```powershell
code --profile "Default" --install-extension "C:\q\arc\projects\vscode\markdown-link-repair\markdown-link-repair-0.1.0.vsix"
code --profile "Default" --list-extensions --show-versions | Select-String '^local\.markdown-link-repair@'
```

The extension identifier is `local.markdown-link-repair`. Installation in Default does not automatically install it into other named profiles. Existing Markdown extensions and their settings do not need changing.

## Disable or uninstall

To remove it, disable or uninstall **Markdown Link Repair** in Extensions. No document changes, global editor-link settings, or changes to other extensions need undoing. The extension owns no persistent storage. Optional user settings can be removed manually if you set them.

For a temporary pause, set `markdownLinkRepair.enabled` to `false`, or choose **Disable** on this extension's gear menu. To remove it from Default using PowerShell:

```powershell
code --profile "Default" --uninstall-extension local.markdown-link-repair
```

Reload the affected normal window if requested. A separately running development host can still load the source copy until that development window is closed.

## Upgrade or reinstall

Install the newer VSIX through **Extensions: Install from VSIX…**, or use the command below. Keep the same publisher/name so it replaces this extension. Reload the affected windows, then verify the listed version.

```powershell
code --profile "Default" --install-extension "C:\path\to\markdown-link-repair-0.1.1.vsix" --force
code --profile "Default" --list-extensions --show-versions | Select-String '^local\.markdown-link-repair@'
```

This private VSIX has no Marketplace release feed; build or obtain a newer VSIX and install it manually. Keep the previous VSIX for rollback; it can be reinstalled with the same `--force` command.

## Modify the source

Edit this repository rather than files under `.vscode\extensions`, where reinstalling would overwrite changes:

| File | Purpose |
| --- | --- |
| `src/extract.ts` | Markdown-aware parsing, native-path recovery, source ranges |
| `src/normalize.ts` | Destination classification and URI construction |
| `src/extension.ts` | Link provider, guarded opening, settings and diagnostics |
| `src/host.ts` | Local Windows / remote-host eligibility |
| `test/unit.cjs`, `src/integration.ts` | Automated behavior checks |
| `package.json` | Version, extension identity, commands and settings |

From a local PowerShell terminal:

```powershell
Set-Location "C:\q\arc\projects\vscode\markdown-link-repair"
npm ci
# Edit the source files, then:
npm test
npm run test:gate
npm run test:integration
# Optional two-root verification:
node scripts/run-integration.cjs --multi-root
# Optional actual gesture test in a development host:
node scripts/run-manual.cjs
```

After confirming the behavior, increment the version and package it:

```powershell
npm version patch --no-git-tag-version
npm run package
# Install the newly generated versioned VSIX using the upgrade instructions.
```

The packaging script derives the VSIX filename from `package.json`. Compiling source alone does not update the installed extension: package and reinstall it, then reload normal VS Code windows. Recheck Ctrl+click after changes; provider routing depends on the tested editor/extensions. See the compatibility report for remaining test coverage.

## Scope

- Local, trusted Windows windows with file-backed Markdown, including loose files and multiple workspace roots. Remote, macOS/Linux, virtual, and untitled documents abstain.
- Inline links, angle destinations, optional titles, reference definitions and full/collapsed/shortcut reference uses. Recovery for native Windows syntax uses Markdown tokenizer positions, with an equal-length shadow parse for malformed native reference definitions.
- Native drive paths, forward-slash drive paths, `/C:/` variants and UNC shares. Native `%` and `#` are filename characters. Prefer angle destinations for paths containing spaces or ambiguous title punctuation.
- Explicit `file:` URIs, relative links, headings, web/mail/other schemes, images, HTML, inline/fenced/indented code and blockquote examples are left to existing behavior. No preview-renderer changes.
- Drive-relative paths and `:line` suffixes are not guessed. The diagnostic command reports their classification. Missing files, directories, inaccessible shares and five-second access timeouts show an error and create nothing.

VS Code handles the follow-link modifier itself, including a changed multi-cursor modifier. PDF/custom editor associations use the normal `vscode.open` path. A generated internal command URI implements the guarded open step during Ctrl+click; it is not a separate user-facing Open command.

## Controls

`markdownLinkRepair.enabled` defaults to `true` and supports resource settings. `markdownLinkRepair.debug` defaults to `false` and logs only local analysis counts.

**Markdown Link Repair: Diagnose Current Document** writes source link ranges, native destinations, classifications, normalized URIs, host/version context and available/active relevant extension versions to a local Output channel. It does not dump document text or identify which provider produced a competing link. Paths remain local. There is no telemetry or network service.

## Build and verify

Requires Node.js/npm and the installed Windows VS Code. From this directory:

```powershell
npm ci
npm test
npm run test:gate
npm run test:integration
npm run package
```

`test:gate` uses a separate minimal probe extension, real native fixtures, the installed extensions directory, and two temporary VS Code profiles. It asserts corrected merged-link targets with registration before and after Markdown activation; disposing the probe restores the malformed baseline.

`test:integration` loads the production extension in a temporary trusted test process with all installed extensions available. It checks URI round trips, combined links, editor follow-link routing, exactly-once target opening, CRLF/unsaved-state preservation, missing files, PDF associations, disabling/re-enabling, and loose files with outside-workspace targets. Its direct follow-handler tests are not represented as mouse-gesture tests.

`node scripts/run-manual.cjs` opens a production gesture fixture and test-only observer in a temporary all-enabled profile. Add `--live` to use the actual default profile without changing extension enablement. In that window Ctrl+click the first native destination, then the `r` identifier in `[Reference][r]`. The observer records opens and unchanged source state in `.gate-runtime/production-manual/manual-result.json`. Reload and repeat to test the final build. GUI launch visibility may depend on the environment that starts VS Code; running this command from your own Windows terminal ensures an interactive window.

Temporary profiles, logs, fixtures and npm cache live in ignored directories. Do not commit them: profile copies can contain local settings. Close test windows before removing `.gate-runtime`. The packaged VSIX contains only production JavaScript, manifest and documentation, not test extensions or fixtures.

See [COMPATIBILITY.md](COMPATIBILITY.md) for measured results and outstanding manual/environment coverage. Provider merge precedence is version-sensitive; rerun the gate after VS Code or Markdown provider updates.
