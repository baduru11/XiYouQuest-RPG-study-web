"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Progress } from "@/components/ui/progress";
import {
  User,
  Users,
  ArrowUp,
  ArrowDown,
  Flame,
  Copy,
  Check,
  Search,
  UserPlus,
  X,
} from "lucide-react";
import { toast } from "sonner";

interface SocialClientProps {
  userId: string;
  friendCode: string | null;
  hasDiscord: boolean;
}

interface UserResult {
  id: string;
  display_name: string;
  avatar_url: string | null;
  current_level: number;
  friend_code?: string;
}

interface RequestEntry {
  friendship_id: string;
  created_at: string;
  user: {
    id: string;
    display_name: string;
    avatar_url: string | null;
    current_level: number;
  };
}

interface FriendStats {
  friendship_id: string;
  id: string;
  display_name: string;
  avatar_url: string | null;
  current_level: number;
  total_xp: number;
  login_streak: number;
  total_sessions: number;
  avg_scores: Record<string, number>;
  selected_character: { name: string; image_url: string } | null;
}

interface SelfStats {
  id: string;
  display_name: string;
  avatar_url: string | null;
  current_level: number;
  total_xp: number;
  login_streak: number;
  total_sessions: number;
  avg_scores: Record<string, number>;
  selected_character: { name: string; image_url: string } | null;
}

const COMPONENT_LABELS: Record<string, string> = {
  "1": "C1",
  "2": "C2",
  "3": "C3",
  "4": "C4",
  "5": "C5",
  "6": "C6",
  "7": "C7",
};

const SCORE_BAR_CLASSES = [
  "h-2 flex-1 [&>[data-slot=progress-indicator]]:bg-pixel-blue",
  "h-2 flex-1 [&>[data-slot=progress-indicator]]:bg-pixel-green",
  "h-2 flex-1 [&>[data-slot=progress-indicator]]:bg-pixel-amber",
  "h-2 flex-1 [&>[data-slot=progress-indicator]]:bg-pixel-gold",
  "h-2 flex-1 [&>[data-slot=progress-indicator]]:bg-pixel-red",
  "h-2 flex-1 [&>[data-slot=progress-indicator]]:bg-purple-500",
  "h-2 flex-1 [&>[data-slot=progress-indicator]]:bg-teal-500",
];

