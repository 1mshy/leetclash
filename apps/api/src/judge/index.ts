/**
 * Judge backend dispatch (PLAN §4.1 two-step adoption): every suite execution
 * goes through executeSuite, and JUDGE_BACKEND picks who runs the code —
 * Judge0 (MVP quartet, dev default) or the Phase 3 isolate workers.
 */
import type { ExecBatchRequest, ExecBatchResult } from "@leetclash/shared";
import { config } from "../config.js";
import { executeOnIsolate } from "./isolate-backend.js";
import { executeOnJudge0 } from "./judge0-backend.js";

export async function executeSuite(req: ExecBatchRequest): Promise<ExecBatchResult> {
  return config.JUDGE_BACKEND === "isolate" ? executeOnIsolate(req) : executeOnJudge0(req);
}
