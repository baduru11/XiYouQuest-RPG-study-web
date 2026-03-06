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
  Loader2,
  Play,
  Trash2,
  Shield,
  ShieldOff,
  CheckSquare,
  Square,
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
  category: string;
}

interface HistorySession {
  id: string;
  characterName: string;
  characterId: string;
  characterVoiceId: string;
  characterImage: string | null;
  scenarioTitle: string;
  scenarioId: string;
  scenarioCategory: string;
  messageCount: number;
  avgScore: number | null;
  xpEarned: number;
  createdAt: string;
  endedAt: string | null;
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
  isRedirect?: boolean;
}

type ViewTab = "chat" | "history";
type ChatPhase = "select_companion" | "select_scenario" | "chatting";

interface CompanionChatClientProps {
  characters: EnrichedCharacter[];
  scenarios: Scenario[];
  backgroundMap: Record<string, string>;
  recentSessions: HistorySession[];
}

const CATEGORY_LABELS: Record<string, { zh: string; en: string }> = {
  modern_daily: { zh: "现代生活", en: "Modern Daily Life" },
  psc_exam: { zh: "PSC考试练习", en: "PSC Exam Practice" },
};

// ── Component ──

export default function CompanionChatClient({
  characters,
  scenarios,
  backgroundMap,
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
  const [turnCount, setTurnCount] = useState(0);
  const [softLimitDismissed, setSoftLimitDismissed] = useState(false);
  const [showSoftLimitDialog, setShowSoftLimitDialog] = useState(false);
  const [filterOffTopic, setFilterOffTopic] = useState(true);

  // Per-turn reward toast
  const [rewardToast, setRewardToast] = useState<{ xp: number; affection: number } | null>(null);

  // Loading step for start animation
  const [loadingStep, setLoadingStep] = useState(0);

  // History state
  const [historyDetail, setHistoryDetail] = useState<{ session: HistorySession; messages: ChatMessageUI[] } | null>(null);
  const [isResuming, setIsResuming] = useState(false);
  const [deletedSessionIds, setDeletedSessionIds] = useState<Set<string>>(new Set());

  // Multi-select state
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);

  // Audio
  const { effectiveTtsVolume } = useAudioSettings();
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const ttsCacheRef = useRef<Map<string, string>>(new Map());

  // Background overlay (C4 pattern)
  const bgOverlayRef = useRef<HTMLDivElement | null>(null);
  const pendingBgImageRef = useRef<string | null>(null);

  // Message scroll
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  // Achievement toast
  const { showAchievementToasts } = useAchievementToast();

  // ── Background overlay setup (C4 pattern) ──
  useEffect(() => {
    if (phase !== "chatting") return;

    document.body.style.isolation = "isolate";
    const pendingUrl = pendingBgImageRef.current;
    pendingBgImageRef.current = null;

    const overlay = document.createElement("div");
    const hasInitialBg = !!pendingUrl;
    overlay.style.cssText = `
      position: fixed; inset: 0; z-index: -1;
      background-color: #0a0a0a;
      background-size: cover; background-position: center; background-attachment: fixed;
      pointer-events: none;
      ${hasInitialBg
        ? `background-image: url("${pendingUrl.replace(/["\\]/g, "")}"); opacity: 1;`
        : `opacity: 0; transition: opacity 0.8s ease-in-out;`
      }
    `;
    document.body.appendChild(overlay);
    bgOverlayRef.current = overlay;

    return () => {
      overlay.remove();
      bgOverlayRef.current = null;
      document.body.style.isolation = "";
    };
  }, [phase]);

  // ── Cleanup TTS blob URLs and audio on unmount ──
  useEffect(() => {
    const audioRef = currentAudioRef;
    const cacheRef = ttsCacheRef;
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      for (const url of cacheRef.current.values()) {
        URL.revokeObjectURL(url);
      }
      cacheRef.current.clear();
    };
  }, []);

  // ── Auto-scroll ──
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Reward toast auto-dismiss ──
  useEffect(() => {
    if (!rewardToast) return;
    const timer = setTimeout(() => setRewardToast(null), 2500);
    return () => clearTimeout(timer);
  }, [rewardToast]);

  // ── TTS playback (cached) ──
  const playTTS = useCallback(async (text: string, voiceId: string) => {
    try {
      // Stop any currently playing audio
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current = null;
      }

      const cacheKey = `${voiceId}:${text}`;
      let blobUrl = ttsCacheRef.current.get(cacheKey);

      if (!blobUrl) {
        const res = await fetchWithRetry("/api/tts/companion", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ voiceId, text }),
        });

        if (!res.ok) return;

        const blob = await res.blob();
        blobUrl = URL.createObjectURL(blob);
        ttsCacheRef.current.set(cacheKey, blobUrl);
      }

      const audio = new Audio(blobUrl);
      audio.volume = effectiveTtsVolume;
      currentAudioRef.current = audio;

      audio.onended = () => {
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
      overlay.style.transition = "opacity 0.8s ease-in-out";
      overlay.style.backgroundImage = `url("${imageUrl.replace(/["\\]/g, "")}")`;
      requestAnimationFrame(() => { overlay.style.opacity = "1"; });
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
      formData.append("filterOffTopic", String(filterOffTopic));

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

      // Handle off-topic redirect
      if (data.isRedirect) {
        // Show user transcript + scores (they still practiced speaking)
        setMessages(prev => [...prev, {
          id: crypto.randomUUID(),
          role: "user",
          content: data.userTranscript,
          pronunciationScore: data.scores.pronunciation,
          toneScore: data.scores.tone,
          fluencyScore: data.scores.fluency,
        }]);

        // Show redirect with amber styling
        setMessages(prev => [...prev, {
          id: crypto.randomUUID(),
          role: "companion",
          content: data.companionReply,
          isRedirect: true,
        }]);

        // Still play TTS for the redirect
        playTTS(data.companionReply, selectedCharacter.voiceId);

        // Do NOT update turnCount or trigger image generation
        setIsProcessing(false);
        return;
      }

      const newTurnCount = data.turnNumber;
      setTurnCount(newTurnCount);

      // Show per-turn reward toast
      if (data.xpEarned > 0 || data.affectionEarned > 0) {
        setRewardToast({ xp: data.xpEarned, affection: data.affectionEarned ?? 0 });
      }

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

      // Check soft limit
      if (newTurnCount >= 20 && !softLimitDismissed) {
        setShowSoftLimitDialog(true);
      }

      // Generate image every 4 user turns (non-blocking)
      if (newTurnCount > 0 && newTurnCount % 3 === 0) {
        // Build conversation summary from last 8 messages (use ref for latest state)
        const recentMsgs = messagesRef.current.slice(-8).map(m =>
          `${m.role === "user" ? "User" : selectedCharacter.name}: ${m.content}`
        ).join("\n");

        fetchWithRetry("/api/chat/generate-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId,
            conversationSummary: recentMsgs,
            characterName: selectedCharacter.name,
            scenarioTitle: selectedScenario?.title,
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
  }, [sessionId, selectedCharacter, selectedScenario, playTTS, showBackgroundImage, softLimitDismissed, filterOffTopic]);

  // ── Reset to start ──
  const handleNewChat = useCallback(() => {
    setPhase("select_companion");
    setSelectedCharacter(null);
    setSelectedScenario(null);
    setSessionId(null);
    setMessages([]);
    setTurnCount(0);
    setSoftLimitDismissed(false);
    setShowSoftLimitDialog(false);
    setRewardToast(null);

    // Free cached TTS blob URLs
    for (const url of ttsCacheRef.current.values()) {
      URL.revokeObjectURL(url);
    }
    ttsCacheRef.current.clear();

    // Fade out background
    if (bgOverlayRef.current) {
      bgOverlayRef.current.style.opacity = "0";
    }
  }, []);

  // ── End conversation — just exit, rewards already given per turn ──
  const handleEndChat = useCallback(async () => {
    if (!sessionId) return;

    setShowSoftLimitDialog(false);

    // Fire-and-forget: mark session ended + check achievements server-side
    const closingSessionId = sessionId;
    fetchWithRetry("/api/chat/end", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: closingSessionId }),
    }).then(async (res) => {
      if (res.ok) {
        const data = await res.json();
        if (data.newAchievements?.length > 0) {
          showAchievementToasts(data.newAchievements);
        }
      }
    }).catch((err) => console.error("[Chat] End error:", err));

    // Immediately go back to companion select
    handleNewChat();
  }, [sessionId, showAchievementToasts, handleNewChat]);

  // ── Resume session ──
  const handleResumeSession = useCallback(async (session: HistorySession) => {
    setIsResuming(true);
    try {
      const res = await fetchWithRetry("/api/chat/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: session.id }),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "Failed to resume session");
        return;
      }

      const data = await res.json();

      // Find matching character from props
      const char = characters.find(c => c.id === session.characterId);
      const scen = scenarios.find(s => s.id === session.scenarioId);

      if (char) setSelectedCharacter(char);
      if (scen) setSelectedScenario(scen);

      setSessionId(session.id);
      setMessages((data.messages ?? []).map((m: { id: string; role: string; content: string; pronunciation_score: number | null; tone_score: number | null; fluency_score: number | null; image_url: string | null }) => ({
        id: m.id,
        role: m.role as "user" | "companion",
        content: m.content,
        pronunciationScore: m.pronunciation_score ?? undefined,
        toneScore: m.tone_score ?? undefined,
        fluencyScore: m.fluency_score ?? undefined,
        imageUrl: m.image_url ?? undefined,
      })));
      setTurnCount(Math.floor((data.session.message_count ?? 0) / 2));
      setSoftLimitDismissed(false);
      setShowSoftLimitDialog(false);

      // Queue the last generated image to show once the overlay mounts
      // Fall back to character-specific scenario background if no in-conversation image exists
      const lastImageMsg = [...(data.messages ?? [])].reverse().find(
        (m: { image_url: string | null }) => m.image_url
      );
      const resumeBgKey = `${session.scenarioId}:${session.characterId}`;
      pendingBgImageRef.current = lastImageMsg?.image_url ?? backgroundMap[resumeBgKey] ?? null;

      setPhase("chatting");
      setActiveTab("chat");
      setHistoryDetail(null);
    } catch (err) {
      console.error("[Chat] Resume error:", err);
      alert("Failed to resume session.");
    } finally {
      setIsResuming(false);
    }
  }, [characters, scenarios]);

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

  // ── Delete session ──
  const handleDeleteSession = useCallback(async (sessionId: string) => {
    if (!confirm("Delete this conversation? This cannot be undone.")) return;

    try {
      const res = await fetchWithRetry("/api/chat/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });

      if (res.ok) {
        setDeletedSessionIds(prev => new Set(prev).add(sessionId));
        // If viewing this session's detail, go back to list
        if (historyDetail?.session.id === sessionId) {
          setHistoryDetail(null);
        }
      }
    } catch (err) {
      console.error("[Chat] Delete error:", err);
    }
  }, [historyDetail]);

  // ── Multi-select helpers ──
  const toggleSelectMode = useCallback(() => {
    setIsSelecting(prev => {
      if (prev) setSelectedIds(new Set());
      return !prev;
    });
    // Close detail view when entering select mode
    setHistoryDetail(null);
  }, []);

  const toggleSessionSelection = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleBulkDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} conversation(s)? This cannot be undone.`)) return;

    setIsDeleting(true);
    const ids = [...selectedIds];
    const results = await Promise.allSettled(
      ids.map(id =>
        fetchWithRetry("/api/chat/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: id }),
        })
      )
    );

    setDeletedSessionIds(prev => {
      const next = new Set(prev);
      ids.forEach((id, i) => {
        if (results[i].status === "fulfilled") next.add(id);
      });
      return next;
    });

    if (historyDetail && selectedIds.has(historyDetail.session.id)) {
      setHistoryDetail(null);
    }

    setSelectedIds(new Set());
    setIsSelecting(false);
    setIsDeleting(false);
  }, [selectedIds, historyDetail]);

  // ── Score helpers ──
  const formatAvgScore = (score: number | null) => {
    if (score === null || score === undefined) return "—";
    return Math.round(score).toString();
  };

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
      const isActive = historyDetail.session.endedAt === null;
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
            <div className="flex items-center justify-between">
              <div>
                <p className="font-pixel text-sm text-primary">{historyDetail.session.characterName}</p>
                <p className="text-sm text-muted-foreground">{historyDetail.session.scenarioTitle}</p>
              </div>
              {isActive && (
                <span className="px-2 py-0.5 text-[10px] font-pixel bg-green-100 text-green-700 border border-green-400 dark:bg-green-950 dark:text-green-400">
                  Active
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
              <span>{new Date(historyDetail.session.createdAt).toLocaleDateString()}</span>
              <span>{historyDetail.session.messageCount} messages</span>
              {historyDetail.session.avgScore !== null && historyDetail.session.avgScore > 0 && (
                <span className={getScoreColor(historyDetail.session.avgScore)}>
                  Avg: {formatAvgScore(historyDetail.session.avgScore)}
                </span>
              )}
            </div>
            <div className="mt-3 flex gap-2">
              <Button
                size="sm"
                onClick={() => handleResumeSession(historyDetail.session)}
                disabled={isResuming}
                className="pixel-btn text-xs"
              >
                {isResuming ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Play className="h-3 w-3 mr-1" />}
                {isActive ? "Continue" : "Resume"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleDeleteSession(historyDetail.session.id)}
                className="text-xs text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-3 w-3 mr-1" /> Delete
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            {historyDetail.messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] pixel-border p-3 ${
                  msg.role === "user" ? "bg-card border-primary/30" : "bg-card"
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

    // Session list — filter deleted, active sessions sort to top
    const sortedSessions = [...recentSessions]
      .filter(s => !deletedSessionIds.has(s.id))
      .sort((a, b) => {
        if (a.endedAt === null && b.endedAt !== null) return -1;
        if (a.endedAt !== null && b.endedAt === null) return 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

    const allSelected = sortedSessions.length > 0 && sortedSessions.every(s => selectedIds.has(s.id));

    return (
      <div className="mx-auto max-w-2xl space-y-4">
        {renderTabBar()}
        <div className="flex items-center justify-between">
          <h2 className="font-pixel text-sm text-foreground">Chat History</h2>
          {sortedSessions.length > 0 && (
            <button
              onClick={toggleSelectMode}
              className="font-pixel text-xs text-primary hover:text-primary/80 transition-colors"
            >
              {isSelecting ? "Cancel" : "Select"}
            </button>
          )}
        </div>
        {isSelecting && sortedSessions.length > 0 && (
          <div className="flex items-center justify-between">
            <button
              onClick={() => {
                if (allSelected) {
                  setSelectedIds(new Set());
                } else {
                  setSelectedIds(new Set(sortedSessions.map(s => s.id)));
                }
              }}
              className="font-pixel text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
            >
              {allSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
              {allSelected ? "Deselect All" : "Select All"}
            </button>
            {selectedIds.size > 0 && (
              <span className="font-pixel text-xs text-muted-foreground">{selectedIds.size} selected</span>
            )}
          </div>
        )}
        {sortedSessions.length === 0 ? (
          <div className="pixel-border bg-card p-4 sm:p-8 text-center">
            <p className="text-muted-foreground">No conversations yet. Start chatting!</p>
          </div>
        ) : (
          <div className="space-y-2">
            {sortedSessions.map((session) => {
              const isActive = session.endedAt === null;
              const isSelected = selectedIds.has(session.id);
              return (
                <div
                  key={session.id}
                  className={`pixel-border chinese-corner bg-card px-4 py-3 hover:pixel-border-primary transition-all ${
                    isActive ? "border-green-400/50" : ""
                  } ${isSelected ? "ring-2 ring-primary/50" : ""}`}
                >
                  <div className="flex items-center justify-between">
                    {isSelecting && (
                      <button
                        onClick={() => toggleSessionSelection(session.id)}
                        className="mr-3 shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {isSelected
                          ? <CheckSquare className="h-5 w-5 text-primary" />
                          : <Square className="h-5 w-5" />
                        }
                      </button>
                    )}
                    <button
                      onClick={() => {
                        if (isSelecting) {
                          toggleSessionSelection(session.id);
                        } else if (isActive) {
                          handleResumeSession(session);
                        } else {
                          handleViewHistory(session);
                        }
                      }}
                      disabled={isResuming}
                      className="flex-1 text-left disabled:opacity-50"
                    >
                      <div className="flex items-center gap-2">
                        <p className="font-pixel text-sm text-foreground">{session.characterName}</p>
                        {isActive && (
                          <span className="px-1.5 py-0.5 text-[10px] font-pixel bg-green-100 text-green-700 border border-green-400 dark:bg-green-950 dark:text-green-400">
                            Active
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{session.scenarioTitle}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-muted-foreground">
                          {new Date(session.createdAt).toLocaleDateString()}
                        </span>
                        <span className="font-pixel text-xs text-primary">
                          {session.messageCount} msgs
                        </span>
                        {session.avgScore !== null && session.avgScore > 0 && (
                          <span className={`font-pixel text-xs ${getScoreColor(session.avgScore)}`}>
                            Avg: {formatAvgScore(session.avgScore)}
                          </span>
                        )}
                      </div>
                    </button>
                    {!isSelecting && (
                      <button
                        onClick={() => handleDeleteSession(session.id)}
                        className="ml-2 p-1.5 text-muted-foreground hover:text-destructive transition-colors shrink-0"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {isSelecting && selectedIds.size > 0 && (
          <div className="sticky bottom-4 flex items-center justify-between pixel-border bg-card px-4 py-3 shadow-lg">
            <span className="font-pixel text-sm text-foreground">{selectedIds.size} selected</span>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleBulkDelete}
              disabled={isDeleting}
              className="font-pixel"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-1.5" />
                  Delete
                </>
              )}
            </Button>
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

  // Phase: Select Scenario — grouped by category
  if (phase === "select_scenario") {
    // Group by category
    const modernDaily = scenarios.filter(s => s.category === "modern_daily");
    const pscExam = scenarios.filter(s => s.category === "psc_exam");

    const renderScenarioButton = (scenario: Scenario) => (
      <button
        key={scenario.id}
        onClick={async () => {
          setSelectedScenario(scenario);
          setIsStarting(true);
          setLoadingStep(0);
          setTimeout(() => setLoadingStep(1), 1200);
          setTimeout(() => setLoadingStep(2), 2800);

          // Preload background image while API call runs
          const bgUrl = backgroundMap[`${scenario.id}:${selectedCharacter!.id}`];
          if (bgUrl) {
            const preload = new window.Image();
            preload.src = bgUrl;
          }

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
            const openingMsgId = crypto.randomUUID();
            setSessionId(data.sessionId);
            setMessages([{
              id: openingMsgId,
              role: "companion",
              content: data.openingMessage,
            }]);
            setTurnCount(0);
            setSoftLimitDismissed(false);

            // Queue background before phase change so the overlay effect picks it up
            pendingBgImageRef.current = bgUrl ?? null;

            setPhase("chatting");

            // Play TTS from inline audio (no extra API call) or fall back
            if (data.ttsAudio) {
              try {
                const binaryStr = atob(data.ttsAudio);
                const bytes = new Uint8Array(binaryStr.length);
                for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
                const blob = new Blob([bytes], { type: "audio/wav" });
                const blobUrl = URL.createObjectURL(blob);
                // Cache it for "Listen" replays
                const cacheKey = `${selectedCharacter!.voiceId}:${data.openingMessage}`;
                ttsCacheRef.current.set(cacheKey, blobUrl);
                const audio = new Audio(blobUrl);
                audio.volume = effectiveTtsVolume;
                currentAudioRef.current = audio;
                audio.onended = () => { currentAudioRef.current = null; };
                await audio.play();
              } catch { playTTS(data.openingMessage, selectedCharacter!.voiceId); }
            } else {
              playTTS(data.openingMessage, selectedCharacter!.voiceId);
            }

            // Attach background URL to opening message for history
            if (bgUrl) {
              setMessages(prev => prev.map(m =>
                m.id === openingMsgId ? { ...m, imageUrl: bgUrl } : m
              ));
            }
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
    );

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

        {/* Modern Daily Life */}
        {modernDaily.length > 0 && (
          <div className="space-y-2">
            <p className="font-pixel text-xs text-muted-foreground">
              {CATEGORY_LABELS.modern_daily.zh} — {CATEGORY_LABELS.modern_daily.en}
            </p>
            {modernDaily.map(renderScenarioButton)}
          </div>
        )}

        {/* PSC Exam */}
        {pscExam.length > 0 && (
          <div className="space-y-2">
            <p className="font-pixel text-xs text-muted-foreground">
              {CATEGORY_LABELS.psc_exam.zh} — {CATEGORY_LABELS.psc_exam.en}
            </p>
            {pscExam.map(renderScenarioButton)}
          </div>
        )}

        {isStarting && (() => {
          const steps = [
            `Summoning ${selectedCharacter?.name ?? "companion"}...`,
            `Setting the scene...`,
            `Preparing dialogue...`,
          ];
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-md animate-in fade-in duration-300">
              <div className="flex flex-col items-center gap-4 sm:gap-6 px-4 sm:px-8">
                {/* Character image */}
                {selectedCharacter?.image && (
                  <div className="relative h-28 w-28 pixel-border bg-muted overflow-hidden animate-in zoom-in-75 duration-500">
                    <Image src={selectedCharacter.image} alt="" fill className="object-contain" unoptimized />
                  </div>
                )}

                {/* Scenario title */}
                <div className="text-center space-y-1 animate-in fade-in slide-in-from-bottom-2 duration-500">
                  <p className="font-pixel text-sm text-primary">{selectedCharacter?.name}</p>
                  <p className="font-chinese text-base text-foreground">{selectedScenario?.title}</p>
                </div>

                {/* Loading steps */}
                <div className="space-y-2 min-w-[200px]">
                  {steps.map((step, i) => (
                    <div
                      key={i}
                      className={`flex items-center gap-2 text-xs font-pixel transition-all duration-500 ${
                        i <= loadingStep ? "opacity-100 translate-x-0" : "opacity-0 translate-x-4"
                      }`}
                    >
                      {i < loadingStep ? (
                        <span className="h-3 w-3 text-green-500">✓</span>
                      ) : i === loadingStep ? (
                        <Loader2 className="h-3 w-3 animate-spin text-primary" />
                      ) : (
                        <span className="h-3 w-3" />
                      )}
                      <span className={i <= loadingStep ? "text-foreground" : "text-muted-foreground"}>
                        {step}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    );
  }

  // Phase: Chatting
  if (phase === "chatting") {
    return (
      <div className="mx-auto max-w-2xl flex flex-col" style={{ height: "calc(100dvh - 5rem)" }}>
        {/* Loading overlay — shown while starting session */}
        {isStarting && (() => {
          const steps = [
            `Summoning ${selectedCharacter?.name ?? "companion"}...`,
            `Setting the scene...`,
            `Preparing dialogue...`,
          ];
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-md animate-in fade-in duration-300">
              <div className="flex flex-col items-center gap-4 sm:gap-6 px-4 sm:px-8">
                {selectedCharacter?.image && (
                  <div className="relative h-28 w-28 pixel-border bg-muted overflow-hidden animate-in zoom-in-75 duration-500">
                    <Image src={selectedCharacter.image} alt="" fill className="object-contain" unoptimized />
                  </div>
                )}
                <div className="text-center space-y-1 animate-in fade-in slide-in-from-bottom-2 duration-500">
                  <p className="font-pixel text-sm text-primary">{selectedCharacter?.name}</p>
                  <p className="font-chinese text-base text-foreground">{selectedScenario?.title}</p>
                </div>
                <div className="space-y-2 min-w-[200px]">
                  {steps.map((step, i) => (
                    <div
                      key={i}
                      className={`flex items-center gap-2 text-xs font-pixel transition-all duration-500 ${
                        i <= loadingStep ? "opacity-100 translate-x-0" : "opacity-0 translate-x-4"
                      }`}
                    >
                      {i < loadingStep ? (
                        <span className="h-3 w-3 text-green-500">✓</span>
                      ) : i === loadingStep ? (
                        <Loader2 className="h-3 w-3 animate-spin text-primary" />
                      ) : (
                        <span className="h-3 w-3" />
                      )}
                      <span className={i <= loadingStep ? "text-foreground" : "text-muted-foreground"}>
                        {step}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })()}
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
          <span className="font-pixel text-xs text-muted-foreground">{turnCount} turns</span>
          <button
            onClick={() => setFilterOffTopic(prev => !prev)}
            title={filterOffTopic ? "Topic filter: ON" : "Topic filter: OFF"}
            className={`p-1.5 transition-colors ${
              filterOffTopic
                ? "text-primary hover:text-primary/70"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {filterOffTopic ? <Shield className="h-4 w-4" /> : <ShieldOff className="h-4 w-4" />}
          </button>
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
        <div className="flex-1 overflow-y-auto py-4 px-1 space-y-3 bg-background/30 relative">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className="max-w-[80%]">
                {/* Companion messages */}
                {msg.role === "companion" && (
                  <div className={`pixel-border backdrop-blur-sm p-3 ${
                    msg.isRedirect
                      ? "bg-amber-50 border-amber-400 dark:bg-amber-950/30 dark:border-amber-600"
                      : "bg-card/90"
                  }`}>
                    {msg.content === "..." ? (
                      <div className="flex gap-1">
                        <span className="h-2 w-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                        <span className="h-2 w-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                        <span className="h-2 w-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                      </div>
                    ) : (
                      <>
                        {msg.isRedirect && (
                          <span className="inline-block mb-1 px-1.5 py-0.5 text-[10px] font-pixel bg-amber-200 text-amber-800 dark:bg-amber-800 dark:text-amber-200 border border-amber-400">
                            Off-topic
                          </span>
                        )}
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
                  <div className="pixel-border bg-card border-primary/30 p-3">
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

          {/* Per-turn reward toast */}
          {rewardToast && (
            <div className="sticky bottom-2 mx-auto w-fit px-3 py-1.5 rounded-full bg-primary/90 text-primary-foreground text-xs font-pixel shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-300">
              +{rewardToast.xp} XP  +{rewardToast.affection} Affection
            </div>
          )}
        </div>

        {/* Soft limit dialog */}
        {showSoftLimitDialog && (
          <div className="pixel-border bg-card/95 backdrop-blur-sm p-4 mx-1 mb-1 shrink-0 space-y-3">
            <p className="font-chinese text-sm text-foreground text-center">
              Great conversation! You&apos;ve had {turnCount} turns.
            </p>
            <p className="text-xs text-muted-foreground text-center">
              Leave the chat, or keep going?
            </p>
            <div className="flex gap-2 justify-center">
              <Button size="sm" onClick={handleEndChat} disabled={isProcessing} className="pixel-btn text-xs">
                <LogOut className="h-3 w-3 mr-1" /> Leave
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => { setShowSoftLimitDialog(false); setSoftLimitDismissed(true); }}
                className="text-xs"
              >
                Keep Going
              </Button>
            </div>
          </div>
        )}

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


  return null;
}
