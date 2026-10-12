import assert from "node:assert/strict";
import { test } from "node:test";

const { refreshUserNotifications, getNotificationState, dismissNotificationToast, setNotificationReadState } =
  await import("./notification-api.ts");

function response(body, ok = true, status = 200) {
  return {
    ok,
    status,
    async json() {
      return body;
    },
  };
}

test("notification refresh retains last-known data, deduplicates new alerts, and isolates account changes", async () => {
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;
  let token = "token-user-a";
  const queuedResponses = [];
  const requests = [];
  globalThis.window = {
    localStorage: {
      getItem(key) {
        assert.equal(key, "applyflow_token");
        return token;
      },
    },
  };
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    const next = queuedResponses.shift();
    if (next instanceof Error) throw next;
    return next;
  };

  const notificationA = {
    id: "a-1",
    title: "Application Status Changed",
    type: "Status Update",
    message: "Acme — Engineer\nApplied to Interview.",
    date: "2026-10-12T09:00:00.000Z",
    read: false,
    applicationId: "15",
    status: "sent",
  };
  const notificationB = {
    ...notificationA,
    id: "a-2",
    title: "Interview coming up at Beta",
    message: "Analyst interview reminder.",
  };

  try {
    queuedResponses.push(response({ notifications: [notificationA] }));
    await refreshUserNotifications();
    assert.deepEqual(getNotificationState().notifications.map(({ id }) => id), ["a-1"]);
    assert.equal(getNotificationState().newNotification, null);

    const pendingReminder = {
      ...notificationA,
      id: "a-reminder-pending",
      type: "Interview Reminder",
      status: "pending",
    };
    queuedResponses.push(response({
      notifications: [pendingReminder, notificationB, notificationA],
    }));
    await refreshUserNotifications({ force: true });
    assert.equal(getNotificationState().newNotification?.id, "a-2");
    assert.equal(requests.at(-1).options.cache, "no-store");

    dismissNotificationToast("a-2");
    queuedResponses.push(response({ message: "Notification marked as read." }));
    queuedResponses.push(response({
      notifications: [{ ...notificationA, read: true }, notificationB],
    }));
    const readResult = await setNotificationReadState("a-1", true);
    assert.equal(readResult.ok, true);
    assert.equal(getNotificationState().newNotification, null);

    queuedResponses.push(new Error("Network unavailable"));
    await refreshUserNotifications({ force: true });
    assert.deepEqual(
      getNotificationState().notifications.map(({ id }) => id),
      ["a-1", "a-2"],
    );
    assert.match(getNotificationState().message || "", /unable to connect/i);

    queuedResponses.push(response({ message: "Unauthorized." }, false, 401));
    await refreshUserNotifications({ force: true });
    assert.deepEqual(getNotificationState().notifications, []);
    assert.equal(getNotificationState().newNotification, null);

    token = "token-user-b";
    const notificationForB = { ...notificationA, id: "b-1", applicationId: "22" };
    queuedResponses.push(response({ notifications: [notificationForB] }));
    await refreshUserNotifications();
    assert.deepEqual(getNotificationState().notifications.map(({ id }) => id), ["b-1"]);
    assert.equal(getNotificationState().newNotification, null);
  } finally {
    globalThis.window = originalWindow;
    globalThis.fetch = originalFetch;
  }
});
