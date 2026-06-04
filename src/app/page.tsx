"use client";

import { ChangeEvent, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

type ExportFile = {
  name: string;
  file: File;
  url: string;
};

type ChatMessage = {
  id: string;
  date: string;
  time: string;
  sender: string;
  text: string;
  mediaName?: string;
  media?: ExportFile;
  system?: boolean;
};

type ParsedExport = {
  title: string;
  messages: ChatMessage[];
  senders: string[];
  files: ExportFile[];
};

type ZipEntry = {
  name: string;
  dir: boolean;
  async: (type: "blob" | "string") => Promise<Blob | string>;
};

const messagePattern =
  /^(\d{1,2}\/\d{1,2}\/\d{2,4}),\s+(.+?)\s+-\s+([\s\S]*)$/;

function normalizeName(name: string) {
  return name.split("/").pop()?.trim() ?? name.trim();
}

function isChatTextFile(file: File | ExportFile) {
  return file.name.toLowerCase().endsWith(".txt");
}

function isImage(name: string) {
  return /\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(name);
}

function isVideo(name: string) {
  return /\.(mp4|webm|ogg|mov|m4v)$/i.test(name);
}

function isAudio(name: string) {
  return /\.(mp3|wav|m4a|aac|ogg|oga|opus|webm)$/i.test(name);
}

function parseChat(text: string, files: ExportFile[], title: string): ParsedExport {
  const mediaByName = new Map(files.map((file) => [normalizeName(file.name), file]));
  const rows = text.replace(/\r\n/g, "\n").split("\n");
  const messages: ChatMessage[] = [];
  let active: ChatMessage | undefined;

  rows.forEach((row, index) => {
    const match = row.match(messagePattern);

    if (match) {
      const [, date, time, body] = match;
      const senderBreak = body.indexOf(": ");
      const hasSender = senderBreak > -1;
      const sender = hasSender ? body.slice(0, senderBreak) : "WhatsApp";
      const messageText = hasSender ? body.slice(senderBreak + 2) : body;
      const mediaName = messageText.match(/([^/\n]+\.[a-z0-9]{2,5}) \(file attached\)/i)?.[1];

      active = {
        id: `${date}-${time}-${index}`,
        date,
        time,
        sender,
        text: messageText,
        mediaName,
        media: mediaName ? mediaByName.get(mediaName) : undefined,
        system: !hasSender,
      };
      messages.push(active);
      return;
    }

    if (active && row.trim()) {
      active.text = `${active.text}\n${row}`;
    }
  });

  const senders = Array.from(
    new Set(messages.filter((message) => !message.system).map((message) => message.sender)),
  );

  return {
    title: title.replace(/\.txt$/i, ""),
    messages,
    senders,
    files,
  };
}

async function readZip(file: File): Promise<ExportFile[]> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(file);
  const entries = Object.values(zip.files) as ZipEntry[];
  const exportFiles = await Promise.all(
    entries
      .filter((entry) => !entry.dir)
      .map(async (entry) => {
        const blob = (await entry.async("blob")) as Blob;
        const extracted = new File([blob], normalizeName(entry.name), {
          type: blob.type || "application/octet-stream",
        });

        return {
          name: extracted.name,
          file: extracted,
          url: URL.createObjectURL(extracted),
        };
      }),
  );

  return exportFiles;
}

async function parseFiles(files: File[]): Promise<ParsedExport> {
  const exportFiles: ExportFile[] = files.map((file) => ({
    name: normalizeName(file.name),
    file,
    url: URL.createObjectURL(file),
  }));
  const textFile = exportFiles.find(isChatTextFile);

  if (!textFile) {
    throw new Error("No WhatsApp export .txt file was found.");
  }

  const text = await textFile.file.text();
  return parseChat(text, exportFiles, normalizeName(textFile.name));
}

function MediaPreview({ message }: { message: ChatMessage }) {
  const media = message.media;

  if (!media && message.mediaName) {
    return <div className="mt-2 text-xs text-zinc-500">{message.mediaName} missing</div>;
  }

  if (!media) {
    return null;
  }

  if (isImage(media.name)) {
    return (
      <img
        src={media.url}
        alt={media.name}
        className="mt-2 max-h-72 w-full rounded-md object-cover"
      />
    );
  }

  if (isVideo(media.name)) {
    return <video src={media.url} className="mt-2 max-h-80 w-full rounded-md" controls />;
  }

  if (isAudio(media.name)) {
    return <audio src={media.url} className="mt-2 w-full min-w-64" controls />;
  }

  return (
    <a
      href={media.url}
      download={media.name}
      className="mt-2 block rounded-md border border-zinc-200 bg-white/70 px-3 py-2 text-sm font-medium text-zinc-800"
    >
      {media.name}
    </a>
  );
}

