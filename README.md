# meta-bot-backend

Instagram/WhatsApp (Meta) webhook gateway → n8n workflow forwarding.
Includes Meta compliance endpoints: Privacy Policy, Terms, Deauthorize, Data Deletion.

## Features
- GET `/webhook` — Meta webhook verification
- POST `/webhook` — Receive Meta events, extract first text message, forward to n8n
- GET `/privacy` — Privacy Policy page (Meta requirement)
- GET `/terms` — Terms of Service page (Meta requirement)
- GET/POST `/instagram/deauthorize` — Deauthorize callback
- GET/POST `/instagram/data-deletion` — Data deletion endpoint + status page

## Requirements
- Node.js 18+ (recommended 20+)

## Install
```bash
npm install