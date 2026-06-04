# WhatsApp Chat Backup Viewer

A Next.js app for viewing exported WhatsApp chats in a WhatsApp-style interface.

The app reads a WhatsApp export ZIP or extracted folder directly in the browser, parses the `.txt` chat file, and connects attached images, videos, and voice notes to the related messages.

## Features

- Upload a WhatsApp export ZIP
- Upload an extracted WhatsApp export folder
- Parse chat messages from the exported text file
- Show sender and receiver messages in separate chat bubbles
- Preview images, videos, and audio/voice notes
- Search messages and attachments
- Select which sender should appear as "your" side of the chat

## Getting Started

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Build

```bash
pnpm build
```

## Privacy Note

WhatsApp exports are read locally in the browser. This project does not upload or store chat files on a server.

## Tech Stack

- Next.js
- React
- TypeScript
- Tailwind CSS
- shadcn-compatible UI components
- JSZip

## Important

Do not commit real WhatsApp exports, private chat text files, or media attachments. The `.gitignore` is configured to ignore common export and media file types.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
