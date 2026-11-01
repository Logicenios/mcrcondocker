import type { DiagnosticMessage } from "./diagnostic-messages.js";
export type LifecyclePhase = "sleeping" | "starting" | "running" | "stopping" | "failed" | "unknown";
export type GenerationPhase = "active" | "paused" | "completed" | "unavailable" | "unknown";
export interface LifecycleObservation {
  version: 1; sequence: number; source: string; observedAt: number; phaseSince: number;
  state: LifecyclePhase; intentionalSleep: boolean; reason: string | null;
  policyRevision: number;
}
export interface MaintenanceHold { id: string; owner: string; reason: string; createdAt: number }
export interface GenerationWorld {
  world: string; dimension: string; state: GenerationPhase; progress: number | null;
  observedAt: number | null; completedAt: number | null; completionSource: string | null;
  raw: string; errorData?: DiagnosticMessage; job: "enabled" | "paused" | "none";
}
export interface ManagementStatus {
  enabled: boolean; state: LifecyclePhase; observedAt: number | null; reason: string | null;
  errorData?: DiagnosticMessage; holds: MaintenanceHold[]; revision: number; acknowledged: boolean;
  idleSeconds: number; startupSeconds: number; worlds: GenerationWorld[];
}
export interface GuestApproval {
  name: string; uuid: string; requestedAt: number; approvedBy: string | null;
  state: "requested" | "pending" | "applied" | "rejected"; error: string | null; errorData?: DiagnosticMessage;
}
