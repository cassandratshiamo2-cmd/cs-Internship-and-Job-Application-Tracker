const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

export type StoredActionState = {
  actionId: string;
  kind: string;
  state: "completed" | "snoozed";
  snoozedUntil?: string | null;
};

export type SnoozePreset = "tomorrow" | "one-week";

async function actionRequest<T>(path: string, token: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}/api/action-centre${path}`, {
    ...options,
    headers: {
      ...(options?.body ? { "Content-Type": "application/json" } : {}),
      Authorization: `Bearer ${token}`,
      ...options?.headers,
    },
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => ({}))) as T & { message?: string };
  if (!response.ok) {
    throw new Error(payload.message || "Unable to update dashboard actions.");
  }
  return payload;
}

export async function getActionStates(token: string) {
  const result = await actionRequest<{ states: StoredActionState[] }>("/states", token);
  return result.states;
}

export async function updateActionState(
  token: string,
  input: {
    applicationId: string;
    actionId: string;
    kind: string;
    state: "completed" | "snoozed";
    snoozePreset?: SnoozePreset;
  }
) {
  return actionRequest<{ action: StoredActionState }>("/states", token, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}
