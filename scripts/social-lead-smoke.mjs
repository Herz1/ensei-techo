import assert from "node:assert/strict";
import { canonicalizeSocialUrl, matchSocialLead, socialPlatformFromUrl } from "../src/lib/social-lead-core.mjs";

assert.equal(socialPlatformFromUrl("https://www.xiaohongshu.com/explore/abc"), "xhs");
assert.equal(socialPlatformFromUrl("https://x.com/example/status/1"), "x");
assert.equal(socialPlatformFromUrl("https://www.instagram.com/p/abc/"), "instagram");
assert.equal(socialPlatformFromUrl("https://example.com/post"), "other");

assert.equal(
  canonicalizeSocialUrl("https://WWW.Instagram.com/p/abc/?utm_source=test&igshid=secret&keep=yes#section"),
  "https://www.instagram.com/p/abc?keep=yes",
);
assert.equal(
  canonicalizeSocialUrl("https://x.com/example/status/1?access_token=secret&utm_medium=social"),
  "https://x.com/example/status/1",
);
assert.equal(canonicalizeSocialUrl("https://user:secret@example.com/post"), null);
assert.equal(canonicalizeSocialUrl("javascript:alert(1)"), null);

const contexts = [
  {
    id: "event-a",
    titleJa: "森本爵ONEMANLIVE ～Palindrome～",
    titleZh: "森本爵ONEMANLIVE ～Palindrome～",
    date: "2026-09-04",
    artistNames: ["森本爵"],
    venueNames: ["Zepp Shinjuku", "Zepp新宿"],
  },
  {
    id: "event-b",
    titleJa: "別の公演",
    titleZh: "另一场演出",
    date: "2026-09-04",
    artistNames: ["別の歌手"],
    venueNames: ["Zepp Shinjuku"],
  },
];

const matched = matchSocialLead({
  pastedText: "森本爵ONEMANLIVE ～Palindrome～ 2026/09/04 Zepp Shinjuku",
}, contexts, 5);
assert.equal(matched[0].eventId, "event-a");
assert.ok(matched[0].reasons.some((reason) => reason.includes("演出标题")));
assert.ok(matched[0].reasons.some((reason) => reason.includes("日期")));
assert.ok(matched[0].reasons.some((reason) => reason.includes("场馆")));
assert.ok(matched.length <= 5);
assert.deepEqual(matchSocialLead({ pastedText: "完全无关的私人备忘" }, contexts, 5), []);

console.log("社媒线索测试通过：URL 去追踪/凭据、平台识别、本地候选排序、未匹配均正常。");
