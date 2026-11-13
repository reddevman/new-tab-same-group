# New Tab, Same Group

Chrome extension that adds a newly opened tab to the group of the tab that was
previously active in the same window.

## Behaviour

- Opening a new tab from a grouped tab adds it to that group.
- Opening a new tab from an ungrouped tab leaves it ungrouped.
- State is tracked independently for each Chrome window.
- Links opened in a new foreground or background tab are not grouped because
  their destination is not Chrome's New Tab page.
- The extension does not replace or customize Chrome's New Tab page.

## Install locally

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Choose this project directory.

The extension requires the `tabs` permission only to distinguish Chrome's New
Tab URL from ordinary pages. It stores only tab IDs, window IDs, and group IDs
in `chrome.storage.session`; this data is cleared when Chrome restarts or the
extension is disabled, reloaded, or updated. Incognito mode is explicitly
disabled.

Clicking the extension icon shows its current status and privacy summary. The
extension does not store or transmit visited URLs.

## Development

Requires Node.js 20 or newer for the built-in test runner.

```sh
npm test
npm run check
npm run build
```

`npm run build` creates a self-contained package in `dist/chrome`. It includes
only the files Chrome needs at runtime, so this is the directory to zip or share
with other users.

## Manual verification

Test the following in at least two normal Chrome windows:

1. Open a new tab with the `+` button and with `Ctrl+T` or `Cmd+T` while the
   active tab belongs to a group.
2. Repeat while the active tab is ungrouped.
3. Switch between windows and confirm that their groups are never mixed.
4. Create an active tab programmatically in a background window and confirm that
   it remains ungrouped.
5. Repeat with an expanded and a collapsed group.
6. Open ordinary links in foreground and background tabs and confirm that they
   are not added to the group.
7. Close the source group immediately after opening a new tab and confirm that
   the extension fails safely.
8. Restart Chrome with a grouped tab active, then confirm that the first new tab
   is grouped correctly.

## Known limitations

- Chrome creates the tab before the extension can group it, so a brief visual
  movement in the tab strip may be visible.
- Another extension that replaces the New Tab page may expose a different URL;
  this extension intentionally does not group that page without explicit
  support.
