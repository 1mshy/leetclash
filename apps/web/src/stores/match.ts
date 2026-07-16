import { create } from "zustand";
import type {
  LiveMatchState,
  MatchEvent,
  MatchStatus,
  PlayerProgress,
  SubmissionResult,
  Verdict,
} from "@leetclash/shared";

export interface OpponentProgress {
  handle: string | null;
  testsPassed: number;
  testsTotal: number;
  submissionCount: number;
  lastVerdict: Verdict | null;
}

const emptyProgress: OpponentProgress = {
  handle: null,
  testsPassed: 0,
  testsTotal: 0,
  submissionCount: 0,
  lastVerdict: null,
};

interface MatchState {
  matchId: string | null;
  status: MatchStatus | null;
  /** The local player's id (guest id until auth sessions land). */
  myUserId: string | null;
  /** Server epoch ms — countdown end and match hard cap. */
  countdownEndsAt: number | null;
  endsAt: number | null;
  players: PlayerProgress[];
  opponent: OpponentProgress;
  myLastResult: SubmissionResult | null;
  winnerId: string | null;
  /** Set by a rematch event; the match page navigates there. */
  rematchMatchId: string | null;
  /** Bumped when REST match detail may have changed (reveal, finish, …). */
  detailVersion: number;

  setMatch: (matchId: string, myUserId: string | null) => void;
  applyState: (state: LiveMatchState | null) => void;
  applyMatchEvent: (e: MatchEvent) => void;
  setMyLastResult: (r: SubmissionResult) => void;
  reset: () => void;
}

const initial = {
  matchId: null,
  status: null,
  myUserId: null,
  countdownEndsAt: null,
  endsAt: null,
  players: [],
  opponent: emptyProgress,
  myLastResult: null,
  winnerId: null,
  rematchMatchId: null,
};

function opponentFromPlayers(
  players: PlayerProgress[],
  myUserId: string | null,
): OpponentProgress {
  const opp = players.find((p) => p.userId !== myUserId);
  if (!opp) return emptyProgress;
  return {
    handle: opp.handle,
    testsPassed: opp.testsPassed,
    testsTotal: opp.testsTotal,
    submissionCount: opp.submissionCount,
    lastVerdict: opp.lastVerdict,
  };
}

export const useMatchStore = create<MatchState>((set, get) => ({
  ...initial,
  detailVersion: 0,

  setMatch: (matchId, myUserId) =>
    set((s) => ({ ...initial, matchId, myUserId, detailVersion: s.detailVersion + 1 })),

  /** Snapshot from the realtime gateway on (re)join — authoritative catch-up. */
  applyState: (state) => {
    if (!state || state.matchId !== get().matchId) return;
    set((s) => ({
      status: state.status,
      countdownEndsAt: state.countdownEndsAt,
      endsAt: state.endsAt,
      players: state.players,
      opponent: opponentFromPlayers(state.players, s.myUserId),
      winnerId: state.winnerId,
      detailVersion: s.detailVersion + 1,
    }));
  },

  applyMatchEvent: (e) => {
    const { myUserId } = get();
    switch (e.type) {
      case "match_created":
        set((s) => ({ status: "matched", detailVersion: s.detailVersion + 1 }));
        break;
      case "countdown_started":
        set({
          status: "countdown",
          countdownEndsAt: Date.parse(e.at) + e.payload.seconds * 1000,
        });
        break;
      case "problem_revealed":
        set((s) => ({ status: "live", detailVersion: s.detailVersion + 1 }));
        break;
      case "submission_received":
        // Server acks a submission; per-player counters update on `progress`.
        break;
      case "progress":
        if (e.payload.userId !== myUserId) {
          set((s) => ({
            opponent: {
              handle: s.opponent.handle,
              testsPassed: e.payload.testsPassed,
              testsTotal: e.payload.testsTotal,
              submissionCount: e.payload.submissionCount,
              lastVerdict: e.payload.lastVerdict,
            },
          }));
        }
        break;
      case "verdict":
        // Own results come from polling GET /submissions/:id (richer detail);
        // this keeps a reconnecting client's "last:" line in sync anyway.
        if (e.payload.userId === myUserId) {
          set({ myLastResult: e.payload.result });
        }
        break;
      case "player_disconnected":
      case "player_reconnected":
        // TODO(phase2): surface opponent presence in the UI.
        break;
      case "match_finished":
        set((s) => ({
          status: "finished",
          winnerId: e.payload.winnerId,
          detailVersion: s.detailVersion + 1,
        }));
        break;
      case "rematch":
        set({ rematchMatchId: e.payload.newMatchId });
        break;
    }
  },

  setMyLastResult: (r) => set({ myLastResult: r }),

  reset: () => set({ ...initial }),
}));
