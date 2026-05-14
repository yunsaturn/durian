"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { connectSocket } from "@/lib/socket";
import { QRCodeSVG } from "qrcode.react";

// ─── 타입 ───────────────────────────────────────────
type Message =
  | { id: string; type: "text"; text: string; from: "me" | "other"; at: number }
  | { id: string; type: "image"; image: string; name: string; from: "me" | "other"; at: number }
  | { id: string; type: "file"; data: string; name: string; mime: string; size: number; from: "me" | "other"; at: number };

type StoredMessage =
  | { id: string; type: "text"; text: string; from: string; at: number }
  | { id: string; type: "image"; image: string; name: string; from: string; at: number }
  | { id: string; type: "file"; data: string; name: string; mime: string; size: number; from: string; at: number };

// ─── 유틸 ───────────────────────────────────────────
function generateId() {
  return Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function fileIcon(mime: string) {
  if (mime.includes("pdf")) return "📄";
  if (mime.includes("word") || mime.includes("document")) return "📝";
  if (mime.includes("sheet") || mime.includes("excel")) return "📊";
  if (mime.includes("zip") || mime.includes("compressed")) return "🗜️";
  if (mime.includes("text")) return "📃";
  return "📁";
}

// ─── 컴포넌트 ───────────────────────────────────────
export default function RoomPage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();

  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [connected, setConnected] = useState(false);
  const [peerConnected, setPeerConnected] = useState(false);
  const [expired, setExpired] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [dark, setDark] = useState(true);

  const mySocketId = useRef<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const roomUrl = typeof window !== "undefined" ? `${window.location.origin}/room/${code}` : "";

  // 테마 클래스
  const bg = dark ? "bg-zinc-950" : "bg-gray-50";
  const cardBg = dark ? "bg-zinc-900" : "bg-white";
  const border = dark ? "border-zinc-800" : "border-gray-200";
  const subText = dark ? "text-zinc-500" : "text-gray-400";
  const inputBg = dark ? "bg-zinc-800 border-zinc-700 text-white placeholder-zinc-600" : "bg-gray-100 border-gray-300 text-gray-900 placeholder-gray-400";

  // ─── 소켓 연결 ─────────────────────────────────
  useEffect(() => {
    const socket = connectSocket();

    const handleConnect = () => {
      setConnected(true);
      mySocketId.current = socket.id ?? null;

      socket.emit("room:join", code, (success: boolean, history?: StoredMessage[]) => {
        if (success && history && history.length > 0) {
          const myId = mySocketId.current;
          setMessages(history.map((m) => ({ ...m, from: m.from === myId ? "me" : "other" } as Message)));
          setPeerConnected(true);
        }
      });
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", () => setConnected(false));
    socket.on("room:user_joined", () => setPeerConnected(true));
    socket.on("room:expired", () => setExpired(true));

    socket.on("message:text", (d: { id: string; text: string; at: number }) =>
      setMessages((p) => [...p, { id: d.id, type: "text", text: d.text, from: "other", at: d.at }])
    );
    socket.on("message:image", (d: { id: string; image: string; name: string; at: number }) =>
      setMessages((p) => [...p, { id: d.id, type: "image", image: d.image, name: d.name, from: "other", at: d.at }])
    );
    socket.on("message:file", (d: { id: string; data: string; name: string; mime: string; size: number; at: number }) =>
      setMessages((p) => [...p, { id: d.id, type: "file", data: d.data, name: d.name, mime: d.mime, size: d.size, from: "other", at: d.at }])
    );

    if (socket.connected) handleConnect();

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect");
      socket.off("room:user_joined");
      socket.off("room:expired");
      socket.off("message:text");
      socket.off("message:image");
      socket.off("message:file");
    };
  }, [code]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ─── 클립보드 붙여넣기 ─────────────────────────
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) sendFile(file);
          break;
        }
      }
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  // ─── 전송 함수 ─────────────────────────────────
  const sendText = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const socket = connectSocket();
    const id = generateId();
    socket.emit("message:text", { code, text: trimmed, id });
    setMessages((p) => [...p, { id, type: "text", text: trimmed, from: "me", at: Date.now() }]);
    setText("");
  };

  const sendFile = useCallback((file: File) => {
    const isImage = file.type.startsWith("image/");
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target?.result as string;
      const socket = connectSocket();
      const id = generateId();

      if (isImage) {
        socket.emit("message:image", { code, image: base64, name: file.name, id });
        setMessages((p) => [...p, { id, type: "image", image: base64, name: file.name, from: "me", at: Date.now() }]);
      } else {
        socket.emit("message:file", { code, data: base64, name: file.name, mime: file.type, size: file.size, id });
        setMessages((p) => [...p, { id, type: "file", data: base64, name: file.name, mime: file.type, size: file.size, from: "me", at: Date.now() }]);
      }
    };
    reader.readAsDataURL(file);
  }, [code]);

  const copyText = async (t: string, id: string) => {
    await navigator.clipboard.writeText(t);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const download = (data: string, name: string) => {
    const a = document.createElement("a");
    a.href = data;
    a.download = name;
    a.click();
  };

  // ─── 만료 화면 ─────────────────────────────────
  if (expired) {
    return (
      <div className={`flex flex-col items-center justify-center min-h-screen text-center px-4 ${bg}`}>
        <div className="text-5xl mb-4">⏰</div>
        <h2 className="text-xl font-semibold mb-2">방이 만료되었습니다</h2>
        <p className={`${subText} text-sm mb-6`}>마지막 활동 후 1시간이 지났어요.</p>
        <button onClick={() => router.push("/")} className="bg-yellow-400 text-zinc-900 font-semibold px-6 py-3 rounded-xl">
          처음으로
        </button>
      </div>
    );
  }

  // ─── 메인 UI ───────────────────────────────────
  return (
    <div className={`flex flex-col h-screen max-w-2xl mx-auto ${bg}`}>

      {/* 헤더 */}
      <header className={`flex items-center justify-between px-4 py-3 border-b ${border} ${cardBg}`}>
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/")} className={`${subText} hover:text-yellow-400 transition-colors text-sm`}>
            ← 홈
          </button>
          <div className="flex items-center gap-2">
            <span className="font-mono text-yellow-400 text-lg font-bold tracking-widest">{code}</span>
            <span className={`w-2 h-2 rounded-full ${connected ? "bg-green-400" : "bg-zinc-600"}`} />
          </div>
        </div>

        <div className="flex items-center gap-2">
          {peerConnected && (
            <span className="text-xs text-green-400 bg-green-400/10 px-2 py-1 rounded-full">연결됨</span>
          )}
          {/* 다크/라이트 토글 */}
          <button
            onClick={() => setDark((v) => !v)}
            className={`text-sm px-3 py-1 border ${border} rounded-lg ${subText} hover:text-yellow-400 transition-colors`}
          >
            {dark ? "☀️" : "🌙"}
          </button>
          <button
            onClick={() => setShowQR((v) => !v)}
            className={`text-sm px-3 py-1 border ${border} rounded-lg ${subText} hover:text-yellow-400 transition-colors`}
          >
            QR
          </button>
        </div>
      </header>

      {/* QR 패널 */}
      {showQR && (
        <div className={`${cardBg} border-b ${border} p-6 flex flex-col items-center gap-4`}>
          <QRCodeSVG
            value={roomUrl}
            size={180}
            bgColor={dark ? "#18181b" : "#ffffff"}
            fgColor="#fbbf24"
            className="rounded-xl"
          />
          <div className="flex items-center gap-2">
            <span className={`font-mono ${subText} text-sm`}>{roomUrl}</span>
            <button
              onClick={() => copyText(roomUrl, "qr")}
              className="text-xs text-yellow-400 hover:text-yellow-300 transition-colors"
            >
              {copiedId === "qr" ? "복사됨!" : "복사"}
            </button>
          </div>
          <p className={`${subText} text-xs`}>다른 기기에서 QR을 스캔하거나 코드를 입력하세요</p>
        </div>
      )}

      {/* 메시지 목록 */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && (
          <div className={`flex flex-col items-center justify-center h-full text-center ${subText}`}>
            <div className="text-4xl mb-3">📡</div>
            <p className="text-sm">다른 기기에서 이 방에 입장하면</p>
            <p className="text-sm">공유가 시작돼요!</p>
            <button onClick={() => setShowQR(true)} className="mt-4 text-yellow-400 text-sm underline">
              QR 코드 보기
            </button>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.from === "me" ? "justify-end" : "justify-start"}`}>

            {/* 텍스트 */}
            {msg.type === "text" && (
              <div className={`group relative max-w-[75%] px-4 py-2.5 rounded-2xl text-sm ${
                msg.from === "me" ? "bg-yellow-400 text-zinc-900" : dark ? "bg-zinc-800 text-white" : "bg-white text-gray-900 shadow-sm border border-gray-200"
              }`}>
                <p className="break-all whitespace-pre-wrap">{msg.text}</p>
                <button
                  onClick={() => copyText(msg.text, msg.id)}
                  className="absolute -bottom-5 right-0 text-xs text-zinc-500 hover:text-zinc-300 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap"
                >
                  {copiedId === msg.id ? "복사됨!" : "복사"}
                </button>
              </div>
            )}

            {/* 이미지 */}
            {msg.type === "image" && (
              <div className={`group relative max-w-[75%] rounded-2xl overflow-hidden ${
                msg.from === "me" ? "border-2 border-yellow-400" : `border ${border}`
              }`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={msg.image} alt={msg.name} className="max-w-full max-h-64 object-contain bg-zinc-900" />
                <button
                  onClick={() => download(msg.image, msg.name)}
                  className="absolute bottom-2 right-2 bg-black/60 hover:bg-black/80 text-white text-xs px-2 py-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  ⬇ 저장
                </button>
              </div>
            )}

            {/* 파일 */}
            {msg.type === "file" && (
              <div className={`flex items-center gap-3 px-4 py-3 rounded-2xl max-w-[75%] ${
                msg.from === "me" ? "bg-yellow-400 text-zinc-900" : dark ? "bg-zinc-800 text-white" : "bg-white text-gray-900 shadow-sm border border-gray-200"
              }`}>
                <span className="text-2xl flex-shrink-0">{fileIcon(msg.mime)}</span>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate max-w-[160px]">{msg.name}</p>
                  <p className={`text-xs ${msg.from === "me" ? "text-zinc-700" : subText}`}>{formatSize(msg.size)}</p>
                </div>
                <button
                  onClick={() => download(msg.data, msg.name)}
                  className={`flex-shrink-0 text-xs px-2 py-1 rounded-lg font-medium ${
                    msg.from === "me" ? "bg-zinc-900/20 hover:bg-zinc-900/30 text-zinc-900" : "bg-yellow-400/20 hover:bg-yellow-400/30 text-yellow-400"
                  } transition-colors`}
                >
                  ⬇
                </button>
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* 입력 영역 */}
      <div className={`px-4 py-3 border-t ${border} ${cardBg}`}>
        <div className="flex gap-2 items-center">
          {/* 파일 첨부 (이미지 + 파일 모두) */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className={`flex-shrink-0 w-10 h-10 ${dark ? "bg-zinc-800 hover:bg-zinc-700" : "bg-gray-100 hover:bg-gray-200"} rounded-xl flex items-center justify-center ${subText} hover:text-yellow-400 transition-colors`}
          >
            📎
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) sendFile(file);
              e.target.value = "";
            }}
          />

          {/* 텍스트 입력 */}
          <input
            ref={inputRef}
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); sendText(); } }}
            placeholder="텍스트 입력 또는 Ctrl+V로 이미지 붙여넣기..."
            className={`flex-1 border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-yellow-400 transition-colors ${inputBg}`}
          />

          {/* 전송 */}
          <button
            onClick={sendText}
            disabled={!text.trim()}
            className="flex-shrink-0 w-10 h-10 bg-yellow-400 hover:bg-yellow-300 disabled:opacity-40 disabled:cursor-not-allowed text-zinc-900 rounded-xl flex items-center justify-center font-bold transition-colors"
          >
            ↑
          </button>
        </div>
        <p className={`${subText} text-xs mt-2 text-center`}>
          Enter로 전송 · 📎로 파일/이미지 첨부 · Ctrl+V로 이미지 붙여넣기
        </p>
      </div>
    </div>
  );
}
