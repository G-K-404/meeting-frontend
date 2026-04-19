import { useEffect, useRef, useState } from "react";
import "./App.css";
import Sidebar from "./Sidebar";

const DEFAULT_MEETING_ID = "main";
const DEFAULT_MEETING_PASSWORD = "123";
const CAPTION_MAX_LINES = 3;
const CAPTION_MAX_CHARS_PER_LINE = 50;

const EMPTY_MEETING_STATE = {
  summary: "",
  action_items: [],
  open_questions: [],
};

function getRuntimeConfig() {
  if (typeof window === "undefined") {
    return {
      chatApiUrl: "http://localhost:8080",
      wsUrl: "ws://localhost:8766",
      captionWsUrl: "ws://localhost:8767",
    };
  }

  const hostname = window.location.hostname || "localhost";
  const isSecurePage = window.location.protocol === "https:";
  const httpProtocol = isSecurePage ? "https:" : "http:";
  const wsProtocol = isSecurePage ? "wss:" : "ws:";
  const apiHost = import.meta.env.VITE_API_HOST || hostname;
  const apiPort = import.meta.env.VITE_API_PORT || "8080";
  const wsPort = import.meta.env.VITE_WS_PORT || "8766";
  const captionWsPort = import.meta.env.VITE_CAPTION_WS_PORT || "8767";

  return {
    chatApiUrl: `${httpProtocol}//${apiHost}:${apiPort}`,
    wsUrl: `${wsProtocol}//${apiHost}:${wsPort}`,
    captionWsUrl: `${wsProtocol}//${apiHost}:${captionWsPort}`,
  };
}

