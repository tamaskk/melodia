import assert from "node:assert/strict";
import { test } from "node:test";
import {
  draftFrom,
  draftPrompt,
  isNoReply,
  replySubject,
  roomToday,
} from "../src/lib/threadReplyDraft";
import { assembleWidget } from "../src/lib/widgetQueues";

test("a robotcímeket felismeri, az élő postafiókokat nem", () => {
  // Act
  const robots = ["noreply@ceg.hu", "No-Reply@ceg.com", "do_not_reply@x.io"];
  const people = ["hr@ceg.hu", "info@ceg.hu", "anna.reply@ceg.hu"];

  // Assert
  assert.deepEqual(robots.map(isNoReply), [true, true, true]);
  assert.deepEqual(people.map(isNoReply), [false, false, false]);
});

test("a tárgy elé egyetlen Re: kerül, halmozás nélkül", () => {
  // Act
  const subject = replySubject("RE: Re: Jelentkezés – full stack fejlesztő");

  // Assert
  assert.equal(subject, "Re: Jelentkezés – full stack fejlesztő");
});

test("a betervezett első levelek után megmaradt hely jut a válaszoknak", () => {
  // Act
  const room = roomToday(20, 15, 3);

  // Assert
  assert.equal(room, 2);
});

test("betelt napon nem megy válasz", () => {
  // Act
  const room = roomToday(20, 20, 0);

  // Assert
  assert.equal(room, 0);
});

test("a prompt mindig kéri a csatolt dokumentum említését", () => {
  // Act
  const prompt = draftPrompt({
    company: "Nova Kft.",
    senderName: "Kiss Anna",
    incoming: "Sajnos most nincs nyitott pozíciónk.",
  });

  // Assert
  assert.match(prompt, /csatolsz egy rövid dokumentumot magadról/);
});

test("kitöltendő helyet tartalmazó piszkozatot nem fogad el", () => {
  // Act + Assert
  assert.throws(
    () => draftFrom({ language: "hu", body: "Tisztelt [Név]! Köszönöm." }),
    /kitöltendő/,
  );
});

test("a kész piszkozatból a szöveg és a nyelv jön vissza", () => {
  // Act
  const draft = draftFrom({ language: "EN", body: "  Dear Team,\nThanks.  " });

  // Assert
  assert.deepEqual(draft, { language: "en", body: "Dear Team,\nThanks." });
});

test("a widgetben a kiment és a váró válasz a fiók sorába számít", () => {
  // Arrange: 3 első levél és 2 válasz ment ki, 1 válasz szabad helyre vár.
  const account = "fo@example.com";

  // Act
  const widget = assembleWidget(
    {
      date: "2026-10-12",
      today: "2026-10-12",
      accounts: [{ id: account, name: "Fő fiók", cap: 20 }],
      sent: [{ from: account, count: 3, lastAt: "2026-10-12T08:00:00.000Z" }],
      replies: [
        {
          accountId: account,
          sent: 2,
          lastAt: "2026-10-12T09:00:00.000Z",
          waiting: 1,
        },
      ],
      campaigns: [],
      queues: [],
      stats: [],
    },
    new Date("2026-10-12T10:00:00.000Z"),
  );

  // Assert
  const queue = widget.queues[0];
  assert.equal(queue.done, 5);
  assert.equal(queue.pending, 1);
  assert.equal(queue.total, 6);
  assert.equal(queue.quota?.used, 5);
  assert.equal(queue.lastActivityAt, "2026-10-12T09:00:00.000Z");
});
