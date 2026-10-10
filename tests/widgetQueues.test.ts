import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assembleWidget,
  dayRange,
  isDayKey,
  type WidgetInput,
} from "../src/lib/widgetQueues";

const ACCOUNT = "fo@example.com";

function input(patch: Partial<WidgetInput>): WidgetInput {
  return {
    date: "2026-10-10",
    today: "2026-10-10",
    accounts: [{ id: ACCOUNT, name: "Gmail – fő fiók", cap: 50 }],
    sent: [],
    campaigns: [],
    queues: [],
    stats: [],
    ...patch,
  };
}

test("a budapesti nap határai nyári időben UTC+2 szerint állnak", () => {
  // Act
  const range = dayRange("2026-10-10");

  // Assert
  assert.deepEqual(range, {
    start: "2026-10-09T22:00:00.000Z",
    end: "2026-10-10T22:00:00.000Z",
  });
});

test("az őszi óraátállítás napja 25 órás", () => {
  // Act
  const range = dayRange("2026-10-25");

  // Assert
  assert.deepEqual(range, {
    start: "2026-10-24T22:00:00.000Z",
    end: "2026-10-25T23:00:00.000Z",
  });
});

test("a tavaszi óraátállítás napja 23 órás", () => {
  // Act
  const range = dayRange("2026-03-29");

  // Assert
  assert.deepEqual(range, {
    start: "2026-03-28T23:00:00.000Z",
    end: "2026-03-29T22:00:00.000Z",
  });
});

test("az óraátállítás éjszakáján kiment levél a helyes napra esik", () => {
  // Arrange: 2026-10-25 23:30 budapesti (téli) idő = 22:30 UTC.
  const sentAt = "2026-10-25T22:30:00.000Z";
  const range = dayRange("2026-10-25");

  // Act
  const inside = sentAt >= range.start && sentAt < range.end;

  // Assert
  assert.equal(inside, true);
});

test("csak létező ÉÉÉÉ-HH-NN dátumot fogad el", () => {
  // Act
  const results = ["2026-10-10", "2026-02-30", "2026-1-5", "ma"].map(isDayKey);

  // Assert
  assert.deepEqual(results, [true, false, false, false]);
});

test("futó menet: a hátralék és az épp küldött levél külön számolódik", () => {
  // Arrange
  const now = new Date("2026-10-10T08:00:00.000Z");
  const morning = input({
    sent: [{ from: ACCOUNT, count: 4, lastAt: "2026-10-10T07:50:00.000Z" }],
    campaigns: [
      {
        accountId: ACCOUNT,
        status: "running",
        stopRequested: false,
        queueLength: 8,
        queueId: "q1",
        dailyLimit: 40,
        sentOnDate: 4,
        nextAt: "2026-10-10T07:59:00.000Z",
        updatedAt: "2026-10-10T07:50:00.000Z",
      },
    ],
    queues: [
      {
        id: "q1",
        status: "fut",
        accounts: [{ accountId: ACCOUNT, dailyLimit: 40 }],
        open: 8,
      },
    ],
  });

  // Act
  const [queue] = assembleWidget(morning, now).queues;

  // Assert
  assert.deepEqual(
    {
      status: queue.status,
      total: queue.total,
      done: queue.done,
      pending: queue.pending,
      inProgress: queue.inProgress,
      quota: queue.quota,
      completedAt: queue.completedAt,
    },
    {
      status: "running",
      total: 12,
      done: 4,
      pending: 7,
      inProgress: 1,
      quota: { used: 4, limit: 40 },
      completedAt: null,
    },
  );
});

