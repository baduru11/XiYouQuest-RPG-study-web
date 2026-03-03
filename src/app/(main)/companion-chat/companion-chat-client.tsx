"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import {
  MessageCircle,
  History,
  ArrowLeft,
  Volume2,
  ChevronDown,
  ChevronUp,
  LogOut,
  RotateCcw,
  Loader2,
} from "lucide-react";
import { AudioRecorder } from "@/components/practice/audio-recorder";
import { Button } from "@/components/ui/button";
import { fetchWithRetry } from "@/lib/fetch-retry";
import { useAudioSettings } from "@/components/shared/audio-settings";
import { useAchievementToast } from "@/components/shared/achievement-toast";
import { getAffectionLevel } from "@/lib/gamification/xp";

// ── Types ──

interface EnrichedCharacter {
  id: string;
  name: string;
  voiceId: string;
  personalityPrompt: string;
  image: string | null;
  isUnlocked: boolean;
  unlockStage: number | null;
  affectionXP: number;
  affectionLevel: number;
}

interface Scenario {
  id: string;
  stage_number: number;
  title: string;
  description: string;
}

interface HistorySession {
  id: string;
  characterName: string;
  scenarioTitle: string;
  messageCount: number;
  avgScore: number | null;
  xpEarned: number;
  createdAt: string;
}

interface ChatMessageUI {
  id: string;
  role: "user" | "companion";
  content: string;
  pronunciationScore?: number;
  toneScore?: number;
  fluencyScore?: number;
  imageUrl?: string;
  expandedScore?: boolean;
}

interface SessionSummary {
  messageCount: number;
  avgScore: number;
  xpEarned: number;
  affectionEarned: number;
  images: string[];
}

type ViewTab = "chat" | "history";
type ChatPhase = "select_companion" | "select_scenario" | "chatting" | "summary";

interface CompanionChatClientProps {
  characters: EnrichedCharacter[];
  scenarios: Scenario[];
  recentSessions: HistorySession[];
}

// ── Stage names ──

const STAGE_NAMES: Record<number, string> = {
  1: "花果山 — Flower Fruit Mountain",
  2: "取经启程 — Journey Begins",
  3: "流沙河 — Flowing Sand River",
  4: "白骨精 — White Bone Spirit",
  5: "火焰山 — Flaming Mountain",
  6: "盘丝洞 — Spider Cave",
  7: "雷音寺 — Thunder Monastery",
};

// ── Component ──

