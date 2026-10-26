# Compatibility report — October 26, 2026

Status: production implementation and local VSIX; automated checks pass. Both the prototype and final production Ctrl+click after reload passed with user confirmation in the real default profile. Installation, uninstall, upgrade and source-modification instructions are in README.md. This extension has not been published to the Marketplace.

## Environment verified during implementation

VS Code **1.143.1**, x64, commit **e646868227c3e3a9e3f24277c8c7220be42c0be7**. The current CLI inventory, package manifests and extension-host availability/activation were checked independently of SPEC.md's recorded inventory.

| Extension | Current version | Observed test state |
| --- | --- | --- |
| Built-in Markdown language features | 10.0.0, bundled | Active in all gate/production tests |
| Markdown All in One | 3.6.3 | Active in gate/production tests and available in real default profile |
| markdownlint | 0.62.1 | Globally disabled in default profile; active in temporary compatibility hosts |
| Markdown Mermaid | 1.32.1 | Globally disabled in default profile; active in temporary compatibility hosts |
| Codex | 26.1021.22027 | Available in default profile; active in production integration hosts |
| Claude Code | 2.1.310 | Available in default profile; active in production integration hosts |
| PDF Preview | 1.2.2 | Active in integration; repaired PDF opens in `pdf.preview` |
| Code Spell Checker | 4.9.3 | Available in default profile; active in gate hosts |
| Paragraph Writing Support | 1.0.0 | Available in default and gate hosts |
| PlantUML | 2.18.1 | Globally disabled in default profile; active in gate hosts |
| Graphviz Preview | 1.7.5 | Available in default and gate hosts |

The CLI also verified Remote WSL 1.104.6, SSH 0.128.0 and Containers 0.469.0. No live remote window was tested. Global enablement was read from the profile's extension enablement record; no enable/disable changes were made there. An extension being installed or available is not proof its features were exercised.

## Feasibility and chosen integration

The minimal probe uses the stable `DocumentLinkProvider` API with a Markdown/file selector and a corrected `Uri.file` target. Both early registration (before Markdown activation) and late registration (after the Markdown extensions activate) produced one corrected merged link on this installed version. Disposing the probe restored the original document-directory-prefixed malformed URI. Each test used a real file fixture; no Markdown source edits occurred.

The user manually Ctrl+clicked the original native destination in the real default-profile development window and confirmed **“Opened once, no error.”** The local event log records one target document open, one target tab opening, unchanged source version/text/disk and a clean Markdown document. See `evidence/manual-live-gesture.json` and `evidence/manual-live-provider.json`. The early prototype's `liveProfile` field used fixture-directory naming and incorrectly says false for this launch; the launch actually omitted `--user-data-dir`. Its extension availability also reflects the real profile's three disabled extensions. This annotation corrects that instrumentation limitation without rewriting the raw evidence.

The production provider emits a command URI for its internal guarded follow handler. The normal source-editor gesture executes that target. The handler rereads the still-open document's current source candidates, normalizes the original destination, performs asynchronous file access validation, and invokes `vscode.open`. It never parses an already malformed competing URI to recover a drive letter.

For the final production check, the user reloaded the visible development window, closed the target, returned to the unchanged source fixture and Ctrl+clicked its native path again. The user confirmed **“Opened once; fixture stayed clean.”** This confirms the final guarded follow handler through the actual gesture after reload in the real profile. This result is user-reported; the prototype event log is not presented as production instrumentation. See `evidence/manual-production-confirmation.json`.

The installed editor's merge implementation removes intersecting/touching ranges according to provider ranking. Its reference-link results can retain overlapping entries when a contributing result is unsorted. Therefore merely finding the repaired command URI in `executeLinkProvider` is insufficient. Production tests additionally place the caret at both reference identifiers and the definition and run the editor's own `editor.action.openLink`, verifying its routing opens the correct target. This exercises the editor lookup used by link following, but is recorded as an automated editor-routing check, not a manual mouse gesture.

