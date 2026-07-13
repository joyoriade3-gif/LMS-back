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

import authRoute from "./routes/auth.route.js";
import courseRoutes from "./routes/course.route.js";
import assignmentRoute from "./routes/assignment.route.js";
import scheduleRouter from "./routes/Scheduleroutes.js";
import chatRoute from "./routes/chat.route.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app: Application = express();

// ─── MIDDLEWARE ───
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    credentials: true,
  }),
);
app.use(morgan("dev"));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

app.get("/", (_req: Request, res: Response) => {
  res.json({
    success: true,
    message: "LMS API running with Active WebSockets",
  });
});

app.use("/api/v1/auth", authRoute);
app.use("/api/v1/courses", courseRoutes);
app.use("/api/v1/assignments", assignmentRoute);
app.use("/api/v1/schedule", scheduleRouter);
app.use("/api/v1/chat", chatRoute);

app.use(errorHandler);

// ─── SOCKET.IO CONFIGURATION ───
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    methods: ["GET", "POST"],
  },
});

// ─── USER ↔ SOCKET IDENTITY MAP ───
// Maps a logged-in user's ID to their live socket ID(s) (a user can have
// more than one tab/device open). Populated by the "identify" event the
// client sends right after connecting (see hooks/useSocket.js). This is
// what lets us push a notification to one specific user instead of only
// broadcasting to rooms.
const userSockets = new Map<string, Set<string>>();

function registerUserSocket(userId: string, socketId: string) {
  if (!userSockets.has(userId)) userSockets.set(userId, new Set());
  userSockets.get(userId)!.add(socketId);
}

function unregisterSocket(socketId: string) {
  for (const [userId, ids] of userSockets.entries()) {
    ids.delete(socketId);
    if (ids.size === 0) userSockets.delete(userId);
  }
}

/**
 * Push a real-time notification to a specific user, e.g. from a route
 * handler after creating an assignment:
 *
 *   import { emitNotificationToUser } from "./server.js"; // adjust path/name
 *   emitNotificationToUser(studentId, {
 *     id: crypto.randomUUID(),
 *     title: "New assignment posted",
 *     message: `${course.title}: ${assignment.title}`,
 *   });
 *
 * If the user has no live socket connected right now, this is a no-op —
 * you'll still want to persist notifications to the DB separately if you
 * want them to show up on next login too (not implemented here, since
 * that depends on a Notification model you haven't shown me yet).
 */
export function emitNotificationToUser(userId: string, notification: Record<string, any>) {
  const socketIds = userSockets.get(String(userId));
  if (!socketIds) return;
  for (const id of socketIds) {
    io.to(id).emit("new_notification", notification);
  }
}

io.on("connection", (socket) => {
  console.log(`🔌 Live WebSocket Node Connected: ${socket.id}`);

  // NEW — client sends this right after connecting, and again on every
  // reconnect (see hooks/useSocket.js identify()).
  socket.on("identify", ({ userId }: { userId: string }) => {
    if (!userId) return;

    registerUserSocket(String(userId), socket.id);

    // Tell everyone who is online
    broadcastOnlineUsers();

    console.log(`🪪 Socket ${socket.id} identified as user ${userId}`);
  });

  socket.on("join_room", (roomId: string) => {
    socket.join(roomId);
    console.log(`🚪 Joined room: ${roomId}`);
  });

  // NEW — companion to join_room, called when the client's useSocket hook
  // leaves a room on cleanup/unmount. Without this, a socket that's been
  // in many rooms over a session keeps receiving receive_message events
  // from all of them, even after the UI has moved on.
  socket.on("leave_room", (roomId: string) => {
    socket.leave(roomId);
    console.log(`🚪 Left room: ${roomId}`);
  });

  socket.on(
    "send_message",
    async (payload: {
      senderId: string;
      roomId: string;
      targetId: string;
      courseId: string;
      message: string;
      isGroup: boolean;
    }) => {
      try {
        if (!payload.courseId) {
          console.error("send_message rejected: missing courseId");
          return;
        }

        const saved = await MessageModel.create({
          roomId: payload.roomId,
          course: payload.courseId,
          sender: payload.senderId,
          message: payload.message,
          isGroup: payload.isGroup,
        });

        const populated = await saved.populate(
          "sender",
          "fullName avatar role"
        );

        const sender = populated.sender as any;

        // Send chat message
        io.to(payload.roomId).emit("receive_message", populated);

        // Don't notify yourself
        if (payload.targetId !== payload.senderId) {
          emitNotificationToUser(payload.targetId, {
            type: "message",
            roomId: payload.roomId,
            senderId: payload.senderId,
            senderName: sender.fullName,
            message: payload.message,
            createdAt: new Date(),
          });

          console.log(
            `🔔 Notification sent to ${payload.targetId}`
          );
        }
      } catch (err) {
        console.error("Socket database persistence error:", err);
      }
    }
  );

  socket.on("disconnect", () => {
    unregisterSocket(socket.id);

    // Update everyone
    broadcastOnlineUsers();

    console.log(`❌ WebSocket disconnected: ${socket.id}`);
  });
});

function broadcastOnlineUsers() {
  io.emit("online_users", Array.from(userSockets.keys()));
}

// ─── INITIALIZATION SEQUENCE ───
(async () => {
  try {
    await connectDatabase();
    httpServer.listen(env.port, () => {
      console.log(`🚀 LMS API Engine running on http://localhost:${env.port}`);
      console.log(`📶 Real-Time WebSockets fully activated`);
      console.log(`Environment: ${env.nodeEnv || "development"}`);
    });
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
})();
