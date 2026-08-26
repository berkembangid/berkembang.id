export type AdminOperation =
  | { action: "create_admin"; email: string; password: string; name: string }
  | { action: "deactivate_admin"; profileId: string }
  | {
      action: "save_institution";
      source: "institutions" | "profiles";
      id?: string;
      name: string;
      type: string;
      programsCount: number;
      active: boolean;
      contactName?: string;
      contactEmail?: string;
      location?: string;
    }
  | { action: "deactivate_institution"; source: "institutions" | "profiles"; id: string }
  | { action: "set_institution_active"; source: "institutions" | "profiles"; id: string; active: boolean }
  | {
      action: "save_mitra";
      id?: string;
      name: string;
      type: string;
      coverage: string;
      umkmManaged: number;
      active: boolean;
    }
  | { action: "delete_mitra"; id: string }
  | {
      action: "publish_rules";
      version: string;
      weights: { konsistensi: number; kas: number; legalitas: number; stabilitas: number };
      thresholds: { maxDailyExpense: number; maxDailyIncome: number };
    }
  | {
      action: "save_umkm";
      id?: string;
      ownerName: string;
      businessName: string;
      sector: string;
      location: string;
      email?: string;
      score: number;
      consistencyDays: number;
      status: string;
      reason?: string;
    }
  | { action: "set_umkm_score"; id: string; score: number; reason: string };

type AdminOperationResult = { ok: true; id?: string };

export async function runAdminOperation(operation: AdminOperation): Promise<AdminOperationResult> {
  const response = await fetch("/api/admin/operations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(operation),
  });
  const result = (await response.json().catch(() => null)) as
    | AdminOperationResult
    | { error?: string }
    | null;

  if (!response.ok || !result || !("ok" in result)) {
    throw new Error(result && "error" in result && result.error ? result.error : "ADMIN_OPERATION_FAILED");
  }
  return result;
}
