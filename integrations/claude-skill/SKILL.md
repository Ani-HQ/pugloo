---
name: preview
description: >-
  Use when the user asks for a preview URL, wants to share or show what they just
  built, asks "can I see it", wants a reviewable link, or wants another person or
  agent to look at the running app. Creates a public HTTPS preview URL for the
  local dev server and returns it for the chat reply.
---

# Share a preview URL

Give the user (or a reviewing agent) a public HTTPS URL for the app running
locally, so they can open it from anywhere.

## Steps

1. **Make sure the dev server is running.** If it isn't, start it (e.g.
   `npm run dev`) and wait until it's listening. Note the port if you know it.
2. **Create the preview.**
   - If the pugloo MCP server is available, call the `create_preview` tool
     (pass `port` if you know it, otherwise omit to auto-detect).
   - Otherwise run: `pugloo preview --json` (add `--port <n>` if auto-detect is
     ambiguous). Parse the `url` field from the JSON on stdout.
3. **Reply with the URL.** Put the preview URL in your message to the user, on
   its own line, so it's easy to click. Mention when it expires if relevant.

## Notes

- The URL is **stable per repo+branch** — calling preview again after you push
  more changes returns the same URL, so you can share it once and keep iterating.
- To take it down: `create_preview`'s counterpart `stop_preview`, or
  `pugloo preview --stop`.
- If you get `PUGLOO_ERR_NO_PORT`, the dev server isn't detected — start it or
  pass the port. If `PUGLOO_ERR_PORT_CLOSED`, nothing is listening on that port.
- See `AGENTS.md` in the pugloo repo for the full JSON contract and exit codes.
