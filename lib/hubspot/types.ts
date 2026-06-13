/** Shared HubSpot + sync domain types. */

/** OAuth token response from POST https://api.hubapi.com/oauth/v1/token */
export interface HubSpotTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number; // seconds; HubSpot access tokens last ~1800s (30 min)
  token_type?: string;
}

/** Normalized contact field set synced in both directions. */
export interface ContactFields {
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
}

/** HubSpot CRM v3 contact object (subset we use). */
export interface HubSpotContact {
  id: string;
  properties: Record<string, string | null>;
  updatedAt?: string;
  archived?: boolean;
}

/** A single inbound webhook event (HubSpot sends an array of these). */
export interface HubSpotWebhookEvent {
  eventId: number;
  subscriptionId?: number;
  portalId: number;
  occurredAt: number;
  subscriptionType: string; // e.g. "contact.creation"
  objectId: number;
  propertyName?: string;
  propertyValue?: string;
  changeSource?: string;
  changeFlag?: string;
}
