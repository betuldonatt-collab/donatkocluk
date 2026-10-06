import { describe, expect, it } from "vitest";

import { bridgeProblemRoutine, PROBLEMLER_COURSE_ID, PROBLEMLER_MASTER_ID } from "./curriculum/problemler";
import { sumTopicStats, type Stat } from "./curriculum/topic-groups";

const stat = (total: number, correct: number, wrong: number, empty: number): Stat => ({ total, correct, wrong, empty });
type Entry = { topicStats: { byTopic: Record<string, Stat>; karma: Stat } };
const entry = (karma = stat(0, 0, 0, 0), byTopic: Record<string, Stat> = {}): Entry => ({ topicStats: { byTopic, karma } });

describe("bridging the standalone Problem routine into TYT Matematik", () => {
  it("moves the routine's results onto the master topic and empties the routine's bucket (counted once)", () => {
    const data: Record<string, Entry> = { problem: entry(stat(60, 40, 15, 5)), [PROBLEMLER_COURSE_ID]: entry() };
    bridgeProblemRoutine(data, (id) => (data[id] ??= entry()));
    expect(data[PROBLEMLER_COURSE_ID].topicStats.byTopic[PROBLEMLER_MASTER_ID]).toEqual(stat(60, 40, 15, 5));
    expect(data.problem.topicStats.karma).toEqual(stat(0, 0, 0, 0));
    const all = Object.values(data).flatMap((e) => [e.topicStats.karma, ...Object.values(e.topicStats.byTopic)]);
    expect(all.reduce((n, s) => n + s.total, 0)).toBe(60);
  });

  it("adds to what tasks assigned straight to 'Problemler (Genel)' already logged, and creates TYT Matematik's entry if needed", () => {
    const data: Record<string, Entry> = {
      problem: entry(stat(10, 7, 2, 1)),
      [PROBLEMLER_COURSE_ID]: entry(stat(0, 0, 0, 0), { [PROBLEMLER_MASTER_ID]: stat(30, 20, 5, 5) }),
    };
    bridgeProblemRoutine(data, (id) => (data[id] ??= entry()));
    expect(data[PROBLEMLER_COURSE_ID].topicStats.byTopic[PROBLEMLER_MASTER_ID]).toEqual(stat(40, 27, 7, 6));

    const fresh: Record<string, Entry> = { problem: entry(stat(5, 5, 0, 0)) };
    bridgeProblemRoutine(fresh, (id) => (fresh[id] ??= entry()));
    expect(fresh[PROBLEMLER_COURSE_ID].topicStats.byTopic[PROBLEMLER_MASTER_ID]).toEqual(stat(5, 5, 0, 0));
  });

  it("does nothing without routine results, or for a student whose Kaynak Takibi has no TYT courses", () => {
    const none: Record<string, Entry> = { [PROBLEMLER_COURSE_ID]: entry() };
    bridgeProblemRoutine(none, (id) => (none[id] ??= entry()));
    expect(none[PROBLEMLER_COURSE_ID].topicStats.byTopic).toEqual({});

    const disabled: Record<string, Entry> = { problem: entry(stat(9, 9, 0, 0)) };
    bridgeProblemRoutine(disabled, (id) => (disabled[id] ??= entry()), false);
    expect(disabled.problem.topicStats.karma).toEqual(stat(9, 9, 0, 0));
    expect(disabled[PROBLEMLER_COURSE_ID]).toBeUndefined();
  });

  it("sums the stats of the given topic ids only", () => {
    expect(sumTopicStats({ a: stat(1, 1, 0, 0), b: stat(2, 1, 1, 0), c: stat(100, 100, 0, 0) }, ["a", "b", "missing"])).toEqual(stat(3, 2, 1, 0));
  });
});
