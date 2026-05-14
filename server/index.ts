import { createServer } from "http";
import { Server } from "socket.io";

const PORT = process.env.PORT || 4000;

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
  maxHttpBufferSize: 20 * 1024 * 1024, // 20MB
});

// 메시지 타입
type StoredMessage =
  | { id: string; type: "text"; text: string; from: string; at: number }
  | { id: string; type: "image"; image: string; name: string; from: string; at: number }
  | { id: string; type: "file"; data: string; name: string; mime: string; size: number; from: string; at: number };

// 방별 메시지 히스토리
const roomMessages = new Map<string, StoredMessage[]>();

// 방 만료 관리 (마지막 활동 후 1시간)
const roomActivity = new Map<string, NodeJS.Timeout>();

function resetRoomExpiry(code: string) {
  if (roomActivity.has(code)) clearTimeout(roomActivity.get(code)!);
  const timer = setTimeout(() => {
    io.to(code).emit("room:expired");
    io.socketsLeave(code);
    roomActivity.delete(code);
    roomMessages.delete(code);
    console.log(`방 만료: ${code}`);
  }, 60 * 60 * 1000);
  roomActivity.set(code, timer);
}

function generateCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

io.on("connection", (socket) => {
  console.log(`클라이언트 연결: ${socket.id}`);

  // 방 생성
  socket.on("room:create", (callback: (code: string) => void) => {
    const code = generateCode();
    socket.join(code);
    roomMessages.set(code, []);
    resetRoomExpiry(code);
    console.log(`방 생성: ${code}`);
    callback(code);
  });

  // 방 입장
  socket.on(
    "room:join",
    (code: string, callback: (success: boolean, history?: StoredMessage[], error?: string) => void) => {
      const room = io.sockets.adapter.rooms.get(code);
      if (!room) {
        callback(false, undefined, "존재하지 않는 방입니다.");
        return;
      }
      socket.join(code);
      resetRoomExpiry(code);
      socket.to(code).emit("room:user_joined");
      console.log(`방 입장: ${code}`);
      const history = roomMessages.get(code) ?? [];
      callback(true, history);
    }
  );

  // 텍스트 전송
  socket.on("message:text", (data: { code: string; text: string; id: string }) => {
    const msg: StoredMessage = { id: data.id, type: "text", text: data.text, from: socket.id, at: Date.now() };
    if (!roomMessages.has(data.code)) roomMessages.set(data.code, []);
    roomMessages.get(data.code)!.push(msg);
    socket.to(data.code).emit("message:text", msg);
    resetRoomExpiry(data.code);
  });

  // 이미지 전송
  socket.on("message:image", (data: { code: string; image: string; name: string; id: string }) => {
    const msg: StoredMessage = { id: data.id, type: "image", image: data.image, name: data.name, from: socket.id, at: Date.now() };
    if (!roomMessages.has(data.code)) roomMessages.set(data.code, []);
    roomMessages.get(data.code)!.push(msg);
    socket.to(data.code).emit("message:image", msg);
    resetRoomExpiry(data.code);
  });

  // 파일 전송 (PDF 등)
  socket.on("message:file", (data: { code: string; data: string; name: string; mime: string; size: number; id: string }) => {
    const msg: StoredMessage = { id: data.id, type: "file", data: data.data, name: data.name, mime: data.mime, size: data.size, from: socket.id, at: Date.now() };
    if (!roomMessages.has(data.code)) roomMessages.set(data.code, []);
    roomMessages.get(data.code)!.push(msg);
    socket.to(data.code).emit("message:file", msg);
    resetRoomExpiry(data.code);
  });

  socket.on("disconnect", () => {
    console.log(`클라이언트 연결 해제: ${socket.id}`);
  });
});

httpServer.listen(PORT, () => {
  console.log(`🚀 두리안 Socket.io 서버 실행 중: http://localhost:${PORT}`);
});
