import { create } from "zustand";
import type {
  MatchEvent,
  MatchStatus,
  SubmissionResult,
  Verdict,
} from "@leetclash/shared";

export interface OpponentProgress {
  testsPassed: number;
  testsTotal: number;
  submissionCount: number;
  lastVerdict: Verdict | null;
}

const emptyProgress: OpponentProgress = {
  testsPassed: 0,
  testsTotal: 0,
  submissionCount: 0,
  lastVerdict: null,
};

interface MatchState {
  matchId: string | null;
  status: MatchStatus | null;
  /** The local player's id — needed to tell own events from the opponent's.
   *  TODO: set from the auth session once auth exists. */
  myUserId: string | null;
  opponent: OpponentProgress;
  myLastResult: SubmissionResult | null;
  winnerId: string | null;

  setMatch: (matchId: string, myUserId: string | null) => void;
  applyMatchEvent: (e: MatchEvent) => void;
  reset: () => void;
}

export const useMatchStore = create<MatchState>((set, get) => ({
  matchId: null,
  status: null,
  myUserId: null,
  opponent: emptyProgress,
  myLastResult: null,
  winnerId: null,

  setMatch: (matchId, myUserId) =>
    set({
      matchId,
      myUserId,
      status: null,
      opponent: emptyProgress,
      myLastResult: null,
      winnerId: null,
    }),

  applyMatchEvent: (e) => {
    const { myUserId } = get();
    switch (e.type) {
      case "match_created":
        set({ status: "matched" });
        break;
      case "countdown_started":
        set({ status: "countdown" });
        break;
      case "problem_revealed":
        set({ status: "live" });
        break;
      case "submission_received":
        // Server acks a submission; per-player counters update on `progress`.
        break;
      case "progress":
        if (e.payload.userId !== myUserId) {
          set({
            opponent: {
              testsPassed: e.payload.testsPassed,
              testsTotal: e.payload.testsTotal,
              submissionCount: e.payload.submissionCount,
              lastVerdict: e.payload.lastVerdict,
            },
          });
        }
        break;
      case "verdict":
        if (e.payload.userId === myUserId) {
          set({ myLastResult: e.payload.result });
        }
        break;
      case "player_disconnected":
      case "player_reconnected":
        // TODO: surface opponent presence in the UI.
        break;
      case "match_finished":
        set({ status: "finished", winnerId: e.payload.winnerId });
        break;
    }
  },

  reset: () =>
    set({
      matchId: null,
      status: null,
      myUserId: null,
      opponent: emptyProgress,
      myLastResult: null,
      winnerId: null,
    }),
}));