function splitCaption(text, maxCharsPerLine = CAPTION_MAX_CHARS_PER_LINE) {
  const words = String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const lines = [];
  let currentLine = "";

  for (const word of words) {
    const candidate = currentLine ? `${currentLine} ${word}` : word;
    if (candidate.length <= maxCharsPerLine) {
      currentLine = candidate;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }

  if (currentLine) lines.push(currentLine);
  return lines;
}

function createDashboardState() {
  return {
    summaries: [],
    actionItems: [],
    openQuestions: [],
  };
}

function normalizeMeetingState(payload) {
  if (!payload || typeof payload !== "object") {
    return EMPTY_MEETING_STATE;
  }

  if (payload.state && typeof payload.state === "object") {
    return normalizeMeetingState(payload.state);
  }

  return {
    summary: String(payload.summary || "").trim(),
    summary_history: Array.isArray(payload.summary_history)
      ? payload.summary_history
          .map((item) => ({
            id: String(item?.id || "").trim(),
            text: String(item?.text || "").trim(),
            timestamp: String(item?.timestamp || "").trim(),
          }))
          .filter((item) => item.id && item.text)
      : [],
    action_items: Array.isArray(payload.action_items)
      ? payload.action_items
      : [],
    open_questions: Array.isArray(payload.open_questions)
      ? payload.open_questions
      : [],
  };
}

function App() {
  const runtimeConfigRef = useRef(getRuntimeConfig());
  const [entryMode, setEntryMode] = useState("join");
  const [draftRoomId, setDraftRoomId] = useState("");
  const [draftPassword, setDraftPassword] = useState("");
  const [activeRoomId, setActiveRoomId] = useState("");
  const [activePassword, setActivePassword] = useState("");
  const [joinError, setJoinError] = useState("");
  const [entryLoading, setEntryLoading] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState("idle");
  const [state, setState] = useState(createDashboardState);
  const [chatMessages, setChatMessages] = useState([
    {
      role: "assistant",
      text: "Join a room to ask questions about the live meeting summary.",
    },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);

  const wsRef = useRef(null);
  const captionWsRef = useRef(null);
  const joinedRoomRef = useRef("");
  const captionsRef = useRef({ finalizedLines: [], partialLines: [] });
  const [, setCaptionTrigger] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadMeetingState() {
      if (!activeRoomId) return;

      try {
        const response = await fetch(
          `${runtimeConfigRef.current.chatApiUrl}/meeting-state?room_id=${encodeURIComponent(activeRoomId)}&password=${encodeURIComponent(activePassword)}`,
        );

        if (!response.ok) {
          throw new Error(`Failed to load meeting state (${response.status})`);
        }

        const payload = await response.json();
        if (cancelled) return;
        applyMeetingState(normalizeMeetingState(payload));
      } catch (error) {
        if (!cancelled) {
          console.warn("Failed to fetch meeting state", error);
        }
      }
    }

    loadMeetingState();

    return () => {
      cancelled = true;
    };
  }, [activePassword, activeRoomId]);

  useEffect(() => {
    if (!activeRoomId) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setConnectionStatus("idle");
      return undefined;
    }

    const ws = new WebSocket(runtimeConfigRef.current.wsUrl);
    wsRef.current = ws;
    joinedRoomRef.current = "";
    setConnectionStatus("connecting");

    ws.addEventListener("open", () => {
      setConnectionStatus("joining");
      ws.send(
        JSON.stringify({
          type: "join_room",
          room_id: activeRoomId,
          password: activePassword,
        }),
      );
    });

    ws.addEventListener("message", (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (!payload || typeof payload !== "object") return;

        if (payload.type === "room_joined") {
          joinedRoomRef.current = String(payload.room_id || activeRoomId);
          setConnectionStatus("connected");
          setJoinError("");
          return;
        }

        if (payload.type === "error") {
          setJoinError(String(payload.message || "Failed to join room"));
          setConnectionStatus("error");
          return;
        }

        if (payload.type === "meeting_state") {
          if (String(payload.room_id || "") !== activeRoomId) return;
          applyMeetingState(normalizeMeetingState(payload));
        }
      } catch (error) {
        console.warn("Invalid websocket message", error);
      }
    });

    ws.addEventListener("close", () => {
      if (wsRef.current === ws) {
        wsRef.current = null;
      }
      joinedRoomRef.current = "";
      setConnectionStatus((current) =>
        current === "idle" ? current : "disconnected",
      );
    });

    ws.addEventListener("error", () => {
      setConnectionStatus("error");
      setJoinError("Could not connect to the meeting websocket server.");
    });

    return () => {
      ws.close();
    };
  }, [activePassword, activeRoomId]);

  useEffect(() => {
    let wsCap;

    try {
      wsCap = new WebSocket(runtimeConfigRef.current.captionWsUrl);
    } catch (error) {
      console.warn("Caption WS connect failed", error);
      return undefined;
    }

    captionWsRef.current = wsCap;

    wsCap.addEventListener("message", (event) => {
      try {
        const payload = JSON.parse(event.data);
        const type = payload.type;
        const text = String(payload.text || "");

        if (type === "partial") {
          captionsRef.current.partialLines = splitCaption(text);
          setCaptionTrigger((value) => value + 1);
        } else if (type === "final") {
          const finalLines = splitCaption(text);
          const keepCount = CAPTION_MAX_LINES - 1;
          captionsRef.current.partialLines = [];
          captionsRef.current.finalizedLines =
            captionsRef.current.finalizedLines
              .concat(finalLines)
              .slice(-keepCount);
          setCaptionTrigger((value) => value + 1);
        }
      } catch (error) {
        console.warn("Invalid caption message", error);
      }
    });

    return () => {
      try {
        wsCap.close();
      } catch {
        // no-op
      }
    };
  }, []);

  function applyMeetingState(meetingState) {
    setState((previous) => {
      const next = { ...previous };
      const incomingHistory = Array.isArray(meetingState.summary_history)
        ? meetingState.summary_history
        : [];

      if (incomingHistory.length) {
        const existingById = new Map(
          previous.summaries.map((item) => [String(item.id || ""), item]),
        );
        next.summaries = incomingHistory.map((item) => {
          const existing = existingById.get(item.id);
          return existing
            ? {
                ...existing,
                ...item,
              }
            : item;
        });
      } else {
        const incomingSummary = meetingState.summary;
        if (incomingSummary) {
          const lastSummary = previous.summaries[previous.summaries.length - 1];
          const lastText = lastSummary?.text;
          if (incomingSummary !== lastText) {
            next.summaries = previous.summaries
              .concat({
                id: `summary-${Date.now()}`,
                text: incomingSummary,
                timestamp: new Date().toISOString(),
              })
              .slice(-100);
          }
        }
      }

      if (Array.isArray(meetingState.action_items)) {
        const newItems = meetingState.action_items.filter((item) => {
          if (!item) return false;
          const taskText = String(item.task || "").trim();
          return (
            taskText &&
            !previous.actionItems.some(
              (existing) => String(existing?.task || "").trim() === taskText,
            )
          );
        });
        if (newItems.length) {
          next.actionItems = previous.actionItems.concat(newItems).slice(-200);
        }
      }

      if (Array.isArray(meetingState.open_questions)) {
        const newQuestions = meetingState.open_questions
          .map((item) => String(item || "").trim())
          .filter((item) => item && !previous.openQuestions.includes(item));
        if (newQuestions.length) {
          next.openQuestions = previous.openQuestions
            .concat(newQuestions)
            .slice(-200);
        }
      }

      return next;
    });
  }

  function resetMeetingWorkspace(roomId, password, message) {
    setActiveRoomId(roomId);
    setActivePassword(password);
    setJoinError("");
    setState(createDashboardState());
    setChatMessages([
      {
        role: "assistant",
        text: message,
      },
    ]);
    captionsRef.current = { finalizedLines: [], partialLines: [] };
    setCaptionTrigger((value) => value + 1);
  }

  async function handleJoinRoom(event) {
    event.preventDefault();
    const normalizedRoomId = draftRoomId.trim();
    const normalizedPassword = draftPassword.trim();

    if (!normalizedRoomId) {
      setJoinError("Enter a meeting ID first.");
      return;
    }

    if (!normalizedPassword) {
      setJoinError("Enter the meeting password.");
      return;
    }

    setJoinError("");
    setEntryLoading(true);

    try {
      const response = await fetch(
        `${runtimeConfigRef.current.chatApiUrl}/meetings/join`,
        {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          room_id: normalizedRoomId,
          password: normalizedPassword,
        }),
        },
      );

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(
          payload.error || `Join failed with status ${response.status}`,
        );
      }

      resetMeetingWorkspace(
        normalizedRoomId,
        normalizedPassword,
        `Joined meeting "${normalizedRoomId}". Ask anything about this meeting.`,
      );
    } catch (error) {
      setJoinError(error.message);
    } finally {
      setEntryLoading(false);
    }
  }

  async function handleCreateMeeting() {
    setJoinError("");
    setEntryLoading(true);

    try {
      const response = await fetch(
        `${runtimeConfigRef.current.chatApiUrl}/meetings/create`,
        {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          room_id: DEFAULT_MEETING_ID,
          password: DEFAULT_MEETING_PASSWORD,
        }),
        },
      );

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(
          payload.error || `Create failed with status ${response.status}`,
        );
      }

      setDraftRoomId(String(payload.room_id || DEFAULT_MEETING_ID));
      setDraftPassword(String(payload.password || DEFAULT_MEETING_PASSWORD));
      resetMeetingWorkspace(
        String(payload.room_id || DEFAULT_MEETING_ID),
        String(payload.password || DEFAULT_MEETING_PASSWORD),
        `Here to answer your questions.`,
      );
    } catch (error) {
      setJoinError(error.message);
    } finally {
      setEntryLoading(false);
    }
  }

  function handleLeaveRoom() {
    setActiveRoomId("");
    setActivePassword("");
    setDraftRoomId("");
    setDraftPassword("");
    setJoinError("");
    setEntryLoading(false);
    setConnectionStatus("idle");
    setState(createDashboardState());
    setChatInput("");
    setChatLoading(false);
    setChatMessages([
      {
        role: "assistant",
        text: "Join a room to ask questions about the live meeting summary.",
      },
    ]);
    captionsRef.current = { finalizedLines: [], partialLines: [] };
    setCaptionTrigger((value) => value + 1);
  }

  async function handleSendChat(event) {
    event.preventDefault();

    const question = chatInput.trim();
    if (!question || !activeRoomId || chatLoading) return;

    setChatMessages((previous) =>
      previous.concat({ role: "user", text: question }),
    );
    setChatInput("");
    setChatLoading(true);

    try {
      const response = await fetch(`${runtimeConfigRef.current.chatApiUrl}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          room_id: activeRoomId,
          password: activePassword,
          message: question,
        }),
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(
          payload.error || `Request failed with status ${response.status}`,
        );
      }

      setChatMessages((previous) =>
        previous.concat({
          role: "assistant",
          text: String(payload.answer || "No answer returned."),
        }),
      );
    } catch (error) {
      setChatMessages((previous) =>
        previous.concat({
          role: "assistant",
          text: `Chat request failed: ${error.message}`,
          tone: "error",
        }),
      );
    } finally {
      setChatLoading(false);
    }
  }

  const showJoinScreen = !activeRoomId;

  return (
    <div className="app-root full-screen">
      {showJoinScreen ? (
        <main className="join-screen">
          <div className="join-card">
            <p className="eyebrow">Realtime Meeting Summarizer</p>
            <h1 className="join-title">
              Choose how you want to enter the meeting workspace.
            </h1>
            <p className="join-copy">
              Join an existing meeting with its ID and password, or create a
              meeting and enter the workspace right away.
            </p>

            <div
              className="entry-mode-toggle"
              role="tablist"
              aria-label="Meeting entry options"
            >
              <button
                type="button"
                className={`mode-button ${entryMode === "join" ? "mode-button-active" : ""}`}
                onClick={() => {
                  setEntryMode("join");
                  setJoinError("");
                }}
              >
                Join Meeting
              </button>
              <button
                type="button"
                className={`mode-button ${entryMode === "create" ? "mode-button-active" : ""}`}
                onClick={() => {
                  setEntryMode("create");
                  setJoinError("");
                }}
              >
                Create Meeting
              </button>
            </div>

            {entryMode === "join" ? (
              <form className="join-form" onSubmit={handleJoinRoom}>
                <label className="join-label" htmlFor="room-id">
                  Meeting ID
                </label>
                <input
                  id="room-id"
                  className="room-input"
                  value={draftRoomId}
                  onChange={(event) => setDraftRoomId(event.target.value)}
                  placeholder="example: main"
                  autoFocus
                />

                <label className="join-label" htmlFor="meeting-password">
                  Password
                </label>
                <input
                  id="meeting-password"
                  className="room-input"
                  type="password"
                  value={draftPassword}
                  onChange={(event) => setDraftPassword(event.target.value)}
                  placeholder="Enter meeting password"
                />

                <button
                  type="submit"
                  className="join-button"
                  disabled={entryLoading}
                >
                  {entryLoading ? "Joining..." : "Join Meeting"}
                </button>
              </form>
            ) : (
              <div className="create-panel">
                <p className="create-copy">
                  Start a meeting workspace instantly. The app will use the
                  current backend default configuration and take you straight
                  inside.
                </p>
                <button
                  type="button"
                  className="join-button create-button"
                  onClick={handleCreateMeeting}
                  disabled={entryLoading}
                >
                  {entryLoading ? "Creating..." : "Create Meeting"}
                </button>
              </div>
            )}

            {joinError ? <p className="join-error">{joinError}</p> : null}
          </div>
        </main>
      ) : (
        <Sidebar
          roomId={activeRoomId}
          connectionStatus={connectionStatus}
          state={state}
          captionsRef={captionsRef}
          chatMessages={chatMessages}
          chatInput={chatInput}
          chatLoading={chatLoading}
          onChatInputChange={setChatInput}
          onSendChat={handleSendChat}
          onLeaveRoom={handleLeaveRoom}
        />
      )}
    </div>
  );
}

export default App;
