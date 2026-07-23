import "dotenv/config";
import cors from "cors";
import express, { Application, Request, Response } from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import morgan from "morgan";
import path from "path";
import { fileURLToPath } from "url";

import { env } from "./config/env.js";
import { connectDatabase } from "./database/connection.js";
import { errorHandler } from "./middleware/error.middleware.js";
import { MessageModel } from "./models/chat.model.js";
import { setIO, registerUserSocket, unregisterSocket, getOnlineUserIds, emitNotificationToUser } from "./socket/notify.js";

import authRoute from "./routes/auth.route.js";
import courseRoutes from "./routes/course.route.js";
import assignmentRoute from "./routes/assignment.route.js";
import scheduleRouter from "./routes/Scheduleroutes.js";
import chatRoute from "./routes/chat.route.js";
import questionRoute from "./routes/question.route.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app: Application = express();

app.use(cors({ origin: process.env.FRONTEND_URL || "http://localhost:5173", credentials: true }));
app.use(morgan("dev"));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

app.get("/", (_req: Request, res: Response) => {
  res.json({ success: true, message: "LMS API running with Active WebSockets" });
});

app.use("/api/v1/auth", authRoute);
app.use("/api/v1/courses", courseRoutes);
app.use("/api/v1/assignments", assignmentRoute);
app.use("/api/v1/schedule", scheduleRouter);
app.use("/api/v1/chat", chatRoute);
app.use("/api/v1/questions", questionRoute);

app.use(errorHandler);

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: process.env.FRONTEND_URL || "http://localhost:5173", methods: ["GET", "POST"] },
});
setIO(io);

io.on("connection", (socket) => {
  console.log(`🔌 Connected: ${socket.id}`);

  socket.on("identify", ({ userId }: { userId: string }) => {
    if (!userId) return;
    registerUserSocket(String(userId), socket.id);
    io.emit("online_users", getOnlineUserIds());
  });

  socket.on("join_room", (roomId: string) => socket.join(roomId));
  socket.on("leave_room", (roomId: string) => socket.leave(roomId));

  socket.on(
    "send_message",
    async (payload: {
      senderId: string;
      roomId: string;
      targetId: string;
      courseId: string;
      message: string;
      isGroup: boolean;
      attachmentUrl?: string;
      attachmentType?: 'image' | 'video' | 'audio' | 'raw';
      isSticker?: boolean;
    }) => {
      try {
        if (!payload.courseId) return;

        const saved = await MessageModel.create({
          roomId: payload.roomId,
          course: payload.courseId,
          sender: payload.senderId,
          message: payload.message || '',
          attachmentUrl: payload.attachmentUrl || '',
          attachmentType: payload.attachmentType || undefined,
          isSticker: !!payload.isSticker,
          isGroup: payload.isGroup,
          readBy: [payload.senderId], // sender has "read" their own message
        });

        const populated = await saved.populate("sender", "fullName avatar role");
        const sender = populated.sender as any;

        io.to(payload.roomId).emit("receive_message", populated);

        if (payload.targetId && payload.targetId !== payload.senderId) {
          emitNotificationToUser(payload.targetId, {
            type: "message",
            roomId: payload.roomId,
            courseId: payload.courseId,
            senderId: payload.senderId,
            senderName: sender.fullName,
            message: payload.message || (payload.attachmentType ? `Sent a ${payload.attachmentType}` : ''),
            createdAt: new Date(),
          });
        }
      } catch (err) {
        console.error("Socket persistence error:", err);
      }
    }
  );

  socket.on("disconnect", () => {
    unregisterSocket(socket.id);
    io.emit("online_users", getOnlineUserIds());
  });
});

(async () => {
  try {
    await connectDatabase();
    httpServer.listen(env.port, () => {
      console.log(`🚀 LMS API running on http://localhost:${env.port}`);
    });
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
})();