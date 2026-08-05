# Remove Portfolio Files Panel

## Goal

Remove the homepage's `Portfolio files / View the complete process.` panel and
its PDF and PPTX download links. The contact section must follow the selected
projects section directly.

## Scope

- Remove the documents-panel markup from `renderPortfolio`.
- Remove the now-unused `documents` content import and `renderDocuments`
  helper.
- Remove the panel's dedicated CSS, including its mobile override.
- Update render tests to assert that no documents panel or download links are
  emitted.

The underlying PDF and PPTX assets remain on disk and are not deleted by this
change. No project reader, navigation, AI assistant, contact content, or other
page section changes.

## Behavior and Verification

- The rendered portfolio contains neither `.documents` nor a link with a
  `download` attribute.
- The contact section remains present immediately after the projects section in
  rendered DOM order.
- The focused render test, full Vitest suite, and production build pass.
