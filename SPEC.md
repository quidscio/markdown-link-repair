# Specification: Markdown Ctrl+click link repair

Status: implementation handoff, October 26, 2026.

## 1. Problem and confirmed evidence

The user opens Markdown in VS Code on Windows. A link containing a bare absolute Windows path fails when clicked, although File > Open opens the same target. Replacing its destination with a file:/// URI works.

Reproduction, with a generic fixture path:

```markdown
[link                                ](C:\fixtures\reports\comparison.html)
```

During debugging, the document-link object already contained a file URI whose path combined the Markdown document/workspace directory with the entire absolute Windows path, for example:

```text
/c:/fixtures/notes/C:\fixtures\reports\comparison.html
```

The bad path was present in both `_link.url.path` and the result of `link.resolve()` before the ordinary file opener ran. The editor's string-only relative-URI handling did not generate it in the observed call. The call stack passed through `links.ts` and `mainThreadLanguageFeatures.ts`, indicating an editor document-link provider registered through the extension-host bridge. The specific contributing extension was not identified. Do not assert that Codex, Markdown All in One, or the built-in Markdown extension caused the bug without further evidence.

The screenshot identified a Markdown source link, not an HTML anchor in a chat webview. Repairing arbitrary third-party chat webviews is outside this first release.

## 2. Primary behavior

The user Ctrl+clicks the normal clickable range of a local Markdown link. The extension supplies a corrected URI and lets VS Code open that resource. Preserve the configured follow-link modifier if the user changes VS Code's modifier settings.

Normalization is transient. Do not replace document text, modify the clipboard, create an undo entry, save the document, or silently change extension settings. No separate command, hover action, preview action, or conversion step is required.

When the target is missing, report the normalized destination and the failure. Do not create a placeholder file or offer creation as the default action. Existing nontext files must use configured editor associations instead of being forced through a text editor. HTML should follow the user's normal VS Code opening behavior; do not force a browser launch.

## 3. Architecture and feasibility gate

Use TypeScript and stable VS Code extension APIs. Separate Markdown target extraction, path classification/normalization, and editor integration so the normalization logic can be tested independently.

Investigate a narrowly scoped DocumentLinkProvider for Markdown. This is the intended way to participate in the editor's follow-link gesture, rather than attaching DOM mouse listeners. However, the API permits multiple link providers and merges their results. Do not assume registration order or selector specificity guarantees that this extension's overlapping link wins. The exact duplicate-range and overlapping-range behavior must be proven on the target VS Code version.

Before building the full implementation:

1. Create a minimal Windows reproduction with a real fixture target and an unchanged bare-path Markdown link.
2. Query the combined document links using `vscode.executeLinkProvider` and record ranges and targets before and after registering the prototype. This command does not necessarily identify the originating provider; do not claim that it does.
3. Test actual Ctrl+click with built-in Markdown and the user's Markdown extensions enabled. Verify exactly one successful open, no parallel bad-target open, and no dirty document.
4. Repeat after reload and changes in extension activation timing. Avoid relying on accidental provider order.
5. If overlapping providers prevent reliable routing, stop at the feasibility gate. Document whether a narrowly scoped, supported integration or upstream provider fix is required. Obtain a separate decision before disabling features or using unsupported hooks.

A diagnostic command may be included, but a command-only workaround does not meet the goal. Do not monkey-patch VS Code internals, another extension's exports, or installed extension files. Do not depend on minified class names or debugger handle numbers.

## 4. Link parsing

Support inline Markdown links and reference-style links, including angle-bracket destinations and optional titles. Use a Markdown-aware parser/tokenizer with source-position mapping, supplemented by narrowly scoped recovery for bare Windows destinations that an ordinary parser does not recognize. A regex over the entire document is insufficient.

Preserve labels, padding, optional titles, reference identifiers, and source ranges. Repeated reference uses must resolve to the same corrected target. Fenced code blocks, inline code, and HTML comments are examples, not active repair candidates. Do not interpret a quoted example of a link as a navigable Markdown link.

Raw paths outside Markdown links, Markdown image rewriting, HTML anchor rewriting, and preview-renderer changes are deferred. Existing behavior for those constructs must not regress.

## 5. Normalization contract