There is no public API promise of precedence over arbitrary future providers. No exclusive/proposed selector, installed-file patch, provider monkey-patch, mouse listener, or global editor-links change is used. These results establish compatibility on the tested version/configuration; rerun the gate after provider/editor updates. The original malformed link's contributing provider remains unattributed.

## Results

| Check | Result |
| --- | --- |
| TypeScript build | Pass |
| Unit tests | 8 suites pass: host abstention, classification, source offsets, native characters, references/recovery, exclusions, cancellation, large-file analysis |
| Performance | Approximately 280 ms for a ~270 KB source fixture in the Node unit run; cached per open-document version, no workspace scans or filesystem access during analysis |
| Early/late activation | Both pass with built-in Markdown, All in One, markdownlint and Mermaid active |
| Actual real-profile prototype Ctrl+click | User-confirmed pass; exactly one recorded target document open |
| Actual real-profile production Ctrl+click after reload | User-confirmed pass: opened once; source fixture stayed clean |
| Production handler/combined links | Pass with all required Markdown extensions active in temporary profiles |
| Production reference editor routing | Pass despite retained competing reference ranges |
| Native URI round trips | Pass: drive/slash variants, percent/hash/Unicode/parentheses and UNC authority/share |
| File URI preservation | Pass: explicit URI percent escapes and fragment remain URI semantics; provider abstains |
| Document preservation | Pass: CRLF/LF, clean version, unsaved edits and unchanged on-disk source |
| Nondefault encoding | Pass: Windows-1252 content and original CRLF bytes remain unchanged |
| Missing file | Pass: no target document, placeholder, or parent-directory creation |
| Configured PDF association | Pass: explicit file URI and repaired native path both select `pdf.preview` |
| Single-folder, two-root, loose/outside-workspace source/target | Pass |
| Disable/re-enable setting | Pass: only repair links removed/restored, ordinary provider links remain |
| Unsupported host policy | Unit pass: Linux/macOS and WSL/SSH/container remote names abstain |

`evidence/gate-early.json`, `evidence/gate-late.json`, `evidence/integration-single-root.json` and `evidence/integration-multi-root.json` contain the local measurements. The last multi-root run includes the encoding check; the earlier single-root run predates that added assertion.

## Remaining coverage and limits

- Manual all-enabled-profile mouse gestures and visual checks of Mermaid/preview, TOC, paste/formatting, editing selections and Codex/Claude webviews have not been signed off. Those extensions remained available/active in automated coexistence tests. No webview interception is implemented.
- The environment's GUI automation cannot hold Ctrl while clicking a Windows native app, and separately launched test profiles may not be visible on the interactive desktop. The test-only observer and manual runner are supplied for a user-launched interactive verification.
- No reachable UNC server was available: URI authority/share construction is tested, real network-share success/failure latency is not. Access checks time out after five seconds.
- Actual remote windows are unsupported, not a claimed compatibility success. UI-host placement plus remote-name/file-scheme checks abstain there. Untitled/untrusted/virtual documents also abstain.
- Blockquotes are conservatively treated as examples. Ambiguous drive-relative paths and native `:line` suffixes are diagnosed, not guessed. No native filesystem paths outside Markdown links are claimed.
- A native destination whose trailing whitespace/parentheses can also be read as a Markdown title should use angle brackets to disambiguate. Existing files/directories are never created by link following.

Public API references: [DocumentLinkProvider and URI/opening APIs](https://code.visualstudio.com/api/references/vscode-api), [executeLinkProvider](https://code.visualstudio.com/api/references/commands). Merge behavior was checked against the local installed editor bundle and the [VS Code source implementation](https://github.com/microsoft/vscode/blob/main/src/vs/editor/contrib/links/browser/getLinks.ts); main-branch source alone was not treated as proof of the installed version.
