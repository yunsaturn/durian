"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { connectSocket } from "@/lib/socket";

export default function Home() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState("");

  const waitForConnect = (socket: ReturnType<typeof connectSocket>): Promise<boolean> => {
    return new Promise((resolve) => {
      if (socket.connected) return resolve(true);
      const timer = setTimeout(() => {
        socket.off("connect", onConnect);
        resolve(false);
      }, 5000);
      const onConnect = () => { clearTimeout(timer); resolve(true); };
      socket.once("connect", onConnect);
    });
  };

  const handleCreate = async () => {
    setCreating(true);
    setError("");
    const socket = connectSocket();
    const ok = await waitForConnect(socket);
    if (!ok) {
      setError("서버에 연결할 수 없어요. 잠시 후 다시 시도해주세요.");
      setCreating(false);
      return;
    }
    socket.emit("room:create", (roomCode: string) => {
      router.push(`/room/${roomCode}`);
    });
  };

  const handleJoin = async () => {
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length !== 6) {
      setError("6자리 코드를 입력해주세요.");
      return;
    }
    setJoining(true);
    setError("");
    const socket = connectSocket();
    const ok = await waitForConnect(socket);
    if (!ok) {
      setError("서버에 연결할 수 없어요. 잠시 후 다시 시도해주세요.");
      setJoining(false);
      return;
    }
    socket.emit("room:join", trimmed, (success: boolean, _history?: unknown, errMsg?: string) => {
      if (success) {
        router.push(`/room/${trimmed}`);
      } else {
        setError(errMsg || "입장 실패");
        setJoining(false);
      }
    });
  };

  return (
    <main className="flex flex-col items-center justify-center min-h-screen px-5 py-12">

      {/* 로고 */}
      <div className="mb-10 text-center">
        <div className="text-5xl mb-3">🌵</div>
        <h1 className="text-3xl font-bold tracking-tight">
          <span className="text-yellow-400">두리안</span>
        </h1>
        <p className="mt-2 text-zinc-400 text-sm">
          모바일 ↔ PC, 설치 없이 바로 공유
        </p>
      </div>

      {/* 카드 */}
      <div className="w-full max-w-sm space-y-3">

        {/* 공유 시작 */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
          <h2 className="text-base font-semibold mb-1">공유 시작</h2>
          <p className="text-zinc-500 text-xs mb-4">
            새 방을 만들고 QR 코드나 코드를 공유하세요.
          </p>
          <button
            onClick={handleCreate}
            disabled={creating}
            className="w-full bg-yellow-400 hover:bg-yellow-300 active:bg-yellow-500 disabled:opacity-50 text-zinc-900 font-semibold py-3.5 rounded-xl transition-colors text-sm"
          >
            {creating ? "방 만드는 중..." : "방 만들기 →"}
          </button>
        </div>

        {/* 구분선 */}
        <div className="flex items-center gap-3 px-1">
          <div className="flex-1 h-px bg-zinc-800" />
          <span className="text-zinc-600 text-xs">또는</span>
          <div className="flex-1 h-px bg-zinc-800" />
        </div>

        {/* 코드 입력 */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
          <h2 className="text-base font-semibold mb-1">코드로 입장</h2>
          <p className="text-zinc-500 text-xs mb-4">
            공유받은 6자리 코드를 입력하세요.
          </p>

          {/* 입력 칸 - 세로 배치 */}
          <input
            type="text"
            maxLength={6}
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase());
              setError("");
            }}
            onKeyDown={(e) => e.key === "Enter" && handleJoin()}
            placeholder="A B C 1 2 3"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3.5 text-white placeholder-zinc-600 text-center text-2xl font-mono tracking-[0.4em] uppercase focus:outline-none focus:border-yellow-400 transition-colors mb-3"
          />
          <button
            onClick={handleJoin}
            disabled={joining || code.trim().length === 0}
            className="w-full bg-zinc-700 hover:bg-zinc-600 active:bg-zinc-500 disabled:opacity-40 text-white font-semibold py-3 rounded-xl transition-colors text-sm"
          >
            {joining ? "입장 중..." : "입장하기"}
          </button>

          {error && (
            <p className="mt-3 text-red-400 text-xs text-center">{error}</p>
          )}
        </div>
      </div>

      {/* 하단 설명 */}
      <div className="mt-10 grid grid-cols-4 gap-2 w-full max-w-sm text-center text-zinc-600 text-xs">
        {[
          { icon: "📱", label: "QR 스캔" },
          { icon: "🔢", label: "코드 입력" },
          { icon: "⚡", label: "즉시 공유" },
          { icon: "🔒", label: "1시간 삭제" },
        ].map(({ icon, label }) => (
          <div key={label} className="flex flex-col items-center gap-1">
            <div className="text-lg">{icon}</div>
            <div className="leading-tight">{label}</div>
          </div>
        ))}
      </div>
    </main>
  );
}
