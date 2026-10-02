// One validation contract is shared by the guest UI and the deployed function.
// The function bundle stays self-contained for deployment through Supabase MCP.
export * from "../../../supabase/functions/party-rsvp/rsvp.ts";