export default function CompanionChatClient({
  characters,
  scenarios,
  recentSessions,
}: CompanionChatClientProps) {
  // Tab state
  const [activeTab, setActiveTab] = useState<ViewTab>("chat");

  // Chat state machine
  const [phase, setPhase] = useState<ChatPhase>("select_companion");
  const [selectedCharacter, setSelectedCharacter] = useState<EnrichedCharacter | null>(null);
  const [selectedScenario, setSelectedScenario] = useState<Scenario | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessageUI[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [turnCount, setTurnCount] = useState(0);

  // History state
  const [historyDetail, setHistoryDetail] = useState<{ session: HistorySession; messages: ChatMessageUI[] } | null>(null);

  // Audio
  const { effectiveTtsVolume } = useAudioSettings();
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

  // Background overlay (C4 pattern)
  const bgOverlayRef = useRef<HTMLDivElement | null>(null);

  // Message scroll
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Achievement toast
  const { showAchievementToasts } = useAchievementToast();

  // ── Background overlay setup (C4 pattern) ──
  useEffect(() => {
    if (phase !== "chatting") return;

    document.body.style.isolation = "isolate";
    const overlay = document.createElement("div");
    overlay.style.cssText = `
      position: fixed; inset: 0; z-index: -1;
      background-size: cover; background-position: center; background-attachment: fixed;
      opacity: 0; transition: opacity 0.8s ease-in-out; pointer-events: none;
    `;
    document.body.appendChild(overlay);
    bgOverlayRef.current = overlay;

    return () => {
      overlay.remove();
      bgOverlayRef.current = null;
      document.body.style.isolation = "";
    };
  }, [phase]);

  // ── Auto-scroll ──
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── TTS playback ──
  const playTTS = useCallback(async (text: string, voiceId: string) => {
    try {
      // Stop any currently playing audio
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current = null;
      }

      const res = await fetchWithRetry("/api/tts/companion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voiceId, text }),
      });

      if (!res.ok) return;

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.volume = effectiveTtsVolume;
      currentAudioRef.current = audio;

      audio.onended = () => {
        URL.revokeObjectURL(url);
        currentAudioRef.current = null;
      };

      await audio.play();
    } catch (err) {
      console.error("[Chat] TTS playback error:", err);
    }
  }, [effectiveTtsVolume]);

  // ── Background image transition ──
  const showBackgroundImage = useCallback((imageUrl: string) => {
    if (!bgOverlayRef.current) return;
    const overlay = bgOverlayRef.current;
    const img = new window.Image();
    img.onload = () => {
      overlay.style.backgroundImage = `url(${imageUrl})`;
      requestAnimationFrame(() => { overlay.style.opacity = "0.4"; });
    };
    img.src = imageUrl;
  }, []);

  // ── Handle recording complete ──
  const handleRecordingComplete = useCallback(async (audioBlob: Blob) => {
    if (!sessionId || !selectedCharacter) return;
    setIsProcessing(true);

    // Add typing indicator
    const typingId = crypto.randomUUID();
    setMessages(prev => [...prev, {
      id: typingId,
      role: "companion",
      content: "...",
    }]);

    try {
      const formData = new FormData();
      formData.append("sessionId", sessionId);
      formData.append("audio", audioBlob, "recording.wav");

      const res = await fetchWithRetry("/api/chat/respond", {
        method: "POST",
        body: formData,
      });

      // Remove typing indicator
      setMessages(prev => prev.filter(m => m.id !== typingId));

      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "Failed to process response");
        setIsProcessing(false);
        return;
      }

      const data = await res.json();
      const newTurnCount = data.turnNumber;
      setTurnCount(newTurnCount);

      // Add user message
      const userMsgId = crypto.randomUUID();
      setMessages(prev => [...prev, {
        id: userMsgId,
        role: "user",
        content: data.userTranscript,
        pronunciationScore: data.scores.pronunciation,
        toneScore: data.scores.tone,
        fluencyScore: data.scores.fluency,
      }]);

      // Add companion reply
      const companionMsgId = crypto.randomUUID();
      setMessages(prev => [...prev, {
        id: companionMsgId,
        role: "companion",
        content: data.companionReply,
      }]);

      // Auto-play companion reply
      playTTS(data.companionReply, selectedCharacter.voiceId);

      // Generate image every 4 user turns (non-blocking)
      if (newTurnCount > 0 && newTurnCount % 4 === 0) {
        // Build conversation summary from last 8 messages
        const recentMsgs = messages.slice(-8).map(m =>
          `${m.role === "user" ? "User" : selectedCharacter.name}: ${m.content}`
        ).join("\n");

        fetchWithRetry("/api/chat/generate-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId,
            conversationSummary: recentMsgs,
          }),
        }).then(async (imgRes) => {
          if (imgRes.ok) {
            const imgData = await imgRes.json();
            if (imgData.imageUrl) {
              showBackgroundImage(imgData.imageUrl);
              // Update the companion message with image URL
              setMessages(prev => prev.map(m =>
                m.id === companionMsgId ? { ...m, imageUrl: imgData.imageUrl } : m
              ));
            }
          }
        }).catch(err => console.error("[Chat] Image gen error:", err));
      }
    } catch (err) {
      // Remove typing indicator on error
      setMessages(prev => prev.filter(m => m.id !== typingId));
      console.error("[Chat] Respond error:", err);
      alert("Failed to process your response. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  }, [sessionId, selectedCharacter, messages, playTTS, showBackgroundImage]);

  // ── End conversation ──
  const handleEndChat = useCallback(async () => {
    if (!sessionId) return;
    if (!confirm("End this conversation?")) return;

    setIsProcessing(true);
    try {
      const res = await fetchWithRetry("/api/chat/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });

      if (res.ok) {
        const data = await res.json();
        setSummary(data.summary);
        setPhase("summary");

        if (data.newAchievements?.length > 0) {
          showAchievementToasts(data.newAchievements);
        }
      }
    } catch (err) {
      console.error("[Chat] End error:", err);
    } finally {
      setIsProcessing(false);
    }
  }, [sessionId, showAchievementToasts]);

  // ── Reset to start ──
  const handleNewChat = useCallback(() => {
    setPhase("select_companion");
    setSelectedCharacter(null);
    setSelectedScenario(null);
    setSessionId(null);
    setMessages([]);
    setSummary(null);
    setTurnCount(0);

    // Fade out background
    if (bgOverlayRef.current) {
      bgOverlayRef.current.style.opacity = "0";
    }
  }, []);

  // ── View history detail ──
  const handleViewHistory = useCallback(async (session: HistorySession) => {
    try {
      const res = await fetchWithRetry(`/api/chat/history?sessionId=${session.id}`);
      if (!res.ok) return;

      const data = await res.json();
      setHistoryDetail({
        session,
        messages: (data.messages ?? []).map((m: { id: string; role: string; content: string; pronunciation_score: number | null; tone_score: number | null; fluency_score: number | null; image_url: string | null }) => ({
          id: m.id,
          role: m.role as "user" | "companion",
          content: m.content,
          pronunciationScore: m.pronunciation_score ?? undefined,
          toneScore: m.tone_score ?? undefined,
          fluencyScore: m.fluency_score ?? undefined,
          imageUrl: m.image_url ?? undefined,
        })),
      });
    } catch (err) {
      console.error("[Chat] History detail error:", err);
    }
  }, []);

  // ── Score color helper ──
  const getScoreColor = (score: number) => {
    if (score >= 85) return "text-green-600";
    if (score >= 70) return "text-yellow-600";
    return "text-red-500";
  };

  const getScoreBg = (score: number) => {
    if (score >= 85) return "bg-green-100 border-green-400";
    if (score >= 70) return "bg-yellow-100 border-yellow-400";
    return "bg-red-100 border-red-400";
  };

  // ── Tab bar ──
  const renderTabBar = () => (
    <div className="flex gap-2 mb-4">
      <button
        onClick={() => { setActiveTab("chat"); setHistoryDetail(null); }}
        className={`flex items-center gap-2 px-4 py-2 font-pixel text-sm transition-all ${
          activeTab === "chat"
            ? "pixel-border-primary bg-primary/10 text-primary"
            : "pixel-border bg-card text-muted-foreground hover:text-foreground"
        }`}
      >
        <MessageCircle className="h-4 w-4" />
        New Chat
      </button>
      <button
        onClick={() => { setActiveTab("history"); setHistoryDetail(null); }}
        className={`flex items-center gap-2 px-4 py-2 font-pixel text-sm transition-all ${
          activeTab === "history"
            ? "pixel-border-primary bg-primary/10 text-primary"
            : "pixel-border bg-card text-muted-foreground hover:text-foreground"
        }`}
      >
        <History className="h-4 w-4" />
        History
      </button>
    </div>
  );

  // ── RENDER: History Tab ──
  if (activeTab === "history") {
    if (historyDetail) {
      return (
        <div className="mx-auto max-w-2xl space-y-4">
          {renderTabBar()}
          <button
            onClick={() => setHistoryDetail(null)}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Back to history
          </button>

          <div className="pixel-border chinese-corner bg-card p-4">
            <p className="font-pixel text-sm text-primary">{historyDetail.session.characterName}</p>
            <p className="text-sm text-muted-foreground">{historyDetail.session.scenarioTitle}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {new Date(historyDetail.session.createdAt).toLocaleDateString()} · {historyDetail.session.messageCount} messages · Avg: {historyDetail.session.avgScore ?? "N/A"}
            </p>
          </div>

          <div className="space-y-3">
            {historyDetail.messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] pixel-border p-3 ${
                  msg.role === "user" ? "bg-primary/10 border-primary/30" : "bg-card"
                }`}>
                  <p className="font-chinese text-sm">{msg.content}</p>
                  {msg.pronunciationScore !== undefined && (
                    <span className={`inline-block mt-1 px-2 py-0.5 text-xs font-pixel border ${getScoreBg(msg.pronunciationScore)}`}>
                      {Math.round(((msg.pronunciationScore ?? 0) + (msg.toneScore ?? 0) + (msg.fluencyScore ?? 0)) / 3)}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    return (
      <div className="mx-auto max-w-2xl space-y-4">
        {renderTabBar()}
        <h2 className="font-pixel text-sm text-foreground">Chat History</h2>
        {recentSessions.length === 0 ? (
          <div className="pixel-border bg-card p-8 text-center">
            <p className="text-muted-foreground">No conversations yet. Start chatting!</p>
          </div>
        ) : (
          <div className="space-y-2">
            {recentSessions.map((session) => (
              <button
                key={session.id}
                onClick={() => handleViewHistory(session)}
                className="w-full text-left pixel-border chinese-corner bg-card px-4 py-3 hover:pixel-border-primary transition-all"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-pixel text-sm text-foreground">{session.characterName}</p>
                    <p className="text-sm text-muted-foreground">{session.scenarioTitle}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">
                      {new Date(session.createdAt).toLocaleDateString()}
                    </p>
                    <p className="font-pixel text-xs text-primary">
                      {session.messageCount} msgs · Avg: {session.avgScore ? Math.round(session.avgScore) : "—"}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── RENDER: Chat Tab ──

  // Phase: Select Companion
  if (phase === "select_companion") {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        {renderTabBar()}
        <h2 className="font-pixel text-sm text-foreground">Choose Your Companion</h2>
        <p className="font-chinese text-sm text-muted-foreground">选择你的同伴</p>
        <div className="grid grid-cols-2 gap-3">
          {characters.map((char) => {
            const affInfo = getAffectionLevel(char.affectionXP);
            return (
              <button
                key={char.id}
                disabled={!char.isUnlocked}
                onClick={() => {
                  setSelectedCharacter(char);
                  setPhase("select_scenario");
                }}
                className={`pixel-border p-4 text-center transition-all ${
                  char.isUnlocked
                    ? "bg-card hover:pixel-border-primary cursor-pointer"
                    : "bg-muted/50 opacity-60 cursor-not-allowed"
                }`}
              >
                <div className="relative h-24 w-24 mx-auto mb-2 pixel-border bg-muted overflow-hidden">
                  {char.image ? (
                    <Image
                      src={char.image}
                      alt={char.name}
                      fill
                      className="object-contain"
                      unoptimized
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-2xl">?</div>
                  )}
                </div>
                <p className="font-pixel text-xs text-foreground leading-relaxed">{char.name}</p>
                {char.isUnlocked ? (
                  <p className="text-xs text-muted-foreground mt-1">{affInfo.name}</p>
                ) : (
                  <p className="text-xs text-muted-foreground mt-1">Stage {char.unlockStage}</p>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // Phase: Select Scenario
  if (phase === "select_scenario") {
    // Group scenarios by stage
    const grouped = scenarios.reduce<Record<number, Scenario[]>>((acc, s) => {
      (acc[s.stage_number] ??= []).push(s);
      return acc;
    }, {});

    return (
      <div className="mx-auto max-w-2xl space-y-4">
        {renderTabBar()}
        <button
          onClick={() => setPhase("select_companion")}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        <div className="pixel-border chinese-corner bg-card p-3 flex items-center gap-3">
          {selectedCharacter?.image && (
            <div className="relative h-12 w-12 shrink-0 pixel-border bg-muted overflow-hidden">
              <Image src={selectedCharacter.image} alt="" fill className="object-contain" unoptimized />
            </div>
          )}
          <div>
            <p className="font-pixel text-sm text-primary">{selectedCharacter?.name}</p>
            <p className="text-xs text-muted-foreground">Select a scenario</p>
          </div>
        </div>

        {Object.entries(grouped)
          .sort(([a], [b]) => Number(a) - Number(b))
          .map(([stage, stageScenarios]) => (
            <div key={stage} className="space-y-2">
              <p className="font-pixel text-xs text-muted-foreground">
                Stage {stage}: {STAGE_NAMES[Number(stage)] ?? ""}
              </p>
              {stageScenarios.map((scenario) => (
                <button
                  key={scenario.id}
                  onClick={async () => {
                    setSelectedScenario(scenario);
                    setIsStarting(true);
                    try {
                      const res = await fetchWithRetry("/api/chat/start", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          characterId: selectedCharacter!.id,
                          scenarioId: scenario.id,
                        }),
                      });
                      if (!res.ok) {
                        const err = await res.json();
                        alert(err.error || "Failed to start chat");
                        setIsStarting(false);
                        return;
                      }
                      const data = await res.json();
                      setSessionId(data.sessionId);
                      setMessages([{
                        id: crypto.randomUUID(),
                        role: "companion",
                        content: data.openingMessage,
                      }]);
                      setTurnCount(0);
                      setPhase("chatting");
                      playTTS(data.openingMessage, selectedCharacter!.voiceId);
                    } catch (err) {
                      console.error("[Chat] Start error:", err);
                      alert("Failed to start chat.");
                    } finally {
                      setIsStarting(false);
                    }
                  }}
                  disabled={isStarting}
                  className="w-full text-left pixel-border bg-card px-4 py-3 hover:pixel-border-primary transition-all disabled:opacity-50"
                >
                  <p className="font-chinese text-base text-foreground">{scenario.title}</p>
                  <p className="font-chinese text-sm text-muted-foreground">{scenario.description}</p>
                </button>
              ))}
            </div>
          ))}

        {isStarting && (
          <div className="flex items-center justify-center gap-2 py-4">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="font-pixel text-sm text-muted-foreground">Starting conversation...</span>
          </div>
        )}
      </div>
    );
  }

  // Phase: Chatting
  if (phase === "chatting") {
    return (
      <div className="mx-auto max-w-2xl flex flex-col" style={{ height: "calc(100vh - 5rem)" }}>
        {/* Top bar */}
        <div className="pixel-border chinese-corner bg-card/90 backdrop-blur-sm p-3 flex items-center gap-3 shrink-0">
          {selectedCharacter?.image && (
            <div className="relative h-10 w-10 shrink-0 pixel-border bg-muted overflow-hidden">
              <Image src={selectedCharacter.image} alt="" fill className="object-contain" unoptimized />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="font-pixel text-xs text-primary truncate">{selectedCharacter?.name}</p>
            <p className="font-chinese text-xs text-muted-foreground truncate">{selectedScenario?.title}</p>
          </div>
          <span className="font-pixel text-xs text-muted-foreground">{turnCount}/20</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleEndChat}
            disabled={isProcessing}
            className="text-muted-foreground hover:text-destructive"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto py-4 px-1 space-y-3 bg-background/80 backdrop-blur-sm">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className="max-w-[80%]">
                {/* Companion messages */}
                {msg.role === "companion" && (
                  <div className="pixel-border bg-card/90 backdrop-blur-sm p-3">
                    {msg.content === "..." ? (
                      <div className="flex gap-1">
                        <span className="h-2 w-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                        <span className="h-2 w-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                        <span className="h-2 w-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                      </div>
                    ) : (
                      <>
                        <p className="font-chinese text-sm leading-relaxed">{msg.content}</p>
                        <button
                          onClick={() => selectedCharacter && playTTS(msg.content, selectedCharacter.voiceId)}
                          className="mt-1 flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                        >
                          <Volume2 className="h-3 w-3" /> Listen
                        </button>
                      </>
                    )}
                  </div>
                )}

                {/* User messages */}
                {msg.role === "user" && (
                  <div className="pixel-border bg-primary/10 border-primary/30 p-3">
                    <p className="font-chinese text-sm leading-relaxed">{msg.content}</p>
                    {msg.pronunciationScore !== undefined && (() => {
                      const overall = Math.round(((msg.pronunciationScore ?? 0) + (msg.toneScore ?? 0) + (msg.fluencyScore ?? 0)) / 3);
                      return (
                        <div className="mt-2">
                          <button
                            onClick={() => setMessages(prev => prev.map(m =>
                              m.id === msg.id ? { ...m, expandedScore: !m.expandedScore } : m
                            ))}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-pixel border ${getScoreBg(overall)} ${getScoreColor(overall)}`}
                          >
                            {overall}
                            {msg.expandedScore ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                          </button>
                          {msg.expandedScore && (
                            <div className="mt-2 space-y-1 text-xs">
                              <p>Pronunciation: <span className={getScoreColor(msg.pronunciationScore ?? 0)}>{msg.pronunciationScore}</span></p>
                              <p>Tone: <span className={getScoreColor(msg.toneScore ?? 0)}>{msg.toneScore}</span></p>
                              <p>Fluency: <span className={getScoreColor(msg.fluencyScore ?? 0)}>{msg.fluencyScore}</span></p>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input bar */}
        <div className="pixel-border bg-card/90 backdrop-blur-sm p-3 shrink-0">
          <AudioRecorder
            onRecordingComplete={handleRecordingComplete}
            disabled={isProcessing}
          />
          {isProcessing && (
            <p className="text-center text-xs text-muted-foreground mt-2 font-pixel animate-pulse">
              Processing...
            </p>
          )}
        </div>
      </div>
    );
  }

  // Phase: Summary
  if (phase === "summary" && summary) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <h2 className="font-pixel text-sm text-primary text-center">Conversation Complete</h2>
        <p className="font-chinese text-center text-muted-foreground">对话结束</p>

        <div className="pixel-border chinese-frame bg-card p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center">
              <p className="font-pixel text-2xl text-primary">{summary.messageCount}</p>
              <p className="text-xs text-muted-foreground">Messages</p>
            </div>
            <div className="text-center">
              <p className={`font-pixel text-2xl ${getScoreColor(summary.avgScore)}`}>{summary.avgScore}</p>
              <p className="text-xs text-muted-foreground">Avg Score</p>
            </div>
            <div className="text-center">
              <p className="font-pixel text-2xl text-primary">+{summary.xpEarned}</p>
              <p className="text-xs text-muted-foreground">XP Earned</p>
            </div>
            <div className="text-center">
              <p className="font-pixel text-2xl text-pink-500">+{summary.affectionEarned}</p>
              <p className="text-xs text-muted-foreground">Affection</p>
            </div>
          </div>

          {summary.images.length > 0 && (
            <>
              <div className="chinese-divider" />
              <p className="font-pixel text-xs text-muted-foreground text-center">Generated Scenes</p>
              <div className="grid grid-cols-2 gap-2">
                {summary.images.map((url, i) => (
                  <div key={i} className="pixel-border overflow-hidden">
                    <Image src={url} alt={`Scene ${i + 1}`} width={300} height={200} className="w-full h-auto" unoptimized />
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="flex gap-3 justify-center">
          <Button onClick={handleNewChat} className="pixel-btn">
            <RotateCcw className="h-4 w-4 mr-2" />
            New Chat
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
