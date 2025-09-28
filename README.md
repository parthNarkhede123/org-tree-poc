# AgentsValidation_poc (Traditional React)

A traditional React project (Create React App style with `react-scripts`) that wraps the **Automation Testing** UI for running the `AgentsValidation` script and downloading outputs/logs.

## Prerequisites
- Node.js 18+ (recommend 20 LTS)
- npm

## Getting Started
```bash
npm install
npm start
```

Open http://localhost:3000

## What this app does
- Run the `AgentsValidation` script via the provided AWS API Gateway endpoint.
- Poll for recent executions and display status/logs.
- Download generated PDFs and **force-download** `.txt` logs using the presigned S3 URL returned by the `download-url` endpoint.

## Notes
- Styling is via **Tailwind CDN** included in `public/index.html` (no Vite/PostCSS setup needed).
- Lightweight UI primitives live in `src/components/ui`.
- Icons use `lucide-react`.

## Troubleshooting
- **CORS/401/403** on fetch calls: your API Gateway or S3 bucket may restrict origins; update CORS on the gateway and/or bucket.
- **Downloads not working**: the app expects JSON like `{ "downloadUrl": "<presigned-s3-url>" }` from the `download-url` endpoint.
- **Logs not downloading**: `.txt` files are blob-downloaded to guarantee a save dialog; PDFs and others open in a new tab.

## Scripts
- `npm start` - start local dev server
- `npm run build` - build for production
- `npm test` - run tests (none added in this POC)