Classify the original source destination before any document-relative resolution. Never repair a malformed provider result by searching for a second drive letter and discarding its prefix: re-read the actual Markdown destination instead.

| Source destination | Required treatment |
| --- | --- |
| `C:\fixtures\report.html` | Absolute Windows file path; construct a file URI without adding a base directory. |
| `C:/fixtures/report.html` | Same absolute Windows path semantics. |
| `/C:/fixtures/report.html` | Recognize the drive-prefixed variant narrowly; do not reinterpret ordinary POSIX paths this way. |
| `file:///C:/fixtures/report.html` | Preserve the already valid file URI; do not double-encode. |
| `C:\My Reports\report #1.html` in an angle-bracket destination | Encode spaces and literal filename `#` when constructing the URI. |
| `C:\fixtures\100% complete.html` | Treat raw path percent characters as filename characters, not pre-encoded URI escapes. |
| `\\server\share\report.pdf` | Construct a UNC file URI with server authority; preserve the share. |
| `./report.html`, `../report.html` | Leave ordinary relative-link behavior to the existing provider; no claim over these links in the initial release. |
| `#heading`, `https://example.com`, `mailto:user@example.com` | Leave untouched. |
| `C:report.html` | Ambiguous drive-relative form; do not guess an absolute target. |
| `vscode:`, `command:`, other schemes | Do not reinterpret or execute as local paths. |

Use `vscode.Uri.file` for native absolute paths in the supported Windows host environment and URI parsing for existing URIs. Serialize through the URI API; avoid manual `file:///` concatenation or blanket slash replacement. Verify percent encoding, Unicode, parentheses, spaces, and literal hash characters with round-trip tests.

For a bare filesystem path, a `#` belongs to the filename. For an explicit URI, preserve its URI fragment. Do not invent `:line` or `:line:column` parsing in v1; preserve ordinary existing URI-fragment handling where supported by the opener. Ambiguous suffixes should be diagnosed rather than silently stripped.

Do not require filesystem existence just to classify a destination. Perform an asynchronous check at open time where the chosen integration allows it. A network/share failure must not block the editor UI.

## 6. Existing environment and compatibility

Observed local installation on October 26, 2026: VS Code 1.143.1, x64, commit e646868227c3e3a9e3f24277c8c7220be42c0be7.

These package versions were read from local installed extension manifests. Old and current package directories can coexist; verify the enabled versions and profile before testing or attributing a conflict.

| Extension | Installed version(s) observed | Required compatibility check |
| --- | --- | --- |
| Built-in Markdown support | Bundled with VS Code | Source Ctrl+click, reference links, heading links, preview unchanged. |
| `yzhang.markdown-all-in-one` | 3.6.3 | Link gestures, editing, preview, paste behavior, formatting, TOC features unchanged. |
| `DavidAnson.vscode-markdownlint` | 0.62.1 | Diagnostics and formatting continue; no document edits from link following. |
| `bierner.markdown-mermaid` | 1.32.1 | Mermaid preview continues rendering. |
| `openai.chatgpt` | 26.818.41705; 26.1021.22027 | Markdown saved/pasted from Codex opens normally; chat UI remains untouched. |
| `Anthropic.claude-code` | 2.1.87; 2.1.310 | Coexistence and generated Markdown; no interception of its webview. |
| `tomoki1207.pdf` | 1.2.2 | PDF targets honor the installed viewer/default association. |
| `streetsidesoftware.code-spell-checker` | 4.9.3 | Ordinary Markdown diagnostics unchanged. |
| `fukuchiharuki.paragraph-writing-support` | 1.0.0 | Editing and selection unchanged. |
| `jebbs.plantuml`; `EFanZh.graphviz-preview` | 2.18.1; 1.7.5 | Existing diagram workflows remain unaffected. |
| Remote WSL, SSH, Containers | 1.104.6; 0.128.0; 0.469.0 | No accidental mapping of Windows client paths into a remote filesystem. |

No extension is a required dependency unless the feasibility investigation demonstrates a documented integration need. Do not automatically change Markdown All in One settings or disable built-in link support.

Initial supported scope: local Windows VS Code windows with file-backed Markdown documents, single-folder and multi-root workspaces, and loose files. Untitled documents may support unambiguous absolute Windows targets after testing; relative links still need a meaningful base.

