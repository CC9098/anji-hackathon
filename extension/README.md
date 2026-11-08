# Anji for managers (Chrome extension)

Manifest V3 side panel and content script. Install it with **Load unpacked**
(see the repository README). It works on Care Desk at
`http://localhost:5490/desk` with the app from `../care-desk` running.

The extension is a thin shell with two seams:

- **Page adapter** (`src/content/adapters.js`) reads only two things from the
  host page: which resident is on screen, and where each care-plan line sits.
  `CareDeskAdapter` serves Care Desk; another care system needs only its own
  adapter.
- **Backend** (`src/backend/backend.js`) is the interface the side panel uses
  for everything else. `AgentNativeBackend` (`src/backend/agent-native.js`)
  calls the app's actions over HTTP and follows its live change stream.

To point the extension at another app address, add that address to
`host_permissions` (and the Care Desk `content_scripts` matches) in
`manifest.json`, and set `backendUrl` in the extension's
`chrome.storage.local`.
