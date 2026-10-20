import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getActionRecommendations } from "./action-centre.ts";

const today = new Date("2026-10-22T10:00:00.000Z");

function application(overrides = {}) {
  return {
    id: "application-1",
    company: "DataWave Technologies",
    position: "Graduate Data Analyst",
    date: "2026-10-01",
    type: "Graduate Job",
    status: "Applied",
    arrangement: "Hybrid",
    notes: "",
    ...overrides,
  };
}

describe("getActionRecommendations", () => {
  it("uses the 7-day and 14-day follow-up boundaries", () => {
    const result = getActionRecommendations(
      [
        application({ id: "day-6", date: "2026-10-16" }),
        application({ id: "day-7", date: "2026-10-15" }),
        application({ id: "day-13", date: "2026-10-09" }),
        application({ id: "day-14", date: "2026-10-08" }),
      ],
      today
    );

    assert.deepEqual(
      result.map(({ key, priority }) => [key, priority]),
      [
        ["day-14-follow-up", "Urgent"],
        ["day-13-follow-up", "Medium"],
        ["day-7-follow-up", "Medium"],
      ]
    );
  });

  it("excludes non-follow-up statuses and invalid or future application dates", () => {
    const result = getActionRecommendations(
      [
        application({ id: "offer", status: "Offer" }),
        application({ id: "rejected", status: "Rejected" }),
        application({ id: "withdrawn", status: "Withdrawn" }),
        application({ id: "interview", status: "Interview" }),
        application({ id: "saved", status: "Saved" }),
        application({ id: "missing-date", date: "" }),
        application({ id: "invalid-date", date: "2026-02-30" }),
        application({ id: "future-date", date: "2026-10-23" }),
      ],
      today
    );

    assert.deepEqual(
      result.map(({ key }) => key),
      ["interview-interview-details", "saved-saved-opportunity"]
    );
  });

  it("includes interviews through day fourteen, with optional time", () => {
    const result = getActionRecommendations(
      [
        application({
          id: "today",
          status: "Interview",
          interviewDate: "2026-10-22",
          interviewTime: "14:00",
        }),
        application({
          id: "day-three",
          status: "Interview",
          interviewDate: "2026-10-25",
          interviewTime: "10:00",
        }),
        application({
          id: "day-four",
          status: "Interview",
          interviewDate: "2026-10-26",
          interviewTime: "10:00",
        }),
        application({
          id: "day-fourteen",
          status: "Interview",
          interviewDate: "2026-11-05",
          interviewTime: "10:00",
        }),
        application({
          id: "day-fifteen",
          status: "Interview",
          interviewDate: "2026-11-06",
          interviewTime: "10:00",
        }),
        application({
          id: "past",
          status: "Interview",
          interviewDate: "2026-10-21",
          interviewTime: "10:00",
        }),
      ],
      today
    );

    assert.deepEqual(
      result.map(({ key }) => key),
      [
        "today-upcoming-interview",
        "day-three-upcoming-interview",
        "day-four-upcoming-interview",
        "day-fourteen-upcoming-interview",
        "past-past-interview",
      ]
    );
    assert.match(result.find(({ key }) => key === "today-upcoming-interview").reason, /Interview today.*2:00 PM/);
    assert.match(result.find(({ key }) => key === "day-three-upcoming-interview").reason, /Interview in 3 days/);
    assert.match(result.find(({ key }) => key === "day-four-upcoming-interview").reason, /Interview in 4 days/);
    assert.match(result.find(({ key }) => key === "day-fourteen-upcoming-interview").reason, /Interview in 14 days/);
    assert.doesNotMatch(
      result.filter(({ kind }) => kind === "upcoming-interview").map(({ key }) => key).join(" "),
      /day-fifteen|past/
    );
  });

  it("does not generate interview recommendations for non-Interview statuses", () => {
    const result = getActionRecommendations(
      [
        application({
          id: "applied",
          status: "Applied",
          interviewDate: "2026-10-23",
        }),
        application({
          id: "offer",
          status: "Offer",
          interviewDate: "2026-10-23",
        }),
        application({
          id: "saved",
          status: "Saved",
          interviewDate: "2026-10-23",
        }),
      ],
      today
    );

    assert.equal(
      result.some(({ kind }) => kind === "upcoming-interview"),
      false
    );
  });

  it("recommends reviewing past interviews and confirming missing or invalid details", () => {
    const result = getActionRecommendations(
      [
        application({
          id: "past",
          status: "Interview",
          interviewDate: "2026-10-21",
          interviewTime: "10:00",
        }),
        application({
          id: "missing",
          status: "Interview",
        }),
        application({
          id: "invalid",
          status: "Interview",
          interviewDate: "2026-02-30",
          interviewTime: "10:00",
        }),
      ],
      today
    );

    assert.deepEqual(
      result.map(({ kind }) => kind),
      ["past-interview", "interview-details", "interview-details"]
    );
    assert.doesNotMatch(result[0].reason, /upcoming/i);
  });

  it("sorts urgent reminders first and caps the list at five", () => {
    const result = getActionRecommendations(
      [
        ...Array.from({ length: 6 }, (_, index) =>
          application({
            id: `saved-${index}`,
            status: "Saved",
          })
        ),
        application({
          id: "urgent",
          date: "2026-10-08",
        }),
        application({
          id: "interview",
          status: "Interview",
          interviewDate: "2026-10-23",
          interviewTime: "10:00",
        }),
      ],
      today
    );

    assert.equal(result.length, 5);
    assert.deepEqual(
      result.slice(0, 2).map(({ kind }) => kind),
      ["upcoming-interview", "urgent-follow-up"]
    );
    assert.equal(
      result.filter(({ kind }) => kind === "saved-opportunity").length,
      3
    );
  });

  it("returns no recommendations for an empty application list", () => {
    assert.deepEqual(getActionRecommendations([], today), []);
  });

  it("uses recruitment activity rather than unrelated application edits as the follow-up clock", () => {
    const result = getActionRecommendations(
      [
        application({
          id: "recent-activity",
          date: "2026-09-01",
          recruitmentActivityAt: "2026-10-16T12:00:00.000Z",
        }),
        application({
          id: "old-activity",
          date: "2026-10-20",
          recruitmentActivityAt: "2026-10-08T12:00:00.000Z",
        }),
      ],
      today
    );

    assert.deepEqual(result.map(({ key }) => key), ["old-activity-follow-up"]);
  });

  it("compares interview time and date in Africa/Johannesburg", () => {
    const result = getActionRecommendations(
      [
        application({
          id: "passed-this-morning",
          status: "Interview",
          interviewDate: "2026-10-22",
          interviewTime: "11:59",
        }),
        application({
          id: "later-today",
          status: "Interview",
          interviewDate: "2026-10-22",
          interviewTime: "12:01",
        }),
        application({
          id: "missing-time",
          status: "Interview",
          interviewDate: "2026-10-22",
        }),
      ],
      today
    );

    assert.deepEqual(
      result.map(({ key, kind }) => [key, kind]),
      [
        ["later-today-upcoming-interview", "upcoming-interview"],
        ["passed-this-morning-past-interview", "past-interview"],
        ["missing-time-interview-details", "interview-details"],
      ]
    );
  });

  it("suppresses completed actions and snoozes only before their deadline", () => {
    const followUp = application({
      id: "snoozed",
      recruitmentActivityAt: "2026-10-01T10:00:00.000Z",
    });
    const [action] = getActionRecommendations([followUp], today);
    assert.ok(action);

    assert.deepEqual(
      getActionRecommendations([followUp], today, {
        [action.cycleKey]: { state: "completed" },
      }),
      []
    );
    assert.deepEqual(
      getActionRecommendations([followUp], today, {
        [action.cycleKey]: { state: "snoozed", snoozedUntil: "2026-10-23T00:00:00.000Z" },
      }),
      []
    );
    assert.equal(
      getActionRecommendations([followUp], today, {
        [action.cycleKey]: { state: "snoozed", snoozedUntil: "2026-10-21T00:00:00.000Z" },
      }).length,
      1
    );
  });
});