Remote windows are a separate gate. Detect the execution environment and abstain from Windows-path repair where ownership of the path is ambiguous. Do not map `C:` to `/mnt/c`, SSH directories, or container mounts automatically. Declare the chosen extension-host placement and test it before claiming remote support. Do not redirect native macOS/Linux file links.

## 7. Controls and diagnostics

Provide an enable/disable setting limited to this extension, and optional debug logging disabled by default. No telemetry or network service is needed.

A diagnostic command should report the source range, original destination, classification, normalized URI, document scheme, local/remote context, VS Code version, and relevant enabled extension versions. Clearly distinguish observed facts from suspected provider ownership. Never dump document contents or API credentials. Paths stay local unless the user explicitly exports diagnostics.

Diagnostic output should make the observed failure recognizable: an absolute Windows path must not be resolved against the document directory. Disable/uninstall must restore the prior environment without leftover settings or modified files.

## 8. Acceptance tests

Use temporary fixtures, never the user's estate documents. Unit-test parsing and normalization; integration-test the editor gesture and coexistence.

| Test | Expected result |
| --- | --- |
| Original bare-backslash reproduction | Ctrl+click opens intended existing HTML exactly once; no duplicated drive or directory creation. |
| Drive path with forward slashes and `/C:/` variant | Correct target, no document-directory prefix. |
| Valid file URI, including `%20`, `%23`, `%25` | Same resource, no double encoding or corruption. |
| Unicode, spaces, parentheses, literal `%`/`#` in native paths | Correct filesystem target. |
| Angle-bracket link, optional title, padded label | Correct target; all source characters preserved. |
| Reference definition with two uses | Both uses navigate to the same target without altering the definition. |
| Existing relative, web, mail, heading, image links | Existing behavior retained. |
| Inline/fenced code example and HTML comment | No repair interception. |
| Missing file | Clear failure; no file, directory, or empty editor creation. |
| PDF and other associated resource types | Configured editor/viewer association retained. |
| UNC target | Correct authority/share; access failure handled without freezing. |
| Unsaved edits, CRLF/LF, nondefault encoding | No new edits, dirty-state transition, save, or undo entry. |
| All relevant existing extensions enabled | Correct Ctrl+click, no competing bad open, no lost normal features. |
| Reload/restart and changed activation timing | Same reliable routing. |
| Two workspace roots, outside-workspace target, loose Markdown file | Absolute target never depends on selected root. |
| Remote or unsupported host | No guessed remapping or interference with existing links. |
| Uninstall/disable | No persistent modifications remain. |

Use `vscode.executeLinkProvider` as diagnostic evidence, not as a replacement for testing the actual user gesture. Include at least one manually verified Ctrl+click in the real profile. Require performance checks on a large Markdown file: cancellable/debounced analysis, no synchronous network/filesystem calls while scanning, and no full-workspace scans.

## 9. Delivery sequence

1. Reconfirm active versions and create the minimal reproduction.
2. Pass the overlapping-provider feasibility gate; report the chosen supported mechanism.
3. Implement source extraction and pure normalization with fixtures.
4. Integrate Ctrl+click and existing editor associations without source mutation.
5. Run isolated and existing-profile compatibility tests; record known limits.
6. Package a VSIX and provide source, README, test results, and removal instructions. Installation or publication is separate from this planning request.

## 10. Sources and evidence limits

- User-provided debugger screenshots and successful file:/// test in this chat establish the observed failure and working destination form.
- Installed VS Code version and extension manifests were inspected locally on October 26, 2026. This is an installation inventory, not proof of enablement or fault.
- [VS Code API reference](https://code.visualstudio.com/api/references/vscode-api): document-link providers are combined; URI and opening APIs are the implementation primitives. These APIs do not by themselves establish that an overlapping repair provider will win.
- [Built-in commands](https://code.visualstudio.com/api/references/commands): `vscode.executeLinkProvider` supports examining combined links.
- [Markdown extension guide](https://code.visualstudio.com/api/extension-guides/markdown-extension): preview extension points are distinct from the source-editor gesture being requested here.

Recheck API behavior and extension versions when implementation begins. The actual provider responsible for the malformed original link remains unidentified.
