/** When `NEXT_PUBLIC_DISABLE_CLIENT_PORTAL_AI=true`, hide client-facing AI help. */
export function isClientPortalAiDisabled(): boolean {
  return process.env.NEXT_PUBLIC_DISABLE_CLIENT_PORTAL_AI === "true";
}