export function SocialClient({
  userId,
  friendCode,
  hasDiscord,
}: SocialClientProps) {
  const [copied, setCopied] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [codeQuery, setCodeQuery] = useState("");
  const [searchResults, setSearchResults] = useState<UserResult[]>([]);
  const [codeResult, setCodeResult] = useState<UserResult | null>(null);
  const [codeNotFound, setCodeNotFound] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [codeLoading, setCodeLoading] = useState(false);
  const [requestedIds, setRequestedIds] = useState<Set<string>>(new Set());
  const [sendingIds, setSendingIds] = useState<Set<string>>(new Set());
  const [discordSuggestions, setDiscordSuggestions] = useState<UserResult[]>([]);
  const [discordLoading, setDiscordLoading] = useState(false);
  const [incoming, setIncoming] = useState<RequestEntry[]>([]);
  const [outgoing, setOutgoing] = useState<RequestEntry[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [respondingIds, setRespondingIds] = useState<Set<string>>(new Set());
  const [friends, setFriends] = useState<FriendStats[]>([]);
  const [selfStats, setSelfStats] = useState<SelfStats | null>(null);
  const [friendsLoading, setFriendsLoading] = useState(true);
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());
  const [requestsError, setRequestsError] = useState<string | null>(null);
  const [friendsError, setFriendsError] = useState<string | null>(null);

  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const copyFriendCode = useCallback(() => {
    if (!friendCode) return;
    const codeOnly = friendCode.replace("PSC-", "");
    navigator.clipboard.writeText(codeOnly).then(() => {
      setCopied(true);
      toast.success("Friend code copied!");
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      toast.error("Failed to copy friend code");
    });
  }, [friendCode]);

  const searchByName = useCallback(async (query: string) => {
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }
    setSearchLoading(true);
    try {
      const res = await fetch(`/api/social/search?q=${encodeURIComponent(query)}`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.filter((u: UserResult) => u.id !== userId));
      } else {
        setSearchResults([]);
      }
    } catch {
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, [userId]);

  const lookupByCode = useCallback(async (code: string) => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed || trimmed.length < 4) {
      setCodeResult(null);
      setCodeNotFound(false);
      return;
    }
    const fullCode = trimmed.startsWith("PSC-") ? trimmed : `PSC-${trimmed}`;
    setCodeLoading(true);
    setCodeNotFound(false);
    try {
      const res = await fetch(`/api/social/lookup?code=${encodeURIComponent(fullCode)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.id === userId) {
          setCodeResult(null);
          setCodeNotFound(true);
        } else {
          setCodeResult(data);
        }
      } else {
        setCodeResult(null);
        setCodeNotFound(true);
      }
    } catch {
      setCodeResult(null);
      setCodeNotFound(true);
    } finally {
      setCodeLoading(false);
    }
  }, [userId]);

  const sendRequest = useCallback(async (addresseeId: string) => {
    setSendingIds((prev) => new Set(prev).add(addresseeId));
    try {
      const res = await fetch("/api/social/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addressee_id: addresseeId }),
      });
      if (res.ok) {
        setRequestedIds((prev) => new Set(prev).add(addresseeId));
        toast.success("Friend request sent!");
        fetchRequests();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Failed to send request");
      }
    } catch {
      toast.error("Failed to send request");
    } finally {
      setSendingIds((prev) => {
        const next = new Set(prev);
        next.delete(addresseeId);
        return next;
      });
    }
  }, []);

  const respondToRequest = useCallback(
    async (friendshipId: string, action: "accept" | "reject") => {
      setRespondingIds((prev) => new Set(prev).add(friendshipId));
      try {
        const res = await fetch("/api/social/respond", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ friendship_id: friendshipId, action }),
        });
        if (res.ok) {
          toast.success(action === "accept" ? "Friend added!" : "Request rejected");
          fetchRequests();
          fetchFriends();
        } else {
          const data = await res.json().catch(() => ({}));
          toast.error(data.error || "Failed to respond");
        }
      } catch {
        toast.error("Failed to respond to request");
      } finally {
        setRespondingIds((prev) => {
          const next = new Set(prev);
          next.delete(friendshipId);
          return next;
        });
      }
    },
    []
  );

  const cancelRequest = useCallback(async (friendshipId: string) => {
    setRespondingIds((prev) => new Set(prev).add(friendshipId));
    try {
      const res = await fetch(`/api/social/remove?id=${friendshipId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        toast.success("Request cancelled");
        fetchRequests();
      } else {
        toast.error("Failed to cancel request");
      }
    } catch {
      toast.error("Failed to cancel request");
    } finally {
      setRespondingIds((prev) => {
        const next = new Set(prev);
        next.delete(friendshipId);
        return next;
      });
    }
  }, []);

  const removeFriend = useCallback(async (friendshipId: string) => {
    setRemovingIds((prev) => new Set(prev).add(friendshipId));
    try {
      const res = await fetch(`/api/social/remove?id=${friendshipId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        toast.success("Friend removed");
        fetchFriends();
      } else {
        toast.error("Failed to remove friend");
      }
    } catch {
      toast.error("Failed to remove friend");
    } finally {
      setRemovingIds((prev) => {
        const next = new Set(prev);
        next.delete(friendshipId);
        return next;
      });
    }
  }, []);

  const fetchRequests = useCallback(async () => {
    try {
      const res = await fetch("/api/social/requests");
      if (!res.ok) throw new Error("Failed to load requests");
      const data = await res.json();
      setIncoming(data.incoming || []);
      setOutgoing(data.outgoing || []);
      const outIds = new Set<string>((data.outgoing || []).map((o: RequestEntry) => o.user.id));
      setRequestedIds(outIds);
      setRequestsError(null);
    } catch {
      setRequestsError("Failed to load friend requests");
    } finally {
      setRequestsLoading(false);
    }
  }, []);

  const fetchFriends = useCallback(async () => {
    try {
      const res = await fetch("/api/social/friends");
      if (!res.ok) throw new Error("Failed to load friends");
      const data = await res.json();
      setSelfStats(data.self || null);
      setFriends(data.friends || []);
      setFriendsError(null);
    } catch {
      setFriendsError("Failed to load friends list");
    } finally {
      setFriendsLoading(false);
    }
  }, []);

  const fetchDiscordSuggestions = useCallback(async () => {
    if (!hasDiscord) return;
    setDiscordLoading(true);
    try {
      const res = await fetch("/api/social/discord-suggestions");
      if (res.ok) {
        const data = await res.json();
        setDiscordSuggestions(data.filter((u: UserResult) => u.id !== userId));
      }
    } catch {
      // silently fail
    } finally {
      setDiscordLoading(false);
    }
  }, [hasDiscord, userId]);

  useEffect(() => {
    fetchRequests();
    fetchFriends();
    fetchDiscordSuggestions();
  }, [fetchRequests, fetchFriends, fetchDiscordSuggestions]);

  useEffect(() => {
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
    }
    if (searchQuery.length < 2) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }
    setSearchLoading(true);
    searchTimerRef.current = setTimeout(() => {
      searchByName(searchQuery);
    }, 300);
    return () => {
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }
    };
  }, [searchQuery, searchByName]);

  const totalPendingRequests = incoming.length + outgoing.length;
  const friendIds = new Set(friends.map((f) => f.id));

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="font-pixel text-base text-primary pixel-glow">Social</h1>
        {friendCode && (
          <button
            onClick={copyFriendCode}
            className="flex items-center gap-2 pixel-border bg-accent/50 px-4 py-2 cursor-pointer hover:bg-accent/70 transition-colors"
          >
            <span className="font-pixel text-xs text-foreground">{friendCode}</span>
            {copied ? (
              <Check className="h-4 w-4 text-pixel-green" />
            ) : (
              <Copy className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
        )}
      </div>

      {/* Section 1: Add Friends */}
      <div className="pixel-border bg-card/60 p-4 space-y-4">
        <h2 className="font-pixel text-xs text-foreground flex items-center gap-2">
          <UserPlus className="h-4 w-4" />
          Add Friends
        </h2>

        <div className="flex flex-col sm:flex-row gap-3">
          {/* Name Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-9 pl-9 pr-3 py-1 border-2 border-border bg-card text-base font-retro placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-primary/30 focus-visible:ring-[3px] outline-none transition-[color,box-shadow]"
            />
          </div>

          {/* Friend Code Input */}
          <div className="sm:w-56 relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-base font-retro text-muted-foreground">
              PSC-
            </span>
            <input
              type="text"
              placeholder="XXXX"
              value={codeQuery}
              onChange={(e) => setCodeQuery(e.target.value.replace(/[^A-Za-z0-9]/g, "").slice(0, 4))}
              onKeyDown={(e) => {
                if (e.key === "Enter") lookupByCode(codeQuery);
              }}
              className="w-full h-9 pl-14 pr-3 py-1 border-2 border-border bg-card text-base font-retro uppercase placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-primary/30 focus-visible:ring-[3px] outline-none transition-[color,box-shadow]"
            />
            <Button
              size="xs"
              variant="ghost"
              className="absolute right-1 top-1/2 -translate-y-1/2"
              onClick={() => lookupByCode(codeQuery)}
              disabled={codeLoading || codeQuery.length < 4}
            >
              <Search className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {/* Search Results */}
        {searchLoading && searchQuery.length >= 2 && (
          <div className="space-y-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-2">
                <div className="h-8 w-8 rounded-sm animate-shimmer" />
                <div className="flex-1 space-y-1">
                  <div className="h-4 w-24 rounded animate-shimmer" />
                  <div className="h-3 w-16 rounded animate-shimmer" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!searchLoading && searchResults.length > 0 && (
          <div className="space-y-1">
            {searchResults.map((user) => (
              <UserResultCard
                key={user.id}
                user={user}
                requested={requestedIds.has(user.id)}
                sending={sendingIds.has(user.id)}
                isFriend={friendIds.has(user.id)}
                onAdd={() => sendRequest(user.id)}
              />
            ))}
          </div>
        )}

        {!searchLoading && searchQuery.length >= 2 && searchResults.length === 0 && (
          <p className="text-base font-retro text-muted-foreground px-2">
            No users found for &quot;{searchQuery}&quot;
          </p>
        )}

        {/* Code Lookup Result */}
        {codeLoading && (
          <div className="flex items-center gap-3 p-2">
            <div className="h-8 w-8 rounded-sm animate-shimmer" />
            <div className="flex-1 space-y-1">
              <div className="h-4 w-24 rounded animate-shimmer" />
            </div>
          </div>
        )}

        {!codeLoading && codeResult && (
          <UserResultCard
            user={codeResult}
            requested={requestedIds.has(codeResult.id)}
            sending={sendingIds.has(codeResult.id)}
            isFriend={friendIds.has(codeResult.id)}
            onAdd={() => sendRequest(codeResult.id)}
          />
        )}

        {!codeLoading && codeNotFound && codeQuery.length >= 4 && (
          <p className="text-base font-retro text-muted-foreground px-2">
            No user found with that friend code
          </p>
        )}

        {/* Discord Suggestions */}
        {hasDiscord && (
          <>
            {discordLoading && (
              <div className="space-y-2 pt-2">
                <div className="h-4 w-48 rounded animate-shimmer" />
                <div className="flex items-center gap-3 p-2">
                  <div className="h-8 w-8 rounded-sm animate-shimmer" />
                  <div className="flex-1 h-4 w-24 rounded animate-shimmer" />
                </div>
              </div>
            )}

            {!discordLoading && discordSuggestions.length > 0 && (
              <div className="pt-2 border-t-2 border-border space-y-2">
                <h3 className="font-pixel text-[10px] text-muted-foreground flex items-center gap-2">
                  <Users className="h-3 w-3" />
                  Discord Friends on PSC Quest
                </h3>
                <div className="space-y-1">
                  {discordSuggestions.map((user) => (
                    <UserResultCard
                      key={user.id}
                      user={user}
                      requested={requestedIds.has(user.id)}
                      sending={sendingIds.has(user.id)}
                      isFriend={friendIds.has(user.id)}
                      onAdd={() => sendRequest(user.id)}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Section 2: Pending Requests */}
      {requestsError && (
        <div className="pixel-border bg-destructive/10 p-4 text-center">
          <p className="text-base font-retro text-destructive">{requestsError}</p>
          <Button size="xs" variant="outline" className="mt-2" onClick={fetchRequests}>
            Retry
          </Button>
        </div>
      )}
      {!requestsLoading && !requestsError && totalPendingRequests > 0 && (
        <div className="pixel-border bg-card/60 p-4 space-y-4">
          <h2 className="font-pixel text-xs text-foreground flex items-center gap-2">
            <Users className="h-4 w-4" />
            Friend Requests ({totalPendingRequests})
          </h2>

          {/* Incoming */}
          {incoming.length > 0 && (
            <div className="space-y-2">
              <p className="text-lg font-retro font-bold text-foreground">Incoming</p>
              {incoming.map((req) => (
                <div
                  key={req.friendship_id}
                  className="flex items-center gap-3 p-2 bg-accent/30 pixel-border"
                >
                  <div className="h-8 w-8 pixel-border bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                    {req.user.avatar_url ? (
                      <img
                        src={req.user.avatar_url}
                        alt={req.user.display_name || "User avatar"}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <User className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-lg font-retro font-bold text-foreground truncate">
                      {req.user.display_name}
                    </p>
                    <span className="text-sm font-retro text-amber-700 bg-amber-100 px-1.5 py-0.5">
                      Lv.{req.user.current_level}
                    </span>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <Button
                      size="xs"
                      onClick={() => respondToRequest(req.friendship_id, "accept")}
                      disabled={respondingIds.has(req.friendship_id)}
                      className="bg-pixel-green hover:bg-pixel-green/80 text-white border-pixel-green/50"
                    >
                      <Check className="h-3 w-3" />
                    </Button>
                    <Button
                      size="xs"
                      variant="destructive"
                      onClick={() => respondToRequest(req.friendship_id, "reject")}
                      disabled={respondingIds.has(req.friendship_id)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Outgoing */}
          {outgoing.length > 0 && (
            <div className="space-y-2">
              <p className="text-lg font-retro font-bold text-foreground">Outgoing</p>
              {outgoing.map((req) => (
                <div
                  key={req.friendship_id}
                  className="flex items-center gap-3 p-2 bg-accent/30 pixel-border"
                >
                  <div className="h-8 w-8 pixel-border bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                    {req.user.avatar_url ? (
                      <img
                        src={req.user.avatar_url}
                        alt={req.user.display_name || "User avatar"}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <User className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-lg font-retro font-bold text-foreground truncate">
                      {req.user.display_name}
                    </p>
                    <span className="text-sm font-retro text-amber-700 bg-amber-100 px-1.5 py-0.5">
                      Lv.{req.user.current_level}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-base font-retro text-muted-foreground">Pending...</span>
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => cancelRequest(req.friendship_id)}
                      disabled={respondingIds.has(req.friendship_id)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Section 3: Friends List */}
      <div className="space-y-4">
        <h2 className="font-pixel text-xs text-foreground flex items-center gap-2">
          <Users className="h-4 w-4" />
          Friends ({friends.length})
        </h2>

        {friendsLoading && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="pixel-border bg-card/60 p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-sm animate-shimmer" />
                  <div className="space-y-1">
                    <div className="h-4 w-24 rounded animate-shimmer" />
                    <div className="h-3 w-16 rounded animate-shimmer" />
                  </div>
                </div>
                <div className="h-3 w-full rounded animate-shimmer" />
                <div className="h-3 w-3/4 rounded animate-shimmer" />
              </div>
            ))}
          </div>
        )}

        {friendsError && (
          <div className="pixel-border bg-destructive/10 p-4 text-center">
            <p className="text-base font-retro text-destructive">{friendsError}</p>
            <Button size="xs" variant="outline" className="mt-2" onClick={fetchFriends}>
              Retry
            </Button>
          </div>
        )}
        {!friendsLoading && !friendsError && friends.length === 0 && (
          <div className="pixel-border bg-card/60 p-8 text-center">
            <Users className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-lg font-retro text-muted-foreground">
              No friends yet &mdash; search above or share your friend code!
            </p>
          </div>
        )}

        {!friendsLoading && !friendsError && friends.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {friends.map((friend) => (
              <FriendCard
                key={friend.friendship_id}
                friend={friend}
                selfStats={selfStats}
                removing={removingIds.has(friend.friendship_id)}
                onRemove={() => removeFriend(friend.friendship_id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function UserResultCard({
  user,
  requested,
  sending,
  isFriend,
  onAdd,
}: {
  user: UserResult;
  requested: boolean;
  sending: boolean;
  isFriend: boolean;
  onAdd: () => void;
}) {
  return (
    <div className="flex items-center gap-3 p-2 hover:bg-accent/30 transition-colors">
      <div className="h-8 w-8 pixel-border bg-muted flex items-center justify-center shrink-0 overflow-hidden">
        {user.avatar_url ? (
          <img
            src={user.avatar_url}
            alt={user.display_name || "User avatar"}
            className="h-full w-full object-cover"
          />
        ) : (
          <User className="h-4 w-4 text-muted-foreground" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-lg font-retro font-bold text-foreground truncate">
          {user.display_name}
        </p>
      </div>
      <span className="text-sm font-retro text-amber-700 bg-amber-100 px-1.5 py-0.5 shrink-0">
        Lv.{user.current_level}
      </span>
      {isFriend ? (
        <Button size="xs" variant="outline" disabled>
          Friends
        </Button>
      ) : requested ? (
        <Button size="xs" variant="outline" disabled>
          Requested
        </Button>
      ) : (
        <Button
          size="xs"
          onClick={onAdd}
          disabled={sending}
        >
          {sending ? "..." : "Add"}
        </Button>
      )}
    </div>
  );
}

function FriendCard({
  friend,
  selfStats,
  removing,
  onRemove,
}: {
  friend: FriendStats;
  selfStats: SelfStats | null;
  removing: boolean;
  onRemove: () => void;
}) {
  const xpDiff = selfStats ? friend.total_xp - selfStats.total_xp : 0;
  const sortedComponents = Object.keys(COMPONENT_LABELS).sort();

  return (
    <div className="pixel-border bg-card/60 p-4 space-y-3">
      {/* Avatar + Name + Level */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 pixel-border bg-muted flex items-center justify-center shrink-0 overflow-hidden">
          {friend.avatar_url ? (
            <img
              src={friend.avatar_url}
              alt={friend.display_name || "User avatar"}
              className="h-full w-full object-cover"
            />
          ) : (
            <User className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-lg font-retro font-bold text-foreground truncate">
            {friend.display_name}
          </p>
          <span className="text-sm font-retro text-amber-700 bg-amber-100 px-1.5 py-0.5">
            Lv.{friend.current_level}
          </span>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 gap-2 text-base font-retro">
        {/* XP with comparison */}
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">XP:</span>
          <span className="font-bold text-foreground">{friend.total_xp.toLocaleString()}</span>
          {selfStats && xpDiff !== 0 && (
            xpDiff > 0 ? (
              <ArrowUp className="h-3.5 w-3.5 text-pixel-green" />
            ) : (
              <ArrowDown className="h-3.5 w-3.5 text-pixel-red" />
            )
          )}
        </div>

        {/* Streak */}
        <div className="flex items-center gap-1.5">
          <Flame className="h-3.5 w-3.5 text-pixel-gold" />
          <span className="text-foreground font-bold">{friend.login_streak}</span>
          <span className="text-muted-foreground">streak</span>
        </div>
      </div>

      {/* Character */}
      {friend.selected_character && (
        <p className="text-base font-retro text-muted-foreground">
          Companion: <span className="text-foreground font-bold">{friend.selected_character.name}</span>
        </p>
      )}

      {/* Average Component Scores */}
      <div className="space-y-1.5">
        <p className="text-sm font-retro text-muted-foreground">Avg Scores</p>
        {sortedComponents.map((comp, i) => {
          const score = friend.avg_scores[comp] ?? 0;
          return (
            <div key={comp} className="flex items-center gap-2">
              <span className="text-sm font-retro text-muted-foreground w-6">
                {COMPONENT_LABELS[comp]}
              </span>
              <Progress
                value={score}
                className={SCORE_BAR_CLASSES[i]}
              />
              <span className="text-sm font-retro text-foreground w-8 text-right">
                {score > 0 ? `${score}%` : "-"}
              </span>
            </div>
          );
        })}
      </div>

      {/* Sessions */}
      <p className="text-base font-retro text-muted-foreground">
        Sessions: <span className="text-foreground font-bold">{friend.total_sessions}</span>
      </p>

      {/* Remove Button */}
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            size="xs"
            variant="ghost"
            className="w-full text-muted-foreground hover:text-destructive"
            disabled={removing}
          >
            {removing ? "Removing..." : "Remove Friend"}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Friend</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove {friend.display_name} from your friends list?
              You can always add them back later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={onRemove}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