export default function Home() {
  const folderInput = useRef<HTMLInputElement>(null);
  const zipInput = useRef<HTMLInputElement>(null);
  const [chat, setChat] = useState<ParsedExport | null>(null);
  const [owner, setOwner] = useState("tameer");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const visibleMessages = useMemo(() => {
    if (!chat) {
      return [];
    }

    const term = query.trim().toLowerCase();

    return chat.messages.filter((message) => {
      if (!term) {
        return true;
      }

      return `${message.sender} ${message.text} ${message.mediaName ?? ""}`
        .toLowerCase()
        .includes(term);
    });
  }, [chat, query]);

  async function loadFolder(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []);

    if (!selected.length) {
      return;
    }

    setBusy(true);
    setError("");

    try {
      const parsed = await parseFiles(selected);
      setChat(parsed);
      setOwner(parsed.senders[0] ?? "");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The selected folder could not be read.");
    } finally {
      setBusy(false);
      event.target.value = "";
    }
  }

  async function loadZip(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setBusy(true);
    setError("");

    try {
      const extracted = await readZip(file);
      const parsed = await parseFiles(extracted.map((entry) => entry.file));
      setChat(parsed);
      setOwner(parsed.senders[0] ?? "");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The selected ZIP file could not be read.");
    } finally {
      setBusy(false);
      event.target.value = "";
    }
  }

  return (
    <main className="h-screen overflow-hidden bg-[#eef1e8] text-zinc-950">
      <section className="mx-auto flex h-screen w-full max-w-7xl flex-col p-0 lg:p-4">
        <div className="grid min-h-0 flex-1 overflow-hidden border border-zinc-200 bg-white shadow-sm lg:rounded-lg lg:grid-cols-[340px_minmax(0,1fr)]">
          <aside className="overflow-y-auto border-b border-zinc-200 bg-[#f7f8f4] p-4 lg:border-b-0 lg:border-r">
            <div className="mb-5 flex items-center gap-3">
              <div className="grid size-11 place-items-center rounded-full bg-[#0f6b5b] text-lg font-semibold text-white">
                W
              </div>
              <div>
                <h1 className="text-lg font-semibold">Chat Viewer</h1>
                <p className="text-sm text-zinc-500">WhatsApp export reader</p>
              </div>
            </div>

            <input
              ref={folderInput}
              type="file"
              multiple
              className="hidden"
              onChange={loadFolder}
              {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
            />
            <input
              ref={zipInput}
              type="file"
              accept=".zip,application/zip"
              className="hidden"
              onChange={loadZip}
            />

            <div className="grid gap-2">
              <Button
                type="button"
                onClick={() => folderInput.current?.click()}
              >
                Upload Folder
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => zipInput.current?.click()}
              >
                Upload ZIP
              </Button>
            </div>

            {busy ? <p className="mt-3 text-sm text-zinc-500">Reading export...</p> : null}
            {error ? <p className="mt-3 text-sm font-medium text-red-600">{error}</p> : null}

            <div className="mt-6 grid gap-4">
              <label className="grid gap-1 text-sm font-medium">
                Search
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="message, name, file..."
                />
              </label>

              <label className="grid gap-1 text-sm font-medium">
                Your Sender Name
                <Select
                  value={owner}
                  onChange={(event) => setOwner(event.target.value)}
                >
                  {chat?.senders.map((sender) => (
                    <option key={sender} value={sender}>
                      {sender}
                    </option>
                  ))}
                </Select>
              </label>
            </div>

            <div className="mt-6 grid grid-cols-3 gap-2">
              <div className="rounded-md border border-zinc-200 bg-white p-3">
                <div className="text-lg font-semibold">{chat?.messages.length ?? 0}</div>
                <div className="text-xs text-zinc-500">Messages</div>
              </div>
              <div className="rounded-md border border-zinc-200 bg-white p-3">
                <div className="text-lg font-semibold">{chat?.senders.length ?? 0}</div>
                <div className="text-xs text-zinc-500">People</div>
              </div>
              <div className="rounded-md border border-zinc-200 bg-white p-3">
                <div className="text-lg font-semibold">{chat?.files.length ?? 0}</div>
                <div className="text-xs text-zinc-500">Files</div>
              </div>
            </div>
          </aside>

          <section className="flex min-h-0 flex-col bg-[#efe8dc]">
            <header className="flex min-h-16 items-center justify-between border-b border-black/10 bg-[#f7f8f4] px-4">
              <div>
                <h2 className="font-semibold">{chat?.title ?? "Upload a WhatsApp export"}</h2>
                <p className="text-sm text-zinc-500">
                  {chat ? `${visibleMessages.length} shown` : "Choose a ZIP file or extracted folder"}
                </p>
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-5 sm:px-6">
              {!chat ? (
                <div className="mx-auto mt-16 max-w-md rounded-md bg-white/80 p-5 text-center shadow-sm">
                  <h3 className="font-semibold">Upload a WhatsApp export</h3>
                  <p className="mt-2 text-sm leading-6 text-zinc-600">
                    Select a WhatsApp export ZIP or extracted folder. The app reads the text file
                    in your browser and connects images, videos, and voice notes to each message.
                  </p>
                </div>
              ) : (
                <div className="mx-auto flex max-w-4xl flex-col gap-2">
                  {visibleMessages.map((message) => {
                    const mine = message.sender === owner && !message.system;

                    if (message.system) {
                      return (
                        <div
                          key={message.id}
                          className="mx-auto my-2 max-w-xl rounded-md bg-[#fff7cf] px-3 py-2 text-center text-xs text-zinc-600 shadow-sm"
                        >
                          {message.text}
                        </div>
                      );
                    }

                    return (
                      <article
                        key={message.id}
                        className={`flex ${mine ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[84%] rounded-lg px-3 py-2 text-sm shadow-sm sm:max-w-[68%] ${
                            mine ? "bg-[#d9fdd3]" : "bg-white"
                          }`}
                        >
                          <div className="mb-1 text-xs font-semibold text-[#0f6b5b]">
                            {message.sender}
                          </div>
                          <p className="whitespace-pre-wrap leading-5">{message.text}</p>
                          <MediaPreview message={message} />
                          <div className="mt-1 text-right text-[11px] text-zinc-500">
                            {message.date} {message.time}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
