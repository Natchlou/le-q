"use client";

import { useEffect, useState, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { supabase, Player, Question } from "@/lib/supabase";

type EventPayload<T = any> = {
  id: string;
  timestamp: string;
  table: string;
  event: "INSERT" | "UPDATE" | "DELETE";
  data: T;
};

export default function RealtimeTest() {
  const [events, setEvents] = useState<EventPayload[]>([]);
  const [status, setStatus] = useState<
    "disconnected" | "connecting" | "connected" | "error"
  >("disconnected");

  const searchParams = useSearchParams();
  const roomId = searchParams.get("roomId") || "demo-room";

  const tables = useMemo(() => ["players", "questions"], []);

  useEffect(() => {
    if (!roomId) return;

    console.log("🔌 Setting up realtime subscriptions for room:", roomId);
    setStatus("connecting");
    const subs: ReturnType<typeof supabase.channel>[] = [];

    try {
      tables.forEach((table) => {
        const sub = supabase
          .channel(`${table}-${roomId}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table,
              filter: `room_id=eq.${roomId}`,
            },
            (payload) => {
              console.log(`📡 Event on ${table}:`, payload);

              const typedData =
                table === "players"
                  ? (payload.new as Player)
                  : (payload.new as Question);

              setEvents((prev) => [
                ...prev,
                {
                  id: crypto.randomUUID(), // 🔑 clé unique
                  timestamp: new Date().toLocaleTimeString(),
                  table,
                  event: payload.eventType,
                  data: typedData,
                },
              ]);
              setStatus("connected");
            }
          )
          .subscribe();

        subs.push(sub);
      });
    } catch (err) {
      console.error("❌ Error setting up subscriptions:", err);
      setStatus("error");
    }

    return () => {
      console.log("🛑 Unsubscribing all channels");
      subs.forEach((sub) => sub.unsubscribe());
      setStatus("disconnected");
    };
  }, [roomId, tables]);

  const statusColor = {
    connected: "text-green-400",
    connecting: "text-yellow-400",
    error: "text-red-400",
    disconnected: "text-gray-400",
  }[status];

  return (
    <div className="min-h-screen bg-gray-900 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="bg-gray-800 rounded-lg p-6 text-white">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold">Test Realtime Supabase</h2>
            <div className="flex items-center gap-2">
              <div
                className={`w-3 h-3 rounded-full ${
                  status === "connected"
                    ? "bg-green-400"
                    : status === "connecting"
                    ? "bg-yellow-400"
                    : status === "error"
                    ? "bg-red-400"
                    : "bg-gray-400"
                }`}
              ></div>
              <span className={`text-sm ${statusColor}`}>{status}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div className="bg-gray-700 rounded p-4">
              <h3 className="font-semibold mb-2">Configuration</h3>
              <p className="text-sm text-gray-300">
                Room ID: <span className="text-blue-400">{roomId}</span>
              </p>
              <p className="text-sm text-gray-300">
                Monitoring: {tables.join(", ")}
              </p>
              <p className="text-sm text-gray-300">
                Events: INSERT, UPDATE, DELETE
              </p>
            </div>

            <div className="bg-gray-700 rounded p-4">
              <h3 className="font-semibold mb-2">Instructions</h3>
              <p className="text-sm text-gray-300">
                Modifie les tables <code>players</code> ou{" "}
                <code>questions</code> dans Supabase Studio avec
                <code> room_id=&quot;{roomId}&quot;</code> pour voir les
                événements en temps réel.
              </p>
            </div>
          </div>

          <div className="bg-gray-700 rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">
                Événements en temps réel ({events.length})
              </h3>
              {events.length > 0 && (
                <button
                  onClick={() => setEvents([])}
                  className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-sm transition-colors"
                >
                  Effacer
                </button>
              )}
            </div>

            {events.length === 0 ? (
              <div className="text-center py-8 text-gray-400 animate-pulse">
                En attente d&apos;événements...
                <p className="text-sm mt-2">
                  Modifie les données dans Supabase Studio pour voir les
                  changements ici.
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {events
                  .slice()
                  .reverse()
                  .map(({ id, table, event, timestamp, data }) => (
                    <div
                      key={id}
                      className="bg-gray-600 rounded p-3 border-l-4 border-blue-500"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs bg-gray-800 px-2 py-1 rounded">
                            {table}
                          </span>
                          <span
                            className={`font-mono text-xs px-2 py-1 rounded ${
                              event === "INSERT"
                                ? "bg-green-600"
                                : event === "UPDATE"
                                ? "bg-yellow-600"
                                : "bg-red-600"
                            }`}
                          >
                            {event}
                          </span>
                        </div>
                        <span className="text-xs text-gray-400">
                          {timestamp}
                        </span>
                      </div>
                      <pre className="text-xs text-gray-300 overflow-x-auto">
                        {JSON.stringify(data, null, 2)}
                      </pre>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
