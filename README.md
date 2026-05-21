# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

## UI Theme Change Checklist

When updating visual styles, verify the active React entrypoint and rendered root component first:

- `src/main.jsx` defines the mounted root component.
- If styles are inline in that component tree, update those styles directly (not only shared CSS files).
- Run a quick literal scan for stale palette/font values before finishing.

## Duplicate Submission Handling

The survey submit path now expects a Firebase HTTPS function endpoint.

1. Deploy function from `functions/index.js` with secret `COMPASS_HASH_SECRET`.
2. Set web env var `VITE_COMPASS_SUBMIT_ENDPOINT` to the deployed function URL.
3. Deploy `firestore.rules` so direct client writes to `compass-results-v2` are blocked.
4. Production builds now fail fast if `VITE_COMPASS_SUBMIT_ENDPOINT` is missing.

Submission behavior:

- users can retake freely,
- every submission is saved,
- repeats within 24h (same IP hash or device hash) are marked,
- `include_in_default_aggregate` is automatically set by backend logic (`repeat IP OR repeat device` excludes),
- `include_in_device_priority_aggregate` is also stored (`repeat device` excludes; IP-only repeats remain included).

Analytics-friendly fields:

- `repeat_classification`: `first_or_stale`, `repeat_ip_24h_only`, `repeat_device_24h`
- `include_in_default_aggregate`: strict default map
- `include_in_device_priority_aggregate`: device-priority map
