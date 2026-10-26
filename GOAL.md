# Goal: Repair Markdown file links on Ctrl+click

Create a personal VS Code extension for Windows that makes existing local-file links in Markdown work when the user Ctrl+clicks them. The extension must normalize the destination in memory and open the intended file, without requiring the user to rewrite the link, run a separate command, or change the Markdown document.

User clarification, October 26, 2026: “I'm looking for an extension that will intercept ctlr-click in markdown files and reform the link”.

## Required experience

Given an existing Markdown link such as:

```markdown
[Report](C:\q\arc\reports\comparison.html)
```

Ctrl+click must open the same file as the equivalent explicit file URI:

```markdown
[Report](file:///C:/q/arc/reports/comparison.html)
```

The original link text and destination remain unchanged on disk and in the editor. The document must not become dirty, and the action must not create files or directories. Opening should preserve VS Code's configured editor associations.

## Compatibility objective

Work alongside the user's existing Markdown extensions, especially Markdown All in One, markdownlint, and Markdown Preview Mermaid Support, with built-in Markdown support enabled. Preserve Codex and Claude Code integration and the installed PDF viewer. Installed versions and the test matrix are recorded in SPEC.md. Installed package presence does not establish that a package is enabled in the active profile.

## Definition of complete

- Ordinary Ctrl+click on a supported local-file Markdown link opens the correct target exactly once.
- Absolute Windows destinations never acquire a workspace or document-directory prefix.
- Existing working file URIs, relative links, web URLs, and Markdown heading links retain their normal behavior.
- The existing extensions remain enabled and usable; the solution does not globally disable editor links or built-in Markdown support.
- Source and document state remain unchanged, including unsaved edits, encoding, and line endings.
- Integration tests demonstrate this behavior in the user's extension configuration, not only in an isolated test host.
- Deliver a locally installable VSIX, source, automated tests, installation/removal instructions, and a short compatibility report.

## Feasibility gate

First prove that a supported extension mechanism can supply the corrected destination for the actual Ctrl+click gesture despite overlapping link providers. A standalone Open command, a code action, automatic text rewriting, or a paste converter is not an acceptable substitute.

If VS Code's public APIs cannot provide this behavior while preserving the current extensions, document the precise limitation and present the smallest alternative integration for the user's decision. Do not quietly lower the requirement or patch VS Code/another extension's installed files.

## Scope of this handoff

These files specify future development. They do not implement, install, publish, or activate an extension. They do not authorize changes to estate documents or existing extension settings.
