import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database.generated";
import type { InstitutionPortalSupplement } from "@/types/institution-portal.supplement";

type GeneratedFunctions = Database["public"]["Functions"];
type SupplementFunctions = InstitutionPortalSupplement["public"]["Functions"];

type OverriddenFunctionNames =
  | "list_anonymous_business_candidates"
  | "create_dossier_request"
  | "get_my_institution_shortlist"
  | "toggle_my_institution_shortlist";

type AllFunctions = Omit<GeneratedFunctions, OverriddenFunctionNames> & SupplementFunctions;

type ArgsOf<Name extends keyof AllFunctions> =
  AllFunctions[Name] extends { Args: infer Args } ? Args : Record<string, never>;

type RpcError = { message: string };

export type PortalRpcClient = Omit<SupabaseClient<Database>, "rpc"> & {
  rpc<Name extends keyof AllFunctions>(
    fn: Name,
    args?: ArgsOf<Name>,
  ): Promise<{ data: Json | null; error: RpcError | null }>;
};

/** Client yang mengenal RPC 0058/0059 sebelum `db:types` diregenerasi. */
export function withPortalRpc(client: SupabaseClient<Database>): PortalRpcClient {
  return client as unknown as PortalRpcClient;
}