test("a délelőtt kiürült queue délután is kész állapotban látszik", () => {
  // Arrange: a menet véget ért, a queue lezárult — csak a tartós nyom maradt.
  const afternoon = input({
    sent: [{ from: ACCOUNT, count: 12, lastAt: "2026-10-10T09:10:00.000Z" }],
    campaigns: [
      {
        accountId: ACCOUNT,
        status: "done",
        stopRequested: false,
        queueLength: 0,
        queueId: "q1",
        dailyLimit: 40,
        sentOnDate: 12,
        nextAt: null,
        updatedAt: "2026-10-10T09:10:05.000Z",
      },
    ],
    queues: [
      {
        id: "q1",
        status: "kesz",
        accounts: [{ accountId: ACCOUNT, dailyLimit: 40 }],
        open: 0,
      },
    ],
  });

  // Act
  const [queue] = assembleWidget(
    afternoon,
    new Date("2026-10-10T14:00:00.000Z"),
  ).queues;

  // Assert
  assert.deepEqual(
    {
      status: queue.status,
      total: queue.total,
      done: queue.done,
      completedAt: queue.completedAt,
    },
    {
      status: "done",
      total: 12,
      done: 12,
      completedAt: "2026-10-10T09:10:05.000Z",
    },
  );
});

test("másnap tiszta lappal indul: a tegnap kész queue nem jelenik meg", () => {
  // Arrange: a menet tegnapi állapota még az adatbázisban van.
  const nextDay = input({
    date: "2026-10-11",
    today: "2026-10-11",
    campaigns: [
      {
        accountId: ACCOUNT,
        status: "done",
        stopRequested: false,
        queueLength: 0,
        queueId: "q1",
        dailyLimit: 40,
        sentOnDate: 0,
        nextAt: null,
        updatedAt: "2026-10-10T09:10:05.000Z",
      },
    ],
  });

  // Act
  const result = assembleWidget(nextDay, new Date("2026-10-11T06:00:00.000Z"));

  // Assert
  assert.deepEqual(result.queues, []);
});

function mixed(): WidgetInput {
  return input({
    accounts: [
      { id: ACCOUNT, name: "Gmail – fő fiók", cap: 50 },
      { id: "masik@example.com", name: "Második", cap: null },
      { id: "harmadik@example.com", name: "Harmadik", cap: 5 },
      { id: "ures@example.com", name: "Üres", cap: 20 },
    ],
    sent: [
      { from: ACCOUNT, count: 9, lastAt: "2026-10-10T08:00:00.000Z" },
      {
        from: "harmadik@example.com",
        count: 5,
        lastAt: "2026-10-10T07:00:00.000Z",
      },
    ],
    campaigns: [
      {
        accountId: ACCOUNT,
        status: "running",
        stopRequested: false,
        queueLength: 6,
        queueId: "q1",
        dailyLimit: 40,
        sentOnDate: 9,
        nextAt: "2026-10-10T09:30:00.000Z",
        updatedAt: "2026-10-10T08:00:00.000Z",
      },
      {
        accountId: "masik@example.com",
        status: "error",
        stopRequested: false,
        queueLength: 3,
        queueId: "q2",
        dailyLimit: 30,
        sentOnDate: 0,
        nextAt: null,
        updatedAt: "2026-10-10T07:30:00.000Z",
      },
    ],
    queues: [
      {
        id: "q2",
        status: "leallitva",
        accounts: [{ accountId: "masik@example.com", dailyLimit: 30 }],
        open: 7,
      },
      {
        id: "q3",
        status: "varakozik",
        accounts: [{ accountId: "harmadik@example.com", dailyLimit: 30 }],
        open: 4,
      },
    ],
    stats: [
      {
        queueId: "smtp:masik@example.com",
        total: 0,
        done: 0,
        failed: 3,
        inProgress: 0,
        running: false,
        lastError: null,
        completedAt: null,
        updatedAt: "2026-10-10T07:30:00.000Z",
      },
      {
        queueId: "research:email",
        total: 40,
        done: 40,
        failed: 0,
        inProgress: 0,
        running: false,
        lastError: null,
        completedAt: "2026-10-10T08:55:00.000Z",
        updatedAt: "2026-10-10T08:55:00.000Z",
      },
      {
        queueId: "research:people",
        total: 20,
        done: 6,
        failed: 1,
        inProgress: 2,
        running: true,
        lastError: null,
        completedAt: null,
        updatedAt: "2026-10-10T08:59:30.000Z",
      },
    ],
  });
}

test("minden queue-ra: total = done + failed + pending + inProgress", () => {
  // Act
  const result = assembleWidget(mixed(), new Date("2026-10-10T09:00:00.000Z"));

  // Assert
  const sums = result.queues.map(
    (queue) => queue.done + queue.failed + queue.pending + queue.inProgress,
  );
  assert.deepEqual(
    result.queues.map((queue) => queue.total),
    sums,
  );
});

test("az összesítő a queue-k számainak összege", () => {
  // Act
  const result = assembleWidget(mixed(), new Date("2026-10-10T09:00:00.000Z"));

  // Assert
  assert.deepEqual(result.totals, {
    total: 15 + 10 + 9 + 40 + 20,
    done: 9 + 0 + 5 + 40 + 6,
    failed: 0 + 3 + 0 + 0 + 1,
    pending: 6 + 7 + 4 + 0 + 11,
    inProgress: 0 + 0 + 0 + 0 + 2,
  });
});

test("sorrend és állapot: hiba, futó, szünetel, kész — az üres fiók kimarad", () => {
  // Act
  const result = assembleWidget(mixed(), new Date("2026-10-10T09:00:00.000Z"));

  // Assert
  assert.deepEqual(
    result.queues.map((queue) => [queue.id, queue.status]),
    [
      ["smtp:masik@example.com", "error"],
      ["smtp:fo@example.com", "running"],
      ["research:people", "running"],
      ["smtp:harmadik@example.com", "paused"],
      ["research:email", "done"],
    ],
  );
});

test("a kutatás elhalt futása nem látszik futónak", () => {
  // Arrange: a statisztika szerint fut, de 40 perce nem adott életjelet.
  const stale = input({
    accounts: [],
    stats: [
      {
        queueId: "research:email",
        total: 10,
        done: 4,
        failed: 0,
        inProgress: 2,
        running: true,
        lastError: null,
        completedAt: null,
        updatedAt: "2026-10-10T08:00:00.000Z",
      },
    ],
  });

  // Act
  const [queue] = assembleWidget(
    stale,
    new Date("2026-10-10T08:40:00.000Z"),
  ).queues;

  // Assert
  assert.deepEqual(
    [queue.status, queue.pending, queue.inProgress, queue.total],
    ["paused", 6, 0, 10],
  );
});

test("várakozó menet: nincs épp küldött levél, a következő időpont látszik", () => {
  // Arrange
  const waiting = input({
    campaigns: [
      {
        accountId: ACCOUNT,
        status: "running",
        stopRequested: false,
        queueLength: 5,
        queueId: null,
        dailyLimit: 40,
        sentOnDate: 0,
        nextAt: "2026-10-10T08:15:00.000Z",
        updatedAt: "2026-10-10T08:00:00.000Z",
      },
    ],
  });

  // Act
  const [queue] = assembleWidget(
    waiting,
    new Date("2026-10-10T08:05:00.000Z"),
  ).queues;

  // Assert
  assert.deepEqual(
    [queue.status, queue.pending, queue.inProgress, queue.nextRunAt],
    ["running", 5, 0, "2026-10-10T08:15:00.000Z"],
  );
});

test("órák óta lejárt időpontnál a menet nem számít épp küldőnek", () => {
  // Arrange
  const stuck = input({
    campaigns: [
      {
        accountId: ACCOUNT,
        status: "running",
        stopRequested: false,
        queueLength: 5,
        queueId: null,
        dailyLimit: 40,
        sentOnDate: 0,
        nextAt: "2026-10-10T08:15:00.000Z",
        updatedAt: "2026-10-10T08:00:00.000Z",
      },
    ],
  });

  // Act
  const [queue] = assembleWidget(
    stuck,
    new Date("2026-10-10T13:00:00.000Z"),
  ).queues;

  // Assert
  assert.deepEqual(
    [queue.pending, queue.inProgress, queue.nextRunAt],
    [5, 0, null],
  );
});
